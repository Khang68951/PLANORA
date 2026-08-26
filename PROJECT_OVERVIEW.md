# Project Planora Overview

> Agent-facing project context. Every coding agent must read this file before implementation and update it after material code changes.

## Project summary

Planora is a single-user planning application for people who may have no technical background. It combines tasks and deadlines in a calm day/week/month calendar, a filterable list, an urgency dashboard, and complete project workspaces with people, documents, files, and contextual AI.

## Current status

- Phase: functional MVP
- Application: Next.js 16 App Router, JavaScript, React, and Tailwind CSS
- Persistence: PostgreSQL through `pg`
- Core behavior: task/deadline CRUD, nested categories and filters, full project workspaces, many-member assignments, rich-text documents, local attachments, provider-selectable project AI with review-before-write, category inheritance, recoverable Trash, and local category suggestions
- Setup: Docker Compose plus an idempotent, diagnostic Node.js schema/seed script
- Verification: 33 domain unit tests, clean ESLint, and an optimized Next.js build containing 22 dynamic API routes

## Goals and non-goals

### Goals

- Give non-technical users one clear place to plan tasks and deadlines.
- Make urgent work visible without requiring the user to configure a dashboard.
- Make all software installation and database-table creation terminal-driven and documented.
- Preserve items in PostgreSQL and seed useful relative-date examples on first setup.
- Keep the interface responsive, accessible, and forgiving, with empty/loading/error states.

### Current non-goals

- Multiple user accounts, authentication, sharing, notifications, recurring items, drag-and-drop, and external calendar sync.
- Production hosting or managed-database provisioning.
- Advanced editing such as recurrence, dependencies, collaborative presence, cloud attachment storage, and bulk changes.

## Users and primary workflows

The primary user is someone who needs a visual planner but should not need computing knowledge to install or operate it. After terminal-based first-time setup, the user can:

1. Review urgent, overdue, upcoming, and completed counts on the dashboard.
2. Switch the calendar between focused day, Sunday-first week, and six-week month modes; navigate by the active period and select a day to create an item.
3. Create or edit a task with a start/end interval, or a deadline with one due time, plus title, optional notes, status, priority, category or category-bearing project; ask for up to three category suggestions.
4. Independently choose the visible categories in Dashboard, Calendar, and Tasks & deadlines using Canvas-style checkboxes. Calendar keeps a vertically scrollable category tree in a sticky right rail on wide screens, with arrows to collapse or expand folders that contain children; manage nested folders, colors, hidden state, the default category, and nesting depth separately.
5. Preview the complete cascade impact before moving a category subtree to Trash, then restore the entire batch if needed.
6. Search or filter items, mark work complete, reopen it, or move it to Trash.
7. Open the top-right Settings dialog to choose Paper, Ocean, or Night appearance, a default Calendar mode, and reduced motion; preferences persist on the current device.
8. Create a project with category, type, dates, status, and progress, then use the left rail for Overview, Documents, Files, Tasks & Deadlines, and Members while project AI chat and skills remain available in the right rail.
9. Save sanitized rich-text documents manually or with Ctrl+S, with warnings before unsaved work is abandoned; upload and preview local project attachments.
10. Assign multiple project members to work and ask project AI about only that project's data. Review and explicitly confirm every AI-proposed database change before it is saved.

## Architecture

The browser renders the client-side planner shell in `components/PlannerApp.jsx`, project UI in `components/ProjectWorkspace.jsx`, and folder manager in `components/CategoryPanel.jsx`. It fetches JSON from Next.js Route Handlers under `app/api`. Route handlers validate user input and use parameterized SQL through the shared `pg` pool in `lib/db.js`. PostgreSQL owns structured planner data; project attachment bytes are stored beneath `storage/projects` with safe generated names and PostgreSQL metadata. Project-linked items expose an effective category using `COALESCE(project.category_id, item.category_id)`, so changing a project's category is inherited without rewriting its tasks. The project UI uses a responsive three-area workspace: non-AI navigation on the left, the active work surface in the center, and persistent project-scoped AI chat and skills on the right; narrower screens reflow the same features rather than hiding them.

```text
Browser UI -> Next.js APIs -> validation/provider boundary -> PostgreSQL + local project files
                                                   \-> OpenRouter or DeepSeek
```

