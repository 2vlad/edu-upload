import {
  SUPPORTED_DOCUMENT_TYPES,
  SUPPORTED_IMAGE_TYPES,
  FILE_SIZE_LIMITS,
  ParserError,
} from './types'

/**
 * Validate file MIME type
 */
export function validateFileType(file: File): 'document' | 'image' {
  const documentTypes = Object.values(SUPPORTED_DOCUMENT_TYPES)
  const imageTypes = Object.values(SUPPORTED_IMAGE_TYPES)

  if (documentTypes.includes(file.type as any)) {
    return 'document'
  }

  if (imageTypes.includes(file.type as any)) {
    return 'image'
  }

  throw new ParserError(
    `Неподдерживаемый тип файла: ${file.type}. Поддерживаемые типы: PDF, DOCX, MD, TXT, RTF, HTML, PNG, JPG, WebP, GIF`,
    file.name
  )
}

/**
 * Validate file size
 */
export function validateFileSize(file: File, type: 'document' | 'image'): void {
  const limit = type === 'document'
    ? FILE_SIZE_LIMITS.DOCUMENT
    : FILE_SIZE_LIMITS.IMAGE

  if (file.size > limit) {
    const limitMB = Math.round(limit / (1024 * 1024))
    const fileSizeMB = Math.round(file.size / (1024 * 1024))
    throw new ParserError(
      `Файл слишком большой: ${fileSizeMB}MB. Максимальный размер для ${type === 'document' ? 'документов' : 'изображений'}: ${limitMB}MB`,
      file.name
    )
  }
}

/**
 * Comprehensive file validation
 */
export function validateFile(file: File): 'document' | 'image' {
  // Check file type
  const fileType = validateFileType(file)

  // Check file size
  validateFileSize(file, fileType)

  return fileType
}
