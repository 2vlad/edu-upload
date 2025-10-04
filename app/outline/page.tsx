"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Edit2, Save, X, FileText, Upload, RefreshCw, ChevronRight } from "lucide-react"

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
  const dragLessonIdRef = useRef<string | null>(null)
  const router = useRouter()

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

  // Extract bullets from lesson objectives or outline
  const getBullets = (lesson: Lesson, index: number): string[] => {
    // Try to get bullets from outline first
    const outlineItem = courseData?.outline?.find(
      (item) => item.lesson_id === lesson.id || item.title === lesson.title
    )

    if (outlineItem?.bullets && outlineItem.bullets.length > 0) {
      return outlineItem.bullets.slice(0, 5)
    }

    // Fallback to objectives
    return lesson.objectives.slice(0, 5)
  }

  // Extract logline from lesson or outline
  const getLogline = (lesson: Lesson, index: number): string => {
    // Try to get logline from outline first
    const outlineItem = courseData?.outline?.find(
      (item) => item.lesson_id === lesson.id || item.title === lesson.title
    )

    if (outlineItem?.logline) {
      return outlineItem.logline
    }

    // Try lesson.logline
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
            <Button variant="outline" className="rounded-[25px]" disabled>
              <FileText className="w-4 h-4 mr-2" />
              Редактировать источники
            </Button>
            <Button variant="outline" className="rounded-[25px]" disabled>
              <Upload className="w-4 h-4 mr-2" />
              Добавить файлы
            </Button>
            <Button variant="outline" className="rounded-[25px]" disabled>
              <RefreshCw className="w-4 h-4 mr-2" />
              Обновить план
            </Button>
            <Button onClick={handleProceedToLessons} className="rounded-[30px] ml-auto">
              Редактировать уроки
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
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
    </div>
  )
}
