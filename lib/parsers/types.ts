/**
 * Unified interface for extracted file data
 */
export interface ExtractedFile {
  id: string
  filename: string
  mime: string
  text?: string // For text-based documents
  imagePath?: string // For images uploaded to Storage
  size?: number // File size in bytes
}

/**
 * Supported MIME types for document parsing
 */
export const SUPPORTED_DOCUMENT_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOC: 'application/msword',
  MD: 'text/markdown',
  TXT: 'text/plain',
  RTF: 'text/rtf',
  HTML: 'text/html',
} as const

/**
 * Supported MIME types for images
 */
export const SUPPORTED_IMAGE_TYPES = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  JPG: 'image/jpeg',
  WEBP: 'image/webp',
  GIF: 'image/gif',
} as const

/**
 * File size limits
 */
export const FILE_SIZE_LIMITS = {
  DOCUMENT: 30 * 1024 * 1024, // 30MB for documents
  IMAGE: 10 * 1024 * 1024, // 10MB for images
} as const

/**
 * Parser error types
 */
export class ParserError extends Error {
  constructor(
    message: string,
    public filename: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'ParserError'
  }
}
