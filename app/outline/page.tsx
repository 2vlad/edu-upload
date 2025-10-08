"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Edit2, Save, X, FileText, Upload, RefreshCw, ChevronRight, Plus, CheckCircle } from "lucide-react"
import { CourseUpdatePreview } from "@/components/CourseUpdatePreview"
import { mergeCourseUpdates, type CourseChanges } from "@/lib/courseUpdates"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/hooks/use-toast"
import { publishCourse } from "@/app/actions/publish-course"
import { AuthButton } from "@/components/AuthButton"

interface Lesson {
  id: string
  title: string
  content: string
  objectives: string[]
  logline?: string
  guiding_questions?: string[]
  expansion_tips?: string[]
  examples_to_add?: string[]
}

interface OutlineItem {
  lesson_id: string
  title: string
  logline?: string
  bullets: string[]
}

interface CourseData {
  title: string
  description: string
  lessons: Lesson[]
  outline?: OutlineItem[]
}

export default function OutlinePage() {
  const [courseData, setCourseData] = useState<CourseData | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [editedDescription, setEditedDescription] = useState("")
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewChanges, setPreviewChanges] = useState<CourseChanges | null>(null)
  const [pendingUpdate, setPendingUpdate] = useState<CourseData | null>(null)
  const [showAddLessonDialog, setShowAddLessonDialog] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState("")
  const [newLessonContent, setNewLessonContent] = useState("")
  const dragLessonIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { isAnonymous, openAuthDialog } = useAuth()
  const { toast } = useToast()
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("courseData")
    if (stored) {
      const data = JSON.parse(stored)
      setCourseData(data)
      setEditedTitle(data.title)
      setEditedDescription(data.description)
    } else {
      router.push("/")
    }
  }, [router])

  const handleSaveTitle = () => {
    if (!courseData || !editedTitle.trim()) return

    const updatedCourse = {
      ...courseData,
      title: editedTitle.trim(),
    }

    setCourseData(updatedCourse)
    localStorage.setItem("courseData", JSON.stringify(updatedCourse))
    setIsEditingTitle(false)
  }

  const handleSaveDescription = () => {
    if (!courseData) return

    const updatedCourse = {
      ...courseData,
      description: editedDescription.trim(),
    }

    setCourseData(updatedCourse)
    localStorage.setItem("courseData", JSON.stringify(updatedCourse))
    setIsEditingDescription(false)
  }

  const handleCancelTitle = () => {
    setEditedTitle(courseData?.title || "")
    setIsEditingTitle(false)
  }

  const handleCancelDescription = () => {
    setEditedDescription(courseData?.description || "")
    setIsEditingDescription(false)
  }

  // Extract bullets from lesson objectives
  const getBullets = (lesson: Lesson, index: number): string[] => {
    return lesson.objectives.slice(0, 5)
  }

  // Extract logline from lesson
  const getLogline = (lesson: Lesson, index: number): string => {
    // Try lesson.logline first
    if (lesson.logline) {
      return lesson.logline
    }

    // Fallback to first paragraph of content
    const firstParagraph = lesson.content.split("\n\n")[0]
    return firstParagraph.length > 150
      ? firstParagraph.slice(0, 150) + "..."
      : firstParagraph
  }

  // Drag and drop handlers
  const reorderLessons = useCallback(
    (lessons: Lesson[], sourceId: string, targetId: string) => {
      if (sourceId === targetId) return lessons

      const sourceIndex = lessons.findIndex((lesson) => lesson.id === sourceId)
      const targetIndex = lessons.findIndex((lesson) => lesson.id === targetId)

      if (sourceIndex === -1 || targetIndex === -1) return lessons

      const updated = [...lessons]
      const [movedLesson] = updated.splice(sourceIndex, 1)
      updated.splice(targetIndex, 0, movedLesson)

      return updated
    },
    []
  )

  const persistLessons = useCallback((lessons: Lesson[]) => {
    setCourseData((prev) => {
      if (!prev) return prev
      const updatedCourse = { ...prev, lessons }
      localStorage.setItem("courseData", JSON.stringify(updatedCourse))
      return updatedCourse
    })
  }, [])

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, lessonId: string) => {
    dragLessonIdRef.current = lessonId
    event.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, lessonId: string) => {
    if (!dragLessonIdRef.current || dragLessonIdRef.current === lessonId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()

    const sourceId = dragLessonIdRef.current
    if (!sourceId || !courseData) return

    const updatedLessons = reorderLessons(courseData.lessons, sourceId, targetId)

    if (updatedLessons === courseData.lessons) return

    persistLessons(updatedLessons)
    dragLessonIdRef.current = null
  }

  const handleDragEnd = () => {
    dragLessonIdRef.current = null
  }

  const handleProceedToLessons = () => {
    router.push("/lessons")
  }

  const handlePublish = async () => {
    if (!courseData) return
    if (isAnonymous) {
      toast({ title: 'Требуется вход', description: 'Войдите в аккаунт, чтобы опубликовать курс', variant: 'default' })
      openAuthDialog()
      return
    }
    setIsPublishing(true)
    try {
      const result = await publishCourse({
        title: courseData.title,
        description: courseData.description,
        lessons: courseData.lessons,
      })
      if (result.success && result.slug) {
        toast({ title: 'Курс опубликован', description: 'Курс сохранен в ваш профиль' })
        localStorage.setItem('publishedCourseSlug', result.slug)
        localStorage.setItem('publishedCourse', JSON.stringify(courseData))
        router.push(`/course?slug=${result.slug}`)
      } else {
        throw new Error(result.error || 'Не удалось опубликовать курс')
      }
    } catch (e) {
      console.error('Publish from outline failed', e)
      toast({ title: 'Ошибка публикации', description: e instanceof Error ? e.message : 'Не удалось опубликовать курс', variant: 'destructive' })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleAddManualLesson = () => {
    if (!courseData || !newLessonTitle.trim()) return

    const newLesson: Lesson = {
      id: `lesson-${Date.now()}`,
      title: newLessonTitle.trim(),
      content: newLessonContent.trim() || "Начните писать содержание урока...",
      objectives: ["Новая цель обучения"],
      logline: "",
      guiding_questions: [],
      expansion_tips: [],
      examples_to_add: [],
    }

    const updatedCourse = {
      ...courseData,
      lessons: [...courseData.lessons, newLesson],
    }

    setCourseData(updatedCourse)
    localStorage.setItem("courseData", JSON.stringify(updatedCourse))

    // Reset form
    setNewLessonTitle("")
    setNewLessonContent("")
    setShowAddLessonDialog(false)
  }

  const handleAddFiles = () => {
    fileInputRef.current?.click()
  }

  // Helper: get JSON if available, otherwise surface readable error text
  const readResponse = async (response: Response) => {
    const ct = response.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return await response.json()
    }
    const text = await response.text()
    throw new Error(`[HTTP ${response.status}] ${text.slice(0, 140)}`)
  }

  // Process files one-by-one to avoid platform body limits (e.g., Vercel 4–5 MB/request)
  const processFilesSequentially = async (incoming: File[], baseCourse: CourseData) => {
    let currentCourse = baseCourse
    let aggregatedChanges: CourseChanges | null = null

    for (const file of incoming) {
      const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || '4.5')
      const maxBytes = Math.floor(maxMb * 1024 * 1024 * 0.92)
      if (file.size > maxBytes) {
        throw new Error(`Файл «${file.name}» слишком большой (${(file.size/1024/1024).toFixed(1)} MB). Лимит запроса ~${maxMb} MB. Сожмите файл или загрузите текстовую версию.`)
      }

      const formData = new FormData()
      formData.append('files', file)
      formData.append('existingCourse', JSON.stringify(currentCourse))

      // forward preferred model if present
      try {
        const preferred = localStorage.getItem('preferredModel')
        if (preferred) formData.append('modelChoice', preferred)
      } catch {}

      const response = await fetch('/api/process-files', { method: 'POST', body: formData })
      const payload = await readResponse(response) // read exactly once
      if (!response.ok) {
        const reason = response.headers.get('X-Auth-Reason')
        if (response.status === 401 && reason === 'anonymous-signin-disabled') {
          throw new Error('Загрузка изображений требует входа в систему. Пожалуйста, войдите или отключите изображения в этом запросе.')
        }
        throw new Error((payload && (payload.error || payload.message)) || 'Ошибка обработки файла')
      }
      const newCourseData = payload

      const { mergedCourse, changes } = mergeCourseUpdates(currentCourse, newCourseData)
      currentCourse = mergedCourse

      if (!aggregatedChanges) {
        aggregatedChanges = changes
      } else {
        aggregatedChanges.newLessons = [
          ...aggregatedChanges.newLessons,
          ...changes.newLessons,
        ]
        aggregatedChanges.updatedLessons = [
          ...aggregatedChanges.updatedLessons,
          ...changes.updatedLessons,
        ]
        aggregatedChanges.preservedLessons = [
          ...aggregatedChanges.preservedLessons,
          ...changes.preservedLessons,
        ]
        aggregatedChanges.removedLessons = [
          ...aggregatedChanges.removedLessons,
          ...changes.removedLessons,
        ]
      }
    }

    return { currentCourse, aggregatedChanges }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0 || !courseData) return

    setIsUploading(true)
    setShowUpdateDialog(false)

    try {
      // Sequential requests under body limit
      const { currentCourse, aggregatedChanges } = await processFilesSequentially(
        Array.from(files),
        courseData
      )

      setPreviewChanges(aggregatedChanges || null)
      setPendingUpdate(currentCourse)
      setShowPreview(true)
    } catch (error) {
      console.error('Error updating course:', error)
      alert(error instanceof Error ? error.message : 'Не удалось обновить курс')
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleApproveUpdate = () => {
    if (!pendingUpdate) return

    // Apply the update
    setCourseData(pendingUpdate)
    localStorage.setItem('courseData', JSON.stringify(pendingUpdate))

    // Close preview
    setShowPreview(false)
    setPreviewChanges(null)
    setPendingUpdate(null)
  }

  const handleCancelUpdate = () => {
    setShowPreview(false)
    setPreviewChanges(null)
    setPendingUpdate(null)
  }

  if (!courseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              className="rounded-[30px]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-sm font-medium text-muted-foreground">План курса</h1>
            <div className="ml-auto">
              <AuthButton />
            </div>
          </div>

          {/* Course Title */}
          <div className="mb-4">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-3xl font-bold h-auto py-2"
                  placeholder="Название курса"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleSaveTitle}
                  className="rounded-[30px]"
                  disabled={!editedTitle.trim()}
                >
                  <Save className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelTitle}
                  className="rounded-[30px]"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold">{courseData.title}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingTitle(true)}
                  className="rounded-[30px]"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Course Description */}
          <div className="mb-6">
            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="min-h-[80px]"
                  placeholder="Описание курса"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDescription} className="rounded-[30px]">
                    <Save className="w-4 h-4 mr-2" />
                    Сохранить
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelDescription}
                    className="rounded-[30px]"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <p className="text-muted-foreground flex-1">{courseData.description}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingDescription(true)}
                  className="rounded-[30px]"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.md,.txt,.rtf,.html,.png,.jpg,.jpeg,.webp,.gif"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" className="rounded-[25px]" disabled>
              <FileText className="w-4 h-4 mr-2" />
              Редактировать источники
            </Button>
            <Button
              variant="outline"
              className="rounded-[25px]"
              onClick={handleAddFiles}
              disabled={isUploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? 'Загрузка...' : 'Добавить файлы'}
            </Button>
            <Button
              variant="outline"
              className="rounded-[25px]"
              onClick={() => setShowAddLessonDialog(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить урок
            </Button>
            <Button variant="outline" className="rounded-[25px]" disabled>
              <RefreshCw className="w-4 h-4 mr-2" />
              Обновить план
            </Button>
            <div className="ml-auto flex gap-3">
              <Button
                onClick={handlePublish}
                disabled={isPublishing}
                className="rounded-[30px]"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isPublishing ? 'Публикация...' : 'Опубликовать курс'}
              </Button>
              <Button onClick={handleProceedToLessons} className="rounded-[30px]">
                Редактировать уроки
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Lessons List */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-4">
          {courseData.lessons.map((lesson, index) => (
            <Card
              key={lesson.id}
              draggable
              onDragStart={(event) => handleDragStart(event, lesson.id)}
              onDragOver={(event) => handleDragOver(event, lesson.id)}
              onDrop={(event) => handleDrop(event, lesson.id)}
              onDragEnd={handleDragEnd}
              className="p-6 hover:shadow-md transition-shadow cursor-move"
            >
              <div className="flex gap-6">
                {/* Lesson Number */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{index + 1}</span>
                  </div>
                </div>

                {/* Lesson Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold mb-2">{lesson.title}</h3>

                  {/* Logline */}
                  <p className="text-muted-foreground text-sm mb-4 italic">
                    {getLogline(lesson, index)}
                  </p>

                  {/* Bullet Points */}
                  <ul className="space-y-2">
                    {getBullets(lesson, index).map((bullet, idx) => (
                      <li key={idx} className="flex items-start text-sm">
                        <span className="mr-2 text-primary font-bold">•</span>
                        <span className="flex-1">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Update Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Предпросмотр обновлений курса</DialogTitle>
          </DialogHeader>
          {previewChanges && (
            <CourseUpdatePreview
              changes={previewChanges}
              onApprove={handleApproveUpdate}
              onCancel={handleCancelUpdate}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Lesson Dialog */}
      <Dialog open={showAddLessonDialog} onOpenChange={setShowAddLessonDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить новый урок</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Название урока <span className="text-red-500">*</span>
              </label>
              <Input
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                placeholder="Введите название урока"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Содержание урока (необязательно)
              </label>
              <Textarea
                value={newLessonContent}
                onChange={(e) => setNewLessonContent(e.target.value)}
                placeholder="Начните писать содержание урока..."
                className="min-h-[120px]"
              />
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddLessonDialog(false)
                  setNewLessonTitle("")
                  setNewLessonContent("")
                }}
                className="rounded-[25px]"
              >
                <X className="w-4 h-4 mr-2" />
                Отмена
              </Button>
              <Button
                onClick={handleAddManualLesson}
                disabled={!newLessonTitle.trim()}
                className="rounded-[30px]"
              >
                <Save className="w-4 h-4 mr-2" />
                Добавить урок
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
