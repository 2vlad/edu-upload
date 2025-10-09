'use server'

import { nanoid } from 'nanoid'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { createSupabaseServer } from '@/lib/supabase/server'
import { ensureAuthServer } from '@/lib/auth-server'

export interface PublishCourseInput {
  title: string
  description: string
  lessons: Array<{
    id: string
    title: string
    content: string
    objectives: string[]
    logline?: string
    guiding_questions?: string[]
    expansion_tips?: string[]
    examples_to_add?: string[]
    contentEdited?: boolean
    titleEdited?: boolean
    objectivesEdited?: boolean
  }>
  outline?: Array<{
    lesson_id: string
    title: string
    logline?: string
    bullets: string[]
  }>
  sourceFiles?: Array<{
    id: string
    filename: string
    mime: string
  }>
  existingSlug?: string // For updating existing courses
}

export interface PublishCourseResult {
  success: boolean
  slug?: string
  courseId?: string
  error?: string
}

/**
 * Generate a URL-safe slug from title
 */
function generateSlug(title: string): string {
  const baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .substring(0, 50) // Limit length

  // Add unique identifier
  const uniqueId = nanoid(8)
  return `${baseSlug}-${uniqueId}`
}

/**
 * Publish course to Supabase database
 */
export async function publishCourse(
  input: PublishCourseInput
): Promise<PublishCourseResult> {
  try {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Публикация курсов требует настройки Supabase. Курс сохранен локально.',
      }
    }

    // Create server-side Supabase client
    const supabase = createSupabaseServer()

    // Ensure user is authenticated (anonymous or regular)
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Validate input
    if (!input.title || !input.description || !input.lessons || input.lessons.length === 0) {
      return {
        success: false,
        error: 'Отсутствуют обязательные поля: название, описание или уроки',
      }
    }

    // Generate or use existing slug
    let slug = input.existingSlug
    let courseId: string | null = null

    if (slug) {
      // Update existing course
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('slug', slug)
        .eq('user_id', userId)
        .single()

      if (!existingCourse) {
        return {
          success: false,
          error: 'Курс не найден или у вас нет прав на его редактирование',
        }
      }

      courseId = existingCourse.id
    } else {
      // Generate new slug
      slug = generateSlug(input.title)

      // Ensure slug is unique
      let slugExists = true
      let attempts = 0
      while (slugExists && attempts < 5) {
        const { data } = await supabase
          .from('courses')
          .select('id')
          .eq('slug', slug)
          .single()

        if (!data) {
          slugExists = false
        } else {
          slug = generateSlug(input.title)
          attempts++
        }
      }

      if (slugExists) {
        return {
          success: false,
          error: 'Не удалось создать уникальный URL для курса',
        }
      }
    }

    // Insert or update course depending on presence of courseId
    let course, courseError
    if (courseId) {
      const upd = await supabase
        .from('courses')
        .update({
          title: input.title,
          description: input.description,
          slug,
          published: true,
          user_id: userId,
        })
        .eq('id', courseId)
        .eq('user_id', userId)
        .select()
        .single()
      course = upd.data
      courseError = upd.error
    } else {
      const ins = await supabase
        .from('courses')
        .insert({
          title: input.title,
          description: input.description,
          slug,
          published: true,
          user_id: userId,
        })
        .select()
        .single()
      course = ins.data
      courseError = ins.error
    }

    if (courseError) {
      console.error('Course upsert error:', courseError)
      return {
        success: false,
        error: `Не удалось сохранить курс: ${courseError.message}`,
      }
    }

    courseId = course.id

    // Delete existing lessons and source files if updating
    if (input.existingSlug) {
      const { error: deleteLessonsError } = await supabase
        .from('lessons')
        .delete()
        .eq('course_id', courseId)

      if (deleteLessonsError) {
        console.error('Error deleting old lessons:', deleteLessonsError)
        // Continue anyway - we'll insert new lessons
      }

      const { error: deleteFilesError } = await supabase
        .from('source_files')
        .delete()
        .eq('course_id', courseId)

      if (deleteFilesError) {
        console.error('Error deleting old source files:', deleteFilesError)
        // Continue anyway - we'll insert new source files
      }
    }

    // Insert lessons
    const lessonsToInsert = input.lessons.map((lesson, index) => ({
      course_id: courseId,
      title: lesson.title,
      content: lesson.content,
      objectives: lesson.objectives,
      logline: lesson.logline || null,
      guiding_questions: lesson.guiding_questions || null,
      expansion_tips: lesson.expansion_tips || null,
      examples_to_add: lesson.examples_to_add || null,
      order_index: index,
    }))

    const { error: lessonsError } = await supabase
      .from('lessons')
      .insert(lessonsToInsert)

    if (lessonsError) {
      console.error('Lessons insert error:', lessonsError)
      // Try to rollback course creation
      if (!input.existingSlug) {
        await supabase.from('courses').delete().eq('id', courseId)
      }
      return {
        success: false,
        error: `Не удалось сохранить уроки: ${lessonsError.message}`,
      }
    }

    // Save source files metadata if provided
    if (input.sourceFiles && input.sourceFiles.length > 0) {
      const sourceFilesToInsert = input.sourceFiles.map((file) => ({
        course_id: courseId,
        filename: file.filename,
        mime: file.mime,
      }))

      const { error: filesError } = await supabase
        .from('source_files')
        .insert(sourceFilesToInsert)

      if (filesError) {
        console.error('Source files error:', filesError)
        // Non-critical error, continue
      }
    }

    return {
      success: true,
      slug,
      courseId,
    }
  } catch (error) {
    console.error('Unexpected error publishing course:', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Произошла неожиданная ошибка при публикации курса',
    }
  }
}

/**
 * Unpublish course (set status to draft)
 */
export async function unpublishCourse(slug: string): Promise<PublishCourseResult> {
  try {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Требуется настройка Supabase',
      }
    }

    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    const { error } = await supabase
      .from('courses')
      .update({ published: false })
      .eq('slug', slug)
      .eq('user_id', userId)

    if (error) {
      return {
        success: false,
        error: `Не удалось снять курс с публикации: ${error.message}`,
      }
    }

    return {
      success: true,
      slug,
    }
  } catch (error) {
    console.error('Unexpected error unpublishing course:', error)
    return {
      success: false,
      error: 'Произошла неожиданная ошибка',
    }
  }
}

/**
 * Delete course completely
 */
export async function deleteCourse(slug: string): Promise<PublishCourseResult> {
  try {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Требуется настройка Supabase',
      }
    }

    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Get course ID first
    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .eq('user_id', userId)
      .single()

    if (!course) {
      return {
        success: false,
        error: 'Курс не найден',
      }
    }

    // Delete will cascade to lessons and source_files
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', course.id)

    if (error) {
      return {
        success: false,
        error: `Не удалось удалить курс: ${error.message}`,
      }
    }

    return {
      success: true,
    }
  } catch (error) {
    console.error('Unexpected error deleting course:', error)
    return {
      success: false,
      error: 'Произошла неожиданная ошибка',
    }
  }
}
