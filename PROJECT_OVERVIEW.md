# Project Planora Overview

> Agent-facing project context. Every coding agent must read this file before implementation and update it after material code changes.

## Project summary

Planora is a single-user planning application for people who may have no technical background. It combines tasks and deadlines in a calm day/week/month calendar, a filterable list, and a dashboard that surfaces overdue and near-due items. The initial working vertical slice is implemented.

## Current status

- Phase: functional MVP
- Application: Next.js 16 App Router, JavaScript, React, and Tailwind CSS
- Persistence: PostgreSQL through `pg`
- Core behavior: task/deadline CRUD, nested category management with independent per-view checkbox filters, project category inheritance, recoverable Trash, and local smart category suggestions
- Setup: Docker Compose plus an idempotent, diagnostic Node.js schema/seed script
- Verification: database URL and category-domain unit tests, ESLint, and optimized Next.js build

## Goals and non-goals

### Goals

- Give non-technical users one clear place to plan tasks and deadlines.
- Make urgent work visible without requiring the user to configure a dashboard.
- Make all software installation and database-table creation terminal-driven and documented.
- Preserve items in PostgreSQL and seed useful relative-date examples on first setup.
- Keep the interface responsive, accessible, and forgiving, with empty/loading/error states.

### Current non-goals

- Multiple user accounts, authentication, sharing, notifications, recurring items, drag-and-drop, external calendar sync, and a hosted LLM integration.
- Production hosting or managed-database provisioning.
- Advanced editing such as recurrence, dependencies, attachments, and bulk changes.

## Users and primary workflows

The primary user is someone who needs a visual planner but should not need computing knowledge to install or operate it. After terminal-based first-time setup, the user can:

1. Review urgent, overdue, upcoming, and completed counts on the dashboard.
2. Switch the calendar between focused day, Sunday-first week, and six-week month modes; navigate by the active period and select a day to create an item.
3. Create or edit a task with a start/end interval, or a deadline with one due time, plus title, optional notes, status, priority, category or category-bearing project; ask for up to three category suggestions.
4. Independently choose the visible categories in Dashboard, Calendar, and Tasks & deadlines using Canvas-style checkboxes. Calendar keeps a vertically scrollable category tree in a sticky right rail on wide screens, with arrows to collapse or expand folders that contain children; manage nested folders, colors, hidden state, the default category, and nesting depth separately.
5. Preview the complete cascade impact before moving a category subtree to Trash, then restore the entire batch if needed.
6. Search or filter items, mark work complete, reopen it, or move it to Trash.
7. Open the top-right Settings dialog to choose Paper, Ocean, or Night appearance, a default Calendar mode, and reduced motion; preferences persist on the current device.

## Architecture

The browser renders the client-side planner shell in `components/PlannerApp.jsx` and the folder manager in `components/CategoryPanel.jsx`. It fetches JSON from Next.js Route Handlers under `app/api`. Route handlers validate user input and use parameterized SQL through the shared `pg` pool in `lib/db.js`. PostgreSQL owns durable planner data. Project-linked items expose an effective category using `COALESCE(project.category_id, item.category_id)`, so changing a project's category is inherited without rewriting its tasks.

```text
Browser UI -> Next.js item/category/project/settings/Trash APIs -> validation + parameterized SQL -> PostgreSQL
```

The dashboard and calendar are projections of the same item collection returned by the API; there are no duplicated dashboard tables. Task placement uses its start/end interval (including every intersected calendar day), while deadlines use `dueAt`. Pure date helpers generate and navigate the day, week, and month ranges. Each tab keeps its own in-memory category selection, while Calendar separately keeps its category-tree expansion state, so filtering Calendar never changes Dashboard or Tasks & deadlines. Validated appearance, default-view, and motion preferences use browser-local storage because they belong to the device rather than PostgreSQL planner records. Optimistic completion and deletion keep interactions quick, with rollback when a request fails.

## Project map

| Path | Responsibility |
| --- | --- |
| `app/page.js` | Application entry point. |
| `app/globals.css` | Tailwind import, design tokens, responsive product styling. |
| `app/api/items/` | Item list/create/update and soft-delete endpoints. |
| `app/api/categories/` | Category tree CRUD, impact preview, cascade Trash/restore, and suggestion endpoints. |
| `app/api/projects/` | Project listing and creation with category ownership. |
| `app/api/settings/categories/` | Default category and nesting-depth settings. |
| `app/api/trash/` | Trash inventory and atomic batch restoration. |
| `components/PlannerApp.jsx` | Dashboard, calendar, list, independent checkbox filters, item form, and client state. |
| `components/CategoryPanel.jsx` | Category-management launcher, responsive manager, settings, impact warning, and Trash UI. |
| `lib/db.js` | Reused PostgreSQL connection pool. |
| `lib/database-url.mjs` | Validates database URLs and normalizes local `localhost` connections to explicit IPv4. |
| `lib/items.js` | Allowed values, input validation, and shared SQL column list. |
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
- `.env.local`: generated with local defaults by `npm run db:setup` on Ubuntu or `npm.cmd run db:setup` on Windows; ignored by source control.
- `.env.example`: safe example configuration.

No production environment has been configured. The included database credentials are local-development defaults only.

## Data model and storage

`planner_items` uses `kind` as a discriminant. Tasks require `start_at` and `end_at` with `end_at > start_at` and must not contain `due_at`; deadlines require `due_at` and must not contain task interval fields. Both share UUID `id`, title, nullable description, status, priority, assigned category, nullable project, and created/updated timestamps. The JSON API exposes these as camelCase (`startAt`, `endAt`, `dueAt`, `categoryId`, `projectId`, `createdAt`, `updatedAt`).

`categories` is a self-referencing adjacency list (`parent_id`) with name, color, hidden state, soft-delete metadata, and an active sibling-name uniqueness rule. `planner_settings` is a singleton holding the required default category and a configurable depth from 1–8. `projects` owns one category. API reads use the project's category when an item is linked. Categories, projects, and items use `deleted_at` plus a shared `trash_batch_id` for atomic cascade restoration. PostgreSQL 17's built-in `gen_random_uuid()` supplies UUIDs. `schema_migrations` ensures each ordered migration runs once in a transaction.

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
| `GET/POST /api/projects` | List projects or create one in a category. |
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

## Known limitations and open questions

- Authentication and tenant isolation are not implemented; the MVP is a trusted single-user local application.
- Full project management UI, reminders, recurring tasks, drag-and-drop rescheduling, and calendar integrations remain future work. Item create/edit can select existing projects; projects are currently created through the API.
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

## Maintenance contract

After every material code change, reconcile this document with the code and add a concise dated entry under `Recent changes`. Update existing sections in place so this file describes the current project rather than accumulating contradictory history. Follow the complete workflow in `AGENTS.md`.
