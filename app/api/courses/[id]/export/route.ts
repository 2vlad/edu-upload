import { type NextRequest, NextResponse } from 'next/server'
import { getCourse } from '@/app/actions/courses'
import { ensureAuthServer } from '@/lib/auth-server'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import {
  formatAsMarkdown,
  formatAsText,
  generateFilename,
  generateLessonFilename,
  slugify,
} from '@/lib/export-formatters'
import JSZip from 'jszip'

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
// Export Handlers
// ============================================================================

/**
 * Handle single file export (one file with all content)
 */
function handleSingleFileExport(
  course: any,
  format: ExportFormat
): NextResponse {
  try {
    // Generate content
    const content = format === 'md'
      ? formatAsMarkdown(course, true) // with frontmatter
      : formatAsText(course, true) // with metadata

    // Generate filename
    const filename = generateFilename(course, format)

    // Set appropriate headers
    const contentType = format === 'md'
      ? 'text/markdown; charset=utf-8'
      : 'text/plain; charset=utf-8'

    // Return file response
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('[export] Single file export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate export file', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Handle multi-file ZIP export (individual lesson files + README)
 */
async function handleZipExport(
  course: any,
  format: ExportFormat
): Promise<NextResponse> {
  try {
    const zip = new JSZip()

    // Add README with course metadata
    const readmeContent = format === 'md'
      ? formatAsMarkdown(course, true)
      : formatAsText(course, true)

    zip.file(`README.${format}`, readmeContent)

    // Add individual lesson files
    course.lessons.forEach((lesson: any, index: number) => {
      const lessonFilename = generateLessonFilename(lesson, index, format)

      let lessonContent = ''
      if (format === 'md') {
        // Markdown lesson file
        lessonContent = [
          `# ${lesson.title}`,
          '',
          lesson.logline ? `> ${lesson.logline}\n` : '',
          '## Цели обучения',
          '',
          ...(lesson.objectives || []).map((obj: string) => `- ${obj}`),
          '',
          '## Содержание',
          '',
          lesson.content || 'Контент отсутствует',
          '',
        ].join('\n')

        if (lesson.guiding_questions && lesson.guiding_questions.length > 0) {
          lessonContent += '\n## Наводящие вопросы\n\n'
          lessonContent += lesson.guiding_questions.map((q: string) => `- ${q}`).join('\n')
          lessonContent += '\n\n'
        }

        if (lesson.expansion_tips && lesson.expansion_tips.length > 0) {
          lessonContent += '\n## Советы по расширению\n\n'
          lessonContent += lesson.expansion_tips.map((tip: string) => `- ${tip}`).join('\n')
          lessonContent += '\n\n'
        }

        if (lesson.examples_to_add && lesson.examples_to_add.length > 0) {
          lessonContent += '\n## Примеры для добавления\n\n'
          lessonContent += lesson.examples_to_add.map((ex: string) => `- ${ex}`).join('\n')
          lessonContent += '\n'
        }
      } else {
        // Plain text lesson file
        lessonContent = [
          '='.repeat(80),
          `УРОК ${index + 1}: ${lesson.title}`,
          '='.repeat(80),
          '',
          lesson.logline ? `Краткое описание: ${lesson.logline}\n` : '',
          'ЦЕЛИ ОБУЧЕНИЯ:',
          ...(lesson.objectives || []).map((obj: string, i: number) => `  ${i + 1}. ${obj}`),
          '',
          'СОДЕРЖАНИЕ:',
          '',
          lesson.content || 'Контент отсутствует',
          '',
        ].join('\n')
      }

      zip.file(lessonFilename, lessonContent)
    })

    // Generate ZIP file
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    // Generate ZIP filename
    const zipFilename = `${slugify(course.title)}.zip`

    // Return ZIP response
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('[export] ZIP export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate ZIP export', details: error.message },
      { status: 500 }
    )
  }
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

    // Generate export based on mode
    if (mode === 'single') {
      // Single file export
      return handleSingleFileExport(course, format)
    } else {
      // Multi-file ZIP export
      return await handleZipExport(course, format)
    }
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
