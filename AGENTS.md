# Repository Guidelines

## Project Structure & Module Organization
- `src/`: application code organized by domain and infrastructure.
  - `src/domains/`: core logic (`chat`, `recommendations`, `shared`).
  - `src/infrastructure/`: integrations (`ai`, `database`, `jobs`) and `container.ts` for DI wiring.
  - `src/inngest/`: background functions and registration.
  - `src/middleware/`: error handling, auth, and validation.
  - `src/lib/`: Sanity and Upstash clients.
  - `src/utils/`: prompt and message helpers.
- `scripts/`: utility scripts (e.g., Sanity type generation).
- `Dockerfile`: container build; `.env` for local configuration.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: start the Hono server with hot reload on `http://localhost:4000`.
- `npx inngest-cli@latest dev -u http://localhost:4000/api/inngest`: run Inngest locally and bind to the webhook route.
- `bun run typegen`: generate `sanity.types.ts` from the Sanity schema.
- If adding tests, use Bun’s runner: `bun test`.

## Coding Style & Naming Conventions
- Language: TypeScript (`ESNext`, `NodeNext`, `strict: true`).
- Indentation: tabs; keep consistent with existing files.
- Files: kebab-case (e.g., `error.middleware.ts`, `sanity.repository.ts`).
- Classes: `PascalCase`; functions/variables: `camelCase`.
- Prefer shared types from `src/domains/shared/types.ts`; surface domain errors via `DomainError` variants.

## Testing Guidelines
- No test suite is present. When contributing tests:
  - Place tests alongside code or under `src/**/__tests__` with `*.test.ts`.
  - Mock external clients (Sanity, Upstash, OpenAI) via DI (see `container.ts`).
  - Aim for focused unit tests on services and utils; keep API tests minimal.

## Commit & Pull Request Guidelines
- Commits follow Conventional Commits (`feat:`, `fix:`, `hotfix:`). Keep subjects imperative and concise.
- PRs should include: summary, rationale, local run steps, affected env vars, and sample request/response for changed endpoints. Link related issues.

## Security & Configuration Tips
- Never commit secrets. Configure via `.env` (local) and platform secrets (prod).
- Common env vars: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_VERSION`, `SANITY_SECRET_TOKEN`, `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`, `PORT`.
- Webhooks: Clerk → `POST /api/webhooks/clerk`; Inngest → `/api/inngest`.
