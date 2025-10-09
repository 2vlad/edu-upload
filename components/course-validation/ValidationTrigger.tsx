"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CheckCircle2, ChevronDown, Loader2, Zap, Brain } from "lucide-react"

export interface ValidationTriggerProps {
  courseId?: string
  onValidationStart?: (mode: 'fast' | 'deep') => void
  onValidationComplete?: (results: any) => void
  disabled?: boolean
}

export function ValidationTrigger({
  courseId,
  onValidationStart,
  onValidationComplete,
  disabled = false,
}: ValidationTriggerProps) {
  const [isValidating, setIsValidating] = useState(false)
  const [validationMode, setValidationMode] = useState<'fast' | 'deep' | null>(null)

  const handleValidate = async (mode: 'fast' | 'deep') => {
    if (!courseId || isValidating) return

    setIsValidating(true)
    setValidationMode(mode)
    onValidationStart?.(mode)

    try {
      const response = await fetch(`/api/courses/${courseId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      })

      if (!response.ok) {
        throw new Error('Validation failed')
      }

      const results = await response.json()
      onValidationComplete?.(results)
    } catch (error) {
      console.error('[ValidationTrigger] Error:', error)
      onValidationComplete?.({ error: 'Validation failed' })
    } finally {
      setIsValidating(false)
      setValidationMode(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled || isValidating || !courseId}
          className="rounded-[30px]"
        >
          {isValidating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {validationMode === 'fast' ? 'Быстрая валидация...' : 'Глубокая валидация...'}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Валидировать курс
              <ChevronDown className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handleValidate('fast')} disabled={isValidating}>
          <Zap className="w-4 h-4 mr-2 text-yellow-500" />
          <div className="flex-1">
            <div className="font-medium">Быстрая валидация</div>
            <div className="text-xs text-muted-foreground">~30 секунд</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleValidate('deep')} disabled={isValidating}>
          <Brain className="w-4 h-4 mr-2 text-purple-500" />
          <div className="flex-1">
            <div className="font-medium">Глубокая валидация</div>
            <div className="text-xs text-muted-foreground">~2-3 минуты, с AI</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
