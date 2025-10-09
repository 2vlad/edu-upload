'use server'

import { createSupabaseServer } from '@/lib/supabase/server'
import { ensureAuthServer } from '@/lib/auth-server'
import { isSupabaseConfigured } from '@/lib/supabaseClient'

/**
 * Course and lesson data types
 */
export interface Course {
  id: string
  user_id: string
  title: string
  description: string | null
  slug: string
  published: boolean
  created_at: string
  updated_at: string
}

export interface Lesson {
  id: string
  course_id: string
  order_index: number
  title: string
  logline: string | null
  objectives: string[]
  guiding_questions: string[]
  expansion_tips: string[]
  examples_to_add: string[]
  content: string | null
  created_at: string
  updated_at: string
}

export interface CourseWithLessons extends Course {
  lessons: Lesson[]
}

export interface SourceFile {
  id: string
  course_id: string
  filename: string
  mime: string
  text_content: string | null
  storage_path: string | null
  created_at: string
}

/**
 * Create course with lessons from payload (for autosave after generation)
 */
export async function createCourseFromPayload(payload: {
  title: string
  description: string
  lessons: Array<{
    title: string
    content: string
    objectives: string[]
    logline?: string
    guiding_questions?: string[]
    expansion_tips?: string[]
    examples_to_add?: string[]
  }>
  sourceFiles?: Array<{
    filename: string
    mime: string
    text_content?: string
    storage_path?: string
  }>
}) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Generate unique slug
    const baseSlug = payload.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)

    const timestamp = Date.now()
    const slug = `${baseSlug}-${timestamp}`

    // Create course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        title: payload.title,
        description: payload.description,
        slug,
        published: false,
        user_id: userId,
      })
      .select()
      .single()

    if (courseError) {
      console.error('Course creation error:', courseError)
      return { success: false, error: courseError.message }
    }

    // Insert lessons
    const lessonsToInsert = payload.lessons.map((lesson, index) => ({
      course_id: course.id,
      title: lesson.title,
      content: lesson.content,
      objectives: lesson.objectives,
      logline: lesson.logline || null,
      guiding_questions: lesson.guiding_questions || [],
      expansion_tips: lesson.expansion_tips || [],
      examples_to_add: lesson.examples_to_add || [],
      order_index: index,
    }))

    const { error: lessonsError } = await supabase
      .from('lessons')
      .insert(lessonsToInsert)

    if (lessonsError) {
      console.error('Lessons insert error:', lessonsError)
      // Rollback course
      await supabase.from('courses').delete().eq('id', course.id)
      return { success: false, error: lessonsError.message }
    }

    // Insert source files if provided
    if (payload.sourceFiles && payload.sourceFiles.length > 0) {
      const filesToInsert = payload.sourceFiles.map((file) => ({
        course_id: course.id,
        filename: file.filename,
        mime: file.mime,
        text_content: file.text_content || null,
        storage_path: file.storage_path || null,
      }))

      const { error: filesError } = await supabase
        .from('source_files')
        .insert(filesToInsert)

      if (filesError) {
        console.error('Source files error:', filesError)
        // Non-critical, continue
      }
    }

    return { success: true, course, slug }
  } catch (error) {
    console.error('Unexpected error creating course:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get all courses for current user (for "My Courses" page)
 */
export async function getMyCourses(): Promise<{
  success: boolean
  courses?: Course[]
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Strategy: union собственных курсов (все статусы) + всех опубликованных курсов любых пользователей
    const [own, published] = await Promise.all([
      supabase.from('courses').select('*').eq('user_id', userId),
      supabase.from('courses').select('*').eq('published', true),
    ])

    const ownList = own.data || []
    const pubList = (published.data || []).filter((c) => !ownList.find((o) => o.id === c.id))
    const merged = [...ownList, ...pubList].sort((a, b) => (
      (b.updated_at || '').localeCompare(a.updated_at || '')
    ))

    if (own.error || published.error) {
      const err = own.error || published.error
      console.error('Error fetching courses:', err)
      return { success: false, error: err.message }
    }

    return { success: true, courses: merged }
  } catch (error) {
    console.error('Unexpected error fetching courses:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get course with lessons by ID (for editor)
 */
export async function getCourse(
  courseId: string
): Promise<{
  success: boolean
  course?: CourseWithLessons
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Fetch course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .eq('user_id', userId)
      .single()

    if (courseError) {
      console.error('Error fetching course:', courseError)
      return { success: false, error: courseError.message }
    }

    // Fetch lessons
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })

    if (lessonsError) {
      console.error('Error fetching lessons:', lessonsError)
      return { success: false, error: lessonsError.message }
    }

    return {
      success: true,
      course: { ...course, lessons: lessons || [] },
    }
  } catch (error) {
    console.error('Unexpected error fetching course:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get published course by slug (for public viewing)
 */
export async function getCourseBySlug(
  slug: string
): Promise<{
  success: boolean
  course?: CourseWithLessons
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()

    // Fetch published course by slug
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .single()

    if (courseError || !course) {
      // Fallback: if user is owner and course is draft, allow access
      const { data: session } = await supabase.auth.getUser()
      const ownerId = session?.user?.id
      if (ownerId) {
        const draft = await supabase
          .from('courses')
          .select('*')
          .eq('slug', slug)
          .eq('user_id', ownerId)
          .single()
        if (!draft.error && draft.data) {
          // Fetch lessons and return
          const { data: lessons } = await supabase
            .from('lessons')
            .select('*')
            .eq('course_id', draft.data.id)
            .order('order_index', { ascending: true })
          return { success: true, course: { ...(draft.data as any), lessons: lessons || [] } }
        }
      }
      console.error('Error fetching course:', courseError || { message: 'not found' })
      return { success: false, error: 'Course not found' }
    }

    // Fetch lessons
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .eq('course_id', course.id)
      .order('order_index', { ascending: true })

    if (lessonsError) {
      console.error('Error fetching lessons:', lessonsError)
      return { success: false, error: lessonsError.message }
    }

    return {
      success: true,
      course: { ...course, lessons: lessons || [] },
    }
  } catch (error) {
    console.error('Unexpected error fetching course:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update course metadata (title, description, published status)
 */
export async function updateCourse(
  courseId: string,
  patch: {
    title?: string
    description?: string
    published?: boolean
  }
): Promise<{
  success: boolean
  course?: Course
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    const { data: course, error } = await supabase
      .from('courses')
      .update(patch)
      .eq('id', courseId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating course:', error)
      return { success: false, error: error.message }
    }

    return { success: true, course }
  } catch (error) {
    console.error('Unexpected error updating course:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update lesson content/metadata
 */
export async function updateLesson(
  lessonId: string,
  patch: {
    title?: string
    content?: string
    objectives?: string[]
    logline?: string
    guiding_questions?: string[]
    expansion_tips?: string[]
    examples_to_add?: string[]
  }
): Promise<{
  success: boolean
  lesson?: Lesson
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Verify ownership through course
    const { data: lesson, error: fetchError } = await supabase
      .from('lessons')
      .select('course_id')
      .eq('id', lessonId)
      .single()

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }

    const { data: course } = await supabase
      .from('courses')
      .select('user_id')
      .eq('id', lesson.course_id)
      .single()

    if (!course || course.user_id !== userId) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update lesson
    const { data: updatedLesson, error } = await supabase
      .from('lessons')
      .update(patch)
      .eq('id', lessonId)
      .select()
      .single()

    if (error) {
      console.error('Error updating lesson:', error)
      return { success: false, error: error.message }
    }

    return { success: true, lesson: updatedLesson }
  } catch (error) {
    console.error('Unexpected error updating lesson:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Reorder lessons for a course
 */
export async function reorderLessons(
  courseId: string,
  orderedLessonIds: string[]
): Promise<{
  success: boolean
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Verify ownership
    const { data: course } = await supabase
      .from('courses')
      .select('user_id')
      .eq('id', courseId)
      .single()

    if (!course || course.user_id !== userId) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update order_index for each lesson
    const updates = orderedLessonIds.map((lessonId, index) =>
      supabase
        .from('lessons')
        .update({ order_index: index })
        .eq('id', lessonId)
        .eq('course_id', courseId)
    )

    const results = await Promise.all(updates)

    const hasError = results.some((result) => result.error)
    if (hasError) {
      return { success: false, error: 'Failed to reorder some lessons' }
    }

    return { success: true }
  } catch (error) {
    console.error('Unexpected error reordering lessons:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete course (cascades to lessons and source files)
 */
export async function deleteCourse(
  courseId: string
): Promise<{
  success: boolean
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const supabase = createSupabaseServer()
    const session = await ensureAuthServer()
    const userId = session.user.id

    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting course:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Unexpected error deleting course:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
