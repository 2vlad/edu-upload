import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import robotsParser from 'robots-parser'
import { ensureAuthServer } from '@/lib/auth-server'

// Force Node.js runtime for URL fetching and parsing
export const runtime = 'nodejs'
export const maxDuration = 30

// ============================================================================
// Configuration and Constants
// ============================================================================

const MAX_CONTENT_SIZE = 200 * 1024 // 200KB per URL
const FETCH_TIMEOUT = 15000 // 15 seconds
const ROBOTS_TIMEOUT = 5000 // 5 seconds for robots.txt
const RATE_LIMIT_REQUESTS = 30 // requests per hour per user
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in milliseconds

// Domain allow/deny lists (configurable via environment variables)
const BLOCKED_DOMAINS = (process.env.BLOCKED_DOMAINS || 'facebook.com,twitter.com,instagram.com,tiktok.com')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean)

const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean)

// In-memory rate limiting store (use Redis/Database for production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

// ============================================================================
// Rate Limiting
// ============================================================================

function checkRateLimit(userId: string): { allowed: boolean; resetAt: number } {
  const now = Date.now()
  const userLimits = rateLimitStore.get(userId)

  // Clean up expired entries
  if (userLimits && userLimits.resetAt < now) {
    rateLimitStore.delete(userId)
  }

  const limits = rateLimitStore.get(userId)

  if (!limits) {
    // First request
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true, resetAt: now + RATE_LIMIT_WINDOW }
  }

  if (limits.count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, resetAt: limits.resetAt }
  }

  // Increment count
  limits.count++
  rateLimitStore.set(userId, limits)
  return { allowed: true, resetAt: limits.resetAt }
}

// ============================================================================
// Domain Validation
// ============================================================================

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isDomainAllowed(url: string): { allowed: boolean; reason?: string } {
  const domain = extractDomain(url)

  if (!domain) {
    return { allowed: false, reason: 'Недействительный URL' }
  }

  // Check blocked domains
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain === blocked || domain.endsWith('.' + blocked)) {
      return { allowed: false, reason: `Домен ${domain} заблокирован` }
    }
  }

  // Check allowed domains (if configured)
  if (ALLOWED_DOMAINS.length > 0) {
    const isAllowed = ALLOWED_DOMAINS.some(
      allowed => domain === allowed || domain.endsWith('.' + allowed)
    )
    if (!isAllowed) {
      return { allowed: false, reason: `Домен ${domain} не входит в список разрешённых` }
    }
  }

  return { allowed: true }
}

// ============================================================================
// Robots.txt Checking
// ============================================================================

