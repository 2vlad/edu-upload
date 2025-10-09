"use client"

import type React from "react"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, ArrowRight, Sparkles, Image as ImageIcon, Code, File, Link as LinkIcon, Loader2, X, ExternalLink } from "lucide-react"
import { CircularProgress } from "@/components/ui/loading-spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AuthButton } from "@/components/AuthButton"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/hooks/use-toast"
import { createCourseFromPayload } from "@/app/actions/courses"
import { mergeCourseUpdates } from "@/lib/courseUpdates"

// Supported file types
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'text/markdown',
  'text/plain',
  'application/rtf',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

const SUPPORTED_EXTENSIONS = '.pdf,.docx,.doc,.md,.txt,.rtf,.html,.png,.jpg,.jpeg,.webp,.gif'

const MAX_URLS = 20

// URL source type
interface URLSource {
  id: string
  url: string
  title: string
  domain: string
  excerpt: string
  wordCount: number
}

// Get icon based on file type
const getFileIcon = (file: File) => {
  if (file.type.startsWith('image/')) {
    return <ImageIcon className="w-5 h-5 text-primary" />
  }
  if (file.type === 'text/html' || file.type === 'text/markdown') {
    return <Code className="w-5 h-5 text-primary" />
  }
  if (file.type === 'application/pdf') {
    return <FileText className="w-5 h-5 text-primary" />
  }
  return <File className="w-5 h-5 text-primary" />
}

