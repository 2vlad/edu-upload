import { ExtractedFile, ParserError } from './types'

/**
 * Extract text from plain text file
 */
export async function parseText(file: File): Promise<ExtractedFile> {
  try {
    // Read as bytes to allow encoding detection
    const buf = new Uint8Array(await file.arrayBuffer())

    // Detect BOM
    const hasUTF8BOM = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
    const hasUTF16LEBOM = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe
    const hasUTF16BEBOM = buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff

    const decode = (label: string, sliceOffset = 0) => new TextDecoder(label as any, { fatal: false }).decode(buf.subarray(sliceOffset))

    let text: string
    if (hasUTF8BOM) {
      text = decode('utf-8', 3)
    } else if (hasUTF16LEBOM) {
      text = decode('utf-16le', 2)
    } else if (hasUTF16BEBOM) {
      text = decode('utf-16be', 2)
    } else {
      // Try utf-8 first
      text = decode('utf-8')
      const replacementCount = (text.match(/\uFFFD/g) || []).length
      // Heuristics: many replacement chars or many NUL bytes → try UTF-16
      const nulRatio = Array.from(buf).filter(b => b === 0).length / Math.max(1, buf.length)
      if (replacementCount > 10 || nulRatio > 0.1) {
        try {
          const candidateLE = decode('utf-16le')
          const candidateBE = decode('utf-16be')
          const rLE = (candidateLE.match(/\uFFFD/g) || []).length
          const rBE = (candidateBE.match(/\uFFFD/g) || []).length
          text = rLE <= rBE ? candidateLE : candidateBE
        } catch {
          // ignore
        }
      }
      // Last resort: try windows-1251 for Cyrillic content
      if ((text.match(/\uFFFD/g) || []).length > 10) {
        try {
          text = decode('windows-1251')
        } catch {
          // environment may not support this label; keep utf-8 result
        }
      }
    }

    if (!text || text.trim().length === 0) {
      throw new ParserError('Текстовый файл пуст', file.name)
    }

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      text: text.replace(/\r\n/g, '\n').trim(),
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось прочитать текстовый файл: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
