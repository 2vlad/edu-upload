"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Edit3, Eye } from "lucide-react"

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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const router = useRouter()

  useEffect(() => {
    const storedCourseData = localStorage.getItem("courseData")
    if (!storedCourseData) {
      router.push("/")
      return
    }

    try {
      const parsedData = JSON.parse(storedCourseData) as CourseData
      setCourseData(parsedData)
    } catch (error) {
      console.error("Error parsing course data:", error)
      router.push("/")
    }
  }, [router])

  const handleEdit = (lessonId: string) => {
    const lesson = courseData?.lessons.find((l) => l.id === lessonId)
    if (lesson) {
      setEditingLesson(lessonId)
      setEditContent(lesson.content)
      setEditTitle(lesson.title)
    }
  }

  const handleSaveEdit = () => {
    if (editingLesson && courseData) {
      const updatedCourseData = {
        ...courseData,
        lessons: courseData.lessons.map((lesson) =>
          lesson.id === editingLesson ? { ...lesson, content: editContent, title: editTitle } : lesson,
        ),
      }
      setCourseData(updatedCourseData)
      localStorage.setItem("courseData", JSON.stringify(updatedCourseData))
      setEditingLesson(null)
      setEditContent("")
      setEditTitle("")
    }
  }

  const handlePublish = () => {
    if (courseData) {
      localStorage.setItem("publishedCourse", JSON.stringify(courseData))
      router.push("/course")
    }
  }

  const nextLesson = () => {
    if (courseData) {
      setCurrentIndex((prev) => Math.min(prev + 1, courseData.lessons.length - 1))
    }
  }

  const prevLesson = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0))
  }

  if (!courseData) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your course...</p>
        </div>
      </div>
    )
  }

  const currentLesson = courseData.lessons[currentIndex]

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" onClick={() => router.push("/")} className="rounded-[30px]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Upload
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-balance">{courseData.title}</h1>
            <p className="text-muted-foreground text-pretty">{courseData.description}</p>
          </div>
          <Button onClick={handlePublish} className="rounded-[30px]">
            <Eye className="w-4 h-4 mr-2" />
            Publish Course
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Lesson Cards */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Lessons Overview</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevLesson}
                  disabled={currentIndex === 0}
                  className="rounded-[30px] bg-transparent"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextLesson}
                  disabled={currentIndex === courseData.lessons.length - 1}
                  className="rounded-[30px] bg-transparent"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {courseData.lessons.map((lesson, index) => (
                <Card
                  key={lesson.id}
                  className={`p-6 cursor-pointer transition-all hover:shadow-md ${
                    index === currentIndex ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setCurrentIndex(index)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg text-balance">{lesson.title}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(lesson.id)
                      }}
                      className="rounded-[30px]"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm font-medium">Learning Objectives:</p>
                    <ul className="text-muted-foreground text-sm space-y-1">
                      {lesson.objectives.slice(0, 2).map((objective, idx) => (
                        <li key={idx} className="text-pretty">
                          • {objective}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    Lesson {index + 1} of {courseData.lessons.length}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Lesson Content */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-6">
              {editingLesson === currentLesson?.id ? (
                <div className="space-y-4">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-3 border rounded-[30px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Lesson title..."
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-64 p-3 border rounded-[30px] resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Edit lesson content..."
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveEdit} size="sm" className="rounded-[30px]">
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingLesson(null)}
                      size="sm"
                      className="rounded-[30px]"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-balance">{currentLesson?.title}</h3>
                  <div className="prose prose-sm max-w-none mb-6">
                    <p className="text-foreground leading-relaxed text-pretty whitespace-pre-wrap">
                      {currentLesson?.content}
                    </p>
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Learning Objectives:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {currentLesson?.objectives.map((objective, idx) => (
                        <li key={idx} className="text-pretty">
                          • {objective}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
