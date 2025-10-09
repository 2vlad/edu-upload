"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Download, FileText, FileArchive, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ExportDropdownProps {
  courseId: string
  disabled?: boolean
}

type ExportFormat = 'md' | 'txt'
type ExportMode = 'single' | 'multi'

interface ExportOption {
  format: ExportFormat
  mode: ExportMode
  label: string
  description: string
  icon: typeof FileText
}

const exportOptions: ExportOption[] = [
  {
    format: 'md',
    mode: 'single',
    label: 'Markdown (один файл)',
    description: 'Все уроки в одном .md файле',
    icon: FileText,
  },
  {
    format: 'md',
    mode: 'multi',
    label: 'Markdown (ZIP архив)',
    description: 'Отдельные файлы для каждого урока',
    icon: FileArchive,
  },
  {
    format: 'txt',
    mode: 'single',
    label: 'Текст (один файл)',
    description: 'Все уроки в одном .txt файле',
    icon: FileText,
  },
  {
    format: 'txt',
    mode: 'multi',
    label: 'Текст (ZIP архив)',
    description: 'Отдельные текстовые файлы',
    icon: FileArchive,
  },
]

export function ExportDropdown({ courseId, disabled = false }: ExportDropdownProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportingOption, setExportingOption] = useState<string | null>(null)
  const { toast } = useToast()

  const handleExport = async (option: ExportOption) => {
    const optionKey = `${option.format}-${option.mode}`
    setIsExporting(true)
    setExportingOption(optionKey)

    try {
      // Call export API
      const url = `/api/courses/${courseId}/export?format=${option.format}&mode=${option.mode}`
      const response = await fetch(url, {
        method: 'GET',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Export failed')
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'course-export'

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      // Create blob and download
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)

      toast({
        title: "Экспорт успешен",
        description: `Курс экспортирован как ${option.label}`,
      })
    } catch (error: any) {
      console.error('Export error:', error)
      toast({
        title: "Ошибка экспорта",
        description: error.message || "Не удалось экспортировать курс",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
      setExportingOption(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isExporting}
          className="rounded-[25px]"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              Экспорт...
            </>
          ) : (
            <>
              <Download className="w-3 h-3 mr-2" />
              Экспорт
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Экспортировать курс</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {exportOptions.map((option) => {
          const optionKey = `${option.format}-${option.mode}`
          const Icon = option.icon
          const isCurrentlyExporting = isExporting && exportingOption === optionKey

          return (
            <DropdownMenuItem
              key={optionKey}
              onClick={() => handleExport(option)}
              disabled={isExporting}
              className="cursor-pointer flex-col items-start py-3"
            >
              <div className="flex items-center gap-2 w-full">
                {isCurrentlyExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="font-medium">{option.label}</span>
              </div>
              <span className="text-xs text-muted-foreground ml-6">
                {option.description}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
