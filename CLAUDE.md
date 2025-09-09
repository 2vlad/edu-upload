# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 14 educational course creation application that transforms PDF documents into structured, interactive lessons using AI. The app uses Groq's Llama model for content generation and features a modern UI built with Radix UI components and Tailwind CSS.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint
```

## Architecture

### Core Application Flow
1. **PDF Upload** (`app/page.tsx`): Users upload PDF files via drag-and-drop interface
2. **Processing** (`app/api/process-pdfs/route.ts`): PDFs are processed and converted to structured lessons using Groq AI
3. **Lesson Editing** (`app/lessons/page.tsx`): Generated lessons can be reviewed and edited before publishing
4. **Course Viewing** (`app/course/page.tsx`): Published courses are displayed with progress tracking and navigation

### Key Technical Details

- **State Management**: Uses React hooks and localStorage for persisting course data between pages
- **AI Integration**: Groq's Llama 3.1 70B model generates structured course content with defined schema
- **Styling**: Tailwind CSS v4 with custom rounded button styles (50px border radius for primary buttons, 25px for secondary)
- **UI Components**: Radix UI primitives wrapped in `/components/ui/` with shadcn/ui patterns

### Build Configuration

The project has TypeScript and ESLint errors intentionally ignored during builds (see `next.config.mjs`):
- `typescript.ignoreBuildErrors: true`
- `eslint.ignoreDuringBuilds: true`

## Important Notes

- PDF text extraction is currently simulated in the MVP (`extractTextFromPDF` function). Production implementation would require proper PDF parsing libraries
- Course data is stored in localStorage - no backend database integration yet
- API keys for Groq should be configured in environment variables (not currently present in codebase)