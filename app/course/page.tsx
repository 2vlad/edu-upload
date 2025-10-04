"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle, Edit2, Save, X, Copy } from "lucide-react"

interface Lesson {
  id: string
  title: string
  content: string
  objectives: string[]
}

interface CourseData {
  title: string
  description: string
  lessons: Lesson[]
}

export default function CoursePage() {
  const [courseData, setCourseData] = useState<CourseData | null>(null)
  const [currentLesson, setCurrentLesson] = useState(0)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [editedContent, setEditedContent] = useState("")
  const [editedObjectives, setEditedObjectives] = useState<string[]>([])
  const router = useRouter()

  useEffect(() => {
    const publishedCourse = localStorage.getItem("publishedCourse")
    if (publishedCourse) {
      try {
        const parsedData = JSON.parse(publishedCourse) as CourseData
        setCourseData(parsedData)
      } catch (error) {
        console.error("Error parsing course data:", error)
        router.push("/")
      }
    } else {
      router.push("/")
    }
  }, [router])

  const markComplete = (lessonId: string) => {
    setCompletedLessons((prev) => new Set([...prev, lessonId]))
  }

  const nextLesson = () => {
    if (courseData && currentLesson < courseData.lessons.length - 1) {
      setCurrentLesson((prev) => prev + 1)
    }
  }

  const prevLesson = () => {
    if (currentLesson > 0) {
      setCurrentLesson((prev) => prev - 1)
    }
  }

  const openEditModal = () => {
    const lesson = courseData?.lessons[currentLesson]
    if (lesson) {
      setEditedTitle(lesson.title)
      setEditedContent(lesson.content)
      setEditedObjectives([...lesson.objectives])
      setIsEditModalOpen(true)
      setIsEditing(false)
    }
  }

  const handleSave = () => {
    if (!courseData) return

    const updatedLessons = courseData.lessons.map((lesson, index) =>
      index === currentLesson
        ? {
            ...lesson,
            title: editedTitle,
            content: editedContent,
            objectives: editedObjectives,
          }
        : lesson
    )

    const updatedCourse = {
      ...courseData,
      lessons: updatedLessons,
    }

    setCourseData(updatedCourse)
    localStorage.setItem("publishedCourse", JSON.stringify(updatedCourse))
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

  if (!courseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка вашего курса...</p>
        </div>
      </div>
    )
  }

  const currentLessonData = courseData.lessons[currentLesson]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.push("/lessons")} className="rounded-[30px]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Редактировать курс
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-balance">{courseData.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {completedLessons.size} из {courseData.lessons.length} уроков завершено
                </p>
              </div>
            </div>
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card className="p-4 sticky top-6">
              <h3 className="font-semibold mb-4">Прогресс курса</h3>
              <div className="space-y-2">
                {courseData.lessons.map((lesson, index) => (
                  <button
                    key={lesson.id}
                    onClick={() => setCurrentLesson(index)}
                    className={`w-full text-left p-3 rounded-[30px] text-sm transition-colors ${
                      index === currentLesson ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {completedLessons.has(lesson.id) ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                      )}
                      <span className="font-medium text-balance">{lesson.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card className="p-8 md:p-10 lg:p-12">
              <div className="flex flex-col gap-10">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-6">
                    <h2 className="text-3xl font-bold text-balance">{currentLessonData?.title}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openEditModal}
                        className="rounded-[30px]"
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Редактировать
                      </Button>
                      <span className="whitespace-nowrap">
                        Урок {currentLesson + 1} из {courseData.lessons.length}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${((currentLesson + 1) / courseData.lessons.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3 tracking-tight">Цели обучения</h3>
                    <ul className="space-y-3 text-base leading-relaxed text-muted-foreground">
                      {currentLessonData?.objectives.map((objective, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <span className="mt-1 text-primary">•</span>
                          <span className="text-pretty">{objective}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="prose prose-lg max-w-none">
                    <div className="text-lg leading-8 text-foreground text-pretty whitespace-pre-wrap">
                      {currentLessonData?.content}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-border/70">
                  <Button
                    variant="outline"
                    onClick={prevLesson}
                    disabled={currentLesson === 0}
                    className="rounded-[30px] bg-transparent"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Назад
                  </Button>

                  <div className="flex flex-wrap gap-3">
                    {!completedLessons.has(currentLessonData?.id) && (
                      <Button
                        variant="outline"
                        onClick={() => markComplete(currentLessonData?.id)}
                        className="rounded-[30px]"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Отметить выполненным
                      </Button>
                    )}

                    <Button
                      onClick={nextLesson}
                      disabled={currentLesson === courseData.lessons.length - 1}
                      className="rounded-[30px]"
                    >
                      Далее
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Lesson Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {isEditing ? (
                <span className="text-xl">Редактирование урока</span>
              ) : (
                <span className="text-xl">Содержание урока</span>
              )}
              <div className="flex gap-2">
                {!isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="rounded-[30px]"
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditModalOpen(false)}
                      className="rounded-[30px]"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        handleSave()
                        setIsEditModalOpen(false)
                      }}
                      className="rounded-[30px]"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Сохранить
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false)
                        const lesson = courseData?.lessons[currentLesson]
                        if (lesson) {
                          setEditedTitle(lesson.title)
                          setEditedContent(lesson.content)
                          setEditedObjectives([...lesson.objectives])
                        }
                      }}
                      className="rounded-[30px]"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Отмена
                    </Button>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Title */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Название урока</h3>
              {isEditing ? (
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-xl font-bold"
                  placeholder="Название урока"
                />
              ) : (
                <h2 className="text-2xl font-bold">{editedTitle}</h2>
              )}
            </div>

            {/* Learning Objectives */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Цели обучения</h3>
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
                    Добавить цель
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {editedObjectives.map((objective, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2 text-muted-foreground">•</span>
                      <span>{objective}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Content */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Содержание урока</h3>
              {isEditing ? (
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Содержание урока..."
                />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                    {editedContent}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
