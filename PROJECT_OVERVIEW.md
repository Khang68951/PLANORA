# Project Planora Overview

> Agent-facing project context. Every coding agent must read this file before implementation and update it after material code changes.

## Project summary

Planora is a single-user planning application for people who may have no technical background. It combines tasks and deadlines in a calm day/week/month calendar, a filterable list, an urgency dashboard, and complete project workspaces with people, documents, files, and contextual AI.

## Current status

- Phase: functional MVP
- Application: Next.js 16 App Router, JavaScript, React, and Tailwind CSS
- Persistence: PostgreSQL through `pg`
- Core behavior: task/deadline CRUD, nested categories and filters, full project workspaces, many-member assignments, rich-text documents, local attachments, a Planora-routed Gemini/OpenRouter/DeepSeek workflow with auditable commands and three approval modes, category inheritance, recoverable Trash, and local category suggestions
- Setup: Docker Compose plus an idempotent, diagnostic Node.js schema/seed script
- Verification: 57 domain unit tests, clean ESLint, and an optimized Next.js build containing 24 dynamic API routes

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

1. Review urgent, overdue, upcoming, and completed counts on the dashboard, with assigned PIC members visible directly in the Priority queue.
2. Switch the calendar between focused day, Sunday-first week, and six-week month modes; navigate by the active period and select a day to create an item.
3. Create or edit a task with a start/end interval, or a deadline with one due time, plus title, optional notes, status, priority, category or category-bearing project; ask for up to three category suggestions.
4. Independently choose the visible categories in Dashboard, Calendar, and Tasks & deadlines using Canvas-style checkboxes. Calendar also filters independently by project, including work with no project. Its sticky right rail keeps separately scrollable category and project lists on wide screens, with arrows to collapse or expand category folders that contain children; manage nested folders, colors, hidden state, the default category, and nesting depth separately.
5. Preview the complete cascade impact before moving a category subtree to Trash, then restore the entire batch if needed.
6. Search or filter items, see assigned PIC members on applicable rows, mark work complete, reopen it, or move it to Trash.
7. Open the top-right Settings dialog to choose Paper, Ocean, or Night appearance, a default Calendar mode, and reduced motion; preferences persist on the current device.
8. Create a project with category, type, dates, status, and progress, then use the left rail for Overview, Documents, Files, Tasks & Deadlines, and Members while project AI chat remains available in the right rail; the earlier AI Skills surface is temporarily hidden pending redesign.
9. Save sanitized rich-text documents manually or with Ctrl+S, with warnings before unsaved work is abandoned; upload and preview local project attachments.
10. Optionally choose zero, one, or many project members as a task/deadline's PIC, manually or through validated AI commands, and ask project AI about only that project's data. Choose whether every AI command, only changing/destructive commands, or most commands require confirmation; active commands appear as compact transient rows inside chat, while AI document text edits appear automatically inside the target document and require approval. Completed rows disappear without removing their PostgreSQL audit records.

## Architecture

The browser renders the client-side planner shell in `components/PlannerApp.jsx`, project UI in `components/ProjectWorkspace.jsx`, and folder manager in `components/CategoryPanel.jsx`. It fetches JSON from Next.js Route Handlers under `app/api`. Route handlers validate user input and use parameterized SQL through the shared `pg` pool in `lib/db.js`. PostgreSQL owns structured planner data; project attachment bytes are stored beneath `storage/projects` with safe generated names and PostgreSQL metadata. Project-linked items expose and display an effective category using `COALESCE(project.category_id, item.category_id)`, so changing a project's category is inherited without rewriting its tasks. Project work mutations refresh both the local workspace and PlannerApp's shared item collection, keeping Calendar and Tasks & deadlines synchronized without a full page reload. The Projects introduction is shown whenever no project is selected; an open project removes that large heading to maximize vertical working space. A non-destructive Close action clears only client selection and returns to the heading plus a project picker, while the existing unsaved-document guard still applies. The open project UI uses a responsive three-area workspace: non-AI navigation on the left, the active work surface in the center, and project-scoped AI chat on the right. All three columns begin on the same horizontal line; on wide screens only the two side boxes follow page scrolling while the middle remains in normal flow, and narrower stacked layouts disable sticky positioning.

```text
Browser UI -> Next.js APIs -> validation/provider boundary -> PostgreSQL + local project files
                                                   \-> Gemini, OpenRouter, or DeepSeek
```

