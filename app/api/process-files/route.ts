import { type NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { parseFiles, parseFile, ExtractedFile } from '@/lib/parsers'
import { ensureAuthServer } from '@/lib/auth-server'

// Force Node.js runtime (not Edge) for file parsing
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for GPT-5 reasoning mode

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Normalize text by cleaning up whitespace and formatting
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\t/g, ' ') // Replace tabs with spaces
    .replace(/ +/g, ' ') // Replace multiple spaces with single space
    .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
    .trim()
}

/**
 * Combine text from multiple extracted files
 */
function combineExtractedText(extractedFiles: ExtractedFile[]): string {
  const textFiles = extractedFiles.filter(f => f.text)

  if (textFiles.length === 0) {
    return ''
  }

  return textFiles
    .map(file => {
      const normalizedText = normalizeText(file.text!)
      return `=== ${file.filename} ===\n\n${normalizedText}`
    })
    .join('\n\n---\n\n')
}

/**
 * Estimate token count (rough approximation: words * 1.3)
 */
function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length
  return Math.ceil(words * 1.3)
}

/**
 * Chunk text if it exceeds token limit
 */
function chunkText(text: string, maxTokens: number = 5000): string[] {
  const estimatedTokens = estimateTokens(text)

  if (estimatedTokens <= maxTokens) {
    return [text]
  }

  // Simple chunking by splitting on double newlines (paragraphs)
  const paragraphs = text.split('\n\n')
  const chunks: string[] = []
  let currentChunk = ''
  let currentTokens = 0

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph)

    if (currentTokens + paragraphTokens > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = paragraph
      currentTokens = paragraphTokens
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      currentTokens += paragraphTokens
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

export async function POST(request: NextRequest) {
  try {
    const traceId = (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
    const t0 = Date.now()
    const log = (level: 'info' | 'warn' | 'error', msg: string, data?: any) => {
      const line = `[process-files][${traceId}] ${msg}`
      if (level === 'info') console.info(line, data ?? '')
      else if (level === 'warn') console.warn(line, data ?? '')
      else console.error(line, data ?? '')
    }
    // Auth is only required if user uploads images (we need userId for storage path).
    // For pure document uploads we skip auth to avoid failures when anonymous auth is disabled.

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const existingCourseJson = formData.get('existingCourse') as string | null
    const modelChoice = (formData.get('modelChoice') as string | null)?.toLowerCase() || (process.env.DEFAULT_MODEL_CHOICE || 'chatgpt4o')
    const lessonCountRaw = formData.get('lessonCount') as string | null
    const lessonCount = lessonCountRaw ? Math.max(1, parseInt(lessonCountRaw)) : null
    const thesisTemplate = (formData.get('thesisTemplate') as string | null)?.trim() || null

    // Check streaming preference: first try header, then fall back to FormData field
    const streamHeader = request.headers.get('x-client-stream')
    const streamFormField = formData.get('wantsStream') as string | null
    log('info', 'Stream header check', {
      streamHeader,
      streamHeaderLower: streamHeader?.toLowerCase(),
      streamFormField,
      allHeaders: Object.fromEntries(request.headers.entries()),
    })
    const wantsStream = (streamHeader || '').toLowerCase() === '1' || (streamFormField || '').toLowerCase() === '1'
    log('info', 'Stream mode decision', { wantsStream, viaHeader: !!streamHeader, viaFormData: !!streamFormField })

    const hasImages = files.some(f => f.type?.startsWith('image/'))
    if (hasImages) {
      try {
        await ensureAuthServer()
        log('info', 'Auth ensured (images present)')
      } catch (e: any) {
        const msg = String(e?.message || e)
        if (msg.includes('Anonymous sign-ins are disabled')) {
          log('warn', 'Auth required but anonymous disabled')
          const res = NextResponse.json({
            error: 'Загрузка изображений требует авторизации. Войдите в аккаунт или включите anonymous sign-in в Supabase.'
          }, { status: 401 })
          res.headers.set('X-Auth-Reason', 'anonymous-signin-disabled')
          return res
        }
        log('error', 'Auth failed', { message: msg })
        return NextResponse.json({ error: 'Не удалось выполнить авторизацию' }, { status: 401 })
      }
    }

    log('info', 'Incoming request meta', {
      filesCount: files?.length || 0,
      fileSummaries: files.slice(0, 10).map(f => ({ name: f.name, type: f.type, size: f.size })),
      existingCourseBytes: existingCourseJson?.length || 0,
      modelChoice,
    })

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Файлы не предоставлены' }, { status: 400 })
    }

    // Parse existing course if provided (for updates)
    let existingCourse: any = null
    if (existingCourseJson) {
      try {
        existingCourse = JSON.parse(existingCourseJson)
      } catch (e) {
        console.error('Failed to parse existing course:', e)
      }
    }

    // Streaming NDJSON branch (opt-in by header)
    if (wantsStream) {
      log('info', 'Streaming mode enabled (NDJSON)')
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const enc = new TextEncoder()
      const send = async (obj: unknown) => {
        try { await writer.write(enc.encode(JSON.stringify(obj) + '\n')) } catch (e) { console.error(`[process-files][${traceId}] stream write failed`, e) }
      }

      ;(async () => {
        try {
          const userId = hasImages ? (await ensureAuthServer())?.user?.id : undefined
          await send({ event: 'stage', stage: 'extract', total: files.length, done: 0, traceId })
          const extractedFiles: ExtractedFile[] = []
          let done = 0
          for (const f of files) {
            try {
              const ef = await parseFile(f, undefined, userId)
              extractedFiles.push(ef)
              done++
              await send({ event: 'progress', stage: 'extract', done, total: files.length, filename: f.name })
            } catch (e: any) {
              done++
              await send({ event: 'progress', stage: 'extract', done, total: files.length, filename: f.name, error: String(e?.message || e) })
            }
          }

          const documents = extractedFiles.filter(f => f.text)
          const images = extractedFiles.filter(f => f.imagePath)
          if (documents.length === 0) { await send({ event: 'error', message: 'Не найдено ни одного текстового документа для обработки', traceId }); await writer.close(); return }

          await send({ event: 'stage', stage: 'analyze' })
          const combinedText = combineExtractedText(documents)
          const combinedChars = combinedText.length
          if (combinedChars < 100) { await send({ event: 'error', message: `Текст слишком короткий (${combinedChars} символов)`, traceId }); await writer.close(); return }
          const chunks = chunkText(combinedText, 20000)
          const textForGeneration = chunks[0]

          // Model selection (short, mirrors legacy branch)
          let selectedProvider: 'openai' | 'anthropic' = 'openai'
          let selectedModelId: string = 'gpt-4o'
          let model: any
          if (modelChoice === 'chatgpt4o') { selectedProvider = 'openai'; selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'; model = openai(selectedModelId) }
          else if (modelChoice === 'chatgpt5') { selectedProvider = 'openai'; selectedModelId = process.env.OPENAI_MODEL_GPT_5 || 'gpt-5'; model = openai(selectedModelId) }
          else if (modelChoice === 'sonnet4') {
            if (process.env.ANTHROPIC_API_KEY) {
              try {
                const mod = await import('@ai-sdk/anthropic')
                // @ts-ignore
                const createAnthropic = (mod as any).createAnthropic
                const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
                selectedProvider = 'anthropic'; selectedModelId = process.env.ANTHROPIC_MODEL_SONNET_4 || 'claude-sonnet-4-20250514'; model = anthropic(selectedModelId)
              } catch { selectedProvider = 'openai'; selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'; model = openai(selectedModelId) }
            } else { selectedProvider = 'openai'; selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'; model = openai(selectedModelId) }
          } else { selectedProvider = 'openai'; selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'; model = openai(selectedModelId) }

          await send({ event: 'stage', stage: 'generate', substage: existingCourseJson ? 'update' : 'outline' })
          log('info', 'Streaming generation phase started', { mode: existingCourseJson ? 'update' : 'create', modelChoice, lessonCount })

          let course: any = null
          if (existingCourse) {
            const existingLessonSummary = existingCourse.lessons
              .map((l: any, idx: number) => `${idx + 1}. ID: ${l.id}, Заголовок: "${l.title}"`).join('\n')
            const prompt = `Обнови существующий курс "${existingCourse.title}" на основе новых документов.\n\nСУЩЕСТВУЮЩИЕ УРОКИ:\n${existingLessonSummary}\n\nПравила: сохраняй ID, меняй только guidance поля.\n\nНовый материал:\n${textForGeneration}\n\nСоздай обновленную структуру курса на русском.`
            const schema = z.object({
              title: z.string(),
              description: z.string().optional(),
              outline: z.array(z.object({ lesson_id: z.string(), title: z.string(), logline: z.string().optional(), bullets: z.array(z.string()).min(1).max(8) })).min(1),
              lessons: z.array(z.object({ id: z.string(), title: z.string(), logline: z.string().optional(), content: z.string().optional(), objectives: z.array(z.string()).optional(), guiding_questions: z.array(z.string()).optional(), expansion_tips: z.array(z.string()).optional(), examples_to_add: z.array(z.string()).optional() })).min(1)
            })
            const res = await generateObject({ model, prompt, schema, maxOutputTokens: 5000 })
            course = res.object
            await send({ event: 'progress', stage: 'generate', substage: 'update', done: 1, total: 1 })
          } else {
            const outlineSchema = z.object({
              title: z.string(),
              description: z.string().optional(),
              outline: z.array(z.object({ lesson_id: z.string(), title: z.string(), logline: z.string().optional(), bullets: z.array(z.string()).min(1).max(7) })).min(3).max(20)
            })
            const lessonsReq = lessonCount ? `Курс должен содержать РОВНО ${lessonCount} уроков.` : `Курс должен содержать 3–7 уроков.`
            const templateBlock = thesisTemplate ? `\nШАБЛОН ТЕЗИСОВ (СТРОГО):\n${thesisTemplate}\nПравила: используй ровно эти пункты и их порядок.\n` : ''
            const outlinePrompt = `Сделай структуру курса из текста ниже. ${lessonsReq}${templateBlock}\nИспользуй ТОЛЬКО информацию из текста.\n\nТекст:\n${textForGeneration}`
            const outlineRes = await generateObject({ model, prompt: outlinePrompt, schema: outlineSchema, maxOutputTokens: 1200 })
            const outline = outlineRes.object
            log('info', 'Streaming outline generated', { lessons: outline.outline.length })
            await send({ event: 'progress', stage: 'generate', substage: 'outline', done: 1, total: 1, lessons: outline.outline.length })

            const lessonSchema = z.object({
              id: z.string(),
              title: z.string(),
              logline: z.string().optional(),
              content: z.string(),
              objectives: z.array(z.string()).optional(),
              guiding_questions: z.array(z.string()).optional(),
              expansion_tips: z.array(z.string()).optional(),
              examples_to_add: z.array(z.string()).optional(),
            })

            const lessons: any[] = []
            let li = 0
            await send({ event: 'stage', stage: 'generate', substage: 'lessons', total: outline.outline.length, done: 0 })
            for (const o of outline.outline) {
              const lessonPrompt = `Сгенерируй детальный урок на русском. Заголовок: "${o.title}". Используй только факты из источника. ${thesisTemplate ? 'Придерживайся заданного шаблона тезисов.' : ''}\n\nИсточник:\n${textForGeneration}`
              const res = await generateObject({ model, prompt: lessonPrompt, schema: lessonSchema, maxOutputTokens: 1200 })
              lessons.push(res.object)
              li++
              log('info', 'Streaming lesson generated', { index: li, title: o.title })
              await send({ event: 'progress', stage: 'generate', substage: 'lessons', done: li, total: outline.outline.length, lesson: o.title })
            }

            course = { title: outline.title, description: outline.description, outline: outline.outline, lessons }
          }

          await send({ event: 'stage', stage: 'finalize' })

          const ensureMinItems = (arr: string[] | undefined, min: number, fillers: string[]): string[] => {
            const base = Array.isArray(arr) ? arr.filter(Boolean).map(s => String(s).trim()).filter(Boolean) : []
            let i = 0; while (base.length < min) { base.push(fillers[i % fillers.length]); i++ } return base
          }
          if (course?.lessons?.length) {
            course.lessons = course.lessons.map((l: any) => {
              const title = l.title || 'Урок'
              return {
                ...l,
                guiding_questions: ensureMinItems(l.guiding_questions, 3, [
                  `Какие ключевые выводы из урока «${title}» важно подчеркнуть?`,
                  `Как применить идеи из урока «${title}» на практике?`,
                  `Какие шаги сделать далее после урока «${title}»?`,
                ]),
                expansion_tips: ensureMinItems(l.expansion_tips, 3, [
                  'Добавьте короткий практический пример/кейс.',
                  'Сделайте чек-лист шагов для применения.',
                  'Вставьте мини-упражнение для закрепления.',
                ]),
                examples_to_add: ensureMinItems(l.examples_to_add, 2, [
                  'Кейс из личной практики.',
                  'Пример из индустрии/компании.',
                ]),
              }
            })
          }

          const durationMs = Date.now() - t0
          await send({ event: 'complete', result: {
            ...course,
            metadata: {
              totalFiles: files.length,
              documentsProcessed: documents.length,
              imagesUploaded: images.length,
              model: { choice: modelChoice, provider: selectedProvider, modelId: selectedModelId },
            }
          }, durationMs, traceId })
          await writer.close()
        } catch (e: any) {
          await send({ event: 'error', message: e?.message || String(e), traceId })
          try { await writer.close() } catch {}
        }
      })()

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        }
      })
    }

    // Parse all files (documents and images) — legacy JSON branch
    let extractedFiles: ExtractedFile[]
    try {
      const userId = hasImages ? (await ensureAuthServer())?.user?.id : undefined
      extractedFiles = await parseFiles(files, undefined, userId)
    } catch (error) {
      log('error', 'parseFiles failed', { error: error instanceof Error ? error.message : String(error) })
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Не удалось обработать файлы' },
        { status: 400 }
      )
    }

    // Separate documents and images
    const documents = extractedFiles.filter(f => f.text)
    const images = extractedFiles.filter(f => f.imagePath)

    log('info', 'Files parsed', {
      extractedTotal: extractedFiles.length,
      documents: documents.length,
      images: images.length,
      firstDoc: documents[0]?.filename,
      firstImg: images[0]?.filename,
    })

    if (documents.length === 0) {
      return NextResponse.json(
        { error: 'Не найдено ни одного текстового документа для обработки' },
        { status: 400 }
      )
    }

    // Combine text from all documents
    const combinedText = combineExtractedText(documents)
    const combinedChars = combinedText.length

    // Check if combined text is too short
    if (combinedChars < 100) {
      log('warn', 'Combined text too short', { combinedChars })
      return NextResponse.json(
        {
          error: 'Текст слишком короткий для создания курса',
          details: `Найдено только ${combinedChars} символов. Минимум 100 символов требуется для генерации курса.`
        },
        { status: 400 }
      )
    }

    // Check if we need to chunk the text
    // Keep per-request input well under typical TPM limits (~30k) to prevent 429
    const chunks = chunkText(combinedText, 20000)

    if (chunks.length > 1) {
      console.warn(`Large document detected, split into ${chunks.length} chunks`)
    }

    // Use the first chunk for course generation (or combine if needed)
    const textForGeneration = chunks[0]
    log('info', 'Prepared text', {
      combinedChars,
      chunkCount: chunks.length,
      firstChunkChars: textForGeneration?.length || 0,
      firstChunkPreview: textForGeneration?.slice(0, 400) || ''
    })

    // Build prompt based on whether we're updating or creating
    let prompt = ''
    if (existingCourse && existingCourse.lessons) {
      // Update mode - preserve existing structure
      const existingLessonSummary = existingCourse.lessons
        .map((l: any, idx: number) => `${idx + 1}. ID: ${l.id}, Заголовок: "${l.title}"`)
        .join('\n')

      prompt = `
        Обнови существующий курс "${existingCourse.title}" на основе новых документов.

        СУЩЕСТВУЮЩИЕ УРОКИ (СОХРАНИ ИХ ID И СТРУКТУРУ):
        ${existingLessonSummary}

        ВАЖНЫЕ ПРАВИЛА:
        - ОБЯЗАТЕЛЬНО сохраняй существующие ID уроков (${existingCourse.lessons.map((l: any) => l.id).join(', ')})
        - Если добавляешь новые уроки, создавай для них новые уникальные ID
        - Обновляй только guidance-поля (guiding_questions, expansion_tips, examples_to_add) для существующих уроков
        - НЕ изменяй вручную отредактированное содержание (content, title, objectives)
        - Добавляй новые уроки, если новые документы содержат новую информацию
        - Следи за логической последовательностью уроков

        Новый материал для интеграции:
        ${textForGeneration}

        Создай обновленную структуру курса на русском языке.
      `
    } else {
      // Create mode - new course
      const lessonsReq = lessonCount ? `Курс должен содержать РОВНО ${lessonCount} уроков.` : `Курс должен содержать 3–5 уроков.`
      const templateBlock = thesisTemplate ? `
        ШАБЛОН ТЕЗИСОВ (СТРОГО ДЛЯ КАЖДОГО УРОКА):
        ${thesisTemplate}
        Правила:
        - Используй ровно эти пункты и их порядок
        - Не добавляй/не удаляй и не переименовывай пункты
      ` : ''

      prompt = `
        Создай образовательный курс из текста ниже. ${lessonsReq}

        Каждый урок:
        - 150-200 слов (краткий и содержательный)
        - Логическая последовательность
        - Практические примеры
        - 2-3 учебные цели
        ${thesisTemplate ? '- Тезисы-буллеты строго по шаблону ниже' : ''}

        ${templateBlock}

        Используй ТОЛЬКО информацию из текста. Не добавляй информацию извне.

        Текст:
        ${textForGeneration}
      `
    }

    // Resolve model based on selection
    let selectedProvider: 'openai' | 'anthropic' = 'openai'
    let selectedModelId: string = 'gpt-4o'
    let model: any

    log('info', 'Model selection requested', {
      modelChoice,
      availableEnvVars: {
        hasGPT4o: !!process.env.OPENAI_MODEL_GPT_4O,
        hasGPT5: !!process.env.OPENAI_MODEL_GPT_5,
        hasSonnet4: !!process.env.ANTHROPIC_MODEL_SONNET_4,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      }
    })

    if (modelChoice === 'chatgpt4o') {
      // ChatGPT-4o (fast, reliable)
      selectedProvider = 'openai'
      selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'
      model = openai(selectedModelId)
      log('info', 'Selected ChatGPT-4o', { modelId: selectedModelId })
    } else if (modelChoice === 'chatgpt5') {
      // ChatGPT-5 (with reasoning)
      selectedProvider = 'openai'
      selectedModelId = process.env.OPENAI_MODEL_GPT_5 || 'gpt-5'
      model = openai(selectedModelId)
      log('info', 'Selected ChatGPT-5', { modelId: selectedModelId })
    } else if (modelChoice === 'sonnet4') {
      // Claude Sonnet 4 (Anthropic)
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const anthropicPkg = ['@ai-sdk','/anthropic'].join('')
          const mod = await import(anthropicPkg as any)
          // @ts-ignore - dynamic import type
          const createAnthropic = (mod as any).createAnthropic
          const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
          selectedProvider = 'anthropic'
          selectedModelId = process.env.ANTHROPIC_MODEL_SONNET_4 || 'claude-sonnet-4-20250514'
          model = anthropic(selectedModelId)
          log('info', 'Selected Claude Sonnet 4', { modelId: selectedModelId })
        } catch (e) {
          log('warn', 'Anthropic SDK not available, falling back to GPT-4o', { error: String(e) })
          selectedProvider = 'openai'
          selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'
          model = openai(selectedModelId)
        }
      } else {
        log('warn', 'ANTHROPIC_API_KEY not set; using GPT-4o fallback')
        selectedProvider = 'openai'
        selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'
        model = openai(selectedModelId)
      }
    } else {
      // Default fallback to GPT-4o
      log('warn', 'Unknown model choice, defaulting to GPT-4o', { modelChoice })
      selectedProvider = 'openai'
      selectedModelId = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'
      model = openai(selectedModelId)
    }

    // Validate provider keys for the finally selected provider
    if (selectedProvider === 'openai' && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Ключ API OpenAI не настроен. Добавьте OPENAI_API_KEY в .env.local.' },
        { status: 500 }
      )
    }
    if (selectedProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Ключ API Anthropic не настроен. Добавьте ANTHROPIC_API_KEY в .env.local или выберите другую модель.' },
        { status: 500 }
      )
    }

    log('info', 'Final model configuration', {
      requestedChoice: modelChoice,
      selectedProvider,
      selectedModelId,
      envVars: {
        OPENAI_MODEL_GPT_4O: process.env.OPENAI_MODEL_GPT_4O,
        OPENAI_MODEL_GPT_5: process.env.OPENAI_MODEL_GPT_5,
        ANTHROPIC_MODEL_SONNET_4: process.env.ANTHROPIC_MODEL_SONNET_4,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      }
    })

    log('info', 'Prompt details', {
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 500),
      isUpdateMode: !!existingCourse,
    })

    // Generate structured course (per-part to avoid output caps)
    let courseStructure: any
    try {
      // 1) If creating: outline -> per-lesson
      if (!existingCourse) {
        const outlineSchema = z.object({
          title: z.string(),
          description: z.string().optional(),
          outline: z.array(z.object({
            lesson_id: z.string(),
            title: z.string(),
            logline: z.string().optional(),
            bullets: z.array(z.string()).min(1).max(7),
          })).min(3).max(20)
        })

        const lessonsReq = lessonCount ? `Курс должен содержать РОВНО ${lessonCount} уроков.` : `Курс должен содержать 3–7 уроков.`
        const templateBlock = thesisTemplate ? `\nШАБЛОН ТЕЗИСОВ (СТРОГО ДЛЯ КАЖДОГО УРОКА):\n${thesisTemplate}\nПравила:\n- Используй ровно эти пункты и их порядок\n- Не добавляй/не удаляй и не переименовывай пункты\n` : ''
        const outlinePrompt = `Сделай структуру курса из текста ниже. ${lessonsReq}${templateBlock}\nИспользуй ТОЛЬКО информацию из текста.\n\nТекст:\n${textForGeneration}`

        const outlineRes = await generateObject({ model, prompt: outlinePrompt, schema: outlineSchema, maxOutputTokens: 2000 })
        const outline = outlineRes.object
        log('info', 'Outline generated (legacy branch)', { lessons: outline.outline.length })

        const lessonSchema = z.object({
          id: z.string().optional(),
          title: z.string(),
          logline: z.string().optional(),
          content: z.string(),
          objectives: z.array(z.string()).min(2).max(4).optional(),
          guiding_questions: z.array(z.string()).min(3).max(8).optional(),
          expansion_tips: z.array(z.string()).min(3).max(6).optional(),
          examples_to_add: z.array(z.string()).min(2).max(5).optional(),
        })

        const lessons: any[] = []
        let idx = 0
        for (const o of outline.outline) {
          idx++
          const lessonPrompt = `Сгенерируй детальный урок на русском. Заголовок: "${o.title}". Используй только факты из источника. ${thesisTemplate ? 'Придерживайся заданного шаблона тезисов.' : ''}\n\nИсточник:\n${textForGeneration}`
          const res = await generateObject({ model, prompt: lessonPrompt, schema: lessonSchema, maxOutputTokens: 1100 })
          const lesson = res.object
          if (!lesson.id) lesson.id = o.lesson_id
          lessons.push(lesson)
          if (idx % 3 === 0) log('info', 'Lessons generated so far', { count: idx })
        }

        courseStructure = { title: outline.title, description: outline.description, lessons }
      } else {
        // 2) If updating: update guidance per existing lesson (lightweight)
        const existing = existingCourse
        const guideSchema = z.object({
          guiding_questions: z.array(z.string()).min(3).max(8).optional(),
          expansion_tips: z.array(z.string()).min(3).max(6).optional(),
          examples_to_add: z.array(z.string()).min(2).max(5).optional(),
        })

        const updatedLessons: any[] = []
        let i = 0
        for (const l of existing.lessons || []) {
          i++
          const updPrompt = `Обнови вспомогательные поля урока (только списки) по новому материалу. Урок: "${l.title}".\nВерни ТОЛЬКО поля guiding_questions (3-8), expansion_tips (3-6), examples_to_add (2-5).\nИсточник:\n${textForGeneration}`
          try {
            const res = await generateObject({ model, prompt: updPrompt, schema: guideSchema, maxOutputTokens: 400 })
            const g = res.object
            updatedLessons.push({
              ...l,
              guiding_questions: g.guiding_questions ?? l.guiding_questions,
              expansion_tips: g.expansion_tips ?? l.expansion_tips,
              examples_to_add: g.examples_to_add ?? l.examples_to_add,
            })
          } catch (e) {
            // On any failure keep lesson as is
            updatedLessons.push(l)
          }
          if (i % 5 === 0) log('info', 'Updated lessons so far', { count: i })
        }
        courseStructure = { title: existing.title, description: existing.description, lessons: updatedLessons }
      }
    } catch (err: any) {
      // AI SDK may attach useful fields: cause, text, value, usage, response
      log('error', 'generateObject failed', {
        name: err?.name,
        message: err?.message,
        stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
        cause: err?.cause?.issues || err?.cause || undefined,
        usage: err?.usage || undefined,
        responseStatus: err?.response?.status || err?.statusCode || undefined,
        responseHeaders: err?.response?.headers || undefined,
        responseModel: err?.response?.modelId || undefined,
        responseBody: err?.response?.body ? JSON.stringify(err.response.body)?.slice(0, 1000) : undefined,
        textSnippet: typeof err?.text === 'string' ? err.text.slice(0, 600) : undefined,
        valueSample: err?.value ? JSON.stringify(err.value)?.slice(0, 600) : undefined,
        errorKeys: Object.keys(err || {}),
        fullError: JSON.stringify(err, null, 2)?.slice(0, 2000),
      })

      // Check for max_output_tokens error
      const incompletReason = err?.response?.body?.incomplete_details?.reason
      if (err?.name === 'AI_NoObjectGeneratedError' && incompletReason === 'max_output_tokens') {
        const res = NextResponse.json({
          error: 'model_output_truncated',
          message: 'Модель не успела сгенерировать весь курс (превышен лимит токенов). Попробуйте уменьшить количество уроков или загрузите меньший документ.',
          provider: selectedProvider,
          modelId: selectedModelId,
          traceId
        }, { status: 422 })
        res.headers.set('X-Trace-Id', traceId)
        return res
      }

      // Provide more helpful error messages
      let userMessage = 'Не удалось сгенерировать курс'
      let errorDetails = err?.message || 'Unknown error'

      // Check for common error patterns
      if (err?.message?.includes('API key')) {
        userMessage = 'Ошибка API ключа'
        errorDetails = 'Проверьте настройки API ключа OpenAI в переменных окружения'
      } else if (err?.message?.includes('rate limit')) {
        userMessage = 'Превышен лимит запросов'
        errorDetails = 'Пожалуйста, подождите немного и попробуйте снова'
      } else if (err?.message?.includes('timeout')) {
        userMessage = 'Превышено время ожидания'
        errorDetails = 'Попробуйте загрузить меньший файл или уменьшите количество уроков'
      } else if (err?.cause?.issues) {
        userMessage = 'Ошибка валидации структуры курса'
        errorDetails = JSON.stringify(err.cause.issues)
      }

      const res = NextResponse.json({
        error: userMessage,
        details: errorDetails,
        provider: selectedProvider,
        modelId: selectedModelId,
        traceId
      }, { status: 500 })
      res.headers.set('X-Trace-Id', traceId)
      return res
    }

    // Normalize generated structure to ensure minimum helpful content
    const ensureMinItems = (arr: string[] | undefined, min: number, fillers: string[]): string[] => {
      const base = Array.isArray(arr) ? arr.filter(Boolean).map(s => String(s).trim()).filter(Boolean) : []
      let i = 0
      while (base.length < min) {
        base.push(fillers[i % fillers.length])
        i++
      }
      return base
    }

    if (courseStructure?.lessons?.length) {
      courseStructure.lessons = courseStructure.lessons.map((l: any) => {
        const title = l.title || 'Урок'
        return {
          ...l,
          guiding_questions: ensureMinItems(
            l.guiding_questions,
            3,
            [
              `Какие ключевые выводы из урока «${title}» важно подчеркнуть?`,
              `Как применить идеи из урока «${title}» на практике?`,
              `Какие шаги сделать далее после урока «${title}»?`,
            ]
          ),
          expansion_tips: ensureMinItems(
            l.expansion_tips,
            3,
            [
              'Добавьте короткий практический пример/кейс.',
              'Сделайте чек-лист шагов для применения.',
              'Вставьте мини-упражнение для закрепления.',
            ]
          ),
          examples_to_add: ensureMinItems(
            l.examples_to_add,
            2,
            [
              'Кейс из личной практики.',
              'Пример из индустрии/компании.',
            ]
          ),
        }
      })
    }

    // Return course structure along with extracted file info
    const durationMs = Date.now() - t0
    log('info', 'Success', {
      lessons: courseStructure?.lessons?.length || 0,
      durationMs,
    })

    const res = NextResponse.json({
      ...courseStructure,
      metadata: {
        totalFiles: files.length,
        documentsProcessed: documents.length,
        imagesUploaded: images.length,
        model: {
          choice: modelChoice,
          provider: selectedProvider,
          modelId: selectedModelId,
        },
        extractedFiles: extractedFiles.map(f => ({
          id: f.id,
          filename: f.filename,
          mime: f.mime,
          hasText: !!f.text,
          hasImage: !!f.imagePath,
          imagePath: f.imagePath,
        })),
      },
    })
    res.headers.set('X-Trace-Id', traceId)
    return res
  } catch (error) {
    const traceId = (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
    console.error(`[process-files][${traceId}] Unhandled error`, error)
    const res = NextResponse.json({ error: 'Не удалось обработать файлы', traceId }, { status: 500 })
    res.headers.set('X-Trace-Id', traceId)
    return res
  }
}
