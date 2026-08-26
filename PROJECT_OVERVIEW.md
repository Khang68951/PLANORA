# Project Planora Overview

> Agent-facing project context. Every coding agent must read this file before implementation and update it after material code changes.

## Project summary

Planora is a single-user planning application for people who may have no technical background. It combines tasks and deadlines in a calm monthly calendar, a filterable list, and a dashboard that surfaces overdue and near-due items. The initial working vertical slice is implemented.

## Current status

- Phase: functional MVP
- Application: Next.js 16 App Router, JavaScript, React, and Tailwind CSS
- Persistence: PostgreSQL through `pg`
- Core behavior: create, list, complete/reopen, filter/search, and delete tasks or deadlines
- Setup: Docker Compose plus an idempotent Node.js schema/seed script
- Verification: ESLint and optimized Next.js build

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
- Editing every field after creation; the MVP supports completion/reopening and deletion.

## Users and primary workflows

The primary user is someone who needs a visual planner but should not need computing knowledge to install or operate it. After terminal-based first-time setup, the user can:

1. Review urgent, overdue, upcoming, and completed counts on the dashboard.
2. Move through months and select a calendar day to create an item.
3. Create a task or deadline with title, notes, date, time, category, and priority.
4. Search or filter all items, mark work complete, reopen it, or remove it.

## Architecture

The browser renders the client-side planner shell in `components/PlannerApp.jsx`. It fetches JSON from Next.js Route Handlers under `app/api/items`. Route handlers validate user input and use parameterized SQL through the shared `pg` pool in `lib/db.js`. PostgreSQL owns durable planner data.

```text
Browser UI -> Next.js /api/items routes -> validation + parameterized SQL -> PostgreSQL
```

The dashboard and calendar are projections of the same item collection returned by the API; there are no duplicated dashboard tables. Optimistic completion and deletion keep interactions quick, with rollback when a request fails.

## Project map

| Path | Responsibility |
| --- | --- |
| `app/page.js` | Application entry point. |
| `app/globals.css` | Tailwind import, design tokens, responsive product styling. |
| `app/api/items/` | List/create/update/delete JSON endpoints. |
| `components/PlannerApp.jsx` | Dashboard, calendar, list, modal, and client state. |
| `lib/db.js` | Reused PostgreSQL connection pool. |
| `lib/items.js` | Allowed values, input validation, and shared SQL column list. |
| `database/schema.sql` | Idempotent table, constraint, extension, and index creation. |
| `scripts/setup-database.mjs` | Creates local env configuration, applies schema, and seeds demo rows. |
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
sudo docker compose up -d
npm run db:setup
npm run dev
```

The README now leads with terminal-only Ubuntu installation and usage, with separate Windows instructions. Verification commands are `npm run lint` and `npm run build` on Ubuntu (`npm.cmd` on Windows).

## Configuration and environments

- `DATABASE_URL`: PostgreSQL connection URL used by the setup script and Next.js server.
- `.env.local`: generated with local defaults by `npm run db:setup` on Ubuntu or `npm.cmd run db:setup` on Windows; ignored by source control.
- `.env.example`: safe example configuration.

No production environment has been configured. The included database credentials are local-development defaults only.

## Data model and storage

`planner_items` stores UUID `id`, required `title`, optional `description`, constrained `kind` (`task` or `deadline`), timezone-aware `due_at`, `category`, constrained `priority`, constrained `status`, and created/updated timestamps. Due-date and status indexes support the primary views. Table creation uses `IF NOT EXISTS`; seed rows are added only when the table is empty.

## Interfaces and integrations

| Method and route | Purpose |
| --- | --- |
| `GET /api/items` | Return all items ordered by due date. |
| `POST /api/items` | Validate and create an item. |
| `PATCH /api/items/:id` | Validate and change supplied item fields. |
| `DELETE /api/items/:id` | Remove one item. |

Errors use JSON and meaningful HTTP status codes. SQL values are parameterized. There are no third-party account integrations.

## Key decisions

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-08-26 | Use one `planner_items` table for tasks and deadlines. | Shared fields and views outweigh the small type distinction; a constrained `kind` keeps it explicit. |
| 2026-08-26 | Derive dashboard summaries from the item collection. | Avoids duplicated state and keeps counts synchronized after every mutation. |
| 2026-08-26 | Use Next.js Route Handlers and `pg` instead of a separate backend service. | Keeps local setup understandable while retaining a clear UI/API/database boundary. |
| 2026-08-26 | Make schema and seed setup idempotent. | Non-technical users can safely rerun one command without losing work. |
| 2026-08-26 | Use date-relative seed records. | The first dashboard always demonstrates overdue and upcoming states. |
| 2026-08-26 | Keep Python optional and use it for fixture generation. | Meets the requested technology mix without making the ordinary application depend on two servers. |

## Known limitations and open questions

- Authentication and tenant isolation are not implemented; the MVP is a trusted single-user local application.
- Item editing, reminders, recurring tasks, drag-and-drop rescheduling, and calendar integrations remain future work.
- Live PostgreSQL behavior was not exercised in the current environment because PostgreSQL and Docker were unavailable; schema/application integration is build-verified but requires a runtime database smoke test.
- Formal user research, accessibility audit, browser matrix, automated API tests, hosting target, student name, course details, and product screenshots remain `TBD`.

## Recent changes

- 2026-08-26: Implemented the initial Planora MVP with dashboard, monthly calendar, filterable task/deadline list, creation form, completion, reopening, and deletion.
- 2026-08-26: Added validated JSON APIs, a constrained PostgreSQL schema, Docker Compose, idempotent setup, relative-date demo seeding, and an optional Python fixture generator.
- 2026-08-26: Added responsive product styling, setup/error/empty/loading states, locked dependencies, and beginner-focused setup and troubleshooting documentation.
- 2026-08-26: Synchronized the assignment report with the implemented requirements, architecture, verification evidence, and known limitations.
- 2026-08-26: Added terminal-only Ubuntu setup and daily-use instructions, and made the optional Python npm utility use Ubuntu's `python3` command.

## Maintenance contract

After every material code change, reconcile this document with the code and add a concise dated entry under `Recent changes`. Update existing sections in place so this file describes the current project rather than accumulating contradictory history. Follow the complete workflow in `AGENTS.md`.
