import { type NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { parseFiles, ExtractedFile } from '@/lib/parsers'
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
    const modelChoice = (formData.get('modelChoice') as string | null)?.toLowerCase() || (process.env.DEFAULT_MODEL_CHOICE || 'chatgpt5')

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

    // Parse all files (documents and images)
    let extractedFiles: ExtractedFile[]
    try {
      extractedFiles = await parseFiles(files)
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
      prompt = `
        Преобразуй следующий текст из документов в структурированный образовательный курс с 3-6 уроками.

        Каждый урок должен:
        - Содержать 200-300 слов (краткий, но содержательный)
        - Следовать логической последовательности
        - Быть увлекательным и образовательным
        - Включать практические примеры, где это возможно
        - Иметь четкие учебные цели

        ДЛЯ КАЖДОГО УРОКА также создай:
        - Краткий логлайн (1-2 предложения о чём урок)
        - 3-5 тезисов-буллетов (основные идеи урока)
        - 4-6 наводящих вопросов, которые помогут автору расширить материал
        - 3-4 практических советов по расширению контента
        - 2-3 идей примеров или кейсов для иллюстрации

        ВАЖНО: Используй ТОЛЬКО информацию из предоставленного текста. Не добавляй информацию, которой нет в исходном материале.
        Создавай уроки на основе реального содержания документов.

        Текст для преобразования:
        ${textForGeneration}

        Ответ должен быть на русском языке.
      `
    }

    // Resolve model based on selection
    let selectedProvider: 'openai' | 'anthropic' = 'openai'
    let selectedModelId: string = process.env.OPENAI_MODEL_CHAT_GPT_5 || 'gpt-4o'
    let model: any = openai(selectedModelId)

    if (modelChoice === 'sonnet4') {
      // Try Anthropic dynamically; if unavailable, fallback to OpenAI
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const anthropicPkg = ['@ai-sdk','/anthropic'].join('')
          const mod = await import(anthropicPkg as any)
          // @ts-ignore - dynamic import type
          const createAnthropic = (mod as any).createAnthropic
          const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
          selectedProvider = 'anthropic'
          selectedModelId = process.env.ANTHROPIC_MODEL_SONNET_4 || 'claude-3-5-sonnet-20241022'
          model = anthropic(selectedModelId)
        } catch (e) {
          console.warn('Anthropic SDK not available, falling back to OpenAI:', e)
          selectedProvider = 'openai'
          selectedModelId = process.env.OPENAI_MODEL_CHAT_GPT_5 || 'gpt-4o'
          model = openai(selectedModelId)
        }
      } else {
        console.warn('ANTHROPIC_API_KEY not set; using OpenAI fallback')
        selectedProvider = 'openai'
        selectedModelId = process.env.OPENAI_MODEL_CHAT_GPT_5 || 'gpt-4o'
        model = openai(selectedModelId)
      }
    } else {
      // Explicit ChatGPT 5 choice → OpenAI
      selectedProvider = 'openai'
      selectedModelId = process.env.OPENAI_MODEL_CHAT_GPT_5 || 'gpt-4o'
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

    log('info', 'Model selected', {
      provider: selectedProvider,
      modelId: selectedModelId,
      envVars: {
        OPENAI_MODEL_CHAT_GPT_5: process.env.OPENAI_MODEL_CHAT_GPT_5,
        ANTHROPIC_MODEL_SONNET_4: process.env.ANTHROPIC_MODEL_SONNET_4,
        DEFAULT_MODEL_CHOICE: process.env.DEFAULT_MODEL_CHOICE,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      }
    })

    log('info', 'Prompt details', {
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 500),
      isUpdateMode: !!existingCourse,
    })

    // Generate structured course
    let courseStructure: any
    try {
      // Choose output budget; GPT-5 slightly higher for complex courses
      const resolvedMaxOutput = Number(
        process.env.OPENAI_MAX_OUTPUT_TOKENS || (selectedModelId?.startsWith('gpt-5') ? 4000 : 3000)
      )

      log('info', 'Calling generateObject', {
        provider: selectedProvider,
        modelId: selectedModelId,
        maxOutputTokens: resolvedMaxOutput,
      })

      const result = await generateObject({
        model,
        prompt,
        maxOutputTokens: resolvedMaxOutput,
        // Removed reasoning to speed up generation (3-5x faster)
        schema: z.object({
          title: z.string().describe('Название курса на русском языке'),
          description: z.string().describe('Описание курса на русском языке'),
        outline: z.array(
          z.object({
            lesson_id: z.string().describe('Идентификатор урока для стабильности'),
            title: z.string().describe('Название урока'),
            logline: z.string().describe('Краткий логлайн урока (1-2 предложения)'),
            bullets: z.array(z.string()).min(1).max(7).describe('Тезисы урока'),
          })
        ),
          lessons: z.array(
            z.object({
              id: z.string().describe('Уникальный идентификатор урока'),
              title: z.string().describe('Название урока на русском языке'),
              logline: z.string().optional().describe('Краткий логлайн урока'),
              content: z.string().describe('Содержание урока на русском языке (200-300 слов)'),
              objectives: z.array(z.string()).describe('Учебные цели на русском языке'),
            guiding_questions: z
              .array(z.string())
              .min(3)
              .max(6)
              .describe('Наводящие вопросы для расширения материала'),
            expansion_tips: z
              .array(z.string())
              .min(3)
              .max(4)
              .describe('Практические советы по расширению контента'),
            examples_to_add: z
              .array(z.string())
              .min(2)
              .max(3)
              .describe('Идеи примеров и кейсов'),
            })
          ),
        }),
      })
      courseStructure = result.object
      log('info', 'generateObject succeeded', {
        hasTitle: !!result.object?.title,
        lessonsCount: result.object?.lessons?.length || 0,
        outlineCount: result.object?.outline?.length || 0,
      })
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

      const res = NextResponse.json({
        error: 'AI генерация не прошла валидацию',
        details: err?.message || 'Unknown error',
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
      outline: courseStructure?.outline?.length || 0,
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
