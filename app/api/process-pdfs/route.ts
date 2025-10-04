import { type NextRequest, NextResponse } from "next/server"
import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Actual PDF text extraction using pdf-parse
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Dynamic import to avoid issues with server-side modules
    // Import the implementation file directly to skip the package's debug entry point that reads test assets
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default
    
    // Parse the PDF
    const data = await pdfParse(buffer)
    
    // Return the extracted text
    return data.text || "Не удалось извлечь текст из PDF файла"
  } catch (error) {
    console.error("Error parsing PDF:", error)
    // Return a fallback message if parsing fails
    return `Не удалось извлечь текст из файла ${file.name}. Пожалуйста, убедитесь, что файл не поврежден и содержит текст.`
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Ключ API OpenAI не настроен. Пожалуйста, добавьте OPENAI_API_KEY в файл .env.local." },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Файлы не предоставлены" }, { status: 400 })
    }

    // Extract text from all PDFs
    const allText = await Promise.all(files.map((file) => extractTextFromPDF(file)))

    const combinedText = allText.join("\n\n---\n\n")

    // Use OpenAI to generate structured lessons
    const { object: courseStructure } = await generateObject({
      model: openai("gpt-4o"),
      prompt: `
        Преобразуй следующий текст из PDF документов в структурированный образовательный курс с 3-10 уроками.
        
        Каждый урок должен:
        - Содержать 300-400 слов (примерно одна страница A4)
        - Следовать логической последовательности
        - Быть увлекательным и образовательным
        - Включать практические примеры, где это возможно
        - Иметь четкие учебные цели
        
        ВАЖНО: Используй ТОЛЬКО информацию из предоставленного текста. Не добавляй информацию, которой нет в исходном материале.
        Создавай уроки на основе реального содержания документов.
        
        Текст для преобразования:
        ${combinedText}
        
        Ответ должен быть на русском языке.
      `,
      schema: z.object({
        title: z.string().describe("Название курса на русском языке"),
        description: z.string().describe("Описание курса на русском языке"),
        lessons: z.array(
          z.object({
            id: z.string().describe("Уникальный идентификатор урока"),
            title: z.string().describe("Название урока на русском языке"),
            content: z.string().describe("Содержание урока на русском языке"),
            objectives: z.array(z.string()).describe("Учебные цели на русском языке"),
          })
        ),
      }),
    })

    return NextResponse.json(courseStructure)
  } catch (error) {
    console.error("Error processing PDFs:", error)
    return NextResponse.json({ error: "Не удалось обработать PDF-файлы" }, { status: 500 })
  }
}