The dashboard and calendar are projections of the same item collection returned by the API; there are no duplicated dashboard tables. Task placement uses its start/end interval (including every intersected calendar day), while deadlines use `dueAt`. Pure date helpers generate and navigate the day, week, and month ranges. Each tab keeps its own in-memory category selection, while Calendar separately keeps its category-tree expansion state, so filtering Calendar never changes Dashboard or Tasks & deadlines. Validated appearance, default-view, and motion preferences use browser-local storage because they belong to the device rather than PostgreSQL planner records. Optimistic completion and deletion keep interactions quick, with rollback when a request fails.

Project AI is server-only. `lib/ai.js` resolves the stored provider/model over environment defaults and calls either OpenRouter or DeepSeek with a project-scoped context assembled from project metadata, members, items, sanitized documents, attachment metadata, supported text-file contents, and recent project chat. Provider keys never enter JSON responses or client bundles. The provider's OpenAI-compatible event stream is decoded on the server, where Planora incrementally extracts only the visible `message` string from the structured AI result. The Route Handler forwards newline-delimited `delta`, `replace`, `done`, or `error` events with buffering disabled; proposals remain hidden until the final event. Plain-text provider fallbacks also stream, while malformed JSON-like output becomes a readable retry message instead of leaking syntax such as `{"`. The same parser repairs previously stored malformed assistant rows at the API boundary before displaying them or adding them to future chat context.

The client adds the outgoing message optimistically, displays an accessible animated thinking bubble until the first text arrives, appends streamed fragments with a cursor, and replaces temporary rows with the persisted message pair without refetching the workspace. Stable role-aware ordering keeps user messages before their paired assistant replies even when PostgreSQL gives both rows the same timestamp.

AI output may propose creating a task, deadline, or document, or replacing the content of a specifically identified existing document. The chat route filters document proposals to IDs in the supplied project context and attaches the reviewed document version. The review panel compares current and proposed text; approval uses the ordinary sanitized document API, which rejects the write if the document changed after the proposal was generated. AI cannot propose document deletion.

## Project map

| Path | Responsibility |
| --- | --- |
| `app/page.js` | Application entry point. |
| `app/globals.css` | Tailwind import, design tokens, responsive product styling. |
| `app/api/items/` | Item list/create/update and soft-delete endpoints. |
| `app/api/categories/` | Category tree CRUD, impact preview, cascade Trash/restore, and suggestion endpoints. |
| `app/api/projects/` | Full project CRUD/workspace, member, document, file, AI chat, and AI-tool endpoints. |
| `app/api/settings/categories/` | Default category and nesting-depth settings. |
| `app/api/settings/ai/` | Provider/model selection and non-secret key-status reporting. |
| `app/api/trash/` | Trash inventory and atomic batch restoration. |
| `components/PlannerApp.jsx` | Dashboard, calendar, list, independent checkbox filters, item form, and client state. |
| `components/ProjectWorkspace.jsx` | Responsive three-area project workspace, vertical sub-tabs, forms, documents, files, members, assignments, persistent AI skills/chat, and proposal review. |
| `components/CategoryPanel.jsx` | Category-management launcher, responsive manager, settings, impact warning, and Trash UI. |
| `lib/db.js` | Reused PostgreSQL connection pool. |
| `lib/database-url.mjs` | Validates database URLs and normalizes local `localhost` connections to explicit IPv4. |
| `lib/items.js` | Allowed values, input validation, and shared SQL column list. |
| `lib/projects.js` | Project/member/document/assignee validation, document sanitization, and project mapping. |
| `lib/ai.js` | OpenRouter/DeepSeek abstraction, effective settings, server requests, and structured-result parsing. |
| `lib/project-files.js` | Attachment limits, safe paths/names, preview, and AI-readable type rules. |
| `lib/categories.js` | Category/settings validation, subtree traversal, and local suggestion ranking. |
| `lib/calendar.js` | Pure day/week/month range and navigation helpers. |
| `lib/preferences.js` | Defaults and validation for browser-local application preferences. |
| `database/schema.sql` | Initial baseline item schema. |
| `database/migrations/` | Ordered PostgreSQL migrations for the current relational model. |
| `scripts/setup-database.mjs` | Creates local env configuration, applies tracked migrations transactionally, and seeds demo rows. |
| `tests/database-url.test.mjs` | Unit coverage for safe URL validation, description, normalization, and env migration. |
| `tests/categories.test.mjs` | Unit coverage for validation, subtree behavior, and suggestion guarantees. |
| `scripts/generate_seed_data.py` | Optional standard-library Python relative-date fixture utility. |
| `docker-compose.yml` | Local PostgreSQL 17 service and persistent Docker volume. |
| `README.md` | Beginner setup, operation, verification, and troubleshooting. |
| `report.html` | Human-facing assignment report and project showcase. |

