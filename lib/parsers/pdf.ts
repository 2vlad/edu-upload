import { ExtractedFile, ParserError } from './types'

/**
 * Extract text from PDF file using pdf-parse
 */
export async function parsePDF(file: File): Promise<ExtractedFile> {
  try {
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Dynamic import to avoid issues with server-side modules
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default

    // Parse the PDF
    const data = await pdfParse(buffer)

    if (!data.text || data.text.trim().length === 0) {
      throw new ParserError(
        'PDF не содержит извлекаемого текста',
        file.name
      )
    }

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      text: data.text.trim(),
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось извлечь текст из PDF: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