The dashboard and calendar are projections of the same item collection returned by the API; there are no duplicated dashboard tables. Task placement uses its start/end interval (including every intersected calendar day), while deadlines use `dueAt`. Pure date helpers generate and navigate the day, week, and month ranges and apply Calendar's project selection, including the explicit no-project group. Each tab keeps its own in-memory category selection, while Calendar separately keeps project selection and category-tree expansion state, so either Calendar filter leaves Dashboard and Tasks & deadlines unchanged. Validated appearance, default-view, and motion preferences use browser-local storage because they belong to the device rather than PostgreSQL planner records. Optimistic completion and deletion keep interactions quick, with rollback when a request fails.

Project AI is server-only and workflow-controlled. `lib/ai-workflow.js` deterministically routes each request to document, file, work, member, and/or project scopes and selects only their relevant context and command catalog entries. The configured Gemini, OpenRouter, or DeepSeek provider then serves two isolated roles: the first call streams only the concise user-facing answer, and the second internal call converts the request into a complete command-only plan. The planner is forbidden from inventing IDs or creating cross-command dependencies; creating and initially writing a Documents-tab document must be one `documents.create` command, while uploaded attachments remain distinct Files resources. Safe defaults and relative dates are inferred, while genuinely missing user-controlled information returns one concise `clarificationQuestion`; recent chat history lets the next answer complete the original plan. The internal planner receives a 6,000-token allowance so a proposal plus multiple work commands is less likely to be truncated. Both calls use provider-native JSON mode. Planora then normalizes known variants, allowlist-filters, validates, audits, and applies or queues each action; neither AI role has database access. Workflow events expose Route, Context, Provider, Validate, and Review/Complete stages to the client. Provider keys and internal command output never enter client bundles or visible chat.

The client adds the outgoing message optimistically, displays an accessible animated thinking bubble until the first text arrives, appends streamed fragments with a cursor, and replaces temporary rows with the persisted message pair without refetching the workspace. Stable role-aware ordering keeps user messages before their paired assistant replies even when PostgreSQL gives both rows the same timestamp. The composer grows automatically from one line to a 180px limit and then scrolls internally, with no manual resize grip. The server streams a command's `running` or `pending` state before execution so the conversation can name its actual activity, such as Reading, Creating, Editing, Adding or Removing text, Assigning, Updating, or Deleting. Automatic reads briefly remain visible without controls; pending commands remain until a decision, and terminal states remove the row while the database ledger remains durable.

AI output contains validated commands from a fixed server registry rather than unrestricted SQL or client-side mutations. Read commands cover project search, documents, supported text files, work, and members. Change commands cover project metadata, documents, work, PIC assignments, members, and roles. `work.create` accepts optional validated `assigneeIds` for zero, one, or many existing member PICs; `work.assign` replaces PICs on existing work, and aliases such as `picIds` are normalized before validation. Destructive commands move documents, files, work, or members out of active use and return an Undo record; permanent AI deletion is unavailable. Every command is persisted in `project_ai_commands` with its arguments, safety class, mode, status, result, and error. `approve_all` queues every command, the default `approve_changes` automatically runs reads but queues changes and destructive actions, and `auto` runs most commands after a centered warning. `documents.update`, `documents.insert`, and `documents.remove` are invariant exceptions: before a pending command is stored, the server applies it to the complete current document, sanitizes the result, and stores that exact preview. Multiple edits to one document are folded into one atomic comparison. The target document then opens automatically with a bounded highlighted diff and explicit Approve/Discard controls; approval applies the same preview that was shown. Insertion supports start, end, or the first exact before/after anchor; removal targets exact source text and a 1-based occurrence. Document and work edits carry the reviewed version so later human changes cannot be silently overwritten.

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
| `components/ProjectWorkspace.jsx` | Responsive three-area project workspace, vertical sub-tabs, synchronized project work, documents, files, members, assignments, persistent AI chat with composer controls, and central highlighted AI document review. |
| `components/CategoryPanel.jsx` | Category-management launcher, responsive manager, settings, impact warning, and Trash UI. |
| `lib/db.js` | Reused PostgreSQL connection pool. |
| `lib/database-url.mjs` | Validates database URLs and normalizes local `localhost` connections to explicit IPv4. |
| `lib/items.js` | Allowed values, input validation, and shared SQL column list. |
| `lib/projects.js` | Project/member/document/assignee validation, document sanitization, and project mapping. |
| `lib/ai.js` | Gemini/OpenRouter/DeepSeek abstraction, effective settings, server requests, and structured-result parsing. |
| `lib/ai-workflow.js` | Deterministic request routing, context scoping, and per-request command allowlisting before provider reasoning. |
| `lib/ai-commands.js` | Allowlisted project AI command registry, validation, permission decisions, project-scoped execution, and recoverable undo. |
| `lib/document-diff.js` | Bounded readable-text conversion and word-level chunks for safe inline AI document comparison. |
| `lib/document-insertion.js` | Deterministic start/end/before/after placement for reviewed AI rich-text fragments. |
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
- `GEMINI_API_KEY`, `GEMINI_MODEL`: server-only Gemini credentials/model; model defaults to `gemini-2.5-flash`.
- `AI_PROVIDER`: environment provider default, now `gemini`. Settings and the chat composer can select only provider/model pairs declared in the environment with their corresponding API key configured; the validated PostgreSQL selection overrides the default.
- `.env.local`: generated with local defaults by `npm run db:setup` on Ubuntu or `npm.cmd run db:setup` on Windows; ignored by source control.
- `.env.example`: safe example configuration.