## Technology and dependencies

- Runtime: Node.js 22 verified; Python 3 is optional for the fixture preview utility.
- Framework: Next.js 16.3.3 with React 19 (locked in `package-lock.json`).
- Styling: Tailwind CSS 4 plus focused CSS design tokens and responsive rules.
- Database: PostgreSQL 17 local Docker image; Node `pg` driver.
- Icons: Lucide React.
- Rich-text sanitization: `sanitize-html` on the server.
- Package manager: npm.

## Setup, run, and verification

```bash
npm install
sudo docker compose up -d --wait
npm run db:setup
npm run dev
```

The README now leads with terminal-only Ubuntu installation and usage, with separate Windows instructions. Verification commands are `npm test`, `npm run lint`, and `npm run build` on Ubuntu (`npm.cmd` on Windows).

## Configuration and environments

- `DATABASE_URL`: PostgreSQL connection URL used by the setup script and Next.js server. Local `localhost` values are normalized to `127.0.0.1` to avoid routing to an unrelated IPv6 PostgreSQL service.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`: server-only OpenRouter credentials/model; model defaults to `openrouter/free`.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`: server-only DeepSeek credentials/model; model defaults to `deepseek-v4-flash`.
- `AI_PROVIDER`: environment provider default, `openrouter` unless set to `deepseek`. A validated PostgreSQL Settings selection overrides provider/model defaults.
- `.env.local`: generated with local defaults by `npm run db:setup` on Ubuntu or `npm.cmd run db:setup` on Windows; ignored by source control.
- `.env.example`: safe example configuration.

No production environment has been configured. The included database credentials are local-development defaults only.

## Data model and storage

`planner_items` uses `kind` as a discriminant. Tasks require `start_at` and `end_at` with `end_at > start_at` and must not contain `due_at`; deadlines require `due_at` and must not contain task interval fields. Both share UUID `id`, title, nullable description, status, priority, assigned category, nullable project, and created/updated timestamps. The JSON API exposes these as camelCase (`startAt`, `endAt`, `dueAt`, `categoryId`, `projectId`, `createdAt`, `updatedAt`).

`categories` is a self-referencing adjacency list (`parent_id`) with name, color, hidden state, soft-delete metadata, and an active sibling-name uniqueness rule. `planner_settings` holds default category, nesting depth, and optional AI provider/model overrides. `projects` owns one category plus description, type, start/deadline dates, status, and progress. `project_members` and `planner_item_assignees` implement many-to-many assignments. `project_documents`, `project_files`, `project_ai_messages`, and `project_ai_tools` belong to a project and cascade only on a permanent project deletion; moving a project to Trash retains its whole workspace for restoration. Local attachment contents are not stored in PostgreSQL or Git.

API reads use the project's category when an item is linked. Categories, projects, and items use `deleted_at` plus a shared `trash_batch_id` for atomic cascade restoration. PostgreSQL 17's built-in `gen_random_uuid()` supplies UUIDs. `schema_migrations` ensures each ordered migration runs once in a transaction.

## Interfaces and integrations

| Method and route | Purpose |
| --- | --- |
| `GET /api/items` | Return all items ordered by due date. |
| `POST /api/items` | Validate and create an item. |
| `PATCH /api/items/:id` | Merge, fully validate, and edit task/deadline fields. |
| `DELETE /api/items/:id` | Move one item to Trash. |
| `GET/POST /api/categories` | Read the active category tree/settings or create a category. |
| `PATCH /api/categories/:id` | Rename, recolor, move, or hide/show a category. |
| `DELETE /api/categories/:id` | Preview impact, then atomically soft-delete a confirmed subtree and affected records. |
| `POST /api/categories/suggest` | Return up to three visible category suggestions from names and saved-item examples. |
| `GET/POST /api/projects` | List or create full project records. |
| `GET/PATCH/DELETE /api/projects/:id` | Load/edit a workspace or move its project and items to Trash. |
| `/api/projects/:id/members[/memberId]` | Create, edit, or remove project members and their assignments. |
| `/api/projects/:id/documents[/documentId]` | Create, sanitize, save, rename, or delete rich-text documents. |
| `/api/projects/:id/files[/fileId][/content]` | Upload, preview, or delete a local attachment linked to a project. |
| `POST /api/projects/:id/ai/chat` | Stream visible answer deltas, then return the persisted ordered message pair and reviewable create/document-edit proposals in the final NDJSON event. |
| `/api/projects/:id/ai/tools[/toolId]` | Create or delete custom project prompt buttons. |
| `GET/PATCH /api/settings/ai` | Read effective provider/model and save a validated selection without exposing keys. |
| `PATCH /api/settings/categories` | Change default category or allowed nesting depth. |
| `GET /api/trash` | List recoverable categories, projects, and items. |
| `POST /api/trash/:batch/restore` | Restore every record in one Trash batch. |

