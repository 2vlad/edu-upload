"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle } from "lucide-react"
import type { CourseWithLessons } from "@/app/actions/courses"

interface CourseViewerProps {
  course: CourseWithLessons
}

export function CourseViewer({ course }: CourseViewerProps) {
  const [currentLesson, setCurrentLesson] = useState(0)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const router = useRouter()

  const markComplete = (lessonId: string) => {
    setCompletedLessons((prev) => new Set([...prev, lessonId]))
  }

  const nextLesson = () => {
    if (currentLesson < course.lessons.length - 1) {
      setCurrentLesson((prev) => prev + 1)
    }
  }

  const prevLesson = () => {
    if (currentLesson > 0) {
      setCurrentLesson((prev) => prev - 1)
    }
  }

  const lesson = course.lessons[currentLesson]
  const progress = Math.round((completedLessons.size / course.lessons.length) * 100)
  const isLessonCompleted = completedLessons.has(lesson.id)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/courses")}
              className="rounded-[30px]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{course.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{course.description}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Прогресс</span>
              <span className="text-sm font-semibold">{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Lesson Navigation */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Урок {currentLesson + 1} из {course.lessons.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="p-8 mb-6">
          <div className="mb-6">
            <h2 className="text-3xl font-bold mb-2">{lesson.title}</h2>
            {lesson.logline && (
              <p className="text-muted-foreground italic">{lesson.logline}</p>
            )}
          </div>

          {/* Learning Objectives */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Цели обучения
            </h3>
            <ul className="space-y-2">
              {lesson.objectives.map((objective, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2 text-primary font-bold">•</span>
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lesson Content */}
          <div className="prose prose-sm max-w-none mb-8">
            <div className="whitespace-pre-wrap leading-relaxed">{lesson.content}</div>
          </div>

          {/* Mark Complete Button */}
          {!isLessonCompleted && (
            <Button
              onClick={() => markComplete(lesson.id)}
              className="rounded-[30px] w-full"
              size="lg"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Отметить как выполненное
            </Button>
          )}

          {isLessonCompleted && (
            <div className="text-center py-4 bg-primary/10 rounded-lg">
              <p className="text-primary font-semibold flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Урок завершён
              </p>
            </div>
          )}
        </Card>

        {/* Navigation Buttons */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={prevLesson}
            disabled={currentLesson === 0}
            className="rounded-[30px] flex-1"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Предыдущий урок
          </Button>
          <Button
            onClick={nextLesson}
            disabled={currentLesson === course.lessons.length - 1}
            className="rounded-[30px] flex-1"
          >
            Следующий урок
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}
