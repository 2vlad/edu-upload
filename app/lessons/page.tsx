"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle,
  ArrowLeft,
  Edit2,
  Save,
  X,
  Plus,
  RefreshCw,
  FileDown,
  Image as ImageIcon,
  Upload
} from "lucide-react"
import { markAsEdited } from "@/lib/types/course"
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient"
import { publishCourse } from "@/app/actions/publish-course"
import { useToast } from "@/hooks/use-toast"

interface Lesson {
  id: string
  title: string
  content: string
  objectives: string[]
  logline?: string
  guiding_questions?: string[]
  expansion_tips?: string[]
  examples_to_add?: string[]
  contentEdited?: boolean
  titleEdited?: boolean
  objectivesEdited?: boolean
}

interface CourseData {
  title: string
  description: string
  lessons: Lesson[]
}

export default function LessonsPage() {
  const [courseData, setCourseData] = useState<CourseData | null>(null)
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [editedContent, setEditedContent] = useState("")
  const [editedObjectives, setEditedObjectives] = useState<string[]>([])
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const stored = localStorage.getItem("courseData")
    if (stored) {
      setCourseData(JSON.parse(stored))
    } else {
      router.push("/")
    }
  }, [router])

  useEffect(() => {
    if (courseData && courseData.lessons[selectedLessonIndex]) {
      const lesson = courseData.lessons[selectedLessonIndex]
      setEditedTitle(lesson.title)
      setEditedContent(lesson.content)
      setEditedObjectives([...lesson.objectives])
    }
  }, [selectedLessonIndex, courseData])

  const handlePublish = async () => {
    if (!courseData) return

    // Save any pending edits first
    if (isEditing) {
      handleSave()
    }

    setIsPublishing(true)

    try {
      // Get existing slug if available
      const existingSlug = localStorage.getItem("publishedCourseSlug") || undefined

      // Call server action
      const result = await publishCourse({
        title: courseData.title,
        description: courseData.description,
        lessons: courseData.lessons,
        existingSlug,
      })

      if (result.success) {
        // Save slug for future updates
        if (result.slug) {
          localStorage.setItem("publishedCourseSlug", result.slug)
        }

        // Also keep localStorage backup for backward compatibility
        localStorage.setItem("publishedCourse", JSON.stringify(courseData))

        toast({
          title: "Курс опубликован!",
          description: `Курс "${courseData.title}" успешно опубликован.`,
        })

        // Navigate to course view
        router.push(`/course?slug=${result.slug}`)
      } else {
        toast({
          title: "Ошибка публикации",
          description: result.error || "Не удалось опубликовать курс",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Unexpected error:", error)
      toast({
        title: "Ошибка",
        description: "Произошла неожиданная ошибка при публикации",
        variant: "destructive",
      })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleSave = () => {
    if (!courseData) return

    const selectedLesson = courseData.lessons[selectedLessonIndex]

    // Track what was edited
    let updatedLesson = { ...selectedLesson }

    if (editedTitle !== selectedLesson.title) {
      updatedLesson = markAsEdited(updatedLesson, 'title')
      updatedLesson.title = editedTitle
    }

    if (editedContent !== selectedLesson.content) {
      updatedLesson = markAsEdited(updatedLesson, 'content')
      updatedLesson.content = editedContent
    }

    if (JSON.stringify(editedObjectives) !== JSON.stringify(selectedLesson.objectives)) {
      updatedLesson = markAsEdited(updatedLesson, 'objectives')
      updatedLesson.objectives = editedObjectives
    }

    const updatedLessons = [...courseData.lessons]
    updatedLessons[selectedLessonIndex] = updatedLesson

    const updatedCourse = {
      ...courseData,
      lessons: updatedLessons,
    }

    setCourseData(updatedCourse)
    localStorage.setItem("courseData", JSON.stringify(updatedCourse))
    setIsEditing(false)
  }

  const handleAddObjective = () => {
    setEditedObjectives([...editedObjectives, "Новая цель"])
  }

  const handleRemoveObjective = (index: number) => {
    setEditedObjectives(editedObjectives.filter((_, i) => i !== index))
  }

  const handleObjectiveChange = (index: number, value: string) => {
    const updated = [...editedObjectives]
    updated[index] = value
    setEditedObjectives(updated)
  }

  const handleInsertGuidance = (items: string[], title: string) => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentContent = editedContent

    // Format as markdown outline
    const outline = `\n\n## ${title}\n\n${items.map(item => `- ${item}`).join('\n')}\n\n`

    const newContent =
      currentContent.substring(0, start) +
      outline +
      currentContent.substring(end)

    setEditedContent(newContent)

    // Focus textarea and set cursor position after inserted text
    setTimeout(() => {
      textarea.focus()
      const newPosition = start + outline.length
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const uploadImageToSupabase = async (file: File): Promise<string | null> => {
    try {
      setIsUploadingImage(true)

      // Check if Supabase is configured
      if (!isSupabaseConfigured() || !supabase) {
        alert('Загрузка изображений требует настройки Supabase. Пожалуйста, настройте Supabase Storage для использования этой функции.')
        return null
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `lesson-images/${fileName}`

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('course-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Upload error:', error)
        alert('Не удалось загрузить изображение: ' + error.message)
        return null
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('course-assets')
        .getPublicUrl(filePath)

      return urlData.publicUrl
    } catch (error) {
      console.error('Unexpected error:', error)
      alert('Не удалось загрузить изображение')
      return null
    } finally {
      setIsUploadingImage(false)
    }
  }

  const insertImageMarkdown = (imageUrl: string, altText: string = 'Изображение') => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentContent = editedContent

    // Create markdown image syntax
    const imageMarkdown = `\n\n![${altText}](${imageUrl})\n\n`

    const newContent =
      currentContent.substring(0, start) +
      imageMarkdown +
      currentContent.substring(end)

    setEditedContent(newContent)

    // Focus textarea and set cursor position after inserted image
    setTimeout(() => {
      textarea.focus()
      const newPosition = start + imageMarkdown.length
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const handleImageDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    )

    if (files.length === 0) {
      return
    }

    // Upload each image
    for (const file of files) {
      const imageUrl = await uploadImageToSupabase(file)
      if (imageUrl) {
        insertImageMarkdown(imageUrl, file.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleImageDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleImageDragLeave = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file =>
      file.type.startsWith('image/')
    )

    if (files.length === 0) return

    for (const file of files) {
      const imageUrl = await uploadImageToSupabase(file)
      if (imageUrl) {
        insertImageMarkdown(imageUrl, file.name.replace(/\.[^/.]+$/, ''))
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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

  const selectedLesson = courseData.lessons[selectedLessonIndex]

  // If cards view mode is selected, we could render the old carousel here
  // For now, we'll just show the outline view

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/outline")}
                className="rounded-[30px]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{courseData.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{courseData.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handlePublish}
                disabled={isPublishing}
                className="rounded-[30px] bg-primary hover:bg-primary/90"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isPublishing ? "Публикация..." : "Опубликовать курс"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Sidebar + Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - TOC */}
        <div className="w-80 border-r bg-card overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-2">
              УРОКИ ({courseData.lessons.length})
            </h3>
            <div className="space-y-2">
              {courseData.lessons.map((lesson, index) => (
                <button
                  key={lesson.id}
                  onClick={() => setSelectedLessonIndex(index)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedLessonIndex === index
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedLessonIndex === index
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-2 text-sm">
                        {lesson.title}
                      </p>
                      {lesson.contentEdited && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Редактировано
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Content Area - Lesson Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-8">
            {/* Lesson Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                {isEditing ? (
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="text-3xl font-bold h-auto py-2 border-0 focus-visible:ring-0"
                    placeholder="Название урока"
                  />
                ) : (
                  <h2 className="text-3xl font-bold">{selectedLesson.title}</h2>
                )}

                <div className="flex gap-2">
                  {!isEditing ? (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                      className="rounded-[30px]"
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={handleSave}
                        className="rounded-[30px]"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Сохранить
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditing(false)
                          setEditedTitle(selectedLesson.title)
                          setEditedContent(selectedLesson.content)
                          setEditedObjectives(selectedLesson.objectives)
                        }}
                        className="rounded-[30px]"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Отмена
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {selectedLesson.logline && (
                <p className="text-muted-foreground italic">{selectedLesson.logline}</p>
              )}
            </div>

            {/* Learning Objectives */}
            <Card className="p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Цели обучения</h3>
              {isEditing ? (
                <div className="space-y-2">
                  {editedObjectives.map((objective, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={objective}
                        onChange={(e) => handleObjectiveChange(index, e.target.value)}
                        className="flex-1"
                        placeholder="Цель обучения"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveObjective(index)}
                        className="text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddObjective}
                    className="rounded-[30px]"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить цель
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {selectedLesson.objectives.map((objective, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2 text-primary font-bold">•</span>
                      <span>{objective}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Guidance Panel */}
            {(selectedLesson.guiding_questions || selectedLesson.expansion_tips || selectedLesson.examples_to_add) && (
              <Card className="p-6 mb-6 bg-blue-50 dark:bg-blue-950/20">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileDown className="w-5 h-5 text-primary" />
                  Подсказки для расширения материала
                </h3>

                {/* Guiding Questions */}
                {selectedLesson.guiding_questions && selectedLesson.guiding_questions.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Наводящие вопросы</h4>
                      {isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInsertGuidance(selectedLesson.guiding_questions!, 'Наводящие вопросы')}
                          className="rounded-[20px] text-xs"
                        >
                          <FileDown className="w-3 h-3 mr-1" />
                          Вставить в текст
                        </Button>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {selectedLesson.guiding_questions.map((q, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Expansion Tips */}
                {selectedLesson.expansion_tips && selectedLesson.expansion_tips.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Советы по расширению</h4>
                      {isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInsertGuidance(selectedLesson.expansion_tips!, 'Советы по расширению')}
                          className="rounded-[20px] text-xs"
                        >
                          <FileDown className="w-3 h-3 mr-1" />
                          Вставить в текст
                        </Button>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {selectedLesson.expansion_tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Examples to Add */}
                {selectedLesson.examples_to_add && selectedLesson.examples_to_add.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Идеи примеров</h4>
                      {isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInsertGuidance(selectedLesson.examples_to_add!, 'Идеи примеров')}
                          className="rounded-[20px] text-xs"
                        >
                          <FileDown className="w-3 h-3 mr-1" />
                          Вставить в текст
                        </Button>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {selectedLesson.examples_to_add.map((example, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{example}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* Content */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Содержание урока</h3>
                {isEditing && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="rounded-[25px]"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      {isUploadingImage ? 'Загрузка...' : 'Добавить изображение'}
                    </Button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    onDrop={handleImageDrop}
                    onDragOver={handleImageDragOver}
                    onDragLeave={handleImageDragLeave}
                    className={`min-h-[500px] font-mono text-sm transition-colors ${
                      isDraggingOver ? 'border-primary border-2 bg-primary/5' : ''
                    }`}
                    placeholder="Содержание урока в формате Markdown... Перетащите изображения для загрузки."
                  />
                  {isDraggingOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/10 pointer-events-none border-2 border-primary border-dashed rounded">
                      <div className="bg-background px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                        <Upload className="w-5 h-5 text-primary" />
                        <span className="font-medium text-primary">Отпустите для загрузки изображения</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                    {selectedLesson.content}
                  </pre>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
