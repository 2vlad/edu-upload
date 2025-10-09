import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { ensureAuthServer } from '@/lib/auth-server'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { getCourse } from '@/app/actions/courses'
import { runFastValidation } from '@/lib/validation/fast-validators'
import { runDeepValidation } from '@/lib/validation/deep-validators'
import type { ValidationSeverity } from '@/lib/validation/fast-validators'

// Force Node.js runtime for validation
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for deep validation

// ============================================================================
// Types
// ============================================================================

type ValidationMode = 'fast' | 'deep'

interface ValidationProgress {
  type: 'progress' | 'complete' | 'error'
  message: string
  progress?: number // 0-100
  data?: any
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Stream SSE message to client
 */
function createSSEMessage(data: ValidationProgress): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

/**
 * Create validation record in database
 */
async function createValidationRecord(params: {
  courseId: string
  validationType: ValidationMode
  userId: string
}): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  try {
    const supabase = createSupabaseServer()

    const { data, error } = await supabase
      .from('course_validations')
      .insert({
        course_id: params.courseId,
        validation_type: params.validationType,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[validate] Failed to create validation record:', error)
      return null
    }

    return data.id
  } catch (error) {
    console.error('[validate] Error creating validation record:', error)
    return null
  }
}

/**
 * Update validation record with results
 */
async function updateValidationRecord(params: {
  validationId: string
  status: 'completed' | 'failed'
  results: any[]
  severity: ValidationSeverity
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return
  }

  try {
    const supabase = createSupabaseServer()

    const { error } = await supabase
      .from('course_validations')
      .update({
        status: params.status,
        results: params.results,
        severity: params.severity,
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.validationId)

    if (error) {
      console.error('[validate] Failed to update validation record:', error)
    }
  } catch (error) {
    console.error('[validate] Error updating validation record:', error)
  }
}

// ============================================================================
// POST Handler - Non-streaming JSON response
// ============================================================================

export async function POST(
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

    // Authenticate user
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Parse request body
    const body = await request.json()
    const mode: ValidationMode = body.mode === 'deep' ? 'deep' : 'fast'

    console.log(`[validate] Starting ${mode} validation for course ${courseId}`)

    // Get course with lessons
    const courseResult = await getCourse(courseId)

    if (!courseResult.success || !courseResult.course) {
      return NextResponse.json(
        { error: 'Course not found or access denied' },
        { status: 404 }
      )
    }

    const course = courseResult.course

    // Create validation record
    const validationId = await createValidationRecord({
      courseId,
      validationType: mode,
      userId,
    })

    // Run appropriate validation
    let validationResult: {
      reports: any[]
      overallSeverity: ValidationSeverity
      summary: string
    }

    try {
      if (mode === 'fast') {
        validationResult = await runFastValidation(course)
      } else {
        validationResult = await runDeepValidation(course)
      }

      // Update validation record with results
      if (validationId) {
        const allResults = validationResult.reports.flatMap((r) => r.results)
        await updateValidationRecord({
          validationId,
          status: 'completed',
          results: allResults,
          severity: validationResult.overallSeverity,
        })
      }

      // Return validation results
      return NextResponse.json({
        success: true,
        mode,
        validationId,
        ...validationResult,
      })
    } catch (validationError: any) {
      console.error('[validate] Validation execution failed:', validationError)

      // Update record as failed
      if (validationId) {
        await updateValidationRecord({
          validationId,
          status: 'failed',
          results: [
            {
              passed: false,
              severity: 'error',
              message: 'Validation failed',
              details: validationError.message,
            },
          ],
          severity: 'error',
        })
      }

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationError.message,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[validate] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET Handler - Streaming SSE Response (for future use)
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const courseId = params.id
  const url = new URL(request.url)
  const mode = (url.searchParams.get('mode') || 'fast') as ValidationMode

  try {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

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

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // Send initial progress
          controller.enqueue(
            encoder.encode(
              createSSEMessage({
                type: 'progress',
                message: `Starting ${mode} validation...`,
                progress: 0,
              })
            )
          )

          // Create validation record
          const validationId = await createValidationRecord({
            courseId,
            validationType: mode,
            userId,
          })

          controller.enqueue(
            encoder.encode(
              createSSEMessage({
                type: 'progress',
                message: 'Running validators...',
                progress: 20,
              })
            )
          )

          // Run validation
          let validationResult: {
            reports: any[]
            overallSeverity: ValidationSeverity
            summary: string
          }

          if (mode === 'fast') {
            validationResult = await runFastValidation(course)
            controller.enqueue(
              encoder.encode(
                createSSEMessage({
                  type: 'progress',
                  message: 'Fast validation complete',
                  progress: 80,
                })
              )
            )
          } else {
            validationResult = await runDeepValidation(course)
            controller.enqueue(
              encoder.encode(
                createSSEMessage({
                  type: 'progress',
                  message: 'Deep validation complete',
                  progress: 80,
                })
              )
            )
          }

          // Update database
          if (validationId) {
            const allResults = validationResult.reports.flatMap((r) => r.results)
            await updateValidationRecord({
              validationId,
              status: 'completed',
              results: allResults,
              severity: validationResult.overallSeverity,
            })
          }

          controller.enqueue(
            encoder.encode(
              createSSEMessage({
                type: 'progress',
                message: 'Saving results...',
                progress: 90,
              })
            )
          )

          // Send completion
          controller.enqueue(
            encoder.encode(
              createSSEMessage({
                type: 'complete',
                message: 'Validation complete',
                progress: 100,
                data: {
                  validationId,
                  ...validationResult,
                },
              })
            )
          )

          controller.close()
        } catch (error: any) {
          console.error('[validate] Stream error:', error)
          controller.enqueue(
            encoder.encode(
              createSSEMessage({
                type: 'error',
                message: error.message || 'Validation failed',
              })
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('[validate] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
