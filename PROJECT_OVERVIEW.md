# Project Planora Overview

> Agent-facing project context. Every coding agent must read this file before implementation and update it after material code changes.

## Project summary

Planora is a single-user planning application for people who may have no technical background. It combines tasks and deadlines in a calm day/week/month calendar, a filterable list, an urgency dashboard, and complete project workspaces with people, documents, files, and contextual AI.

## Current status

- Phase: functional MVP
- Application: Next.js 16 App Router, JavaScript, React, and Tailwind CSS
- Persistence: PostgreSQL through `pg`
- Core behavior: task/deadline CRUD, nested standalone categories, independent project filters and full project workspaces, many-member assignments, rich-text documents, local attachments, a Planora-routed Gemini/OpenRouter/DeepSeek workflow with auditable commands and three approval modes, recoverable Trash with confirmed permanent deletion, and local category suggestions
- Setup: Docker Compose plus an idempotent, diagnostic Node.js schema/seed script
- Verification: 84 domain/unit checks, clean ESLint, an optimized Next.js build containing 27 dynamic API routes, and migration 006 applied successfully to PostgreSQL

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
3. Create or edit a task with a start/end interval, or a deadline with one due time, plus title, optional notes, status, priority, and either a standalone category or project; ask for up to three category suggestions only for standalone work.
4. Filter Calendar with compact, collapsible category and project controls in its secondary right rail. Category management lives in Settings rather than appearing as a primary workspace.
5. Preview category-deletion impact on standalone work and choose a replacement classification before moving only the category subtree to Trash; projects remain a separate visible organization type.
6. Use the Tasks & deadlines toolbar for search, quick kind/overdue choices, detailed status/time/priority/category/project/PIC filters, removable chips, result count, and every supported sort order. Filter state persists in the URL.
7. Open the dedicated top-right Trash dialog to inspect grouped deleted records, restore a complete deletion batch, or permanently remove one only after a non-recoverable impact warning; open Settings to choose appearance, default Calendar mode, and reduced motion.
8. Create a project with type, dates, status, and progress, then use the left rail for Overview, Documents, Files, Tasks & Deadlines, and Members while project AI chat remains available in the right rail; the earlier AI Skills surface is temporarily hidden pending redesign.
9. Save sanitized rich-text documents manually or with Ctrl+S, with warnings before unsaved work is abandoned; upload and preview local project attachments.
10. Optionally choose zero, one, or many project members as a task/deadline's PIC, manually or through validated AI commands. One AI prompt creates one compact approval run in chat, while its complete command list, group decisions, progress, individual errors, and document-specific review actions use a spacious review drawer. AI document text edits still appear as highlighted comparisons in the target document and always require explicit approval.

## Architecture

The browser renders the planner shell in `components/PlannerApp.jsx`, the focused task workspace in `components/planner/TasksView.jsx`, project UI in `components/ProjectWorkspace.jsx`, the project approval drawer in `components/project/AIApprovalReview.jsx`, and category management in `components/CategoryPanel.jsx`. `usePlannerData`, `useItemMutations`, and `useTaskFilters` keep loading, mutations, and URL-backed selection logic outside presentation components; `lib/api-client.js` provides a shared structured browser API boundary. Next.js Route Handlers validate input and use parameterized SQL through `lib/db.js`. PostgreSQL owns structured planner data; project attachment bytes remain beneath `storage/projects`. Project-tab lists load only for the selected sub-tab, and full document HTML loads only after one document opens. The UI treats project membership and standalone categories as separate organization dimensions: category controls and labels are omitted for project work, and category filtering bypasses project-linked records while Project filters control them. Legacy non-null category references remain internally for schema compatibility. Shared refresh keeps Calendar and Tasks & deadlines synchronized without a page reload. The responsive project UI retains non-AI navigation left, selected content center, and project AI right. Project creation and unsaved-warning overlays render outside the transformed wide-workspace container so their fixed positioning and pointer interaction remain viewport-bound in both open and closed states.

```text
Browser UI -> Next.js APIs -> validation/provider boundary -> PostgreSQL + local project files
                                                   \-> Gemini, OpenRouter, or DeepSeek
```

The dashboard and calendar are projections of the same item collection returned by the API; there are no duplicated dashboard tables. Task placement uses its start/end interval, while deadlines use `dueAt`. Pure selectors in `lib/task-selectors.js` own date boundaries, combined filtering, relative labels, all sort modes, and URL serialization. `lib/item-query.js` mirrors scalable parameterized search/filter/sort/pagination on the server. No full-text search index is added yet because current workspaces are small and use `ILIKE`; the new partial schedule and updated-time indexes directly support implemented active-item queries. Calendar independently keeps project/category selection in compact disclosures. Validated display preferences remain browser-local. Optimistic completion and deletion roll back on request failure, and item edits use `updatedAt` stale-write checks.

