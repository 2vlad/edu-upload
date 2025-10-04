/**
 * Extended course data types with versioning and edit tracking
 */

export interface EditMetadata {
  lastModified: string // ISO timestamp
  modifiedBy: 'ai' | 'user'
  editCount: number
}

export interface Lesson {
  id: string
  title: string
  content: string
  objectives: string[]
  logline?: string
  guiding_questions?: string[]
  expansion_tips?: string[]
  examples_to_add?: string[]
  // Edit tracking
  metadata?: EditMetadata
  contentEdited?: boolean // Track if content was manually edited
  titleEdited?: boolean
  objectivesEdited?: boolean
}

export interface OutlineItem {
  lesson_id: string
  title: string
  logline?: string
  bullets: string[]
}

export interface SourceFile {
  id: string
  filename: string
  mime: string
  uploadedAt: string
}

export interface CourseData {
  title: string
  description: string
  lessons: Lesson[]
  outline?: OutlineItem[]
  // Course-level metadata
  version?: number
  createdAt?: string
  updatedAt?: string
  sourceFiles?: SourceFile[]
}

/**
 * Track which fields have been manually edited
 */
export function markAsEdited(
  lesson: Lesson,
  field: 'content' | 'title' | 'objectives' | 'all'
): Lesson {
  const now = new Date().toISOString()
  const metadata: EditMetadata = {
    lastModified: now,
    modifiedBy: 'user',
    editCount: (lesson.metadata?.editCount || 0) + 1,
  }

  const updates: Partial<Lesson> = { metadata }

  if (field === 'content' || field === 'all') {
    updates.contentEdited = true
  }
  if (field === 'title' || field === 'all') {
    updates.titleEdited = true
  }
  if (field === 'objectives' || field === 'all') {
    updates.objectivesEdited = true
  }

  return { ...lesson, ...updates }
}

/**
 * Check if a lesson has been manually edited
 */
export function isManuallyEdited(lesson: Lesson): boolean {
  return !!(
    lesson.contentEdited ||
    lesson.titleEdited ||
    lesson.objectivesEdited
  )
}

/**
 * Update course metadata
 */
export function updateCourseMetadata(course: CourseData): CourseData {
  return {
    ...course,
    version: (course.version || 0) + 1,
    updatedAt: new Date().toISOString(),
  }
}
