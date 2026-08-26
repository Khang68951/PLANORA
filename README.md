# Planora

Planora is a calm, beginner-friendly calendar for keeping tasks and deadlines in one place. It has three views:

- **Dashboard** — shows overdue work, today’s items, the next seven days, and completed work.
- **Calendar** — switches between Day, Week, and Month schedules; navigate by the selected period or select a day to add something there. Its right-side category filter scrolls vertically, and categories with nested folders have arrows for expanding or collapsing their children.
- **Tasks & deadlines** — searches, filters, completes, and removes saved items.
- **Settings** — use the gear in the top-right to choose Paper, Ocean, or Night appearance, select the default Calendar mode, and reduce motion. These preferences are saved in the current browser.

Categories work like folders. They can be nested, renamed, recolored, moved, hidden, filtered, and recovered from Trash. Every task or deadline has a category; work linked to a project displays the project's category. Planora uses a configurable default when none is supplied and can privately suggest up to three categories from the title, description, and similar saved items.

Data is stored in PostgreSQL. The setup command creates every table, applies ordered migrations, and adds five starter categories, one example project, and six date-relative demo items automatically, so no one needs to create database tables by hand.

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
```

For an existing PostgreSQL server, copy `.env.example` to `.env.local`, change `DATABASE_URL`, and run the database setup command. Never commit real database passwords.

## Using categories

- Each workspace tab has its own **Categories shown in…** checkbox panel. Tick exactly which categories should appear there, or use **Show all** and **Hide all**. Dashboard, Calendar, and Tasks & deadlines remember separate selections while you switch tabs. On wide screens, Calendar places its filter in the right-hand rail so the whole month stays immediately visible; narrower layouts place it below the calendar.
- Select **Manage categories** in the sidebar to create, rename, recolor, move, hide/show, or delete folders. The same dialog configures the default category and allowed nesting depth (1–8).
- Category deletion first shows the exact number of affected folders, projects, and tasks/deadlines. Confirmed deletion moves the entire group to Trash; **Restore** recovers its batch together.
- Individual task/deadline deletion also moves the item to Trash.
- In the add-item form, **Suggest category** returns up to three visible matches. Suggestions run locally in Planora and do not send task text to an external AI service.
- If an item belongs to a project, its category selector is disabled because it inherits the project's category. Existing projects can be listed or created through the project JSON API; a full project-management screen is future work.

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
components/           Planner views, item form, and responsive category manager
database/schema.sql   Baseline PostgreSQL schema
database/migrations/  Ordered category/project/settings/Trash migrations
lib/                  Database connection, validation, tree logic, and suggestions
scripts/              Database setup and Python fixture utility
tests/                Node unit tests
report.html           Submission-ready project report website
```
# PLANORA
