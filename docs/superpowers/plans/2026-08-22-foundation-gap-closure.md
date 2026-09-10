# OpenSchedule Foundation Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the missing foundation behaviors identified by the full OpenSchedule plan while preserving the existing B15-B25 modules.

**Architecture:** Reuse the existing NestJS modules, Prisma models, EventEmitter, React Router, Ant Design, and TanStack Query. Close the gaps in dependency order: task/personal execution, notification/reminder delivery, comments and attachments/search, then PWA and calendar completeness. Keep NestJS as the only business-database writer; keep AI proposals draft-only and approval-gated.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Redis, Jest, React 19, Vite, Ant Design 5, React Router 7, TanStack Query 5.

**Spec:** `D:\GLMclaw\workspace\DELIVERY\OpenSchedule完整开发方案.html`, Chapter 4 batch plan B6/B8-B14/B21/B12.

## Global Constraints

- Do not introduce new runtime dependencies.
- Keep API DTOs camelCase and Prisma/database fields snake_case through mappings.
- Every business table query must remain tenant-scoped.
- Key writes must remain auditable.
- Preserve the existing deterministic engines and `ai_proposals` draft/approval gate.
- Every task adds focused Jest coverage before production implementation.
- Run backend typecheck, frontend typecheck/build, and focused/full Jest gates before claiming completion.

---

### Task 1: Establish the real-gap baseline

**Files:**
- Create: `docs/superpowers/plans/2026-08-22-foundation-gap-closure.md`
- Modify: `.cluster/openschedule-phase3/progress.md`
- Test: command-based baseline reports

**Interfaces:**
- Consumes: current Prisma schema, module registry, routes, existing tests.
- Produces: explicit gap ledger separating existing backend code from incomplete behavior and UI wiring.

- [ ] Step 1: Run backend typecheck and focused tests for assignments, comments, notifications, reminders, attachments, search, and summaries.
- [ ] Step 2: Run frontend typecheck/build and inspect route/layout TODOs.
- [ ] Step 3: Record only verified gaps in the phase progress file.

---

### Task 2: Close personal execution and assignment flows

