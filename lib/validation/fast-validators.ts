/**
 * Fast deterministic validation functions for course content
 * These validators perform structural and consistency checks without AI
 */

import type { CourseWithLessons, Lesson } from '@/app/actions/courses'

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ValidationSeverity = 'info' | 'warning' | 'error'

export interface ValidationResult {
  passed: boolean
  severity: ValidationSeverity
  message: string
  affectedLessonIds?: string[]
  details?: string
}

export interface ValidationReport {
  validator: string
  timestamp: string
  results: ValidationResult[]
  overallSeverity: ValidationSeverity
}

// ============================================================================
// Validation Configuration
// ============================================================================

const VALIDATION_CONFIG = {
  minContentLength: 100, // minimum words per lesson
  maxContentLength: 10000, // maximum words per lesson
  linkTimeout: 5000, // 5 seconds for link validation
  maxConcurrentLinkChecks: 10, // parallel link checks
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count words in text content
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Extract URLs from markdown/HTML content
 */
function extractUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/gi
  const matches = content.match(urlRegex) || []
  return [...new Set(matches)] // deduplicate
}

/**
 * Determine overall severity from multiple results
 */
function calculateOverallSeverity(results: ValidationResult[]): ValidationSeverity {
  if (results.some((r) => r.severity === 'error')) return 'error'
  if (results.some((r) => r.severity === 'warning')) return 'warning'
  return 'info'
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate course structure: lesson order, unique titles, required fields
 */
export async function validateCourseStructure(
  course: CourseWithLessons
): Promise<ValidationReport> {
  const results: ValidationResult[] = []

  // Check if course has lessons
  if (!course.lessons || course.lessons.length === 0) {
    results.push({
      passed: false,
      severity: 'error',
      message: 'Курс не содержит уроков',
      details: 'Добавьте хотя бы один урок в курс',
    })
    return {
      validator: 'structure',
      timestamp: new Date().toISOString(),
      results,
      overallSeverity: 'error',
    }
  }

  // Check lesson order indices are sequential
  const orderIndices = course.lessons.map((l) => l.order_index).sort((a, b) => a - b)
  const expectedIndices = Array.from({ length: course.lessons.length }, (_, i) => i)
  const orderCorrect = orderIndices.every((idx, i) => idx === expectedIndices[i])

  if (!orderCorrect) {
    results.push({
      passed: false,
      severity: 'warning',
      message: 'Порядок уроков не последователен',
      details: `Ожидается порядок 0, 1, 2..., но найдено: ${orderIndices.join(', ')}`,
    })
  }

  // Check for duplicate lesson titles
  const titleCounts = new Map<string, string[]>()
  course.lessons.forEach((lesson) => {
    const normalizedTitle = lesson.title.trim().toLowerCase()
    if (!titleCounts.has(normalizedTitle)) {
      titleCounts.set(normalizedTitle, [])
    }
    titleCounts.get(normalizedTitle)!.push(lesson.id)
  })

  titleCounts.forEach((lessonIds, title) => {
    if (lessonIds.length > 1) {
      results.push({
        passed: false,
        severity: 'warning',
        message: `Дублирующиеся заголовки уроков: "${title}"`,
        affectedLessonIds: lessonIds,
        details: `${lessonIds.length} уроков имеют одинаковый заголовок`,
      })
    }
  })

  // Check required fields for each lesson
  course.lessons.forEach((lesson) => {
    const missingFields: string[] = []

    if (!lesson.title || lesson.title.trim().length === 0) {
      missingFields.push('заголовок')
    }
    if (!lesson.content || lesson.content.trim().length === 0) {
      missingFields.push('контент')
    }
    if (!lesson.objectives || lesson.objectives.length === 0) {
      missingFields.push('цели')
    }

    if (missingFields.length > 0) {
      results.push({
        passed: false,
        severity: 'error',
        message: `Урок "${lesson.title}" имеет пустые обязательные поля`,
        affectedLessonIds: [lesson.id],
        details: `Отсутствуют поля: ${missingFields.join(', ')}`,
      })
    }
  })

  // If no issues found, add success result
  if (results.length === 0) {
    results.push({
      passed: true,
      severity: 'info',
      message: 'Структура курса корректна',
      details: `${course.lessons.length} уроков, все обязательные поля заполнены`,
    })
  }

  return {
    validator: 'structure',
    timestamp: new Date().toISOString(),
    results,
    overallSeverity: calculateOverallSeverity(results),
  }
}

/**
 * Validate outline consistency: lessons match course description
 */
export async function validateOutlineConsistency(
  course: CourseWithLessons
): Promise<ValidationReport> {
  const results: ValidationResult[] = []

  // Check if course has description
  if (!course.description || course.description.trim().length === 0) {
    results.push({
      passed: false,
      severity: 'warning',
      message: 'Отсутствует описание курса',
      details: 'Рекомендуется добавить описание для контекста',
    })
  }

  // Check if lessons have loglines
  const lessonsWithoutLoglines = course.lessons.filter(
    (l) => !l.logline || l.logline.trim().length === 0
  )

  if (lessonsWithoutLoglines.length > 0) {
    results.push({
      passed: false,
      severity: 'info',
      message: `${lessonsWithoutLoglines.length} уроков без краткого описания`,
      affectedLessonIds: lessonsWithoutLoglines.map((l) => l.id),
      details: 'Краткие описания помогают студентам понять содержание урока',
    })
  }

  // Check if lessons have objectives
  const lessonsWithFewObjectives = course.lessons.filter(
    (l) => !l.objectives || l.objectives.length < 2
  )

  if (lessonsWithFewObjectives.length > 0) {
    results.push({
      passed: false,
      severity: 'warning',
      message: `${lessonsWithFewObjectives.length} уроков имеют менее 2 целей`,
      affectedLessonIds: lessonsWithFewObjectives.map((l) => l.id),
      details: 'Рекомендуется иметь минимум 2-3 цели на урок',
    })
  }

  // Success if no major issues
  if (results.length === 0) {
    results.push({
      passed: true,
      severity: 'info',
      message: 'Структура курса соответствует ожиданиям',
      details: 'Все уроки имеют описания и цели',
    })
  }

  return {
    validator: 'outline',
    timestamp: new Date().toISOString(),
    results,
    overallSeverity: calculateOverallSeverity(results),
  }
}

/**
 * Validate external links in course content
 */
export async function validateLinks(course: CourseWithLessons): Promise<ValidationReport> {
  const results: ValidationResult[] = []

  // Extract all URLs from all lesson content
  const linksByLesson = new Map<string, string[]>()
  course.lessons.forEach((lesson) => {
    if (lesson.content) {
      const urls = extractUrls(lesson.content)
      if (urls.length > 0) {
        linksByLesson.set(lesson.id, urls)
      }
    }
  })

  // If no links found, return early
  if (linksByLesson.size === 0) {
    results.push({
      passed: true,
      severity: 'info',
      message: 'В курсе нет внешних ссылок',
    })
    return {
      validator: 'links',
      timestamp: new Date().toISOString(),
      results,
      overallSeverity: 'info',
    }
  }

  // Check links in batches
  const allUrls = Array.from(linksByLesson.values()).flat()
  const uniqueUrls = [...new Set(allUrls)]

  results.push({
    passed: true,
    severity: 'info',
    message: `Найдено ${uniqueUrls.length} уникальных ссылок`,
    details: `Проверка доступности ссылок (может занять время)`,
  })

  // Check each URL (with concurrency limit)
  const brokenLinks: Array<{ url: string; lessonIds: string[] }> = []
  const timeoutLinks: Array<{ url: string; lessonIds: string[] }> = []

  // Process URLs in batches
  for (let i = 0; i < uniqueUrls.length; i += VALIDATION_CONFIG.maxConcurrentLinkChecks) {
    const batch = uniqueUrls.slice(i, i + VALIDATION_CONFIG.maxConcurrentLinkChecks)

    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), VALIDATION_CONFIG.linkTimeout)

        try {
          const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
          })
          clearTimeout(timeoutId)

          return {
            url,
            status: response.ok ? 'ok' : 'broken',
            statusCode: response.status,
          }
        } catch (error: any) {
          clearTimeout(timeoutId)

          if (error.name === 'AbortError') {
            return { url, status: 'timeout' }
          }
          return { url, status: 'error', error: error.message }
        }
      })
    )

    // Collect results
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { url, status } = result.value

        // Find which lessons contain this URL
        const affectedLessons: string[] = []
        linksByLesson.forEach((urls, lessonId) => {
          if (urls.includes(url)) {
            affectedLessons.push(lessonId)
          }
        })

        if (status === 'broken' || status === 'error') {
          brokenLinks.push({ url, lessonIds: affectedLessons })
        } else if (status === 'timeout') {
          timeoutLinks.push({ url, lessonIds: affectedLessons })
        }
      }
    })
  }

  // Report broken links
  if (brokenLinks.length > 0) {
    brokenLinks.forEach(({ url, lessonIds }) => {
      results.push({
        passed: false,
        severity: 'error',
        message: `Недоступная ссылка: ${url}`,
        affectedLessonIds: lessonIds,
        details: 'Ссылка возвращает ошибку или не существует',
      })
    })
  }

  // Report timeout links
  if (timeoutLinks.length > 0) {
    timeoutLinks.forEach(({ url, lessonIds }) => {
      results.push({
        passed: false,
        severity: 'warning',
        message: `Ссылка не отвечает: ${url}`,
        affectedLessonIds: lessonIds,
        details: 'Превышено время ожидания ответа (5 секунд)',
      })
    })
  }

  // Success message
  const workingLinks = uniqueUrls.length - brokenLinks.length - timeoutLinks.length
  if (brokenLinks.length === 0 && timeoutLinks.length === 0) {
    results.push({
      passed: true,
      severity: 'info',
      message: `Все ${uniqueUrls.length} ссылок доступны`,
    })
  } else {
    results.push({
      passed: false,
      severity: 'info',
      message: `${workingLinks} из ${uniqueUrls.length} ссылок доступны`,
    })
  }

  return {
    validator: 'links',
    timestamp: new Date().toISOString(),
    results,
    overallSeverity: calculateOverallSeverity(results),
  }
}

