/**
 * HTML sanitization utilities for user-generated content
 */

const MAX_AUTHOR_TONE_LENGTH = 2000

/**
 * Sanitize HTML content by removing dangerous tags and attributes
 * while preserving safe formatting
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''

  let sanitized = html
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove event handlers (onclick, onload, etc.)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: protocol
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, '')
    // Remove data: protocol (can contain encoded scripts)
    .replace(/href\s*=\s*["']data:[^"']*["']/gi, '')
    .replace(/src\s*=\s*["']data:[^"']*["']/gi, '')
    // Remove iframe, object, embed tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*>/gi, '')

  return sanitized.trim()
}

/**
 * Validate and sanitize author tone input
 */
export function validateAndSanitizeAuthorTone(tone: string | null | undefined): {
  valid: boolean
  sanitized?: string
  error?: string
} {
  if (!tone) {
    return { valid: true, sanitized: null as any }
  }

  // Check length
  if (tone.length > MAX_AUTHOR_TONE_LENGTH) {
    return {
      valid: false,
      error: `Авторский тон слишком длинный (максимум ${MAX_AUTHOR_TONE_LENGTH} символов)`,
    }
  }

  // Sanitize HTML
  const sanitized = sanitizeHtml(tone)

  return { valid: true, sanitized }
}
