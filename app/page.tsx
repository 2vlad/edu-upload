"use client"

import type React from "react"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, ArrowRight, Sparkles } from "lucide-react"
import { CircularProgress } from "@/components/ui/loading-spinner"

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingMessage, setProcessingMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

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

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => file.type === "application/pdf")
    setFiles((prev) => [...prev, ...droppedFiles])
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((file) => file.type === "application/pdf")
      setFiles((prev) => [...prev, ...selectedFiles])
    }
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Simulate progress updates
  useEffect(() => {
    if (isProcessing && processingProgress < 90) {
      const timer = setTimeout(() => {
        setProcessingProgress(prev => {
          const increment = Math.random() * 15 + 5
          return Math.min(prev + increment, 90)
        })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isProcessing, processingProgress])

  // Update processing messages
  useEffect(() => {
    if (isProcessing) {
      if (processingProgress < 20) {
        setProcessingMessage("Чтение PDF-файлов...")
      } else if (processingProgress < 50) {
        setProcessingMessage("Анализ содержимого...")
      } else if (processingProgress < 75) {
        setProcessingMessage("Создание структуры курса...")
      } else {
        setProcessingMessage("Генерация уроков...")
      }
    }
  }, [processingProgress, isProcessing])

  const handleCreateCourse = async () => {
    if (files.length === 0) return

    setIsProcessing(true)
    setError(null)
    setProcessingProgress(0)
    setProcessingMessage("Начинаем обработку...")

    try {
      const formData = new FormData()
      files.forEach((file) => {
        formData.append("files", file)
      })

      const response = await fetch("/api/process-pdfs", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Не удалось обработать PDF-файлы")
      }

      // Set progress to 100% when done
      setProcessingProgress(100)
      setProcessingMessage("Готово!")

      // Store course data for the lessons page
      localStorage.setItem("courseData", JSON.stringify(data))

      // Small delay to show completion
      setTimeout(() => {
        router.push("/lessons")
      }, 500)
    } catch (error) {
      console.error("Error creating course:", error)
      setError(error instanceof Error ? error.message : "Произошла ошибка при создании курса")
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative">
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
                  Это может занять несколько секунд...
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">Создайте курс из PDF-файлов</h1>
          <p className="text-lg text-muted-foreground text-pretty">
            Загрузите PDF-материалы, и ИИ превратит их в структурированные увлекательные уроки
          </p>
        </div>

        <Card className="p-8 mb-8">
          <div
            className={`border-2 border-dashed rounded-[30px] p-12 text-center transition-colors ${
              isDragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-16 h-16 mx-auto mb-6 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Перетащите PDF-файлы сюда</h3>
            <p className="text-muted-foreground mb-6">или нажмите, чтобы выбрать файлы</p>

            <input type="file" multiple accept=".pdf" onChange={handleFileSelect} className="hidden" id="file-upload" />
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
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
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