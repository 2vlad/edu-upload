"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
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
import { ChevronLeft, ChevronRight, CheckCircle, ArrowLeft, Edit2, Save, X } from "lucide-react"

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

export default function LessonsPage() {
  const [courseData, setCourseData] = useState<CourseData | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [editedContent, setEditedContent] = useState("")
  const [editedObjectives, setEditedObjectives] = useState<string[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem("courseData")
    if (stored) {
      setCourseData(JSON.parse(stored))
    } else {
      router.push("/")
    }
  }, [router])

  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
        setCanScrollLeft(scrollLeft > 0)
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
      }
    }

    checkScroll()
    const container = scrollContainerRef.current
    container?.addEventListener("scroll", checkScroll)
    window.addEventListener("resize", checkScroll)

    return () => {
      container?.removeEventListener("scroll", checkScroll)
      window.removeEventListener("resize", checkScroll)
    }
  }, [courseData])

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -340, behavior: "smooth" })
    }
  }

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 340, behavior: "smooth" })
    }
  }

  const handlePublish = () => {
    if (courseData) {
      localStorage.setItem("publishedCourse", JSON.stringify(courseData))
      router.push("/course")
    }
  }

  const handleCardClick = (lesson: Lesson) => {
    setSelectedLesson(lesson)
    setEditedTitle(lesson.title)
    setEditedContent(lesson.content)
    setEditedObjectives([...lesson.objectives])
    setIsEditing(false)
  }

  const handleSave = () => {
    if (!selectedLesson || !courseData) return

    const updatedLessons = courseData.lessons.map((lesson) =>
      lesson.id === selectedLesson.id
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
    localStorage.setItem("courseData", JSON.stringify(updatedCourse))
    
    // Update selected lesson with new data
    const updatedLesson = updatedLessons.find(l => l.id === selectedLesson.id)
    if (updatedLesson) {
      setSelectedLesson(updatedLesson)
    }
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
          <p className="text-muted-foreground mb-4">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push("/")} 
                className="rounded-[30px]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{courseData.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{courseData.description}</p>
              </div>
            </div>
            <Button 
              onClick={handlePublish} 
              className="rounded-[30px] bg-primary hover:bg-primary/90"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Опубликовать курс
            </Button>
          </div>
        </div>
      </div>

      {/* Lessons Carousel - Full Width */}
      <div className="flex-1 flex items-center py-12">
        <div className="relative w-full">
          {/* Navigation Arrows */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-card border shadow-sm hover:shadow-md transition-shadow"
              aria-label="Предыдущий урок"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
          
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-card border shadow-sm hover:shadow-md transition-shadow"
              aria-label="Следующий урок"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          )}

          {/* Scrollable Container - Full Width */}
          <div 
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide px-6 pb-4"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <style jsx>{`
              div::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="flex gap-4" style={{ width: "max-content" }}>
              {courseData.lessons.map((lesson, index) => (
                <Card 
                  key={lesson.id} 
                  className="w-[320px] h-[420px] p-6 flex flex-col hover:shadow-lg transition-shadow cursor-pointer"
                  style={{
                    backgroundColor: index === 0 ? "oklch(0.94 0 0)" : "oklch(1 0 0)",
                  }}
                  onClick={() => handleCardClick(lesson)}
                >
                  <div className="flex-1 flex flex-col">
                    <h3 className="text-lg font-bold mb-3 line-clamp-2">
                      {lesson.title}
                    </h3>
                    
                    <div className="mb-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Цели обучения:</p>
                      <ul className="space-y-1">
                        {lesson.objectives.slice(0, 3).map((objective, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start">
                            <span className="mr-2">•</span>
                            <span className="line-clamp-2">{objective}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-auto">
                      <p className="text-sm text-muted-foreground line-clamp-4 mb-4">
                        {lesson.content}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lesson Edit Dialog */}
      <Dialog open={!!selectedLesson} onOpenChange={(open) => !open && setSelectedLesson(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {isEditing ? (
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-2xl font-bold border-0 p-0 focus:ring-0"
                  placeholder="Название урока"
                />
              ) : (
                <span className="text-2xl">{selectedLesson?.title}</span>
              )}
              <div className="flex gap-2">
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="rounded-[30px]"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Редактировать
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={handleSave}
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
                        setEditedTitle(selectedLesson?.title || "")
                        setEditedContent(selectedLesson?.content || "")
                        setEditedObjectives(selectedLesson?.objectives || [])
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
                  {selectedLesson?.objectives.map((objective, index) => (
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
                  placeholder="Содержание урока в формате Markdown..."
                />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                    {selectedLesson?.content}
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