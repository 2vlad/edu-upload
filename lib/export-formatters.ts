/**
 * Course export formatting utilities
 * Converts course data to Markdown and plain text formats
 */

import type { CourseWithLessons, Lesson } from '@/app/actions/courses'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Slugify text for filename generation
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
}

/**
 * Format date for display
 */
function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Escape YAML special characters
 */
function escapeYaml(text: string): string {
  if (!text) return ''

  // If contains special characters, wrap in quotes
  if (/[:#@`]/.test(text) || text.includes('\n')) {
    return `"${text.replace(/"/g, '\\"')}"`
  }

  return text
}

/**
 * Generate validation status string
 */
function getValidationStatus(course: CourseWithLessons): string {
  if (!course.last_validated_at) {
    return 'Не проверен'
  }

  const statusMap = {
    info: 'Пройдена успешно',
    warning: 'Пройдена с предупреждениями',
    error: 'Обнаружены ошибки',
  }

  const status = statusMap[course.last_validation_severity as keyof typeof statusMap] || 'Неизвестно'
  const date = formatDate(course.last_validated_at)

  return `${status} (${date})`
}

// ============================================================================
// Markdown Formatting
// ============================================================================

/**
 * Generate YAML frontmatter for markdown
 */
function generateYamlFrontmatter(course: CourseWithLessons): string {
  const frontmatter = [
    '---',
    `title: ${escapeYaml(course.title)}`,
    `description: ${escapeYaml(course.description || '')}`,
    `slug: ${course.slug}`,
    `author_tone: ${escapeYaml(course.author_tone || 'Не указан')}`,
    `lesson_count: ${course.lessons.length}`,
    `validation_status: ${escapeYaml(getValidationStatus(course))}`,
    `created_at: ${formatDate(course.created_at)}`,
    `updated_at: ${formatDate(course.updated_at)}`,
    `published: ${course.published ? 'да' : 'нет'}`,
    '---',
    '',
  ]

  return frontmatter.join('\n')
}

/**
 * Format single lesson as markdown
 */
function formatLessonAsMarkdown(lesson: Lesson, index: number): string {
  const sections: string[] = []

  // Lesson header
  sections.push(`## ${index + 1}. ${lesson.title}`)
  sections.push('')

  // Logline (if exists)
  if (lesson.logline) {
    sections.push(`> ${lesson.logline}`)
    sections.push('')
  }

  // Objectives
  if (lesson.objectives && lesson.objectives.length > 0) {
    sections.push('### Цели обучения')
    sections.push('')
    lesson.objectives.forEach((obj) => {
      sections.push(`- ${obj}`)
    })
    sections.push('')
  }

  // Content
  sections.push('### Содержание')
  sections.push('')
  sections.push(lesson.content || 'Контент отсутствует')
  sections.push('')

  // Guiding questions (if exists)
  if (lesson.guiding_questions && lesson.guiding_questions.length > 0) {
    sections.push('### Наводящие вопросы')
    sections.push('')
    lesson.guiding_questions.forEach((q) => {
      sections.push(`- ${q}`)
    })
    sections.push('')
  }

  // Expansion tips (if exists)
  if (lesson.expansion_tips && lesson.expansion_tips.length > 0) {
    sections.push('### Советы по расширению')
    sections.push('')
    lesson.expansion_tips.forEach((tip) => {
      sections.push(`- ${tip}`)
    })
    sections.push('')
  }

  // Examples (if exists)
  if (lesson.examples_to_add && lesson.examples_to_add.length > 0) {
    sections.push('### Примеры для добавления')
    sections.push('')
    lesson.examples_to_add.forEach((example) => {
      sections.push(`- ${example}`)
    })
    sections.push('')
  }

  sections.push('---')
  sections.push('')

  return sections.join('\n')
}

/**
 * Format entire course as markdown
 */
export function formatAsMarkdown(course: CourseWithLessons, includeFrontmatter: boolean = true): string {
  const sections: string[] = []

  // Add YAML frontmatter
  if (includeFrontmatter) {
    sections.push(generateYamlFrontmatter(course))
  }

  // Course title and description
  sections.push(`# ${course.title}`)
  sections.push('')
  if (course.description) {
    sections.push(course.description)
    sections.push('')
  }

  sections.push(`**Всего уроков:** ${course.lessons.length}`)
  sections.push('')
  sections.push('---')
  sections.push('')

  // Add all lessons
  course.lessons.forEach((lesson, index) => {
    sections.push(formatLessonAsMarkdown(lesson, index))
  })

  return sections.join('\n')
}

// ============================================================================
// Plain Text Formatting
// ============================================================================

/**
 * Format course metadata as plain text
 */
function formatMetadataAsText(course: CourseWithLessons): string {
  const lines = [
    '=' .repeat(80),
    `КУРС: ${course.title}`,
    '='.repeat(80),
    '',
    `Описание: ${course.description || 'Нет описания'}`,
    `Тон автора: ${course.author_tone || 'Не указан'}`,
    `Количество уроков: ${course.lessons.length}`,
    `Статус валидации: ${getValidationStatus(course)}`,
    `Создан: ${formatDate(course.created_at)}`,
    `Обновлен: ${formatDate(course.updated_at)}`,
    `Опубликован: ${course.published ? 'Да' : 'Нет'}`,
    '',
    '='.repeat(80),
    '',
  ]

  return lines.join('\n')
}

/**
 * Format single lesson as plain text
 */
function formatLessonAsText(lesson: Lesson, index: number): string {
  const sections: string[] = []

  // Lesson header
  sections.push('-'.repeat(80))
  sections.push(`УРОК ${index + 1}: ${lesson.title}`)
  sections.push('-'.repeat(80))
  sections.push('')

  // Logline
  if (lesson.logline) {
    sections.push(`Краткое описание: ${lesson.logline}`)
    sections.push('')
  }

  // Objectives
  if (lesson.objectives && lesson.objectives.length > 0) {
    sections.push('ЦЕЛИ ОБУЧЕНИЯ:')
    lesson.objectives.forEach((obj, i) => {
      sections.push(`  ${i + 1}. ${obj}`)
    })
    sections.push('')
  }

  // Content
  sections.push('СОДЕРЖАНИЕ:')
  sections.push('')
  sections.push(lesson.content || 'Контент отсутствует')
  sections.push('')

  // Guiding questions
  if (lesson.guiding_questions && lesson.guiding_questions.length > 0) {
    sections.push('НАВОДЯЩИЕ ВОПРОСЫ:')
    lesson.guiding_questions.forEach((q, i) => {
      sections.push(`  ${i + 1}. ${q}`)
    })
    sections.push('')
  }

  // Expansion tips
  if (lesson.expansion_tips && lesson.expansion_tips.length > 0) {
    sections.push('СОВЕТЫ ПО РАСШИРЕНИЮ:')
    lesson.expansion_tips.forEach((tip, i) => {
      sections.push(`  ${i + 1}. ${tip}`)
    })
    sections.push('')
  }

  // Examples
  if (lesson.examples_to_add && lesson.examples_to_add.length > 0) {
    sections.push('ПРИМЕРЫ ДЛЯ ДОБАВЛЕНИЯ:')
    lesson.examples_to_add.forEach((example, i) => {
      sections.push(`  ${i + 1}. ${example}`)
    })
    sections.push('')
  }

  sections.push('')

  return sections.join('\n')
}

/**
 * Format entire course as plain text
 */
export function formatAsText(course: CourseWithLessons, includeMetadata: boolean = true): string {
  const sections: string[] = []

  // Add metadata header
  if (includeMetadata) {
    sections.push(formatMetadataAsText(course))
  }

  // Add all lessons
  course.lessons.forEach((lesson, index) => {
    sections.push(formatLessonAsText(lesson, index))
  })

  // Footer
  sections.push('='.repeat(80))
  sections.push(`КОНЕЦ КУРСА: ${course.title}`)
  sections.push('='.repeat(80))

  return sections.join('\n')
}

/**
 * Generate appropriate filename for course export
 */
export function generateFilename(course: CourseWithLessons, format: 'md' | 'txt'): string {
  const slug = slugify(course.title)
  const extension = format === 'md' ? 'md' : 'txt'
  return `${slug}.${extension}`
}

/**
 * Generate lesson filename for multi-file export
 */
export function generateLessonFilename(lesson: Lesson, index: number, format: 'md' | 'txt'): string {
  const paddedIndex = String(index + 1).padStart(2, '0')
  const slug = slugify(lesson.title)
  const extension = format === 'md' ? 'md' : 'txt'
  return `${paddedIndex}-${slug}.${extension}`
}
