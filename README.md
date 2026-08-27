# Planora

Planora is a calm, beginner-friendly workspace for keeping tasks, deadlines, and projects in one place. Its main views are:

- **Dashboard** — shows overdue work, today’s items, the next seven days, and completed work. Priority queue rows also identify their assigned PIC members when present.
- **Calendar** — switches between Day, Week, and Month schedules; navigate by the selected period or select a day to add something there. Independent category and project checkbox filters live in the right rail, including a **No project** option; nested categories have arrows for expanding or collapsing their children.
- **Tasks & deadlines** — searches, filters, completes, and removes saved items, with assigned PIC members shown directly on each applicable row.
- **Projects** — gives each project its own overview, documents, local files, assigned work, members, and project-aware AI workspace.
- **Settings** — use the gear in the top-right to choose appearance and Calendar preferences, then choose an AI provider and model. Display preferences are saved in the browser; AI selection is saved in PostgreSQL.

Categories work like folders. They can be nested, renamed, recolored, moved, hidden, filtered, and recovered from Trash. Every task or deadline has a category; work linked to a project displays the project's category. Planora uses a configurable default when none is supplied and can privately suggest up to three categories from the title, description, and similar saved items.

Structured data is stored in PostgreSQL. Project attachments stay in the local `storage/projects` folder and are linked from PostgreSQL. The setup command creates every table, applies ordered migrations, and adds five starter categories, a populated example project, and six date-relative demo items automatically, so no one needs to create database tables by hand.

## First-time setup (Ubuntu)

The commands below install everything from the terminal. They are suitable for supported 64-bit Ubuntu releases.

### 1. Install Node.js 22 and Python 3

```bash
sudo apt update
sudo apt install -y curl ca-certificates python3
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
```

Close and reopen the terminal, then run:

```bash
nvm install 22
nvm use 22
node --version
npm --version
```

### 2. Install Docker Engine and Docker Compose

