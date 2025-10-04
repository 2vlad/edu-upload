# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 14 educational course creation application that transforms PDF documents into structured, interactive lessons using AI. The app uses OpenAI's GPT-4o model for content generation and features a modern UI built with Radix UI components and Tailwind CSS.

## Development Commands

```bash
# Install dependencies (use npm if pnpm not available)
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Environment Setup

Create a `.env.local` file in the project root with:

```
OPENAI_API_KEY=your_openai_api_key_here
```

Get your API key from https://platform.openai.com/api-keys

## Architecture

### Core Application Flow
1. **PDF Upload** (`app/page.tsx`): Users upload PDF files via drag-and-drop interface
2. **Processing** (`app/api/process-pdfs/route.ts`): PDFs are processed and converted to structured lessons using OpenAI
3. **Lesson Editing** (`app/lessons/page.tsx`): Generated lessons can be reviewed and edited before publishing
4. **Course Viewing** (`app/course/page.tsx`): Published courses are displayed with progress tracking and navigation

### Key Technical Details

- **State Management**: Uses React hooks and localStorage for persisting course data between pages
- **AI Integration**: OpenAI's GPT-4o model generates structured course content with defined schema
- **Styling**: Tailwind CSS v4 with custom rounded button styles (50px border radius for primary buttons, 25px for secondary)
- **UI Components**: Radix UI primitives wrapped in `/components/ui/` with shadcn/ui patterns

### Build Configuration

The project has TypeScript and ESLint errors intentionally ignored during builds (see `next.config.mjs`):
- `typescript.ignoreBuildErrors: true`
- `eslint.ignoreDuringBuilds: true`

## Important Notes

- PDF text extraction is currently simulated in the MVP (`extractTextFromPDF` function). Production implementation would require proper PDF parsing libraries
- Course data is stored in localStorage - no backend database integration yet
- OpenAI API key must be configured in environment variables for the app to function

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
