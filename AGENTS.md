# AGENTS.md

This project uses UmaDev. The latest explicit user request is the only task authorization; prior plans and `.umadev/coach/CURRENT.md` are context unless that request explicitly continues the active run.
<!-- umadev:project:begin -->
## UmaDev project context

- **Mode**: existing repository; preserve conventions and change incrementally
- **Stack**: Node.js · Python · React · TypeScript · Vite
- **Source files scanned**: 483
- **Existing config**: .env.example · .github/ · apps/mobile/package-lock.json · apps/mobile/package.json · apps/mobile/tsconfig.json · apps/web/dockerfile · apps/web/package.json · apps/web/tsconfig.json · deploy/docker-compose.yml · package.json · pnpm-lock.yaml · services/ai/.env.example · +6

### Current-task authority

- The latest user message is the current objective. Existing plans, `.umadev/coach/CURRENT.md`, run notes, output documents, and earlier conversation are context only; their presence does not authorize continuing old work.
- Resume an earlier plan only when the user explicitly asks to continue or resume it. Keep targeted work within the requested scope and do not fix unrelated issues.
- **Dev server**: `npm run dev`

### Build / test / lint

- **install**: `pnpm install --silent`
- **lint**: `pnpm run lint`
- **test**: `pnpm run test`
- **build**: `pnpm run build`

<!-- umadev:project:end -->