**Files:**
- Modify: `services/api/src/modules/assignments/assignments.service.ts`
- Modify: `services/api/src/modules/assignments/assignments.controller.ts`
- Modify: `services/api/src/modules/tasks/tasks.service.ts`
- Create/Modify: `services/api/src/modules/personal-tasks/*`
- Create/Modify: `services/api/src/modules/time-entries/*`
- Test: focused Jest specs for claim, transfer, personal task CRUD, timer accumulation, and completion summary
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/TodayFocusPage.tsx`
- Create: `apps/web/src/api/personalTaskApi.ts`

**Interfaces:**
- Consumes: `PersonalTask`, `TimeEntry`, `Task.actualHours`, `Task.completedAt`, existing assignments and summary contracts.
- Produces: `/me/today`, personal task CRUD, timer start/stop, and verified A5 first-come-first-served transfer behavior.

- [ ] Step 1: Add failing tests for claim conflict, transfer audit, personal task ownership, and timer accumulation.
- [ ] Step 2: Run focused tests and confirm expected failures.
- [ ] Step 3: Implement minimal service/controller behavior using existing Prisma and AuditService patterns.
- [ ] Step 4: Add `/me/today` route and usable empty/loading/error states.
- [ ] Step 5: Run focused backend tests and frontend typecheck.

---

### Task 3: Complete reminders and notification delivery

**Files:**
- Modify: `services/api/src/modules/reminders/reminders.service.ts`
- Modify: `services/api/src/modules/reminders/reminders.worker.ts`
- Modify: `services/api/src/modules/notifications/notifications.service.ts`
- Modify: `services/api/src/modules/notifications/notifications.controller.ts`
- Modify: `services/api/src/modules/notifications/adapters/*`
- Test: reminder fallback, ghost-reminder suppression, preference routing, retry/backoff, and tenant isolation specs
- Create/Modify: `apps/web/src/pages/NotificationsPage.tsx`
- Create/Modify: `apps/web/src/api/notificationApi.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: `Reminder`, `Notification`, `NotificationDelivery`, `NotificationPreference`, event payloads.
- Produces: in-app inbox, read/unread updates, preference updates, Redis-primary plus DB-fallback reminder processing.

- [ ] Step 1: Add failing tests for preference routing, retry schedule, DB fallback, and completed-task suppression.
- [ ] Step 2: Run focused tests and confirm failures.
- [ ] Step 3: Implement deterministic delivery selection and retry state transitions.
- [ ] Step 4: Implement reminder worker fallback without requiring Redis for correctness.
- [ ] Step 5: Add notification page and enable navigation.
- [ ] Step 6: Run focused tests, backend typecheck, and frontend build.

---

### Task 4: Finish comments, mentions, decisions, attachments, and search UX

**Files:**
- Modify: `services/api/src/modules/comments/*`
- Modify: `services/api/src/modules/attachments/*`
- Modify: `services/api/src/modules/search/*`
- Test: mention parsing, XSS-safe content validation, reply tree, attachment limits, tenant-scoped search specs
- Modify: `apps/web/src/pages/TaskDetailPage.tsx`
- Modify: `apps/web/src/api/taskApi.ts`
- Modify: `apps/web/src/api/attachmentApi.ts`
- Modify: `apps/web/src/pages/SearchPage.tsx`

**Interfaces:**
- Consumes: existing task/comment/attachment/search contracts and notification events.
- Produces: reply threads, mention notification integration, decision toggle, attachment upload/download states, and complete search filters.

- [ ] Step 1: Add failing tests for reply ownership, mention extraction, decision updates, attachment validation, and tenant-scoped search.
- [ ] Step 2: Run focused tests and confirm failures.
- [ ] Step 3: Implement missing behavior with existing module boundaries.
- [ ] Step 4: Add task detail attachment and thread interactions.
- [ ] Step 5: Run focused tests and frontend build.

---

### Task 5: Complete import/export, summaries, PWA, and calendar contract gaps

**Files:**
- Modify: `services/api/src/modules/import-export/*`
- Modify: `services/api/src/modules/summaries/*`
- Modify: `services/api/src/modules/calendar/*`
- Modify: `apps/web/src/pages/ImportExportPage.tsx`
- Modify: `apps/web/src/pages/SummaryPage.tsx`
- Modify: `apps/web/src/pages/CalendarPage.tsx`
- Modify: `apps/web/vite.config.ts`
- Create/Modify: `apps/web/public/*` PWA assets if required
- Test: import error detail, summary aggregation, calendar sync conflict, and 375px route smoke checks where supported

**Interfaces:**
- Consumes: CSV contracts, task completion data, calendar adapter/mapping contracts, Vite PWA dependency already present.
- Produces: verified B13/B14/B21 behavior with explicit sync direction and offline-safe shell.

- [ ] Step 1: Add failing tests for row-level import errors, summary totals, and calendar mapping conflict handling.
- [ ] Step 2: Run focused tests and confirm failures.
- [ ] Step 3: Implement minimal missing backend behavior.
- [ ] Step 4: Complete frontend states and PWA registration/configuration.
- [ ] Step 5: Run backend tests, frontend typecheck/build, and static 375px inspection.

---

### Task 6: Reconcile AI service boundary without breaking deterministic engines

**Files:**
- Inspect/Modify: `services/ai/app/*`
- Modify: `services/api/src/modules/proposals/*`
- Modify: `apps/web/src/api/aiApi.ts`
- Test: proposal schema, approval atomicity, SSE framing, and no-direct-write boundary tests
- Modify: `.cluster/openschedule-phase3/progress.md`

**Interfaces:**
- Consumes: existing deterministic decompose/health/resource-pool engines and `AiProposal` model.
- Produces: documented and tested adapter boundary; no AI service direct database credentials; approval remains the only business-data write path.

- [ ] Step 1: Add failing contract tests for strict proposal shape, SSE frames, and apply atomicity.
- [ ] Step 2: Implement the smallest adapter/boundary changes compatible with the existing repository.
- [ ] Step 3: Run AI/backend contract tests and update progress with remaining architecture variance if Python service integration is still deferred.

---

### Task 7: Final verification and delivery report

**Files:**
- Modify: `.cluster/openschedule-phase3/progress.md`
- Create: `DELIVERY/OpenSchedule-基础回补-交付报告.md`
- Create: `DELIVERY/OpenSchedule-基础回补-交付报告.html`

**Interfaces:**
- Consumes: all completed tasks and test outputs.
- Produces: verified report with implemented scope, known residual variance, commands, and exact test counts.

- [ ] Step 1: Run backend typecheck.
- [ ] Step 2: Run frontend typecheck/build.
- [ ] Step 3: Run focused and full Jest suites.
- [ ] Step 4: Record any existing unrelated failures explicitly.
- [ ] Step 5: Generate Markdown and self-contained HTML delivery reports.