// Validate file type
const isSupportedFile = (file: File): boolean => {
  return SUPPORTED_MIME_TYPES.includes(file.type)
}

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([])
  const [urls, setUrls] = useState<URLSource[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isExtractingUrl, setIsExtractingUrl] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingMessage, setProcessingMessage] = useState("")
  const [etaMs, setEtaMs] = useState<number | null>(null)
  type Stage = 'idle' | 'upload' | 'extract' | 'analyze' | 'generate' | 'finalize' | 'done'
  const [stage, setStage] = useState<Stage>('idle')
  const stageStartRef = useRef<number | null>(null)
  const uploadBytesRef = useRef({ loaded: 0, total: 0, startedAt: 0, lastTs: 0, lastLoaded: 0, avgBps: 0 })
  const progressTimerRef = useRef<number | null>(null)
  const advancedAfterUploadRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  // Model selection: "chatgpt5" | "sonnet4"
  const [modelChoice, setModelChoice] = useState<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem('preferredModel') || (process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'chatgpt4o')
      : 'chatgpt4o'
  )
  const router = useRouter()
  const { user, isAnonymous } = useAuth()
  const { toast } = useToast()
  // Optional generation options
  const [lessonCount, setLessonCount] = useState<number | ''>('')
  const [thesisTemplateText, setThesisTemplateText] = useState<string>('')

  // Stage labels and weights - defined early for use in callbacks
  const STAGE_WEIGHTS: Record<Exclude<Stage, 'idle' | 'done'>, number> = useMemo(() => ({
    upload: 0.18,
    extract: 0.12,
    analyze: 0.18,
    generate: 0.45,
    finalize: 0.07,
  }), [])

  const STAGE_ORDER: Exclude<Stage, 'idle' | 'done'>[] = useMemo(() => ['upload', 'extract', 'analyze', 'generate', 'finalize'], [])

  // Upload exactly one file; when existingCourse is provided,
  // server will merge context and return updated course.
  const uploadSingleFile = useCallback(async (file: File, existingCourse?: any) => {
    // Prepare form data
    const formData = new FormData()
    formData.append('files', file)
    formData.append('modelChoice', modelChoice)
    formData.append('wantsStream', '1') // Backup for streaming preference (in case header is stripped)
    if (existingCourse) formData.append('existingCourse', JSON.stringify(existingCourse))
    if (lessonCount && Number(lessonCount) > 0) formData.append('lessonCount', String(lessonCount))
    if (thesisTemplateText) formData.append('thesisTemplate', thesisTemplateText)

    // Compute weighted upload progress (real bytes)
    const weightBefore = 0 // upload — первый этап в визуальном цикле при создании
    const weightUpload = STAGE_WEIGHTS.upload

    const payload = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/process-files', true)
      // NDJSON streaming from server; keep default responseType (text)
      // We'll set a header to opt-in for streaming progress
      xhr.setRequestHeader('X-Client-Stream', '1')

      console.debug('[upload:start]', { name: file.name, size: file.size, type: file.type })

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return
        const frac = Math.min(1, e.loaded / Math.max(1, e.total))
        const percent = (weightBefore + frac * weightUpload) * 100
        setProcessingProgress(Math.min(99, percent))
        setProcessingMessage('Загрузка файлов...')
        console.debug('[upload:progress]', {
          loaded: e.loaded,
          total: e.total,
          frac: Number(frac.toFixed(3)),
          visualPercent: Number(percent.toFixed(1))
        })
      }

      // Parse NDJSON events from response stream for real progress after upload
      let lastIndex = 0
      let resultData: any = null
      const stageOrderLocal: Stage[] = ['upload','extract','analyze','generate','finalize'] as any
      const weightBeforeStage = (st: Stage) => {
        const idx = stageOrderLocal.indexOf(st)
        if (idx <= 0) return 0
        return stageOrderLocal.slice(0, idx).reduce((s, k) => s + (STAGE_WEIGHTS as any)[k] || 0, 0)
      }

      xhr.onprogress = () => {
        const text = xhr.responseText || ''
        const chunk = text.slice(lastIndex)
        lastIndex = text.length
        const lines = chunk.split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const evt = JSON.parse(line)
            if (evt.event === 'stage') {
              const st = evt.stage as Stage
              if (st && st !== 'upload') {
                setStage(st)
                const base = weightBeforeStage(st) * 100
                setProcessingProgress((prev) => Math.max(prev, Math.min(99, base)))
                setProcessingMessage(st === 'extract' ? 'Извлечение текста...' : st === 'analyze' ? 'Анализ содержимого...' : st === 'generate' ? 'Генерация уроков...' : 'Подготовка курса...')
                console.debug('[ndjson:stage]', evt)
              }
            } else if (evt.event === 'progress') {
              const st = evt.stage as Stage
              if (evt.total && typeof evt.done === 'number') {
                const w = (STAGE_WEIGHTS as any)[st] || 0
                const before = weightBeforeStage(st)
                const frac = Math.max(0, Math.min(1, evt.done / evt.total))
                const percent = Math.min(99, (before + frac * w) * 100)
                setProcessingProgress(percent)
                if (st !== stage) setStage(st)
                console.debug('[ndjson:progress]', { st, done: evt.done, total: evt.total, percent: Number(percent.toFixed(1)) })
              }
            } else if (evt.event === 'error') {
              console.error('[ndjson:error]', evt.message)
              setError(evt.message || 'Ошибка обработки на сервере')
            } else if (evt.event === 'complete') {
              resultData = evt.result
              setProcessingProgress(100)
              setStage('done')
              console.debug('[ndjson:complete]', { durationMs: evt.durationMs })
            }
          } catch {
            // ignore partial line
          }
        }
      }

      xhr.onload = () => {
        const ct = xhr.getResponseHeader('content-type') || ''
        const json = ct.includes('application/json') ? ((): any => { try { return JSON.parse(xhr.responseText) } catch { return null } })() : null
        console.debug('[upload:load]', { status: xhr.status, ct, hasJson: !!json })
        if (xhr.status >= 200 && xhr.status < 300) {
          // Если upload-прогресс не пришёл (очень маленькие файлы), слегка подвинем шкалу
          setProcessingProgress((prev) => (prev < (weightUpload * 100 * 0.5) ? weightUpload * 100 * 0.5 : prev))
          // Сразу переведём стадию в extract, чтобы не висеть на 18%
          setStage('extract')
          setProcessingMessage('Анализ документов...')
          console.debug('[stage] force -> extract after upload load')
          // Prefer streamed final result if present
          resolve((resultData ?? json ?? {}))
        } else {
          const reason = xhr.getResponseHeader('X-Auth-Reason')
          if (xhr.status === 401 && reason === 'anonymous-signin-disabled') {
            console.warn('[upload:error] anonymous-signin-disabled')
            reject(new Error('Загрузка изображений требует входа в систему. Войдите и попробуйте снова.'))
            return
          }
          if (xhr.status === 413) {
            console.warn('[upload:error] HTTP 413')
            reject(new Error('Размер запроса слишком большой (413). Сожмите файл или загрузите по одному.'))
            return
          }
          console.error('[upload:error]', { status: xhr.status, json })
          reject(new Error(json?.message || json?.error || `HTTP ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('Сеть недоступна'))
      xhr.send(formData)
    })

    // Optional: log model used
    if ((payload as any)?.metadata?.model) {
      const m = (payload as any).metadata.model
      console.log('✅ Model used:', { requested: m.choice, provider: m.provider, modelId: m.modelId })
    }
    return payload
  }, [modelChoice, lessonCount, thesisTemplateText, STAGE_WEIGHTS])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter(isSupportedFile)
    if (droppedFiles.length < e.dataTransfer.files.length) {
      setError('Некоторые файлы не поддерживаются и были пропущены')
    }
    setFiles((prev) => [...prev, ...droppedFiles])
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(isSupportedFile)
      if (selectedFiles.length < e.target.files.length) {
        setError('Некоторые файлы не поддерживаются и были пропущены')
      }
      setFiles((prev) => [...prev, ...selectedFiles])
    }
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // URL validation helper
  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  // Extract URL content
  const handleExtractUrl = useCallback(async () => {
    if (!urlInput.trim() || !isValidUrl(urlInput.trim())) {
      toast({
        title: "Недействительный URL",
        description: "Пожалуйста, введите правильный HTTP или HTTPS URL",
        variant: "destructive",
      })
      return
    }

    if (urls.length >= MAX_URLS) {
      toast({
        title: "Лимит достигнут",
        description: `Максимум ${MAX_URLS} ссылок на курс`,
        variant: "destructive",
      })
      return
    }

    setIsExtractingUrl(true)
    setError(null)

    try {
      const response = await fetch('/api/sources/ingest-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Не удалось извлечь контент из URL')
      }

      const data = await response.json()

      const urlObj = new URL(urlInput.trim())
      const domain = urlObj.hostname

      const newUrlSource: URLSource = {
        id: crypto.randomUUID(),
        url: urlInput.trim(),
        title: data.title || 'URL Source',
        domain,
        excerpt: data.text?.slice(0, 150) + (data.text?.length > 150 ? '...' : ''),
        wordCount: data.wordCount || 0,
      }

      setUrls((prev) => [...prev, newUrlSource])
      setUrlInput('')

      toast({
        title: "URL добавлен",
        description: `Извлечено ${data.wordCount} слов из ${domain}`,
      })
    } catch (error: any) {
      console.error('Error extracting URL:', error)
      setError(error.message || 'Не удалось извлечь контент из URL')
      toast({
        title: "Ошибка",
        description: error.message || 'Не удалось извлечь контент из URL',
        variant: "destructive",
      })
    } finally {
      setIsExtractingUrl(false)
    }
  }, [urlInput, urls.length, isValidUrl, toast])

  const removeUrl = useCallback((id: string) => {
    setUrls((prev) => prev.filter((url) => url.id !== id))
  }, [])

  const stageLabel = useMemo(() => {
    switch (stage) {
      case 'upload': return 'Загрузка файлов...'
      case 'extract': return 'Извлечение текста...'
      case 'analyze': return 'Анализ содержимого...'
      case 'generate': return 'Генерация уроков...'
      case 'finalize': return 'Подготовка курса...'
      case 'done': return 'Готово!'
      default: return processingMessage || ''
    }
  }, [stage, processingMessage])

  // Rough duration predictors based on file sizes and model
  function predictDurations(fls: File[], model: string) {
    const sizes = fls.reduce((acc, f) => {
      const mb = f.size / (1024 * 1024)
      if (f.type.startsWith('image/')) acc.imageMB += mb
      else acc.docMB += mb
      return acc
    }, { docMB: 0, imageMB: 0 })

    const speedFactor = 1
    const providerFactor = model === 'sonnet4' ? 0.9 : 1

    const extract = Math.round(speedFactor * (800 + sizes.docMB * 900 + sizes.imageMB * 350))
    const analyze = Math.round(speedFactor * (1200 + sizes.docMB * 1200))
    const generate = Math.round(speedFactor * providerFactor * (3200 + sizes.docMB * 5200))
    const finalize = Math.round(600 + fls.length * 150)
    return { extract, analyze, generate, finalize }
  }

  const predicted = useMemo(() => predictDurations(files, modelChoice), [files, modelChoice])

  // Progress driver for non-upload stages
  useEffect(() => {
    if (!isProcessing) return

    setProcessingMessage(stageLabel)

    if (stage === 'upload' || stage === 'done' || stage === 'idle') return

    if (!stageStartRef.current) stageStartRef.current = performance.now()

    const durationByStage: Record<'extract' | 'analyze' | 'generate' | 'finalize', number> = {
      extract: predicted.extract,
      analyze: predicted.analyze,
      generate: predicted.generate,
      finalize: predicted.finalize,
    }

    const prevWeight = STAGE_ORDER
      .slice(0, STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]))
      .reduce((s, k) => s + STAGE_WEIGHTS[k], 0)

    function tick() {
      const now = performance.now()
      const elapsed = (now - (stageStartRef.current || now))
      const duration = durationByStage[stage as keyof typeof durationByStage] || 1000
      const stageFrac = Math.min(1, elapsed / duration)
      const base = prevWeight * 100
      const current = base + stageFrac * STAGE_WEIGHTS[stage as keyof typeof STAGE_WEIGHTS] * 100
      const cap = 99
      setProcessingProgress(Math.min(current, cap))

      const remainingThis = Math.max(0, duration - elapsed)
      const remainingNext = STAGE_ORDER
        .slice(STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) + 1)
        .reduce((sum, k) => sum + (k === 'upload' ? 0 : (predicted as any)[k] || 0), 0)
      setEtaMs(Math.round(remainingThis + remainingNext))

      if (stageFrac >= 1) {
        const idx = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number])
        if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
          setStage(STAGE_ORDER[idx + 1])
          stageStartRef.current = null
        }
      }
    }

    if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current)
    const rafLoop = () => {
      tick()
      progressTimerRef.current = requestAnimationFrame(rafLoop)
    }
    progressTimerRef.current = requestAnimationFrame(rafLoop)
    return () => {
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [isProcessing, stage, predicted, STAGE_ORDER, STAGE_WEIGHTS, stageLabel])

  const handleCreateCourse = async () => {
    if (files.length === 0 && urls.length === 0) return

    setIsProcessing(true)
    setError(null)
    setProcessingProgress(0)
    setProcessingMessage("Начинаем обработку...")
    setEtaMs(null)
    setStage('upload')
    stageStartRef.current = performance.now()

    try {
      // Sequential upload to avoid 413 and to support large batches
      const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || '4.5')
      const maxBytes = Math.floor(maxMb * 1024 * 1024 * 0.92)

      let aggregated: any | null = null
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.size > maxBytes) {
          throw new Error(`Файл «${file.name}» слишком большой (${(file.size/1024/1024).toFixed(1)} MB). Лимит запроса ~${maxMb} MB.`)
        }
        console.debug('[pipeline] process file', { index: i, name: file.name, size: file.size })
        setProcessingMessage(`Обработка файла ${i + 1} из ${files.length}…`)
        if (i === 0) {
          aggregated = await uploadSingleFile(file)
        } else {
          const part = await uploadSingleFile(file, aggregated)
          const { mergedCourse } = mergeCourseUpdates(aggregated, part)
          aggregated = mergedCourse
        }
        if (stage === 'upload') { setStage('extract'); stageStartRef.current = null; console.debug('[stage] -> extract') }
      }
      const data = aggregated

      // Set progress to 100% when done
      console.debug('[pipeline] done, setting progress 100')
      setProcessingProgress(100)
      setProcessingMessage("Готово!")
      setStage('done')

      // Check if user is authenticated (not anonymous)
      if (user && !isAnonymous) {
        // Authenticated user: save to database
        try {
          setProcessingMessage("Сохранение курса...")
          const result = await createCourseFromPayload({
            title: data.title,
            description: data.description,
            lessons: data.lessons,
            sourceFiles: data.sourceFiles?.map((f: any) => ({
              filename: f.filename,
              mime: f.mime,
              text_content: f.text || null,
              storage_path: null,
            })),
          })

          if (result.success && result.slug) {
            toast({
              title: "Курс сохранен",
              description: "Курс успешно сохранен в ваш профиль",
            })

            // Small delay to show completion
            setTimeout(() => {
              router.push(`/courses/${result.slug}`)
            }, 500)
            try { localStorage.setItem('draftCourseSlug', result.slug) } catch {}
          } else {
            throw new Error(result.error || "Не удалось сохранить курс")
          }
        } catch (saveError) {
          console.error("Error saving to database:", saveError)
          toast({
            title: "Ошибка сохранения",
            description: "Курс сгенерирован, но не удалось сохранить в базу данных",
            variant: "destructive",
          })

          // Fallback to localStorage
          localStorage.setItem("courseData", JSON.stringify(data))
          setTimeout(() => {
            router.push("/outline")
          }, 500)
        }
      } else {
        // Anonymous user: save to localStorage
        localStorage.setItem("courseData", JSON.stringify(data))

        // Small delay to show completion
        setTimeout(() => {
          router.push("/outline")
        }, 500)
      }
    } catch (error) {
      console.error("Error creating course:", error)
      setError(error instanceof Error ? error.message : "Произошла ошибка при создании курса")
      setIsProcessing(false)
      setProcessingProgress(0)
      setStage('idle')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative">
      {/* Auth Button */}
      <div className="absolute top-6 right-6 z-[60]">
        <AuthButton />
      </div>

      {/* Loading Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
          style={{
            animation: "fade-in-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          <Card className="p-8 max-w-sm w-full mx-4"
            style={{
              animation: "scale-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
            }}
          >
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                <CircularProgress
                  size="lg"
                  progress={processingProgress}
                  label={processingMessage}
                />
                {processingProgress === 100 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                )}
              </div>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {files.length} {files.length === 1 ? 'файл' : 'файла'} обрабатывается
                </p>
                <p className="text-xs text-muted-foreground/70">Обычно занимает 20–60 сек</p>
              </div>
            </div>
          </Card>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">Создайте курс из ваших материалов</h1>
          <p className="text-lg text-muted-foreground text-pretty">
            Загрузите документы и изображения, и ИИ превратит их в структурированные увлекательные уроки
          </p>
        </div>

        <Card className="p-8 mb-8">
          {/* Model selector */}
          <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <label className="text-sm text-muted-foreground">Модель:</label>
            <Select
              value={modelChoice}
              onValueChange={(v) => {
                setModelChoice(v)
                try { localStorage.setItem('preferredModel', v) } catch {}
              }}
            >
              <SelectTrigger className="w-full sm:w-[260px] rounded-[30px] bg-white">
                <SelectValue placeholder="Выберите модель" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatgpt4o">ChatGPT-4o (OpenAI)</SelectItem>
                <SelectItem value="chatgpt5">ChatGPT-5 (OpenAI)</SelectItem>
                <SelectItem value="sonnet4">Claude Sonnet 4 (Anthropic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional generation options */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground min-w-40">Количество уроков (опц.)</label>
              <Input
                type="number"
                min={1}
                value={lessonCount}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '') setLessonCount('')
                  else setLessonCount(Math.max(1, Number(v)))
                }}
                className="rounded-[30px] w-full bg-white"
                placeholder="например, 5"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-2 block">Промпт / шаблон (опц.)</label>
              <Textarea
                value={thesisTemplateText}
                onChange={(e) => setThesisTemplateText(e.target.value)}
                placeholder="Введите дополнительные инструкции или шаблон структуры курса..."
                className="rounded-[20px] bg-white min-h-[100px] resize-none"
              />
              {thesisTemplateText && (
                <p className="text-xs text-muted-foreground mt-2">Генерация будет учитывать ваши инструкции при создании курса.</p>
              )}
            </div>
          </div>

          {/* Tabs for Files and Links */}
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 rounded-[30px]">
              <TabsTrigger value="files" className="rounded-[25px]">Файлы</TabsTrigger>
              <TabsTrigger value="links" className="rounded-[25px]">Ссылки</TabsTrigger>
            </TabsList>

            {/* Files Tab */}
            <TabsContent value="files">
              <div
                className={`border-2 border-dashed rounded-[30px] p-12 text-center transition-colors ${
                  isDragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-16 h-16 mx-auto mb-6 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Перетащите файлы сюда</h3>
                <p className="text-muted-foreground mb-6">
                  Поддерживаются PDF, DOCX, MD, TXT, RTF, HTML и изображения
                </p>

                <input type="file" multiple accept={SUPPORTED_EXTENSIONS} onChange={handleFileSelect} className="hidden" id="file-upload" />
                <label htmlFor="file-upload">
                  <Button variant="outline" className="cursor-pointer rounded-[30px] bg-white" asChild>
                    <span>Выбрать файлы</span>
                  </Button>
                </label>
              </div>
            </TabsContent>

            {/* Links Tab */}
            <TabsContent value="links">
              <div className="border-2 border-dashed rounded-[30px] p-12">
                <LinkIcon className="w-16 h-16 mx-auto mb-6 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2 text-center">Добавить ссылку</h3>
                <p className="text-muted-foreground mb-6 text-center">
                  Извлеките контент из веб-страниц (до {MAX_URLS} ссылок)
                </p>

                <div className="flex gap-3 max-w-2xl mx-auto">
                  <Input
                    type="url"
                    placeholder="https://example.com/article"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !isExtractingUrl) {
                        handleExtractUrl()
                      }
                    }}
                    disabled={isExtractingUrl || urls.length >= MAX_URLS}
                    className="rounded-[30px] bg-white"
                  />
                  <Button
                    onClick={handleExtractUrl}
                    disabled={!urlInput.trim() || isExtractingUrl || urls.length >= MAX_URLS || !isValidUrl(urlInput.trim())}
                    className="rounded-[30px] whitespace-nowrap"
                  >
                    {isExtractingUrl ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Извлечение...
                      </>
                    ) : (
                      'Извлечь'
                    )}
                  </Button>
                </div>

                {urls.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm text-muted-foreground text-center mb-3">
                      Добавленные ссылки ({urls.length}/{MAX_URLS})
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {error && (
          <Card className="p-4 mb-8 border-destructive bg-destructive/10">
            <p className="text-destructive text-sm">{error}</p>
          </Card>
        )}

        {files.length > 0 && (
          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Выбранные файлы ({files.length})</h3>
            <div className="space-y-3">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-[30px]">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file)}
                    <div className="flex flex-col">
                      <span className="font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {file.type || 'неизвестный тип'} • {(file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="text-destructive hover:text-destructive rounded-[30px]"
                  >
                    Удалить
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {urls.length > 0 && (
          <Card className="p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Добавленные ссылки ({urls.length}/{MAX_URLS})</h3>
            <div className="space-y-3">
              {urls.map((urlSource) => (
                <div key={urlSource.id} className="flex items-start justify-between p-4 bg-muted rounded-[30px] gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <LinkIcon className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{urlSource.title}</span>
                        <a
                          href={urlSource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        </a>
                      </div>
                      <span className="text-xs text-muted-foreground mb-1">
                        {urlSource.domain} • {urlSource.wordCount} слов
                      </span>
                      {urlSource.excerpt && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {urlSource.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeUrl(urlSource.id)}
                    className="text-destructive hover:text-destructive rounded-[25px] flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="text-center">
          <Button
            onClick={handleCreateCourse}
            disabled={(files.length === 0 && urls.length === 0) || isProcessing}
            className="px-8 py-3 text-lg rounded-[30px]"
          >
            {isProcessing ? (
              "Создание курса..."
            ) : (
              <>
                Создать курс
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Small helper to format ms → mm:ss
function formatEta(ms: number) {
  const sec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