/**
 * Validate prerequisites and dependencies
 * Note: Current schema doesn't have lesson dependencies, but validates logical flow
 */
export async function validatePrerequisites(
  course: CourseWithLessons
): Promise<ValidationReport> {
  const results: ValidationResult[] = []

  // Check if lessons build upon each other logically
  // Look for terms/concepts introduced in earlier lessons that are referenced later

  // Simple heuristic: Check if lesson titles suggest a progression
  const titleKeywords = course.lessons.map((l) => ({
    id: l.id,
    title: l.title.toLowerCase(),
    order: l.order_index,
  }))

  // Check for "part 1", "part 2" patterns
  const partPattern = /part\s+(\d+)|часть\s+(\d+)|урок\s+(\d+)/i
  const partsFound = titleKeywords.filter((t) => partPattern.test(t.title))

  if (partsFound.length > 0) {
    // Verify parts are in order
    const partNumbers = partsFound.map((t) => {
      const match = t.title.match(partPattern)
      return match ? parseInt(match[1] || match[2] || match[3]) : 0
    })

    const inOrder = partNumbers.every((num, idx) => idx === 0 || num > partNumbers[idx - 1])

    if (!inOrder) {
      results.push({
        passed: false,
        severity: 'warning',
        message: 'Нумерация частей/уроков не последовательна',
        affectedLessonIds: partsFound.map((t) => t.id),
        details: `Найдена нумерация: ${partNumbers.join(', ')}`,
      })
    } else {
      results.push({
        passed: true,
        severity: 'info',
        message: 'Нумерация частей/уроков последовательна',
      })
    }
  }

  // Check for basic prerequisite keywords
  const prerequisiteKeywords = [
    'prerequisite',
    'requires',
    'предварительно',
    'требует',
    'необходимо знать',
  ]

  course.lessons.forEach((lesson) => {
    if (lesson.content) {
      const hasPrereqMention = prerequisiteKeywords.some((kw) =>
        lesson.content!.toLowerCase().includes(kw)
      )

      if (hasPrereqMention && lesson.order_index === 0) {
        results.push({
          passed: false,
          severity: 'warning',
          message: `Первый урок "${lesson.title}" упоминает предварительные требования`,
          affectedLessonIds: [lesson.id],
          details: 'Первый урок не должен иметь предварительных требований',
        })
      }
    }
  })

  // Success if no issues
  if (results.length === 0) {
    results.push({
      passed: true,
      severity: 'info',
      message: 'Логический порядок уроков корректен',
    })
  }

  return {
    validator: 'prerequisites',
    timestamp: new Date().toISOString(),
    results,
    overallSeverity: calculateOverallSeverity(results),
  }
}

