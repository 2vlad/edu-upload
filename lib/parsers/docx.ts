import mammoth from 'mammoth'
import { ExtractedFile, ParserError } from './types'

/**
 * Extract text from DOCX file using mammoth
 */
export async function parseDOCX(file: File): Promise<ExtractedFile> {
  try {
    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Extract text from DOCX
    const result = await mammoth.extractRawText({
      arrayBuffer: arrayBuffer,
    })

    if (!result.value || result.value.trim().length === 0) {
      throw new ParserError(
        'DOCX файл не содержит текста',
        file.name
      )
    }

    // Log warnings if any
    if (result.messages && result.messages.length > 0) {
      console.warn(`Предупреждения при парсинге ${file.name}:`, result.messages)
    }

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      text: result.value.trim(),
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось извлечь текст из DOCX: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