Project AI is server-only and workflow-controlled. `lib/ai-workflow.js` routes each message before querying context, then selects only required document, file, work, member, and/or project scopes. Pure conversation defaults to lightweight project metadata; file bytes are read only for file requests, document bodies only for document requests, and the command-planner call is skipped when wording cannot produce a command. Gemini, OpenRouter, or DeepSeek still serve isolated conversation and internal-planner roles for actionable requests. Requests have a 90-second provider timeout, propagate cancellation, and return clear timeout, cancellation, configuration, or provider errors. Planora normalizes, allowlist-filters, validates, audits, and applies or queues actions; neither AI role receives database access.

The client adds the outgoing message optimistically, displays an accessible animated thinking bubble until the first text arrives, appends streamed fragments with a cursor, and replaces temporary rows with the persisted message pair without refetching the workspace. Stable role-aware ordering keeps user messages before their paired assistant replies even when PostgreSQL gives both rows the same timestamp. The composer grows automatically from one line to a 180px limit and then scrolls internally, with no manual resize grip. The server streams a command's `running` or `pending` state before execution so the conversation can name its actual activity, such as Reading, Creating, Editing, Adding or Removing text, Assigning, Updating, or Deleting. Automatic reads briefly remain visible without controls; pending commands remain until a decision, and terminal states remove the row while the database ledger remains durable.

AI output contains validated commands from a fixed registry rather than unrestricted SQL or client mutations. Every prompt is persisted once in `project_ai_runs`; its individual `project_ai_commands` reference that run instead of duplicating request text. Compact chat summaries show resource counts and progress, while a full review drawer exposes every command—without the former six-command display limit—plus individual decisions, group rejection, eligible batch approval, and per-command errors. Batch rejection is transactional; batch approval deliberately executes independently auditable commands in sequence and reports honest partial outcomes. Document changes are excluded from approve-all and retain their exact highlighted in-document comparison. Run history is paginated, stale group decisions are rejected with `updatedAt`, and every command retains its safety, mode, arguments, result, error, and audit status.

## Project map

| Path | Responsibility |
| --- | --- |
| `app/page.js` | Application entry point. |
| `app/globals.css` | Tailwind import, design tokens, responsive product styling. |
| `app/api/items/` | Item list/create/update and soft-delete endpoints. |
| `app/api/categories/` | Category CRUD, impact preview, transactional work reassignment, category-only Trash/restore, and suggestions. |
| `app/api/projects/` | Project CRUD, lazy workspace resources, members, documents, files, AI chat, grouped runs, and tools. |
| `app/api/settings/categories/` | Default category and nesting-depth settings. |
| `app/api/settings/ai/` | Provider/model selection and non-secret key-status reporting. |
| `app/api/trash/` | Trash inventory, atomic batch restoration, and confirmed transactional permanent deletion. |
| `components/PlannerApp.jsx` | Planner shell, Dashboard/Calendar orchestration, item form, global Trash, and Settings. |
| `components/planner/TasksView.jsx` | Responsive task toolbar, filter surface, chips, sorting, count, and detailed rows. |
| `components/ProjectWorkspace.jsx` | Responsive three-area project workspace and lazy sub-tab coordination. |
| `components/project/AIApprovalReview.jsx` | Spacious grouped AI command review, progress, and group/individual decisions. |
| `components/CategoryPanel.jsx` | Settings-owned category manager, replacement warning, defaults, and nesting. |
| `hooks/` | Shared planner loading/mutations and URL-persisted task filtering. |
| `lib/db.js` | Reused PostgreSQL connection pool. |
| `lib/database-url.mjs` | Validates database URLs and normalizes local `localhost` connections to explicit IPv4. |
| `lib/items.js` | Allowed values, input validation, and shared SQL column list. |
| `lib/projects.js` | Project/member/document/assignee validation, document sanitization, and project mapping. |
| `lib/ai.js` | Gemini/OpenRouter/DeepSeek abstraction, effective settings, server requests, and structured-result parsing. |
| `lib/ai-workflow.js` | Deterministic request routing, context scoping, and per-request command allowlisting before provider reasoning. |
| `lib/ai-commands.js` | Allowlisted project AI command registry, validation, permission decisions, project-scoped execution, and recoverable undo. |
| `lib/ai-runs.js` | Group summaries, progress, batch eligibility, and truthful aggregate statuses. |
| `lib/ai-batch.js` | Sequential, independently auditable approval execution with explicit partial/skip outcomes. |
| `lib/api-client.js`, `lib/http.js` | Shared browser requests plus structured server JSON parsing/errors. |
| `lib/task-selectors.js`, `lib/item-query.js` | Pure client selectors and parameterized server list query construction. |
| `lib/trash.js` | Groups recoverable records, builds permanent-delete warnings, and transactionally purges one Trash batch. |
| `lib/category-deletion.js` | Transactional category reassignment and category-only Trash operation. |
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

