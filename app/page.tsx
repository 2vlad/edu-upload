"use client"

import type React from "react"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, ArrowRight, Sparkles, Image as ImageIcon, Code, File } from "lucide-react"
import { CircularProgress } from "@/components/ui/loading-spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AuthButton } from "@/components/AuthButton"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/hooks/use-toast"
import { createCourseFromPayload } from "@/app/actions/courses"

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
      ? localStorage.getItem('preferredModel') || (process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL || 'chatgpt5')
      : 'chatgpt5'
  )
  const router = useRouter()
  const { user, isAnonymous } = useAuth()
  const { toast } = useToast()

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

  // Stage labels and weights
  const STAGE_WEIGHTS: Record<Exclude<Stage, 'idle' | 'done'>, number> = useMemo(() => ({
    upload: 0.18,
    extract: 0.12,
    analyze: 0.18,
    generate: 0.45,
    finalize: 0.07,
  }), [])

  const STAGE_ORDER: Exclude<Stage, 'idle' | 'done'>[] = ['upload', 'extract', 'analyze', 'generate', 'finalize']

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
    if (files.length === 0) return

    setIsProcessing(true)
    setError(null)
    setProcessingProgress(0)
    setProcessingMessage("Начинаем обработку...")
    setEtaMs(null)
    setStage('upload')
    stageStartRef.current = performance.now()

    try {
      const formData = new FormData()
      files.forEach((file) => {
        formData.append("files", file)
      })
      // include model choice
      formData.append('modelChoice', modelChoice)

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/process-files', true)
        xhr.responseType = 'json'

        uploadBytesRef.current = { loaded: 0, total: 0, startedAt: performance.now(), lastTs: performance.now(), lastLoaded: 0, avgBps: 0 }
        advancedAfterUploadRef.current = false

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return
          const now = performance.now()
          const deltaBytes = e.loaded - uploadBytesRef.current.lastLoaded
          const deltaMs = Math.max(1, now - uploadBytesRef.current.lastTs)
          const instBps = (deltaBytes * 1000) / deltaMs
          uploadBytesRef.current.avgBps = uploadBytesRef.current.avgBps
            ? uploadBytesRef.current.avgBps * 0.7 + instBps * 0.3
            : instBps
          uploadBytesRef.current.lastTs = now
          uploadBytesRef.current.lastLoaded = e.loaded
          uploadBytesRef.current.loaded = e.loaded
          uploadBytesRef.current.total = e.total

          const uploadedFrac = e.total ? e.loaded / e.total : 0
          const uploadProgress = uploadedFrac * STAGE_WEIGHTS.upload * 100
          const display = Math.min(99, uploadProgress)
          setProcessingProgress(display)
          setProcessingMessage('Загрузка файлов...')

          const remainingUploadBytes = Math.max(0, e.total - e.loaded)
          const remainingUploadMs = uploadBytesRef.current.avgBps > 0
            ? Math.round((remainingUploadBytes / uploadBytesRef.current.avgBps) * 1000)
            : 0
          const remainingAfterUpload = predicted.extract + predicted.analyze + predicted.generate + predicted.finalize
          setEtaMs(remainingUploadMs + remainingAfterUpload)

          // Switch to next stage as soon as upload finishes
          if (e.loaded >= e.total && !advancedAfterUploadRef.current) {
            advancedAfterUploadRef.current = true
            setStage('extract')
            stageStartRef.current = null
          }
        }

        // In some browsers onprogress may not reach 100%; ensure advance
        xhr.upload.onloadend = () => {
          if (!advancedAfterUploadRef.current) {
            advancedAfterUploadRef.current = true
            setStage('extract')
            stageStartRef.current = null
          }
        }

        xhr.onload = () => {
          if (stage === 'upload') {
            setStage('extract')
            stageStartRef.current = null
          }
          try {
            const json = typeof xhr.response === 'string' ? JSON.parse(xhr.response) : xhr.response
            if (xhr.status >= 200 && xhr.status < 300) resolve(json)
            else reject(new Error(json?.message || json?.error || `HTTP ${xhr.status}`))
          } catch (e) {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response)
            else reject(new Error(`HTTP ${xhr.status}`))
          }
        }

        xhr.onerror = () => reject(new Error('Сеть недоступна'))
        xhr.send(formData)
      })

      // Set progress to 100% when done
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
      <div className="absolute top-6 right-6 z-10">
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
                <p className="text-xs text-muted-foreground/70">
                  {etaMs !== null ? `Осталось ≈ ${formatEta(etaMs)}` : 'Оценка времени...'}
                </p>
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
              <SelectTrigger className="w-full sm:w-[260px] rounded-[30px]">
                <SelectValue placeholder="Выберите модель" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatgpt5">ChatGPT 5 (OpenAI)</SelectItem>
                <SelectItem value="sonnet4">Sonnet 4 (Anthropic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              <Button variant="outline" className="cursor-pointer rounded-[30px] bg-transparent" asChild>
                <span>Выбрать файлы</span>
              </Button>
            </label>
          </div>
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

        <div className="text-center">
          <Button
            onClick={handleCreateCourse}
            disabled={files.length === 0 || isProcessing}
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
