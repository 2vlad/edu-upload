import { JSDOM } from 'jsdom'
import { ExtractedFile, ParserError } from './types'

/**
 * Extract text from HTML file using jsdom
 */
export async function parseHTML(file: File): Promise<ExtractedFile> {
  try {
    // Read file as text
    const html = await file.text()

    // Parse HTML
    const dom = new JSDOM(html)
    const document = dom.window.document

    // Remove script and style elements
    const scriptsAndStyles = document.querySelectorAll('script, style, nav, header, footer')
    scriptsAndStyles.forEach(el => el.remove())

    // Extract text content
    const text = document.body?.textContent || document.documentElement?.textContent || ''

    // Clean up whitespace
    const cleanedText = text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
      .trim()

    if (!cleanedText || cleanedText.length === 0) {
      throw new ParserError(
        'HTML файл не содержит текста',
        file.name
      )
    }

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      text: cleanedText,
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось извлечь текст из HTML: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
