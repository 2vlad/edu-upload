"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Edit2, Eye, Trash2, Calendar, BookOpen, Plus, CheckCircle2, AlertTriangle, AlertCircle, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { unpublishCourse, deleteCourse } from "@/app/actions/publish-course"
import type { Course } from "@/app/actions/courses"
import { ValidationTrigger } from "@/components/course-validation"
import { ExportDropdown } from "@/components/ExportDropdown"

interface CoursesListProps {
  courses: Course[]
}

export function CoursesList({ courses }: CoursesListProps) {
  const [localCourses, setLocalCourses] = useState(courses)
  const [activeTab, setActiveTab] = useState<'drafts' | 'published'>('drafts')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleViewCourse = (course: Course) => {
    router.push(`/courses/${course.slug}`)
  }

  const handleEditCourse = (course: Course) => {
    // TODO: Navigate to editor when Task #5 is implemented
    router.push(`/courses/${course.slug}`)
  }

  const handleUnpublishCourse = async (course: Course) => {
    const result = await unpublishCourse(course.slug)
    if (result.success) {
      toast({
        title: "Курс снят с публикации",
        description: "Курс перемещен в черновики",
      })

      // Update local state
      setLocalCourses(prev =>
        prev.map(c =>
          c.id === course.id ? { ...c, published: false } : c
        )
      )
      router.refresh()
    } else {
      toast({
        title: "Ошибка",
        description: result.error || "Не удалось снять курс с публикации",
        variant: "destructive",
      })
    }
  }

  const handleDeleteClick = (course: Course) => {
    setCourseToDelete(course)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!courseToDelete) return

    setIsDeleting(true)

    try {
      const result = await deleteCourse(courseToDelete.slug)
      if (!result.success) {
        toast({
          title: "Ошибка",
          description: result.error || "Не удалось удалить курс",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Курс удален",
        description: `Курс "${courseToDelete.title}" был удален`,
      })

      // Update local state
      setLocalCourses(prev => prev.filter(c => c.id !== courseToDelete.id))
      setDeleteDialogOpen(false)
      setCourseToDelete(null)
      router.refresh()
    } catch (error) {
      console.error('Error deleting course:', error)
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при удалении курса",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const draftCourses = localCourses.filter(c => !c.published)
  const publishedCourses = localCourses.filter(c => c.published)

  // Count lessons for each course (if we had lessons data, we'd use it)
  const getLessonCount = (course: Course) => {
    // This would ideally come from a lessons array on the course
    // For now, return 0 as placeholder
    return 0
  }

  // Validation badge component
  const ValidationBadge = ({ course }: { course: Course }) => {
    if (!course.last_validated_at) {
      return (
        <Badge variant="outline" className="rounded-[15px] text-gray-500 border-gray-300">
          <Clock className="w-3 h-3 mr-1" />
          Не проверен
        </Badge>
      )
    }

    const severity = course.last_validation_severity
    const variants = {
      info: { variant: 'default' as const, icon: CheckCircle2, color: 'text-green-600', label: 'OK' },
      warning: { variant: 'outline' as const, icon: AlertTriangle, color: 'text-yellow-600', label: 'Предупреждения' },
      error: { variant: 'destructive' as const, icon: AlertCircle, color: 'text-red-600', label: 'Ошибки' },
    }

    const config = variants[severity as keyof typeof variants] || variants.info
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className={`rounded-[15px] ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    )
  }

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'drafts' | 'published')}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="drafts">
            Черновики ({draftCourses.length})
          </TabsTrigger>
          <TabsTrigger value="published">
            Опубликованные ({publishedCourses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-6">
          {draftCourses.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4">
                У вас пока нет черновиков в базе данных
              </p>
              <Button
                onClick={() => router.push("/")}
                className="rounded-[30px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Создать первый курс
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {draftCourses.map((course) => (
                <Card key={course.id} className="p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-[15px]">
                      Черновик
                    </Badge>
                    {course.published && <ValidationBadge course={course} />}
                  </div>

                  <h3 className="text-xl font-bold mb-2 line-clamp-1">
                    {course.title}
                  </h3>

                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {course.description}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 flex-wrap">
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {getLessonCount(course)} уроков
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(course.updated_at), {
                        addSuffix: true,
                        locale: ru
                      })}
                    </div>
                    {course.published && course.last_validated_at && (
                      <div className="flex items-center gap-1 text-blue-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Проверен {formatDistanceToNow(new Date(course.last_validated_at), {
                          addSuffix: true,
                          locale: ru
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditCourse(course)}
                      className="flex-1 rounded-[25px]"
                    >
                      <Edit2 className="w-3 h-3 mr-2" />
                      Открыть
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(course)}
                      className="rounded-[25px] text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="published" className="mt-6">
          {publishedCourses.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4">
                У вас пока нет опубликованных курсов
              </p>
              <Button
                onClick={() => router.push("/")}
                variant="outline"
                className="rounded-[30px]"
              >
                Создать курс
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {publishedCourses.map((course) => (
                <Card key={course.id} className="p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                    <Badge variant="default" className="rounded-[15px]">
                      Опубликован
                    </Badge>
                    <ValidationBadge course={course} />
                  </div>

                  <h3 className="text-xl font-bold mb-2 line-clamp-1">
                    {course.title}
                  </h3>

                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {course.description}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 flex-wrap">
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {getLessonCount(course)} уроков
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(course.updated_at), {
                        addSuffix: true,
                        locale: ru
                      })}
                    </div>
                    {course.published && course.last_validated_at && (
                      <div className="flex items-center gap-1 text-blue-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Проверен {formatDistanceToNow(new Date(course.last_validated_at), {
                          addSuffix: true,
                          locale: ru
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewCourse(course)}
                        className="flex-1 rounded-[25px]"
                      >
                        <Eye className="w-3 h-3 mr-2" />
                        Просмотр
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditCourse(course)}
                        className="flex-1 rounded-[25px]"
                      >
                        <Edit2 className="w-3 h-3 mr-2" />
                        Редактировать
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(course)}
                        className="rounded-[25px] text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <ValidationTrigger
                        courseId={course.id}
                        onValidationComplete={(results) => {
                          toast({
                            title: results.error ? "Ошибка валидации" : "Валидация завершена",
                            description: results.error || results.summary,
                            variant: results.error ? "destructive" : "default",
                          })
                          router.refresh()
                        }}
                      />
                      <ExportDropdown courseId={course.id} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить курс?</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить курс "{courseToDelete?.title}"? Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="rounded-[30px]"
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="rounded-[30px]"
            >
              {isDeleting ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
