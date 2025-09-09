"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle } from "lucide-react"

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

  if (!courseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your course...</p>
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
                Edit Course
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-balance">{courseData.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {completedLessons.size} of {courseData.lessons.length} lessons completed
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
              <h3 className="font-semibold mb-4">Course Progress</h3>
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
            <Card className="p-8">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-3xl font-bold text-balance">{currentLessonData?.title}</h2>
                  <span className="text-sm text-muted-foreground">
                    Lesson {currentLesson + 1} of {courseData.lessons.length}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${((currentLesson + 1) / courseData.lessons.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Learning Objectives</h3>
                <ul className="space-y-2 text-muted-foreground">
                  {currentLessonData?.objectives.map((objective, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span className="text-pretty">{objective}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="prose prose-lg max-w-none mb-8">
                <div className="text-foreground leading-relaxed text-pretty whitespace-pre-wrap">
                  {currentLessonData?.content}
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={prevLesson}
                  disabled={currentLesson === 0}
                  className="rounded-[30px] bg-transparent"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>

                <div className="flex gap-3">
                  {!completedLessons.has(currentLessonData?.id) && (
                    <Button
                      variant="outline"
                      onClick={() => markComplete(currentLessonData?.id)}
                      className="rounded-[30px]"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark Complete
                    </Button>
                  )}

                  <Button
                    onClick={nextLesson}
                    disabled={currentLesson === courseData.lessons.length - 1}
                    className="rounded-[30px]"
                  >
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