async function checkRobotsTxt(url: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const urlObj = new URL(url)
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`

    // Fetch robots.txt with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT)

    const response = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EduUploadBot/1.0 (+https://edu-upload-app.vercel.app)' },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      // No robots.txt or error - allow by default
      return { allowed: true }
    }

    const robotsTxt = await response.text()
    const robots = robotsParser(robotsUrl, robotsTxt)

    const userAgent = 'EduUploadBot'
    const isAllowed = robots.isAllowed(url, userAgent) ?? true

    if (!isAllowed) {
      return { allowed: false, reason: 'Сайт запретил индексирование через robots.txt' }
    }

    return { allowed: true }
  } catch (error: any) {
    // Network error, timeout, or parsing error - allow by default
    if (error.name === 'AbortError') {
      console.warn('[ingest-url] robots.txt check timeout:', url)
    }
    return { allowed: true }
  }
}

// ============================================================================
// Content Fetching and Parsing
// ============================================================================

async function fetchUrlContent(url: string): Promise<{
  content: string
  contentType: string
  title?: string
}> {
  // Fetch with timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'EduUploadBot/1.0 (+https://edu-upload-app.vercel.app)',
        'Accept': 'text/html,text/plain,application/pdf,*/*',
      },
      redirect: 'follow', // Follow one redirect
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Не удалось загрузить URL: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10)

    // Check content size limit
    if (contentLength > 0 && contentLength > MAX_CONTENT_SIZE) {
      throw new Error(`Контент слишком большой: ${(contentLength / 1024).toFixed(0)}KB (максимум 200KB)`)
    }

    // Get response body
    const arrayBuffer = await response.arrayBuffer()

    if (arrayBuffer.byteLength > MAX_CONTENT_SIZE) {
      throw new Error(`Контент слишком большой: ${(arrayBuffer.byteLength / 1024).toFixed(0)}KB (максимум 200KB)`)
    }

    const text = new TextDecoder('utf-8').decode(arrayBuffer)

    // Parse based on content type
    if (contentType.includes('text/html')) {
      return parseHtml(text, url)
    } else if (contentType.includes('text/plain')) {
      return {
        content: text,
        contentType: 'text/plain',
        title: extractTitleFromUrl(url),
      }
    } else if (contentType.includes('application/pdf')) {
      throw new Error('PDF URLs поддерживаются через кнопку "Попробовать как PDF"')
    } else {
      throw new Error(`Неподдерживаемый тип контента: ${contentType}`)
    }
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      throw new Error('Превышено время ожидания загрузки (15 секунд)')
    }

    if (error.message) {
      throw error
    }

    throw new Error(`Не удалось загрузить URL: ${error.toString()}`)
  }
}

function parseHtml(html: string, url: string): { content: string; contentType: string; title?: string } {
  try {
    // Parse HTML with JSDOM
    const dom = new JSDOM(html, { url })
    const document = dom.window.document

    // Use Readability to extract clean content
    const reader = new Readability(document)
    const article = reader.parse()

    if (!article || !article.textContent) {
      // Fallback: extract text from body
      const bodyText = document.body?.textContent || ''
      return {
        content: bodyText.trim(),
        contentType: 'text/html',
        title: document.title || extractTitleFromUrl(url),
      }
    }

    return {
      content: article.textContent.trim(),
      contentType: 'text/html',
      title: article.title || document.title || extractTitleFromUrl(url),
    }
  } catch (error) {
    console.error('[ingest-url] HTML parsing error:', error)
    throw new Error('Не удалось распарсить HTML контент')
  }
}

function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const lastSegment = pathname.split('/').filter(Boolean).pop()
    return lastSegment || urlObj.hostname
  } catch {
    return 'URL Source'
  }
}

// ============================================================================
// Request Schema
// ============================================================================

const requestSchema = z.object({
  url: z.string().url('Недействительный URL'),
})

// ============================================================================
// Main POST Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await ensureAuthServer()
    const userId = session.user.id

    // Parse and validate request body
    const body = await request.json()
    const validation = requestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Недействительный запрос', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { url } = validation.data

    // Validate URL protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'URL_INVALID_PROTOCOL', message: 'Поддерживаются только HTTP и HTTPS протоколы' },
        { status: 400 }
      )
    }

    // Check rate limit
    const rateLimit = checkRateLimit(userId)
    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetAt).toLocaleTimeString('ru-RU')
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Превышен лимит запросов (${RATE_LIMIT_REQUESTS}/час). Попробуйте снова после ${resetDate}`,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      )
    }

    // Check domain allow/deny list
    const domainCheck = isDomainAllowed(url)
    if (!domainCheck.allowed) {
      return NextResponse.json(
        { error: 'DOMAIN_NOT_ALLOWED', message: domainCheck.reason },
        { status: 403 }
      )
    }

    // Check robots.txt
    const robotsCheck = await checkRobotsTxt(url)
    if (!robotsCheck.allowed) {
      return NextResponse.json(
        { error: 'ROBOTS_TXT_DISALLOWED', message: robotsCheck.reason },
        { status: 403 }
      )
    }

    // Fetch and parse content
    const { content, contentType, title } = await fetchUrlContent(url)

    // Calculate word count
    const wordCount = content.split(/\s+/).filter(Boolean).length

    // Return structured response
    return NextResponse.json({
      title: title || 'URL Source',
      text: content,
      wordCount,
      sourceUrl: url,
      contentType,
      byline: `Извлечено из ${extractDomain(url)}`,
    })
  } catch (error: any) {
    console.error('[ingest-url] Error:', error)

    // Check for specific error types
    if (error.message?.includes('URL')) {
      return NextResponse.json(
        { error: 'URL_FETCH_ERROR', message: error.message },
        { status: 400 }
      )
    }

    if (error.message?.includes('Контент слишком большой')) {
      return NextResponse.json(
        { error: 'CONTENT_TOO_LARGE', message: error.message },
        { status: 413 }
      )
    }

    if (error.message?.includes('Превышено время')) {
      return NextResponse.json(
        { error: 'FETCH_TIMEOUT', message: error.message },
        { status: 504 }
      )
    }

    if (error.message?.includes('распарсить')) {
      return NextResponse.json(
        { error: 'PARSE_ERROR', message: error.message },
        { status: 422 }
      )
    }

    // Generic error
    return NextResponse.json(
      { error: 'INGEST_ERROR', message: error.message || 'Не удалось извлечь контент из URL' },
      { status: 500 }
    )
  }
}
