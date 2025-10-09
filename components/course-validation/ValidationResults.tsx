"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { AlertCircle, AlertTriangle, Info, CheckCircle, ChevronDown, X } from "lucide-react"
import { useState } from "react"

export interface ValidationResult {
  passed: boolean
  severity: 'info' | 'warning' | 'error'
  message: string
  affectedLessonIds?: string[]
  details?: string
}

export interface ValidationReport {
  validator: string
  timestamp: string
  results: ValidationResult[]
  overallSeverity: 'info' | 'warning' | 'error'
}

export interface ValidationResultsData {
  mode: 'fast' | 'deep'
  reports: ValidationReport[]
  overallSeverity: 'info' | 'warning' | 'error'
  summary: string
  validationId?: string
  error?: string
}

export interface ValidationResultsProps {
  data: ValidationResultsData | null
  onClose?: () => void
}

const SeverityIcon = ({ severity }: { severity: 'info' | 'warning' | 'error' }) => {
  switch (severity) {
    case 'error':
      return <AlertCircle className="w-5 h-5 text-destructive" />
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />
    case 'info':
      return <Info className="w-5 h-5 text-blue-500" />
    default:
      return <CheckCircle className="w-5 h-5 text-green-500" />
  }
}

const SeverityBadge = ({ severity }: { severity: 'info' | 'warning' | 'error' }) => {
  const variants = {
    error: 'destructive',
    warning: 'outline',
    info: 'secondary',
  } as const

  const labels = {
    error: 'Ошибка',
    warning: 'Предупреждение',
    info: 'Информация',
  }

  return (
    <Badge variant={variants[severity]} className="ml-2">
      {labels[severity]}
    </Badge>
  )
}

const ValidatorTitle = (validator: string) => {
  const titles: Record<string, string> = {
    'structure': 'Структура курса',
    'outline': 'Соответствие описанию',
    'links': 'Проверка ссылок',
    'prerequisites': 'Предварительные требования',
    'content-length': 'Длина контента',
    'objectives-alignment': 'Соответствие целям',
    'term-definitions': 'Терминология',
    'transition-smoothness': 'Переходы между уроками',
    'educational-quality': 'Образовательное качество',
  }

  return titles[validator] || validator
}

export function ValidationResults({ data, onClose }: ValidationResultsProps) {
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set())

  if (!data) return null

  if (data.error) {
    return (
      <Card className="p-6 border-destructive">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-destructive mt-1" />
            <div>
              <h3 className="text-lg font-semibold text-destructive mb-1">
                Ошибка валидации
              </h3>
              <p className="text-sm text-muted-foreground">{data.error}</p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Card>
    )
  }

  const toggleReport = (validator: string) => {
    const newSet = new Set(expandedReports)
    if (newSet.has(validator)) {
      newSet.delete(validator)
    } else {
      newSet.add(validator)
    }
    setExpandedReports(newSet)
  }

  const totalIssues = data.reports.reduce(
    (sum, report) => sum + report.results.filter((r) => !r.passed).length,
    0
  )

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <SeverityIcon severity={data.overallSeverity} />
          <div>
            <h3 className="text-lg font-semibold flex items-center">
              Результаты валидации
              <SeverityBadge severity={data.overallSeverity} />
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {data.mode === 'fast' ? 'Быстрая валидация' : 'Глубокая валидация (AI)'} •{' '}
              {totalIssues === 0
                ? 'Проблем не найдено'
                : `Найдено ${totalIssues} проблем${totalIssues === 1 ? 'а' : ''}`}
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <p className="text-sm">{data.summary}</p>
      </div>

      {/* Reports */}
      <div className="space-y-4">
        {data.reports.map((report) => (
          <Collapsible
            key={report.validator}
            open={expandedReports.has(report.validator)}
            onOpenChange={() => toggleReport(report.validator)}
          >
            <Card className="border-l-4 border-l-primary">
              <CollapsibleTrigger className="w-full">
                <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <SeverityIcon severity={report.overallSeverity} />
                    <div className="text-left">
                      <h4 className="font-medium">{ValidatorTitle(report.validator)}</h4>
                      <p className="text-sm text-muted-foreground">
                        {report.results.filter((r) => !r.passed).length} проблем
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 transition-transform ${
                      expandedReports.has(report.validator) ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3">
                  {report.results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg ${
                        result.severity === 'error'
                          ? 'bg-destructive/10'
                          : result.severity === 'warning'
                          ? 'bg-yellow-500/10'
                          : 'bg-blue-500/10'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <SeverityIcon severity={result.severity} />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{result.message}</p>
                          {result.details && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {result.details}
                            </p>
                          )}
                          {result.affectedLessonIds &&
                            result.affectedLessonIds.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {result.affectedLessonIds.map((id) => (
                                  <Badge key={id} variant="secondary" className="text-xs">
                                    Урок {id}
                                  </Badge>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </Card>
  )
}