`categories` remains a compatible self-referencing adjacency list and is presented as a standalone-work classification. Deleting a subtree locks the relevant categories, maintains required legacy references with a chosen/default replacement, updates the configured default if necessary, and soft-deletes only categories in one transaction. `planner_settings` holds default category, nesting depth, and optional AI provider/model overrides. `projects` retains an internal compatibility category reference but presents description, type, dates, status, progress, and AI command mode independently. Project creation resolves that compatibility reference from the active configured default on the server; the browser form neither displays nor submits a category. `project_members` and `planner_item_assignees` implement many-to-many assignments. `project_documents`, `project_files`, `project_ai_messages`, `project_ai_tools`, `project_ai_runs`, and `project_ai_commands` belong to a project. Local attachment contents are not stored in PostgreSQL or Git.

API reads retain compatibility category fields, but browser presentation and filtering ignore them when an item is project-linked. Categories, projects, and items use `deleted_at` plus a shared `trash_batch_id` for atomic cascade restoration. PostgreSQL 17's built-in `gen_random_uuid()` supplies UUIDs. `schema_migrations` ensures each ordered migration runs once in a transaction.

## Interfaces and integrations

| Method and route | Purpose |
| --- | --- |
| `GET /api/items` | Paginated item search/filter/sort with validated kind, status, priority, category, project, PIC, date, and ordering parameters. |
| `POST /api/items` | Validate and create an item. |
| `PATCH /api/items/:id` | Merge, fully validate, and edit fields with optional `expectedUpdatedAt` concurrency protection. |
| `DELETE /api/items/:id` | Move one item to Trash. |
| `GET/POST /api/categories` | Read the active category tree/settings or create a category. |
| `PATCH /api/categories/:id` | Rename, recolor, move, or hide/show a category. |
| `DELETE /api/categories/:id` | Preview impact, select/fall back to an active replacement, atomically reassign work/projects, then Trash only the category subtree. |
| `POST /api/categories/suggest` | Return up to three visible category suggestions from names and saved-item examples. |
| `GET/POST /api/projects` | List or create full project records. |
| `GET/PATCH/DELETE /api/projects/:id` | Load selected `include` resources lazily, edit a project, or move its project/items to Trash. |
| `/api/projects/:id/members[/memberId]` | Create, edit, or remove project members and their assignments. |
| `/api/projects/:id/documents[/documentId]` | Create, sanitize, save, rename, or delete rich-text documents. |
| `/api/projects/:id/files[/fileId][/content]` | Upload, preview, or delete a local attachment linked to a project. |
| `POST /api/projects/:id/ai/chat` | Route before context, stream visible deltas/workflow, persist one AI run plus commands, and return its compact group model in the final NDJSON event. |
| `PATCH /api/projects/:id/ai/mode` | Save `approve_all`, `approve_changes`, or `auto` for one project. |
| `PATCH /api/projects/:id/ai/commands/:commandId` | Approve, discard, or undo a persisted project AI command. |
| `GET /api/projects/:id/ai/runs` | Paginate grouped prompt/approval history with full command progress. |
| `GET/PATCH /api/projects/:id/ai/runs/:runId` | Load one approval group or approve eligible/reject pending commands with stale-review protection. |
| `/api/projects/:id/ai/tools[/toolId]` | Create or delete custom project prompt buttons. |
| `GET/PATCH /api/settings/ai` | Read effective provider/model and save a validated selection without exposing keys. |
| `PATCH /api/settings/categories` | Change default category or allowed nesting depth. |
| `GET /api/trash` | List recoverable categories, projects, and items. |
| `DELETE /api/trash/:batch` | Permanently delete one Trash batch and project-owned data, then clean up local attachments. |
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
| 2026-08-26 | Use soft deletes and shared Trash batch IDs for the original category cascade. | Superseded on 2026-08-27 by safe reassignment so deleting a classification never removes active work. |
| 2026-08-26 | Resolve legacy project category references at read time. | This preserves storage compatibility; the 2026-08-27 user-facing model now hides those references and organizes project work independently. |
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
| 2026-08-27 | Treat categories as classifications and reassign references before deletion. | Removing a label cannot unexpectedly remove tasks, deadlines, or projects from active work. |
| 2026-08-27 | Group AI commands by one durable run per user prompt. | Chat stays compact while complete audit, progress, batch decisions, document exceptions, and partial failures remain visible. |
| 2026-08-27 | Lazy-load project resources by selected sub-tab. | Opening a project no longer transfers every document body, attachment list, member, and work record at once. |
| 2026-08-27 | Separate projects from categories in the user-facing organization model. | Category filters classify standalone work only; project membership, labels, and filters organize project work without redundant category UI. |

