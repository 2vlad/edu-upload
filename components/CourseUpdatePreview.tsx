"use client"

import { CourseChanges } from "@/lib/courseUpdates"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, RefreshCw, Check, AlertCircle } from "lucide-react"

interface CourseUpdatePreviewProps {
  changes: CourseChanges
  onApprove: () => void
  onCancel: () => void
}

export function CourseUpdatePreview({
  changes,
  onApprove,
  onCancel,
}: CourseUpdatePreviewProps) {
  const hasChanges =
    changes.newLessons.length > 0 ||
    changes.updatedLessons.length > 0 ||
    changes.removedLessons.length > 0

  if (!hasChanges) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="w-5 h-5" />
          <p>Изменений не обнаружено</p>
        </div>
        <Button onClick={onCancel} variant="outline" className="mt-4 rounded-[30px]">
          Закрыть
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Предпросмотр изменений</h3>
        <div className="flex gap-4 flex-wrap">
          {changes.newLessons.length > 0 && (
            <Badge variant="default" className="rounded-[20px]">
              <Plus className="w-3 h-3 mr-1" />
              {changes.newLessons.length} новых уроков
            </Badge>
          )}
          {changes.updatedLessons.length > 0 && (
            <Badge variant="secondary" className="rounded-[20px]">
              <RefreshCw className="w-3 h-3 mr-1" />
              {changes.updatedLessons.length} обновленных уроков
            </Badge>
          )}
          {changes.preservedLessons.length > 0 && (
            <Badge variant="outline" className="rounded-[20px]">
              <Check className="w-3 h-3 mr-1" />
              {changes.preservedLessons.length} сохраненных уроков
            </Badge>
          )}
        </div>
      </Card>

      {/* New Lessons */}
      {changes.newLessons.length > 0 && (
        <Card className="p-6">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Новые уроки
          </h4>
          <div className="space-y-3">
            {changes.newLessons.map((lesson) => (
              <div
                key={lesson.id}
                className="p-4 bg-primary/5 rounded-lg border border-primary/20"
              >
                <h5 className="font-medium">{lesson.title}</h5>
                {lesson.logline && (
                  <p className="text-sm text-muted-foreground mt-1 italic">
                    {lesson.logline}
                  </p>
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  {lesson.objectives.length} целей обучения
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Updated Lessons */}
      {changes.updatedLessons.length > 0 && (
        <Card className="p-6">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-500" />
            Обновленные уроки
          </h4>
          <div className="space-y-3">
            {changes.updatedLessons.map(({ lesson, changes: lessonChanges }) => (
              <div
                key={lesson.id}
                className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <h5 className="font-medium">{lesson.title}</h5>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lessonChanges.map((change, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs rounded-[15px]"
                    >
                      {change}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Preserved Lessons */}
      {changes.preservedLessons.length > 0 && (
        <Card className="p-6">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            Сохраненные уроки (без изменений)
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {changes.preservedLessons.map((lesson) => (
              <div
                key={lesson.id}
                className="p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800 text-sm"
              >
                {lesson.title}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          className="rounded-[30px]"
        >
          Отмена
        </Button>
        <Button
          onClick={onApprove}
          className="rounded-[30px] bg-primary hover:bg-primary/90"
        >
          Применить изменения
        </Button>
      </div>
    </div>
  )
}
