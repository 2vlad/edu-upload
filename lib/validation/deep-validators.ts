/**
 * LLM-based deep validation functions for course content quality
 * These validators use AI to analyze semantic consistency and educational quality
 */

import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import type { CourseWithLessons, Lesson } from '@/app/actions/courses'
import type { ValidationSeverity, ValidationResult, ValidationReport } from './fast-validators'

// ============================================================================
// AI Configuration
// ============================================================================

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Use GPT-4o by default for validation (faster and cheaper than GPT-5)
const DEFAULT_VALIDATION_MODEL = process.env.OPENAI_MODEL_GPT_4O || 'gpt-4o'

// ============================================================================
// LLM Validation Schema
// ============================================================================

const ValidationIssueSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string().describe('Краткое описание проблемы'),
  lessonIds: z.array(z.string()).optional().describe('ID затронутых уроков'),
  details: z.string().optional().describe('Подробное объяснение и рекомендации'),
})

const ValidationReportSchema = z.object({
  passed: z.boolean().describe('Прошел ли курс эту проверку'),
  issues: z.array(ValidationIssueSchema),
  summary: z.string().describe('Краткое резюме результатов валидации'),
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert LLM validation output to our internal format
 */
function convertLLMResults(
  validator: string,
  llmOutput: z.infer<typeof ValidationReportSchema>
): ValidationReport {
  const results: ValidationResult[] = llmOutput.issues.map((issue) => ({
    passed: issue.severity === 'info',
    severity: issue.severity as ValidationSeverity,
    message: issue.message,
    affectedLessonIds: issue.lessonIds,
    details: issue.details,
  }))

  // Add summary as an info result if passed
  if (llmOutput.passed && results.length === 0) {
    results.push({
      passed: true,
      severity: 'info',
      message: llmOutput.summary,
    })
  }

  // Calculate overall severity
  const overallSeverity: ValidationSeverity = results.some((r) => r.severity === 'error')
    ? 'error'
    : results.some((r) => r.severity === 'warning')
    ? 'warning'
    : 'info'

  return {
    validator,
    timestamp: new Date().toISOString(),
    results,
    overallSeverity,
  }
}

/**
 * Retry wrapper for AI calls with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Check if error is retryable
      const isRetryable =
        error?.status === 429 || // Rate limit
        error?.status === 500 || // Server error
        error?.status === 503 || // Service unavailable
        error?.code === 'ECONNRESET' || // Connection reset
        error?.message?.includes('timeout')

      if (!isRetryable || attempt === maxRetries) {
        throw error
      }

      // Wait with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt)
      console.warn(`[deep-validation] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Retry failed')
}

// ============================================================================
// LLM Validation Functions
// ============================================================================

/**
 * Validate objectives alignment: check if lesson content matches stated objectives
 */
export async function validateObjectivesAlignment(
  course: CourseWithLessons
): Promise<ValidationReport> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      validator: 'objectives-alignment',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'OpenAI API key not configured for deep validation',
        },
      ],
      overallSeverity: 'error',
    }
  }

  try {
    // Prepare lesson summaries for LLM
    const lessonSummaries = course.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      objectives: lesson.objectives,
      content: lesson.content?.substring(0, 1000) || '', // First 1000 chars
    }))

    const prompt = `
Проанализируй соответствие содержания уроков заявленным целям обучения.

Курс: "${course.title}"
Описание: ${course.description || 'Нет описания'}

Уроки для анализа:
${lessonSummaries
  .map(
    (l) => `
Урок ID: ${l.id}
Заголовок: "${l.title}"
Цели:
${l.objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

Содержание (начало):
${l.content}
`
  )
  .join('\n---\n')}

Задачи:
1. Проверь, соответствует ли содержание каждого урока заявленным целям
2. Найди цели, которые не раскрыты в содержании
3. Найди контент, который не соответствует ни одной цели
4. Оцени, насколько четко и полно достигаются цели

Верни структурированный отчет о найденных проблемах.
`

    const result = await retryWithBackoff(async () => {
      return await generateObject({
        model: openai(DEFAULT_VALIDATION_MODEL),
        prompt,
        maxOutputTokens: 2000,
        schema: ValidationReportSchema,
      })
    })

    return convertLLMResults('objectives-alignment', result.object)
  } catch (error: any) {
    console.error('[deep-validation] Objectives alignment failed:', error)
    return {
      validator: 'objectives-alignment',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'Не удалось выполнить LLM-валидацию целей',
          details: error?.message || 'Unknown error',
        },
      ],
      overallSeverity: 'error',
    }
  }
}