No production environment has been configured. The included database credentials are local-development defaults only.

## Data model and storage

`planner_items` uses `kind` as a discriminant. Tasks require `start_at` and `end_at` with `end_at > start_at` and must not contain `due_at`; deadlines require `due_at` and must not contain task interval fields. Both share UUID `id`, title, nullable description, status, priority, assigned category, nullable project, and created/updated timestamps. The JSON API exposes these as camelCase (`startAt`, `endAt`, `dueAt`, `categoryId`, `projectId`, `createdAt`, `updatedAt`).

`categories` is a self-referencing adjacency list (`parent_id`) with name, color, hidden state, soft-delete metadata, and an active sibling-name uniqueness rule. `planner_settings` holds default category, nesting depth, and optional AI provider/model overrides. `projects` owns one category plus description, type, start/deadline dates, status, progress, and AI command mode. `project_members` and `planner_item_assignees` implement many-to-many assignments. `project_documents`, `project_files`, `project_ai_messages`, `project_ai_tools`, and `project_ai_commands` belong to a project and cascade only on a permanent project deletion; moving a project to Trash retains its whole workspace for restoration. Members, documents, and file metadata have active/soft-deleted states for recoverable AI removal. Local attachment contents are not stored in PostgreSQL or Git.

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
| `POST /api/projects/:id/ai/chat` | Stream visible answer deltas and persisted command activity, then return the ordered message pair and normalized commands in the final NDJSON event. |
| `PATCH /api/projects/:id/ai/mode` | Save `approve_all`, `approve_changes`, or `auto` for one project. |
| `PATCH /api/projects/:id/ai/commands/:commandId` | Approve, discard, or undo a persisted project AI command. |
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
| 2026-08-26 | Put AI capabilities behind a fixed command registry and configurable permission policy. | Strict, balanced, and automatic modes serve different trust levels while server validation, an audit ledger, stale-write guards, soft deletion, and Undo remain consistent. |
| 2026-08-26 | Store attachment metadata in PostgreSQL and bytes locally. | This keeps local setup simple while preserving project links, previews, and safe generated paths. |
| 2026-08-26 | Keep project AI beside the active project content instead of making it another sub-tab. | Users can retain project context and reach AI chat or skills without navigating away from their current work. |
| 2026-08-26 | Apply AI document replacements only after comparison, approval, and version checking. | Users can delegate additions or removals without silent overwrites, stale changes, or AI-triggered deletion. |
| 2026-08-26 | Decode structured provider streaming on the server and expose only display-safe chat events. | Users see progressive answers without receiving provider JSON syntax or unreviewed proposal data. |
| 2026-08-27 | Put a deterministic Planora workflow around every project-AI provider request. | Providers receive only routed context and command choices, while Planora retains validation, persistence, and approval authority. |

## Known limitations and open questions

- Authentication and tenant isolation are not implemented; the MVP is a trusted single-user local application.
- Reminders, recurring tasks, drag-and-drop rescheduling, collaborative editing, and calendar integrations remain future work.
- Project files are local-only and require separate backup/migration. AI reads supported text formats but does not extract image or PDF contents; those formats provide metadata and browser preview only.
- Live provider calls were not verified because no real Gemini, OpenRouter, or DeepSeek key is committed. Provider failures surface in the project chat UI.
- Live PostgreSQL behavior was not exercised in the current environment because PostgreSQL and Docker were unavailable; schema/application integration is build-verified but requires a runtime database smoke test.
- Project context is assembled before the provider call, so command approval controls execution inside Planora rather than acting as a provider data-disclosure consent boundary.
- Formal user research, accessibility audit, browser matrix, automated API tests, hosting target, student name, course details, and product screenshots remain `TBD`.

## Recent changes

- 2026-08-27: Extended the optional PIC-name display from Dashboard's Priority queue to the main Tasks & deadlines list while leaving unassigned rows unchanged.

- 2026-08-27: Added optional PIC names to Dashboard Priority queue rows using the existing project-member assignments, without adding noise to unassigned items or other compact views.

