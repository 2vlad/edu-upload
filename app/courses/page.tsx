"use client"

import { useState, useEffect } from "react"
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
import {
  ArrowLeft,
  Plus,
  Edit2,
  Eye,
  Trash2,
  Upload as UploadIcon,
  Calendar,
  BookOpen
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { unpublishCourse, deleteCourse } from "@/app/actions/publish-course"

interface CourseMetadata {
  title: string
  description: string
  lessonCount: number
  createdAt?: string
  updatedAt?: string
  slug?: string
  status: 'draft' | 'published'
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseMetadata[]>([])
  const [activeTab, setActiveTab] = useState<'drafts' | 'published'>('drafts')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<CourseMetadata | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    loadCourses()
  }, [])

  const loadCourses = () => {
    const allCourses: CourseMetadata[] = []

    // Load draft course from localStorage
    const draftCourse = localStorage.getItem('courseData')
    if (draftCourse) {
      const data = JSON.parse(draftCourse)
      allCourses.push({
        title: data.title,
        description: data.description,
        lessonCount: data.lessons?.length || 0,
        status: 'draft',
        updatedAt: new Date().toISOString(), // We'll track this later
      })
    }

    // Load published course from localStorage
    const publishedCourse = localStorage.getItem('publishedCourse')
    const publishedSlug = localStorage.getItem('publishedCourseSlug')
    if (publishedCourse) {
      const data = JSON.parse(publishedCourse)
      allCourses.push({
        title: data.title,
        description: data.description,
        lessonCount: data.lessons?.length || 0,
        slug: publishedSlug || undefined,
        status: 'published',
        updatedAt: new Date().toISOString(),
      })
    }

    setCourses(allCourses)
  }

  const handleOpenCourse = (course: CourseMetadata) => {
    // Navigate to outline page for editing
    router.push('/outline')
  }

  const handleViewCourse = (course: CourseMetadata) => {
    if (course.slug) {
      router.push(`/courses/${course.slug}`)
    } else {
      // Fallback to legacy course view
      router.push('/course')
    }
  }

  const handlePublishCourse = () => {
    // Navigate to lessons page where publish button is
    router.push('/lessons')
  }

  const handleUnpublishCourse = async (course: CourseMetadata) => {
    if (!course.slug) {
      toast({
        title: "Ошибка",
        description: "Не удалось снять курс с публикации",
        variant: "destructive",
      })
      return
    }

    const result = await unpublishCourse(course.slug)
    if (result.success) {
      toast({
        title: "Курс снят с публикации",
        description: "Курс перемещен в черновики",
      })
      loadCourses()
    } else {
      toast({
        title: "Ошибка",
        description: result.error || "Не удалось снять курс с публикации",
        variant: "destructive",
      })
    }
  }

  const handleDeleteClick = (course: CourseMetadata) => {
    setCourseToDelete(course)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!courseToDelete) return

    setIsDeleting(true)

    try {
      if (courseToDelete.status === 'published' && courseToDelete.slug) {
        // Delete from Supabase
        const result = await deleteCourse(courseToDelete.slug)
        if (!result.success) {
          toast({
            title: "Ошибка",
            description: result.error || "Не удалось удалить курс",
            variant: "destructive",
          })
          return
        }
        // Also remove from localStorage
        localStorage.removeItem('publishedCourse')
        localStorage.removeItem('publishedCourseSlug')
      } else {
        // Delete draft from localStorage
        localStorage.removeItem('courseData')
      }

      toast({
        title: "Курс удален",
        description: `Курс "${courseToDelete.title}" был удален`,
      })

      loadCourses()
      setDeleteDialogOpen(false)
      setCourseToDelete(null)
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

  const draftCourses = courses.filter(c => c.status === 'draft')
  const publishedCourses = courses.filter(c => c.status === 'published')

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6">
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
                <h1 className="text-3xl font-bold">Мои курсы</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Управляйте своими курсами
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push("/")}
              className="rounded-[30px]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Создать курс
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
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
                  У вас пока нет черновиков
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
                {draftCourses.map((course, index) => (
                  <Card key={index} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant="secondary" className="rounded-[15px]">
                        Черновик
                      </Badge>
                    </div>

                    <h3 className="text-xl font-bold mb-2 line-clamp-1">
                      {course.title}
                    </h3>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {course.description}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {course.lessonCount} {course.lessonCount === 1 ? 'урок' : 'уроков'}
                      </div>
                      {course.updatedAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(course.updatedAt), {
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
                        onClick={() => handleOpenCourse(course)}
                        className="flex-1 rounded-[25px]"
                      >
                        <Edit2 className="w-3 h-3 mr-2" />
                        Открыть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePublishCourse()}
                        className="flex-1 rounded-[25px]"
                      >
                        <UploadIcon className="w-3 h-3 mr-2" />
                        Опубликовать
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
                {publishedCourses.map((course, index) => (
                  <Card key={index} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant="default" className="rounded-[15px]">
                        Опубликован
                      </Badge>
                    </div>

                    <h3 className="text-xl font-bold mb-2 line-clamp-1">
                      {course.title}
                    </h3>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {course.description}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {course.lessonCount} {course.lessonCount === 1 ? 'урок' : 'уроков'}
                      </div>
                      {course.updatedAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(course.updatedAt), {
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
                        onClick={() => handleViewCourse(course)}
                        className="flex-1 rounded-[25px]"
                      >
                        <Eye className="w-3 h-3 mr-2" />
                        Просмотр
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenCourse(course)}
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
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
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
    </div>
  )
}
