import { parsePDF } from './pdf'
import { parseDOCX } from './docx'
import { parseRTF } from './rtf'
import { parseMarkdown } from './markdown'
import { parseText } from './text'
import { parseHTML } from './html'
import { handleImage } from './image'
import { validateFile } from './validation'
import { ParserError, SUPPORTED_DOCUMENT_TYPES, SUPPORTED_IMAGE_TYPES, FILE_SIZE_LIMITS } from './types'
import type { ExtractedFile } from './types'

/**
 * Parse a file based on its MIME type
 * @param file File to parse
 * @param courseId Optional course ID for image uploads
 * @returns ExtractedFile with text or imagePath
 */
export async function parseFile(
  file: File,
  courseId?: string,
  userId?: string
): Promise<ExtractedFile> {
  // Validate file
  const fileType = validateFile(file)

  // Handle images
  if (fileType === 'image') {
    return handleImage(file, { courseId, userId })
  }

  // Handle documents based on MIME type
  switch (file.type) {
    case SUPPORTED_DOCUMENT_TYPES.PDF:
      return parsePDF(file)

    case SUPPORTED_DOCUMENT_TYPES.DOCX:
    case SUPPORTED_DOCUMENT_TYPES.DOC:
      return parseDOCX(file)

    case SUPPORTED_DOCUMENT_TYPES.RTF:
      return parseRTF(file)

    case SUPPORTED_DOCUMENT_TYPES.MD:
      return parseMarkdown(file)

    case SUPPORTED_DOCUMENT_TYPES.TXT:
      return parseText(file)

    case SUPPORTED_DOCUMENT_TYPES.HTML:
      return parseHTML(file)

    default:
      throw new ParserError(
        `Неподдерживаемый тип файла: ${file.type}`,
        file.name
      )
  }
}

/**
 * Parse multiple files
 * @param files Array of files to parse
 * @param courseId Optional course ID for image uploads
 * @returns Array of ExtractedFiles
 */
export async function parseFiles(
  files: File[],
  courseId?: string,
  userId?: string
): Promise<ExtractedFile[]> {
  const results = await Promise.allSettled(
    files.map(file => parseFile(file, courseId, userId))
  )

  const extractedFiles: ExtractedFile[] = []
  const errors: { filename: string; error: string }[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      extractedFiles.push(result.value)
    } else {
      const file = files[index]
      const error = result.reason instanceof ParserError
        ? result.reason.message
        : 'Неизвестная ошибка при обработке файла'

      errors.push({ filename: file.name, error })
      console.error(`Failed to parse ${file.name}:`, result.reason)
    }
  })

  // If all files failed, throw an error
  if (extractedFiles.length === 0 && errors.length > 0) {
    throw new Error(
      `Не удалось обработать ни один файл:\n${errors.map(e => `- ${e.filename}: ${e.error}`).join('\n')}`
    )
  }

  // Log partial failures
  if (errors.length > 0) {
    console.warn(`Some files failed to parse:`, errors)
  }

  return extractedFiles
}

// Re-export types and utilities
export type { ExtractedFile } from './types'
export { ParserError, SUPPORTED_DOCUMENT_TYPES, SUPPORTED_IMAGE_TYPES, FILE_SIZE_LIMITS, validateFile }