/**
 * Validate content length for each lesson
 */
export async function validateContentLength(
  course: CourseWithLessons
): Promise<ValidationReport> {
  const results: ValidationResult[] = []

  const tooShort: Array<{ lesson: Lesson; wordCount: number }> = []
  const tooLong: Array<{ lesson: Lesson; wordCount: number }> = []
  const justRight: Array<{ lesson: Lesson; wordCount: number }> = []

  course.lessons.forEach((lesson) => {
    if (!lesson.content) {
      results.push({
        passed: false,
        severity: 'error',
        message: `Урок "${lesson.title}" не имеет контента`,
        affectedLessonIds: [lesson.id],
      })
      return
    }

    const wordCount = countWords(lesson.content)

    if (wordCount < VALIDATION_CONFIG.minContentLength) {
      tooShort.push({ lesson, wordCount })
    } else if (wordCount > VALIDATION_CONFIG.maxContentLength) {
      tooLong.push({ lesson, wordCount })
    } else {
      justRight.push({ lesson, wordCount })
    }
  })

  // Report short lessons
  if (tooShort.length > 0) {
    tooShort.forEach(({ lesson, wordCount }) => {
      results.push({
        passed: false,
        severity: 'warning',
        message: `Урок "${lesson.title}" слишком короткий`,
        affectedLessonIds: [lesson.id],
        details: `${wordCount} слов (минимум ${VALIDATION_CONFIG.minContentLength})`,
      })
    })
  }

  // Report long lessons
  if (tooLong.length > 0) {
    tooLong.forEach(({ lesson, wordCount }) => {
      results.push({
        passed: false,
        severity: 'warning',
        message: `Урок "${lesson.title}" слишком длинный`,
        affectedLessonIds: [lesson.id],
        details: `${wordCount} слов (максимум ${VALIDATION_CONFIG.maxContentLength})`,
      })
    })
  }

  // Success message
  if (justRight.length === course.lessons.length) {
    const avgWords = Math.round(
      justRight.reduce((sum, { wordCount }) => sum + wordCount, 0) / justRight.length
    )
    results.push({
      passed: true,
      severity: 'info',
      message: `Все ${course.lessons.length} уроков имеют адекватную длину`,
      details: `Средняя длина: ${avgWords} слов`,
    })
  } else {
    results.push({
      passed: false,
      severity: 'info',
      message: `${justRight.length} из ${course.lessons.length} уроков имеют адекватную длину`,
    })
  }

  return {
    validator: 'content-length',
    timestamp: new Date().toISOString(),
    results,
    overallSeverity: calculateOverallSeverity(results),
  }
}

// ============================================================================
// Main Fast Validation Runner
// ============================================================================

/**
 * Run all fast validations and return combined report
 */
export async function runFastValidation(
  course: CourseWithLessons
): Promise<{
  reports: ValidationReport[]
  overallSeverity: ValidationSeverity
  summary: string
}> {
  // Run all validators in parallel
  const [structure, outline, links, prerequisites, contentLength] = await Promise.all([
    validateCourseStructure(course),
    validateOutlineConsistency(course),
    validateLinks(course),
    validatePrerequisites(course),
    validateContentLength(course),
  ])

  const reports = [structure, outline, links, prerequisites, contentLength]

  // Calculate overall severity
  const overallSeverity = calculateOverallSeverity(
    reports.flatMap((report) => report.results)
  )

  // Generate summary
  const totalIssues = reports.reduce(
    (sum, report) => sum + report.results.filter((r) => !r.passed).length,
    0
  )

  const summary =
    totalIssues === 0
      ? 'Курс прошел все проверки быстрой валидации'
      : `Найдено ${totalIssues} проблем при быстрой валидации`

  return {
    reports,
    overallSeverity,
    summary,
  }
}
