import { CourseData, Lesson, isManuallyEdited, updateCourseMetadata } from './types/course'

export interface MergeResult {
  mergedCourse: CourseData
  changes: CourseChanges
}

export interface CourseChanges {
  newLessons: Lesson[]
  updatedLessons: Array<{
    lesson: Lesson
    changes: string[]
  }>
  preservedLessons: Lesson[]
  removedLessons: Lesson[]
}

/**
 * Merge new course data with existing course data, preserving manual edits
 */
export function mergeCourseUpdates(
  existingCourse: CourseData,
  newCourse: CourseData
): MergeResult {
  const changes: CourseChanges = {
    newLessons: [],
    updatedLessons: [],
    preservedLessons: [],
    removedLessons: [],
  }

  // Create a map of existing lessons by ID
  const existingLessonsMap = new Map<string, Lesson>()
  existingCourse.lessons.forEach((lesson) => {
    existingLessonsMap.set(lesson.id, lesson)
  })

  // Process new lessons
  const mergedLessons: Lesson[] = []
  const processedExistingIds = new Set<string>()

  newCourse.lessons.forEach((newLesson) => {
    const existingLesson = existingLessonsMap.get(newLesson.id)

    if (!existingLesson) {
      // New lesson - add it
      changes.newLessons.push(newLesson)
      mergedLessons.push(newLesson)
    } else {
      // Existing lesson - merge intelligently
      processedExistingIds.add(newLesson.id)
      const merged = mergeLesson(existingLesson, newLesson)

      if (merged.hasChanges) {
        changes.updatedLessons.push({
          lesson: merged.lesson,
          changes: merged.changesList,
        })
      } else {
        changes.preservedLessons.push(existingLesson)
      }

      mergedLessons.push(merged.lesson)
    }
  })

  // Find lessons that were in the old course but not in the new one
  existingCourse.lessons.forEach((lesson) => {
    if (!processedExistingIds.has(lesson.id)) {
      // Preserve lessons that weren't in the update
      // (they might have been manually added or the update didn't include them)
      changes.preservedLessons.push(lesson)
      mergedLessons.push(lesson)
    }
  })

  const mergedCourse: CourseData = {
    ...existingCourse,
    title: existingCourse.title, // Preserve existing title
    description: existingCourse.description, // Preserve existing description
    lessons: mergedLessons,
    outline: newCourse.outline || existingCourse.outline,
    sourceFiles: [
      ...(existingCourse.sourceFiles || []),
      ...(newCourse.sourceFiles || []),
    ],
  }

  // Update course metadata
  const finalCourse = updateCourseMetadata(mergedCourse)

  return {
    mergedCourse: finalCourse,
    changes,
  }
}

/**
 * Merge a single lesson, preserving manual edits
 */
function mergeLesson(
  existingLesson: Lesson,
  newLesson: Lesson
): { lesson: Lesson; hasChanges: boolean; changesList: string[] } {
  const changesList: string[] = []
  let hasChanges = false

  // Start with existing lesson
  const merged: Lesson = { ...existingLesson }

  // Only update title if it wasn't manually edited
  if (!existingLesson.titleEdited && existingLesson.title !== newLesson.title) {
    merged.title = newLesson.title
    changesList.push('Обновлен заголовок')
    hasChanges = true
  }

  // Only update content if it wasn't manually edited
  if (!existingLesson.contentEdited && existingLesson.content !== newLesson.content) {
    merged.content = newLesson.content
    changesList.push('Обновлено содержание')
    hasChanges = true
  }

  // Only update objectives if they weren't manually edited
  if (
    !existingLesson.objectivesEdited &&
    JSON.stringify(existingLesson.objectives) !== JSON.stringify(newLesson.objectives)
  ) {
    merged.objectives = newLesson.objectives
    changesList.push('Обновлены цели обучения')
    hasChanges = true
  }

  // Always update AI-generated guidance fields (these are meant to be refreshed)
  if (newLesson.guiding_questions) {
    merged.guiding_questions = newLesson.guiding_questions
    if (
      JSON.stringify(existingLesson.guiding_questions) !==
      JSON.stringify(newLesson.guiding_questions)
    ) {
      changesList.push('Обновлены наводящие вопросы')
      hasChanges = true
    }
  }

  if (newLesson.expansion_tips) {
    merged.expansion_tips = newLesson.expansion_tips
    if (
      JSON.stringify(existingLesson.expansion_tips) !==
      JSON.stringify(newLesson.expansion_tips)
    ) {
      changesList.push('Обновлены советы по расширению')
      hasChanges = true
    }
  }

  if (newLesson.examples_to_add) {
    merged.examples_to_add = newLesson.examples_to_add
    if (
      JSON.stringify(existingLesson.examples_to_add) !==
      JSON.stringify(newLesson.examples_to_add)
    ) {
      changesList.push('Обновлены примеры')
      hasChanges = true
    }
  }

  // Update logline if available and not manually edited
  if (newLesson.logline && newLesson.logline !== existingLesson.logline) {
    merged.logline = newLesson.logline
    changesList.push('Обновлен логлайн')
    hasChanges = true
  }

  return { lesson: merged, hasChanges, changesList }
}

/**
 * Generate a summary of changes for display
 */
export function generateChangeSummary(changes: CourseChanges): string {
  const parts: string[] = []

  if (changes.newLessons.length > 0) {
    parts.push(`${changes.newLessons.length} новых уроков`)
  }

  if (changes.updatedLessons.length > 0) {
    parts.push(`${changes.updatedLessons.length} обновленных уроков`)
  }

  if (changes.preservedLessons.length > 0) {
    parts.push(`${changes.preservedLessons.length} сохраненных уроков`)
  }

  return parts.length > 0 ? parts.join(', ') : 'Нет изменений'
}
