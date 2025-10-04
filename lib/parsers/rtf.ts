import { parseString } from 'rtf-parser'
import { ExtractedFile, ParserError } from './types'

/**
 * Extract text from RTF file using rtf-parser
 */
export async function parseRTF(file: File): Promise<ExtractedFile> {
  try {
    // Read file as text
    const text = await file.text()

    // Parse RTF
    const rtfDoc = await new Promise<any>((resolve, reject) => {
      parseString(text, (err, doc) => {
        if (err) reject(err)
        else resolve(doc)
      })
    })

    // Extract plain text from RTF document
    const extractText = (node: any): string => {
      if (!node) return ''

      if (typeof node === 'string') {
        return node
      }

      if (node.content) {
        if (Array.isArray(node.content)) {
          return node.content.map(extractText).join('')
        }
        return extractText(node.content)
      }

      return ''
    }

    const extractedText = extractText(rtfDoc).trim()

    if (!extractedText || extractedText.length === 0) {
      throw new ParserError(
        'RTF файл не содержит текста',
        file.name
      )
    }

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      text: extractedText,
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось извлечь текст из RTF: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
