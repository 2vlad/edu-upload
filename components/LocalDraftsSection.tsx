"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Edit2, Trash2, Upload as UploadIcon, Calendar, BookOpen, Plus } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface LocalCourse {
  title: string
  description: string
  lessonCount: number
  updatedAt?: string
}

export function LocalDraftsSection() {
  const [localDraft, setLocalDraft] = useState<LocalCourse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    loadLocalDraft()
  }, [])

  const loadLocalDraft = () => {
    const draftData = localStorage.getItem('courseData')
    if (draftData) {
      const data = JSON.parse(draftData)
      setLocalDraft({
        title: data.title,
        description: data.description,
        lessonCount: data.lessons?.length || 0,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  const handleOpenCourse = () => {
    router.push('/outline')
  }

  const handlePublishCourse = () => {
    router.push('/lessons')
  }

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)

    try {
      localStorage.removeItem('courseData')

      toast({
        title: "Черновик удален",
        description: `Черновик "${localDraft?.title}" был удален`,
      })

      setLocalDraft(null)
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error('Error deleting draft:', error)
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при удалении черновика",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  if (!localDraft) {
    return null
  }

  return (
    <>
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Локальные черновики</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <Badge variant="outline" className="rounded-[15px]">
                Локальный черновик
              </Badge>
            </div>

            <h3 className="text-xl font-bold mb-2 line-clamp-1">
              {localDraft.title}
            </h3>

            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {localDraft.description}
            </p>

            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {localDraft.lessonCount} {localDraft.lessonCount === 1 ? 'урок' : 'уроков'}
              </div>
              {localDraft.updatedAt && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDistanceToNow(new Date(localDraft.updatedAt), {
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
                onClick={handleOpenCourse}
                className="flex-1 rounded-[25px]"
              >
                <Edit2 className="w-3 h-3 mr-2" />
                Открыть
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePublishCourse}
                className="flex-1 rounded-[25px]"
              >
                <UploadIcon className="w-3 h-3 mr-2" />
                Опубликовать
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteClick}
                className="rounded-[25px] text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить черновик?</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить черновик "{localDraft?.title}"? Это действие нельзя отменить.
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