## Known limitations and open questions

- Authentication and tenant isolation are not implemented; the MVP is a trusted single-user local application.
- Reminders, recurring tasks, drag-and-drop rescheduling, collaborative editing, and calendar integrations remain future work.
- Project files are local-only and require separate backup/migration. AI reads supported text formats but does not extract image or PDF contents; those formats provide metadata and browser preview only.
- Live provider calls were not verified because no real Gemini, OpenRouter, or DeepSeek key is committed. Provider failures surface in the project chat UI.
- Migration 006 and idempotent database setup were exercised against PostgreSQL at `172.22.0.2/32`; full browser CRUD and destructive category smoke tests were intentionally not run against the user's existing records.
- Approval controls execution inside Planora rather than acting as provider-data consent. Routing now precedes context loading and minimizes disclosed scopes, but any context selected for the answer still goes to the configured provider.
- Formal user research, accessibility audit, browser matrix, automated API tests, hosting target, student name, course details, and product screenshots remain `TBD`.

## Recent changes

- 2026-08-28: Tightened the submission report's interactive Design architecture panel by reducing its vertical footprint and replacing dense layer descriptions with concise, evidence-preserving summaries.
- 2026-08-28: Added per-batch Delete forever controls inside Trash with a styled irreversible-action confirmation, transactional dependent-record cleanup, project attachment removal, explicit cleanup warnings, and permanent-deletion tests.
- 2026-08-27: Restored clickable project creation after Close by moving project dialog layers outside the transformed wide-workspace container; expanded the submission report with a nine-part capability map and an evidence-based eight-stage journey from the original calendar concept through the planner, project, AI, safety, and refinement extensions.
- 2026-08-27: Fixed creating a project after closing the current workspace by removing the stale hidden category dependency from the browser form and resolving the required legacy compatibility category from the configured active default on the server.

- 2026-08-27: Refactored planner data and item mutations into shared hooks/API helpers; added a feature-owned Tasks & deadlines workspace with pure tested URL filters, every requested sorting mode, responsive progressive disclosure, detailed accessible rows, and server-side query/pagination support.
- 2026-08-27: Demoted categories to Settings and compact Calendar filtering; category deletion now transactionally reassigns active work/projects to a replacement before moving only the category subtree to Trash.
- 2026-08-27: Added migration 006 with grouped `project_ai_runs`, command relationships, query-backed partial indexes, and consistent `updated_at` triggers; added paginated run APIs, stale group checks, group approve/reject, complete command visibility, and central review UI.
- 2026-08-27: Routed AI messages before context loading, skipped planner calls for non-actionable conversation, restricted document/file loading by scope, added provider cancellation/timeout errors, lazy-loaded project-tab resources and opened document bodies, and grew verification from 57 to 78 checks plus 26 built API routes.

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
- 2026-08-26: Added nested, colored, movable and hideable categories; configurable defaults/depth; inheritance, suggestions, and the original cascade Trash design. The 2026-08-27 safe-reassignment update supersedes that original deletion behavior.
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
- 2026-08-27: Synchronized manual and AI project mutations with shared Calendar/list state, temporarily hid AI Skills pending redesign, and moved approval mode plus environment-only model selection into the chat composer.
- 2026-08-27: Removed horizontal overflow from project chat by constraining the rail, messages, composer, and compact selectors; long text and model names now wrap or truncate within the available width.
- 2026-08-27: Exposed the existing many-member work assignment as optional PIC throughout project task/deadline UI and taught AI creation/assignment commands to normalize and validate zero, one, or many PIC member IDs.
- 2026-08-27: Added a non-destructive Close Project action that clears only the active client selection, restores the Projects heading and reopen picker, and honors unsaved-document warnings without modifying stored data.
- 2026-08-27: Made Calendar entries visibly interactive on hover and keyboard focus; selecting an existing task or deadline now opens its populated edit/details form while selecting empty day space continues to open creation for that date.
- 2026-08-27: Removed redundant category controls from project-linked task/deadline forms, preserved internal compatibility references during saves, and repaired the item PATCH query so existing work can be edited successfully.
- 2026-08-27: Separated projects from categories across the visible UI and filtering model, removed project-related category labels/controls, made category filters apply only to standalone work, added neutral project markers, and fixed the Tasks filter overlay's previously undefined transparent surface.
- 2026-08-27: Promoted Trash from the buried category manager into a dedicated top-bar dialog with grouped batch summaries and restore actions; added grouping coverage and made selected Tasks-filter ticks visibly green on a pale accent background.

## Maintenance contract

After every material code change, reconcile this document with the code and add a concise dated entry under `Recent changes`. Update existing sections in place so this file describes the current project rather than accumulating contradictory history. Follow the complete workflow in `AGENTS.md`.
