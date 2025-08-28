# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `bun run dev` - Start development server with hot reload (runs on port 4000)
- `bun run dev:inngest` - Start Inngest dev server for background job processing
- `bun run typegen` - Generate TypeScript types from Sanity schema
- `bun install` - Install dependencies

## Architecture Overview

This is a Hono-based API server that provides:
1. **AI-powered chat functionality** for educational content with RAG (Retrieval Augmented Generation)
2. **Course recommendation system** using semantic search
3. **Background job processing** via Inngest for async tasks

### Core Components

**Main API Server** (`src/index.ts`):
- Hono web framework with Clerk authentication
- Two main endpoints: `/api/chat` and `/api/recommendations`
- Serves Inngest webhook endpoint at `/api/inngest`

**Data Layer**:
- **Sanity CMS** (`src/lib/sanity.ts`, `src/sanity/index.ts`) - Content management and user data
- **Upstash Vector** (`src/lib/upstash.ts`) - Semantic search for lessons and courses
- Generated types from Sanity schema in `sanity.types.ts`

**Background Jobs** (`src/inngest/inggest.ts`):
- Course recommendation processing using semantic search
- AI-powered explanation generation for recommendations

**AI Integration**:
- OpenAI GPT models for chat and content generation
- RAG implementation: searches relevant lesson content via vector database
- Context-aware responses using lesson metadata and user level

### Key Patterns

**Chat Session Management**:
- Sessions link users to lessons with activity tracking
- Messages saved with structured parts format
- Real-time streaming responses with post-processing saves

**Authentication Flow**:
- Clerk middleware for all protected routes
- User lookup by Clerk ID with fallback error handling

**Vector Search Integration**:
- Lesson content indexed by lesson ID with metadata filtering
- Course recommendations use semantic similarity matching
- Results include relevance metadata for context building

## Environment Variables

The application requires these environment variables:
- `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` - Authentication
- `SANITY_PROJECT_ID` / `SANITY_DATASET` / `SANITY_API_VERSION` / `SANITY_SECRET_TOKEN` - CMS
- Upstash Vector DB credentials
- OpenAI API key
- `PORT` (defaults to 4000)

## Type Generation

Run `bun run typegen` after Sanity schema changes to regenerate `sanity.types.ts`. The types are used throughout the codebase for type-safe CMS operations.