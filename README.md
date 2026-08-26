# Planora

Planora is a calm, beginner-friendly calendar for keeping tasks and deadlines in one place. It has three views:

- **Dashboard** — shows overdue work, today’s items, the next seven days, and completed work.
- **Calendar** — shows every item in a monthly calendar; select a day to add something there.
- **Tasks & deadlines** — searches, filters, completes, and removes saved items.

Data is stored in PostgreSQL. The setup command creates the table and adds six date-relative demo items automatically, so no one needs to create database tables by hand.

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
sudo docker compose up -d
npm run db:setup
npm run dev
```

Open <http://localhost:3000> in a browser. Keep the terminal open while using Planora. Press `Ctrl+C` to stop the website.

The commands do all database setup automatically:

- `sudo docker compose up -d` downloads and starts PostgreSQL in the background.
- `npm run db:setup` creates `.env.local`, the `planner_items` table and indexes, then adds demo data if the table is empty.
- Running `npm run db:setup` again is safe; existing items are kept.

## Everyday use on Ubuntu

Open a terminal in the project folder and run:

```bash
sudo docker compose up -d
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
docker compose up -d
npm.cmd run db:setup
npm.cmd run dev
```

Open <http://localhost:3000> in a browser. Keep the terminal open while using Planora. Press `Ctrl+C` in the terminal to stop the website.

The commands do all technical setup:

- `docker compose up -d` downloads and starts PostgreSQL in the background.
- `npm.cmd run db:setup` creates `.env.local`, creates the `planner_items` table and indexes, then adds demo data if the table is empty.
- Running `db:setup` again is safe; existing items are kept.

## Everyday use on Windows

After the first setup, start Planora with:

```powershell
docker compose up -d
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
DATABASE_URL=postgresql://planora:planora@localhost:5432/planora
```

For an existing PostgreSQL server, copy `.env.example` to `.env.local`, change `DATABASE_URL`, and run the database setup command. Never commit real database passwords.

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
npm run build
```

Windows:

```powershell
npm.cmd run lint
npm.cmd run build
```

## Troubleshooting

- **Ubuntu says `nvm: command not found`:** close the terminal, open it again, and retry `nvm install 22`.
- **Ubuntu says Docker permission denied:** use `sudo docker compose ...` as shown in this guide.
- **Docker service is not running on Ubuntu:** run `sudo systemctl enable --now docker`.
- **`npm` scripts are disabled in PowerShell:** use `npm.cmd` exactly as shown above.
- **Database setup says it cannot connect:** start Docker and PostgreSQL, wait about ten seconds, then retry the database setup command.
- **Port 5432 is already in use:** another PostgreSQL service is running. Either stop it or update the port in `docker-compose.yml` and `.env.local` together.
- **The website says “Database setup needed”:** run `npm run db:setup` on Ubuntu or `npm.cmd run db:setup` on Windows, then refresh the page.

## Project structure

```text
app/                  Next.js pages and JSON API routes
components/           Calendar, dashboard, list, and item form interface
database/schema.sql   Repeatable PostgreSQL schema
lib/                  Database connection and input validation
scripts/              Database setup and Python fixture utility
report.html           Submission-ready project report website
```
# PLANORA
