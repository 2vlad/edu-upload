import { type NextRequest, NextResponse } from 'next/server'
import { getCourse } from '@/app/actions/courses'
import { ensureAuthServer } from '@/lib/auth-server'
import { isSupabaseConfigured } from '@/lib/supabaseClient'

// Force Node.js runtime for file generation
export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute for export generation

// ============================================================================
// Types
// ============================================================================

type ExportFormat = 'md' | 'txt'
type ExportMode = 'single' | 'multi'

interface ExportParams {
  format: ExportFormat
  mode: ExportMode
}

// ============================================================================
// Parameter Validation
// ============================================================================

function validateExportParams(searchParams: URLSearchParams): {
  valid: boolean
  params?: ExportParams
  error?: string
} {
  const format = searchParams.get('format')
  const mode = searchParams.get('mode')

  // Validate format
  if (!format || (format !== 'md' && format !== 'txt')) {
    return {
      valid: false,
      error: 'Invalid format parameter. Must be "md" or "txt"',
    }
  }

  // Validate mode
  if (!mode || (mode !== 'single' && mode !== 'multi')) {
    return {
      valid: false,
      error: 'Invalid mode parameter. Must be "single" or "multi"',
    }
  }

  return {
    valid: true,
    params: { format, mode },
  }
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const courseId = params.id

  try {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

    // Validate query parameters
    const url = new URL(request.url)
    const validation = validateExportParams(url.searchParams)

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { format, mode } = validation.params!

    console.log(`[export] Starting export: courseId=${courseId}, format=${format}, mode=${mode}`)

    // Authenticate user
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Get course with lessons
    const courseResult = await getCourse(courseId)

    if (!courseResult.success || !courseResult.course) {
      return NextResponse.json(
        { error: 'Course not found or access denied' },
        { status: 404 }
      )
    }

    const course = courseResult.course

    // Validate course has lessons
    if (!course.lessons || course.lessons.length === 0) {
      return NextResponse.json(
        { error: 'Course has no lessons to export' },
        { status: 400 }
      )
    }

    console.log(`[export] Course loaded: ${course.title}, ${course.lessons.length} lessons`)

    // Placeholder for actual export logic (to be implemented in next subtasks)
    return NextResponse.json(
      {
        message: 'Export data retrieved successfully',
        courseId,
        courseTitle: course.title,
        lessonCount: course.lessons.length,
        format,
        mode,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[export] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
