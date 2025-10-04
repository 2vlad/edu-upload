import { supabase } from '../supabaseClient'
import { getCurrentUserId } from '../auth'
import { ExtractedFile, ParserError } from './types'

/**
 * Upload image to Supabase Storage and return ExtractedFile with imagePath
 */
export async function handleImage(file: File, courseId?: string): Promise<ExtractedFile> {
  try {
    // Get current user ID
    const userId = await getCurrentUserId()
    if (!userId) {
      throw new ParserError(
        'Необходима авторизация для загрузки изображений',
        file.name
      )
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${crypto.randomUUID()}.${fileExt}`

    // Create path: userId/courseId/fileName or userId/temp/fileName if no courseId
    const folder = courseId || 'temp'
    const filePath = `${userId}/${folder}/${fileName}`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('course-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      throw new ParserError(
        `Ошибка загрузки изображения: ${error.message}`,
        file.name
      )
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('course-assets')
      .getPublicUrl(data.path)

    return {
      id: crypto.randomUUID(),
      filename: file.name,
      mime: file.type,
      imagePath: publicUrl,
      size: file.size,
    }
  } catch (error) {
    if (error instanceof ParserError) {
      throw error
    }
    throw new ParserError(
      `Не удалось загрузить изображение: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
      file.name,
      error instanceof Error ? error : undefined
    )
  }
}