- 2026-08-27: Top-aligned the three open-Project workspace columns while keeping only the left navigation and right AI boxes sticky during desktop scrolling; non-scrolling horizontal clipping preserves sticky behavior, the middle remains in normal flow, and responsive stacked layouts stay non-sticky.

- 2026-08-27: Added an independent Canvas-style Project checkbox filter to Calendar's right rail, including explicit No project handling, isolated Calendar-only state, bounded scrolling, and filtering tests.

- 2026-08-27: Removed page-level horizontal overflow from the Project workspace by constraining its three-column shell and nested project, document, file, task, member, and AI panels while preserving intentional tab scrolling on small screens.

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
- 2026-08-26: Added a 22-command project AI registry, persisted command ledger, per-project Approve everything/Approve changes/Auto modes, per-command review and status UI, stale-write protection, recoverable AI removal with Undo, soft-deleted resource filtering, two command APIs, migration coverage, and command policy tests.
- 2026-08-26: Expanded the submission report with a navigable product-capabilities section that maps six user problems to concrete Planora functions and outcomes, follows a five-step end-to-end user journey, and corrects stale API and AI-safety descriptions.
- 2026-08-27: Moved AI document replacement comparison from the narrow chat rail into the central Documents workspace with word-level addition/removal highlighting, full-page Approve/Discard controls, bounded diff tests, stale-write protection, and mandatory human approval even in Auto mode.
- 2026-08-27: Added Gemini as a server-only streaming project-AI provider, exposed it in Settings, added safe environment defaults and database validation, and retained OpenRouter and DeepSeek as selectable alternatives.
- 2026-08-27: Added a positional `documents.insert` AI command and automatic in-document proposal display, so additions can target the start, end, or an exact before/after anchor and users accept or reject them inside Documents without a separate reveal action.
- 2026-08-27: Normalized provider `<|tool_code|>` output into validated Planora commands without exposing command syntax in chat and added malformed-block recovery.
- 2026-08-27: Added a five-stage Planora AI workflow with deterministic intent routing, scoped context, per-request command allowlisting, streamed progress, and a mandatory-review `documents.remove` command that targets exact text by occurrence.
- 2026-08-27: Repaired invalid provider-escaped HTML inside structured command JSON and added a no-false-approval guard when a model describes a review but no valid command is accepted.
- 2026-08-27: Audited the project-AI boundary end to end: enabled provider JSON-output modes, normalized common command variants with visible rejection reasons, materialized and sanitized exact full-document previews before approval, combined same-document edits atomically, prevented truncated-context overwrites, and added a capped auto-growing chat composer.
- 2026-08-27: Expanded the submission report with a responsive AI approval-flow visualization, exact highlighted-preview example, corrected 53-test metrics, provider structured-output references, and synchronized implementation, evidence, results, and update-date claims.
- 2026-08-27: Made the Projects introduction conditional so it yields its vertical space whenever a project is open, while preserving project creation through a compact New action in the workspace selector.
- 2026-08-27: Moved active AI commands into compact transient chat rows with human-readable Reading/Writing/Updating labels, streamed pre-execution visibility, inline decisions, automatic document-review opening, and removal after completion or rejection while retaining the PostgreSQL audit ledger.
- 2026-08-27: Corrected transient AI command labels so create, text insertion/removal, rename, assignment, edit, and delete operations describe their actual action instead of appearing as generic document writing.
- 2026-08-27: Split project AI into a streamed conversational role and a second internal command-planner role, with explicit Documents-versus-Files semantics and dependency-free creation rules that combine a new document's title and initial body into one command.
- 2026-08-27: Replaced command-planning refusals with context-preserving clarification questions, added safe inference rules for relative schedules, prevented partial execution of invalid plans, and raised the internal planner output allowance for document-plus-work requests.
- 2026-08-27: Displayed inherited categories on project work, synchronized manual and AI project mutations with shared Calendar/list state, temporarily hid AI Skills pending redesign, and moved approval mode plus environment-only model selection into the chat composer.
- 2026-08-27: Removed horizontal overflow from project chat by constraining the rail, messages, composer, and compact selectors; long text and model names now wrap or truncate within the available width.
- 2026-08-27: Exposed the existing many-member work assignment as optional PIC throughout project task/deadline UI and taught AI creation/assignment commands to normalize and validate zero, one, or many PIC member IDs.
- 2026-08-27: Added a non-destructive Close Project action that clears only the active client selection, restores the Projects heading and reopen picker, and honors unsaved-document warnings without modifying stored data.

## Maintenance contract

After every material code change, reconcile this document with the code and add a concise dated entry under `Recent changes`. Update existing sections in place so this file describes the current project rather than accumulating contradictory history. Follow the complete workflow in `AGENTS.md`.