Errors use JSON and meaningful HTTP status codes. SQL values are parameterized. Suggestions are deterministic, private, and local: token overlap against category names and up to 200 recent examples provides lightweight AI-assisted classification without sending planner text to a third party.

## Key decisions

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-08-26 | Use one `planner_items` table for tasks and deadlines. | Shared fields and views outweigh the small type distinction; a constrained `kind` keeps it explicit. |
| 2026-08-26 | Derive dashboard summaries from the item collection. | Avoids duplicated state and keeps counts synchronized after every mutation. |
| 2026-08-26 | Use Next.js Route Handlers and `pg` instead of a separate backend service. | Keeps local setup understandable while retaining a clear UI/API/database boundary. |
| 2026-08-26 | Make schema and seed setup idempotent. | Non-technical users can safely rerun one command without losing work. |
| 2026-08-26 | Use date-relative seed records. | The first dashboard always demonstrates overdue and upcoming states. |
| 2026-08-26 | Keep Python optional and use it for fixture generation. | Meets the requested technology mix without making the ordinary application depend on two servers. |
| 2026-08-26 | Pin local PostgreSQL connections to IPv4 and publish Docker only on `127.0.0.1`. | Prevents Ubuntu `localhost`/IPv6 resolution from reaching a different native PostgreSQL server and avoids exposing the development database beyond the host. |
| 2026-08-26 | Separate connection, schema, and seed diagnostics. | The previous broad catch mislabeled every schema failure as a connection failure and obscured the actionable PostgreSQL error. |
| 2026-08-26 | Model categories as a self-referencing tree with a configurable depth limit. | It provides folder behavior while preserving simple SQL and API traversal. |
| 2026-08-26 | Use soft deletes and shared Trash batch IDs for category cascades. | Users see impact before deletion and can atomically restore a subtree with its projects and items. |
| 2026-08-26 | Resolve project category inheritance at read time. | Moving a project changes the effective category of all linked work without bulk item updates. |
| 2026-08-26 | Keep category suggestions local and deterministic. | It provides useful, testable assistance with no API key, cost, network dependency, or disclosure of task text. |
| 2026-08-26 | Keep category visibility state inside each workspace tab. | It matches calendar-style filtering and prevents a Calendar choice from unexpectedly changing Dashboard or Tasks. |
| 2026-08-26 | Keep tasks and deadlines in one discriminated table with mutually exclusive temporal fields. | Shared metadata stays simple while PostgreSQL guarantees task intervals and deadline due times cannot be mixed. |
| 2026-08-26 | Store display preferences in the browser rather than PostgreSQL. | Theme, motion, and default-view choices are device-specific and should not require database setup or schema changes. |
| 2026-08-26 | Keep AI provider calls and keys behind server Route Handlers. | Provider choice remains configurable without exposing credentials to client JavaScript. |
| 2026-08-26 | Require explicit confirmation for AI-proposed writes. | AI chat can assist with planning while ordinary validated APIs remain the only persistence path. |
| 2026-08-26 | Store attachment metadata in PostgreSQL and bytes locally. | This keeps local setup simple while preserving project links, previews, and safe generated paths. |
| 2026-08-26 | Keep project AI beside the active project content instead of making it another sub-tab. | Users can retain project context and reach AI chat or skills without navigating away from their current work. |
| 2026-08-26 | Apply AI document replacements only after comparison, approval, and version checking. | Users can delegate additions or removals without silent overwrites, stale changes, or AI-triggered deletion. |
| 2026-08-26 | Decode structured provider streaming on the server and expose only display-safe chat events. | Users see progressive answers without receiving provider JSON syntax or unreviewed proposal data. |

## Known limitations and open questions

- Authentication and tenant isolation are not implemented; the MVP is a trusted single-user local application.
- Reminders, recurring tasks, drag-and-drop rescheduling, collaborative editing, and calendar integrations remain future work.
- Project files are local-only and require separate backup/migration. AI reads supported text formats but does not extract image or PDF contents; those formats provide metadata and browser preview only.
- Live provider calls were not verified because no real OpenRouter or DeepSeek key is committed. Provider failures surface in the project chat UI.
- Live PostgreSQL behavior was not exercised in the current environment because PostgreSQL and Docker were unavailable; schema/application integration is build-verified but requires a runtime database smoke test.
- Formal user research, accessibility audit, browser matrix, automated API tests, hosting target, student name, course details, and product screenshots remain `TBD`.