These commands use Docker's official Ubuntu package repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc" | sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run hello-world
```

### 3. Install and start Planora

In the terminal, move into the downloaded Planora project folder. For example:

```bash
cd ~/Downloads/Project\ Planora
npm install
sudo docker compose up -d --wait
npm run db:setup
npm run dev
```

Open <http://localhost:3000> in a browser. Keep the terminal open while using Planora. Press `Ctrl+C` to stop the website.

The commands do all database setup automatically:

- `sudo docker compose up -d --wait` downloads PostgreSQL and waits until its health check passes.
- `npm run db:setup` creates `.env.local`, creates the baseline schema, transactionally applies every unapplied file in `database/migrations`, then adds demo data if the item table is empty.
- Local database URLs are normalized to `127.0.0.1` so Ubuntu cannot route `localhost` to a different IPv6 PostgreSQL service.
- Running `npm run db:setup` again is safe; applied migrations are recorded in `schema_migrations` and existing items are kept.

## Everyday use on Ubuntu

Open a terminal in the project folder and run:

```bash
sudo docker compose up -d --wait
npm run dev
```

Open <http://localhost:3000>. To stop the database later:

```bash
sudo docker compose stop
```

Stopping PostgreSQL does not delete saved items. The Docker volume named `planora-data` owns the database files.

## First-time setup (Windows)

Open PowerShell as Administrator and install the required programs from the terminal:

```powershell
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Docker.DockerDesktop
```

Reopen the terminal after installation and start Docker Desktop once. Then open this project folder in the terminal and run:

```powershell
npm.cmd install
docker compose up -d --wait
npm.cmd run db:setup
npm.cmd run dev
```

Open <http://localhost:3000> in a browser. Keep the terminal open while using Planora. Press `Ctrl+C` in the terminal to stop the website.

The commands do all technical setup:

- `docker compose up -d --wait` downloads PostgreSQL and waits until its health check passes.
- `npm.cmd run db:setup` creates `.env.local`, creates the baseline schema, applies unapplied migrations, then adds demo data if the item table is empty.
- Running `db:setup` again is safe; existing items are kept.

## Everyday use on Windows

After the first setup, start Planora with:

```powershell
docker compose up -d --wait
npm.cmd run dev
```

To stop the database later:

```powershell
docker compose stop
```

Stopping it does not delete saved items. The Docker volume named `planora-data` owns the database files.

## Configuration

The Ubuntu `npm run db:setup` and Windows `npm.cmd run db:setup` commands create this local configuration automatically:

```dotenv
DATABASE_URL=postgresql://planora:planora@127.0.0.1:5432/planora
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
AI_PROVIDER=gemini
```

For an existing PostgreSQL server, copy `.env.example` to `.env.local`, change `DATABASE_URL`, and run the database setup command. To use project AI, set both the key and model for each provider you want available, then restart `npm run dev`. API keys are read only by server Route Handlers and are never returned to the browser. The Settings dialog and chat composer list only provider/model pairs declared in `.env.local`; a pair cannot be selected until its corresponding API key is configured. Gemini with `gemini-2.5-flash` remains the generated environment default. A Gemini consumer subscription or student offer does not automatically provide Gemini API quota: create an API key in Google AI Studio and check the API's current free-tier limits. Never commit real database passwords or AI keys.

## Using project workspaces

- Create a project from the **Projects** tab and set its category, type, date range, status, and progress.
- Before a project is open, the Projects page shows its introductory heading and creation action. Once a project workspace opens, that large heading disappears to give the selector, content, and AI more vertical room; compact **New** and **Close** actions remain beside the project selector. **Close** clears only the current UI selection, never changes project data, and returns to the heading plus a project picker for reopening. Unsaved document changes still receive the normal warning first. On wide screens, the workspace keeps its selector and non-AI sub-tabs on the left, selected content in the center, and project AI chat on the right. On smaller screens, the same areas reflow into a readable stacked layout. AI Skills are temporarily hidden while their interaction is redesigned; their stored data and APIs are retained.
- **Overview** summarizes project information, members, progress, and upcoming work.
- **Documents** provides rich-text tabs. A centered Planora dialog asks for the name of each new document. Changes save only when you select **Save** or press `Ctrl+S`; a matching centered warning lets you keep editing or discard changes before internal navigation. Closing or refreshing the browser uses the browser's required native warning.
- **Files** accepts local attachments up to 10 MB. Images, PDFs, and supported text files can preview in the browser. Project AI can read plain text, Markdown, CSV, JSON, XML, and HTML content; other formats contribute metadata only.
- **Tasks & Deadlines** creates work through the existing item model and links it through `projectId`. Every row shows the inherited project category, and project work mutations refresh the shared planner collection immediately so Calendar and the main Tasks & deadlines tab stay synchronized without a browser reload. The optional **PIC** field accepts zero, one, or many existing project members and can be changed from the work list.
- **Members** stores a name and optional project role.
- **Project AI** remains available in the right rail while you work in any project sub-tab. Planora does not give either provider role direct database access. Its server workflow first routes the request and selects only relevant project context. One provider call streams the concise user-facing conversation; a second internal command-planner call translates actionable requests into a non-conflicting JSON command plan for validation, execution, or review. A new Documents-tab document and its initial rich text are always represented by one `documents.create` command, while uploaded attachments remain separate Files resources. The planner infers safe defaults and relative dates, but when essential user-controlled information is missing it asks one concise follow-up question and retains recent conversation context for the answer. Longer multi-action plans receive a larger internal output allowance to avoid truncated JSON. A five-stage status strip shows Route, Context, Provider, Validate, and Review. Messages stream progressively without reloading, and the composer grows automatically up to a comfortable limit before scrolling. Compact selectors beneath the prompt choose the current project approval mode and an environment-configured AI model.
- The compact command-mode selector inside the chat composer controls execution for that project: **Approve everything** queues reads and changes; **Approve changes** (the default) runs reads automatically but queues stored changes and removals; **Auto** runs most supported commands after a warning. Active commands appear directly in the conversation as short status rows. Automatic reads need no controls. Pending changes show Reject and approval/review controls; document writes open their highlighted comparison in Documents. The status row disappears after the command finishes or is rejected, while the complete audit record remains in PostgreSQL. AI document text edits always wait for human approval in every mode.
- The fixed command registry can inspect/search project data, documents, supported text files, work, and members; create or update documents, work, PIC assignments, members, roles, and project metadata; and move documents, files, work, or members out of active use. AI-created work can include optional PIC member IDs directly; changing PIC on existing work uses the separate validated assignment command. AI cannot issue arbitrary SQL or permanently delete a record. The backend must successfully build and sanitize the exact full-document result before it creates an approval command; invalid anchors and missing text are rejected first. Multiple additions/removals for one document become one atomic preview. That preview opens automatically inside the actual Documents workspace, with additions highlighted green and removals highlighted red with strikethrough. Nothing is stored until **Approve and update document** is selected, and approval applies the same content that was shown; **Reject AI change** discards it. Stale versions are rejected if a person edited the document after the AI prepared its command.
- Approval modes control whether Planora executes a command. The selected project context is already assembled for each provider request, so these modes are not consent settings for what project context is sent to the configured AI provider.

Attachments are intentionally local and ignored by Git. Back up both PostgreSQL and `storage/projects` if project files need to move to another computer.

## Using categories

- Each workspace tab has its own **Categories shown in…** checkbox panel. Tick exactly which categories should appear there, or use **Show all** and **Hide all**. Dashboard, Calendar, and Tasks & deadlines remember separate selections while you switch tabs. Calendar also has an independent **Projects shown in Calendar** panel, where projects and unassigned **No project** work can be shown or hidden. On wide screens, Calendar places both filters in the right-hand rail so the whole month stays immediately visible; narrower layouts place them below the calendar.
- Select **Manage categories** in the sidebar to create, rename, recolor, move, hide/show, or delete folders. The same dialog configures the default category and allowed nesting depth (1–8).
- Category deletion first shows the exact number of affected folders, projects, and tasks/deadlines. Confirmed deletion moves the entire group to Trash; **Restore** recovers its batch together.
- Individual task/deadline deletion also moves the item to Trash.
- In the add-item form, **Suggest category** returns up to three visible matches. Suggestions run locally in Planora and do not send task text to an external AI service.
- If an item belongs to a project, its category selector is disabled because it inherits the project's category. Create and manage complete project workspaces from the Projects tab.

## Task and deadline fields

Tasks and deadlines share title, optional description, status, priority, category, optional project, and automatic created/updated timestamps. Their scheduling fields differ:

- A **Task** requires `startAt` and `endAt`; the end must be after the start. A task spanning multiple dates appears on every intersected calendar day.
- A **Deadline** requires one `dueAt` value.
- PostgreSQL prevents task interval fields and deadline due fields from being mixed in one record.
- The JSON item API uses camelCase names: `categoryId`, `projectId`, `startAt`, `endAt`, `dueAt`, `createdAt`, and `updatedAt`.

Use the pencil button beside an item to edit its type, schedule, title, notes, status, priority, category, or project. Existing tasks created before this update are migrated to one-hour intervals beginning at their previous saved time.

## Python utility

The primary application is JavaScript/Node.js. A small Python utility demonstrates generation of relative-date fixture data without external Python packages:

Ubuntu installs Python 3 during the main setup. Generate the optional preview with:

```bash
npm run db:seed-data
```

On Windows, install Python and run the script directly:

```powershell
winget install --exact --id Python.Python.3.12
py scripts/generate_seed_data.py
```

It writes `scripts/seed-preview.json`; it does not change the live database. Python is optional for running the Planora website.

## Verification

Ubuntu:

```bash
npm run lint
npm test
npm run build
```

Windows:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

## Troubleshooting

- **Ubuntu says `nvm: command not found`:** close the terminal, open it again, and retry `nvm install 22`.
- **Ubuntu says Docker permission denied:** use `sudo docker compose ...` as shown in this guide.
- **Docker service is not running on Ubuntu:** run `sudo systemctl enable --now docker`.
- **`npm` scripts are disabled in PowerShell:** use `npm.cmd` exactly as shown above.
- **Database setup reports authentication code `28P01`:** read the safe endpoint printed by the setup command. It should be `planora@127.0.0.1:5432/planora`; an old volume may contain different credentials.
- **Database setup reports a schema failure:** authentication already succeeded. Use the PostgreSQL code, detail, and hint printed immediately above the explanation.
- **Migration `002_task_deadline_fields.sql` previously reported code `23502`:** update to the corrected migration and run `npm run db:setup` again. Migrations are transactional, so the failed attempt was rolled back and the retry keeps existing planner data.
- **Database setup says it cannot connect:** run `docker compose up -d --wait` and retry. The setup command also retries temporary startup failures for about 24 seconds.
- **Port 5432 is already in use:** another PostgreSQL service is running. Either stop it or update the port in `docker-compose.yml` and `.env.local` together.
- **The website says “Database setup needed”:** run `npm run db:setup` on Ubuntu or `npm.cmd run db:setup` on Windows, then refresh the page.

## Project structure

```text
app/                  Next.js pages and JSON API routes
components/           Planner views, project workspace, item form, and category manager
database/schema.sql   Baseline PostgreSQL schema
database/migrations/  Ordered category/project/workspace/settings/Trash migrations
lib/                  Database, validation, AI providers, file safety, calendar, and categories
storage/projects/     Local project attachments (contents ignored by Git)
scripts/              Database setup and Python fixture utility
tests/                Node unit tests
report.html           Submission-ready project report website
```
# PLANORA
