import { type NextRequest, NextResponse } from "next/server"
import { generateObject } from "ai"
import { createGroq } from "@ai-sdk/groq"

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

// Simple PDF text extraction (in production, use a proper PDF parser)
async function extractTextFromPDF(file: File): Promise<string> {
  // For MVP, we'll simulate PDF text extraction
  // In production, use libraries like pdf-parse or pdf2pic
  const fileName = file.name.toLowerCase()

  // Simulate different content based on filename for demo
  if (fileName.includes("marketing")) {
    return `Marketing Fundamentals
    
    Chapter 1: Understanding Your Audience
    Marketing is about connecting with people who need your product or service. The first step is understanding who your target audience is, what they care about, and where they spend their time.
    
    Chapter 2: Building Your Brand
    Your brand is more than just a logo. It's the entire experience customers have with your business. This includes your messaging, visual identity, and customer service.
    
    Chapter 3: Digital Marketing Channels
    Today's marketing landscape includes social media, email marketing, content marketing, and paid advertising. Each channel has its strengths and ideal use cases.`
  }

  return `Course Content
  
  This document contains valuable information that can be transformed into structured learning materials. The content covers various topics and concepts that will be organized into digestible lessons for optimal learning outcomes.
  
  Key concepts include foundational principles, practical applications, and advanced techniques. Each section builds upon previous knowledge to create a comprehensive learning experience.`
}

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "Groq API key not configured. Please add GROQ_API_KEY to your .env.local file." },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // Extract text from all PDFs
    const allText = await Promise.all(files.map((file) => extractTextFromPDF(file)))

    const combinedText = allText.join("\n\n---\n\n")

    // Use Groq to generate structured lessons
    const { object: courseStructure } = await generateObject({
      model: groq("llama-3.1-70b-versatile"),
      prompt: `
        Convert the following text into a structured course with 3-10 lessons. Each lesson should be no more than one A4 page of content (approximately 300-400 words).
        
        Create lessons that:
        - Follow a logical sequence
        - Are engaging and educational
        - Include practical examples where possible
        - Have clear learning objectives
        
        Text to convert:
        ${combinedText}
      `,
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          lessons: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                content: { type: "string" },
                objectives: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["id", "title", "content", "objectives"],
            },
          },
        },
        required: ["title", "description", "lessons"],
      },
    })

    return NextResponse.json(courseStructure)
  } catch (error) {
    console.error("Error processing PDFs:", error)
    return NextResponse.json({ error: "Failed to process PDFs" }, { status: 500 })
  }
}