## Recent changes

- 2026-08-26: Implemented the initial Planora MVP with dashboard, monthly calendar, filterable task/deadline list, creation form, completion, reopening, and deletion.
- 2026-08-26: Added validated JSON APIs, a constrained PostgreSQL schema, Docker Compose, idempotent setup, relative-date demo seeding, and an optional Python fixture generator.
- 2026-08-26: Added responsive product styling, setup/error/empty/loading states, locked dependencies, and beginner-focused setup and troubleshooting documentation.
- 2026-08-26: Synchronized the assignment report with the implemented requirements, architecture, verification evidence, and known limitations.
- 2026-08-26: Added terminal-only Ubuntu setup and daily-use instructions, and made the optional Python npm utility use Ubuntu's `python3` command.
- 2026-08-26: Hardened local PostgreSQL authentication with explicit IPv4 routing, env migration, health waiting, startup retries, configuration-aware pool refresh, safe endpoint diagnostics, and six unit tests; removed the unnecessary `pgcrypto` setup privilege.
- 2026-08-26: Added nested, colored, movable and hideable categories; configurable default/depth settings; subtree filters; project category inheritance with a seeded example project; impact-confirmed cascade Trash and batch restoration; private local category suggestions; transactional migrations; responsive management UI; and category-domain tests.
- 2026-08-26: Replaced the global sidebar category filter with responsive, Canvas-style checkbox filters whose selections remain independent across Dashboard, Calendar, and Tasks & deadlines; retained category management in the sidebar.
- 2026-08-26: Moved Calendar's category filter into a sticky right-hand rail above Coming soon, with a below-calendar fallback on narrower layouts so the month grid remains first.
- 2026-08-26: Added the MVP task/deadline field model, kind-specific camelCase API mapping, temporal validation and database constraint, compatibility migration for existing items, interval-aware calendar behavior, edit controls, create/edit forms, updated seed fixtures, and five item-domain tests.
- 2026-08-26: Corrected the task/deadline compatibility migration to remove the legacy `due_at NOT NULL` and temporal constraints before converting task timestamps; preserved existing interval values, added a migration-order regression test, and made setup identify the failing migration by name.
- 2026-08-26: Added Day, Week, and Month calendar modes with period-aware navigation and responsive agendas; changed Calendar's category rail into a height-limited vertical tree whose parent folders can expand or collapse; added category-tree and calendar-range tests.
- 2026-08-26: Scoped Calendar's vertical overflow to the category checkbox tree only, leaving the overall right rail and Coming soon panel fully visible without a second scrollbar.
- 2026-08-26: Added a top-right Settings dialog with persistent Paper, Ocean, and Night themes, a configurable default Calendar mode, reduced-motion support, responsive controls, and preference validation tests.
- 2026-08-26: Added the full Project workspace with Overview, manual-save sanitized Documents, local Files, members and many-assignee project work, project-scoped AI chat/tools, review-before-write proposals, OpenRouter/DeepSeek server abstraction and Settings, migration/seed support, responsive states, and project/AI/file tests.
- 2026-08-26: Replaced the browser-native new-document prompt with a centered, responsive Planora dialog that validates names and reports creation progress or errors.
- 2026-08-26: Replaced internal browser-native unsaved-document confirmations with one accessible Planora warning used for document, sub-tab, and project navigation; retained the mandatory native browser warning for page unloads.
- 2026-08-26: Redesigned Projects as a responsive three-area workspace with vertical non-AI navigation, a focused central work surface, and persistent project AI chat and skills on the right.
- 2026-08-26: Corrected deterministic chat ordering, added optimistic messages and an accessible thinking animation without workspace reloads, and enabled project-aware AI document additions/removals through compared, version-checked, user-approved replacement proposals.
- 2026-08-26: Added end-to-end streamed AI answers with an in-message cursor, server-side structured-message extraction, NDJSON completion/review events, plain-text fallback streaming, and a readable recovery for malformed output that previously appeared as raw `{"`.

## Maintenance contract

After every material code change, reconcile this document with the code and add a concise dated entry under `Recent changes`. Update existing sections in place so this file describes the current project rather than accumulating contradictory history. Follow the complete workflow in `AGENTS.md`.
