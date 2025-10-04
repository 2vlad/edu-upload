import { ExtractedFile, ParserError } from './types'

/**
 * Extract text from Markdown file (plain text reading)
 */
export async function parseMarkdown(file: File): Promise<ExtractedFile> {
  try {
    // Read file as text
    const text = await file.text()

    if (!text || text.trim().length === 0) {
      throw new ParserError(
        'Markdown файл пуст',
        file.name
      )
    }

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      text: text.trim(),
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось прочитать Markdown файл: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