/**
 * Validate term definitions: ensure consistent terminology across lessons
 */
export async function validateTermDefinitions(
  course: CourseWithLessons
): Promise<ValidationReport> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      validator: 'term-definitions',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'OpenAI API key not configured for deep validation',
        },
      ],
      overallSeverity: 'error',
    }
  }

  try {
    // Extract key terms and their usage from lessons
    const lessonTexts = course.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content?.substring(0, 800) || '',
    }))

    const prompt = `
Проанализируй терминологическую согласованность курса.

Курс: "${course.title}"

Уроки:
${lessonTexts
  .map(
    (l) => `
Урок ${l.id}: "${l.title}"
${l.content}
`
  )
  .join('\n---\n')}

Задачи:
1. Найди ключевые термины, которые используются в нескольких уроках
2. Проверь, используются ли термины последовательно с одним и тем же значением
3. Найди случаи, где один термин используется по-разному
4. Найди синонимы, которые можно унифицировать
5. Проверь, вводятся ли термины перед использованием

Верни отчет о терминологических несоответствиях.
`

    const result = await retryWithBackoff(async () => {
      return await generateObject({
        model: openai(DEFAULT_VALIDATION_MODEL),
        prompt,
        maxOutputTokens: 2000,
        schema: ValidationReportSchema,
      })
    })

    return convertLLMResults('term-definitions', result.object)
  } catch (error: any) {
    console.error('[deep-validation] Term definitions failed:', error)
    return {
      validator: 'term-definitions',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'Не удалось выполнить LLM-валидацию терминологии',
          details: error?.message || 'Unknown error',
        },
      ],
      overallSeverity: 'error',
    }
  }
}

/**
 * Validate transition smoothness: analyze logical flow between lessons
 */
export async function validateTransitionSmoothness(
  course: CourseWithLessons
): Promise<ValidationReport> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      validator: 'transition-smoothness',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'OpenAI API key not configured for deep validation',
        },
      ],
      overallSeverity: 'error',
    }
  }

  try {
    // Get lesson pairs for transition analysis
    const transitions = course.lessons.slice(0, -1).map((lesson, index) => ({
      from: {
        id: lesson.id,
        title: lesson.title,
        content: lesson.content?.substring(0, 500) || '',
      },
      to: {
        id: course.lessons[index + 1].id,
        title: course.lessons[index + 1].title,
        content: course.lessons[index + 1].content?.substring(0, 500) || '',
      },
    }))

    const prompt = `
Проанализируй логичность переходов между уроками в курсе.

Курс: "${course.title}"

Переходы для анализа:
${transitions
  .map(
    (t, i) => `
Переход ${i + 1}: "${t.from.title}" → "${t.to.title}"

Окончание урока ${t.from.id}:
${t.from.content.substring(Math.max(0, t.from.content.length - 300))}

Начало урока ${t.to.id}:
${t.to.content.substring(0, 300)}
`
  )
  .join('\n---\n')}

Задачи:
1. Оцени, есть ли логическая связь между последовательными уроками
2. Найди резкие переходы без подготовки
3. Проверь, опирается ли следующий урок на предыдущий
4. Найди пропуски в логике (темы, которые упоминаются, но не объясняются)
5. Оцени общую плавность повествования

Верни отчет о проблемах с переходами.
`

    const result = await retryWithBackoff(async () => {
      return await generateObject({
        model: openai(DEFAULT_VALIDATION_MODEL),
        prompt,
        maxOutputTokens: 2000,
        schema: ValidationReportSchema,
      })
    })

    return convertLLMResults('transition-smoothness', result.object)
  } catch (error: any) {
    console.error('[deep-validation] Transition smoothness failed:', error)
    return {
      validator: 'transition-smoothness',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'Не удалось выполнить LLM-валидацию переходов',
          details: error?.message || 'Unknown error',
        },
      ],
      overallSeverity: 'error',
    }
  }
}

/**
 * Validate educational quality: assess content depth and clarity
 */
export async function validateEducationalQuality(
  course: CourseWithLessons
): Promise<ValidationReport> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      validator: 'educational-quality',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'OpenAI API key not configured for deep validation',
        },
      ],
      overallSeverity: 'error',
    }
  }

  try {
    // Sample lessons for quality analysis (max 3 to stay within token limits)
    const sampled = course.lessons.slice(0, 3)

    const prompt = `
Оцени образовательное качество курса.

Курс: "${course.title}"
Описание: ${course.description || 'Нет описания'}

Примеры уроков:
${sampled
  .map(
    (l) => `
Урок: "${l.title}"
Цели: ${l.objectives.join(', ')}
Содержание:
${l.content || 'Нет контента'}
`
  )
  .join('\n---\n')}

Задачи:
1. Оцени глубину раскрытия тем (поверхностно или подробно)
2. Проверь ясность изложения (понятно ли для целевой аудитории)
3. Оцени наличие примеров и практических применений
4. Проверь структурированность материала
5. Оцени баланс между теорией и практикой
6. Найди слишком сложные или слишком простые части

Верни отчет о качестве образовательного контента.
`

    const result = await retryWithBackoff(async () => {
      return await generateObject({
        model: openai(DEFAULT_VALIDATION_MODEL),
        prompt,
        maxOutputTokens: 2000,
        schema: ValidationReportSchema,
      })
    })

    return convertLLMResults('educational-quality', result.object)
  } catch (error: any) {
    console.error('[deep-validation] Educational quality failed:', error)
    return {
      validator: 'educational-quality',
      timestamp: new Date().toISOString(),
      results: [
        {
          passed: false,
          severity: 'error',
          message: 'Не удалось выполнить LLM-валидацию качества',
          details: error?.message || 'Unknown error',
        },
      ],
      overallSeverity: 'error',
    }
  }
}

// ============================================================================
// Main Deep Validation Runner
// ============================================================================

/**
 * Run all deep validations and return combined report
 */
export async function runDeepValidation(
  course: CourseWithLessons,
  options: {
    includedValidators?: Array<
      'objectives' | 'terms' | 'transitions' | 'quality'
    >
  } = {}
): Promise<{
  reports: ValidationReport[]
  overallSeverity: ValidationSeverity
  summary: string
}> {
  const {
    includedValidators = ['objectives', 'terms', 'transitions', 'quality'],
  } = options

  // Run selected validators in parallel
  const validatorPromises: Promise<ValidationReport>[] = []

  if (includedValidators.includes('objectives')) {
    validatorPromises.push(validateObjectivesAlignment(course))
  }
  if (includedValidators.includes('terms')) {
    validatorPromises.push(validateTermDefinitions(course))
  }
  if (includedValidators.includes('transitions')) {
    validatorPromises.push(validateTransitionSmoothness(course))
  }
  if (includedValidators.includes('quality')) {
    validatorPromises.push(validateEducationalQuality(course))
  }

  const reports = await Promise.all(validatorPromises)

  // Calculate overall severity
  const allResults = reports.flatMap((report) => report.results)
  const overallSeverity: ValidationSeverity = allResults.some((r) => r.severity === 'error')
    ? 'error'
    : allResults.some((r) => r.severity === 'warning')
    ? 'warning'
    : 'info'

  // Generate summary
  const totalIssues = allResults.filter((r) => !r.passed).length

  const summary =
    totalIssues === 0
      ? 'Курс прошел все проверки глубокой валидации'
      : `Найдено ${totalIssues} проблем при глубокой валидации`

  return {
    reports,
    overallSeverity,
    summary,
  }
}
