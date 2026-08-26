import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import {
  DEFAULT_DATABASE_URL,
  describeDatabaseUrl,
  normalizeDatabaseEnvText,
  normalizeDatabaseUrl,
} from "../lib/database-url.mjs";

const envPath = resolve(".env.local");
const retryableCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ETIMEDOUT", "57P03"]);
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function prepareLocalEnvironment() {
  if (!existsSync(envPath)) {
    await writeFile(envPath, `DATABASE_URL=${DEFAULT_DATABASE_URL}\n`, "utf8");
    console.log("Created .env.local with Planora's local IPv4 database address.");
    return DEFAULT_DATABASE_URL;
  }

  const currentText = await readFile(envPath, "utf8");
  const fileUrl = currentText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();

  if (!fileUrl) {
    const separator = currentText && !currentText.endsWith("\n") ? "\n" : "";
    await writeFile(envPath, `${currentText}${separator}DATABASE_URL=${DEFAULT_DATABASE_URL}\n`, "utf8");
    console.log("Added DATABASE_URL to .env.local.");
    return DEFAULT_DATABASE_URL;
  }

  const normalized = normalizeDatabaseEnvText(currentText);
  if (normalized.changed) {
    await writeFile(envPath, normalized.text, "utf8");
    console.log("Updated .env.local from localhost to 127.0.0.1 to avoid reaching the wrong PostgreSQL server.");
  }

  return normalizeDatabaseUrl(fileUrl);
}

async function waitForDatabase(pool, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT current_user, current_database(), inet_server_addr()::text AS server_address
        `);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      if (!retryableCodes.has(error.code) || attempt === attempts) throw error;
      console.log(`PostgreSQL is starting (attempt ${attempt}/${attempts})…`);
      await sleep(2_000);
    }
  }
}

function printFailure(error, phase, endpoint) {
  console.error(`\nPlanora database ${phase} failed.`);
  console.error(
    `Endpoint: ${endpoint.user}@${endpoint.host}:${endpoint.port}/${endpoint.database}`,
  );
  if (error.code) console.error(`PostgreSQL/error code: ${error.code}`);
  console.error(error.message);
  if (error.detail) console.error(`Detail: ${error.detail}`);
  if (error.hint) console.error(`Hint: ${error.hint}`);

  if (error.code === "28P01") {
    console.error("\nThe server rejected the password. For local Docker, verify that this endpoint is 127.0.0.1 and that an old volume was not initialized with different credentials.");
  } else if (phase === "connection") {
    console.error("\nStart the healthy local database with: docker compose up -d --wait");
  } else if (phase === "schema" || phase.startsWith("migration ")) {
    console.error("\nAuthentication succeeded, but PostgreSQL rejected a schema statement. The message above is the actual schema error.");
  }
}

const daysFromNow = (days, hour = 17) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};

const demoItems = [
  { title: "Submit research proposal", description: "Upload the final PDF and check the submission receipt.", kind: "deadline", at: daysFromNow(2, 23), category: "University", priority: "high", status: "pending" },
  { title: "Prepare presentation slides", description: "Turn the project notes into a short, visual presentation.", kind: "task", at: daysFromNow(5, 14), category: "University", priority: "medium", status: "pending" },
  { title: "Renew library books", description: "Return or renew the borrowed design books.", kind: "deadline", at: daysFromNow(-2, 17), category: "Personal", priority: "high", status: "pending" },
  { title: "Weekly planning", description: "Review priorities and plan the next seven days.", kind: "task", at: daysFromNow(1, 9), category: "Planning", priority: "low", status: "pending" },
  { title: "Team project check-in", description: "Share progress and agree on the next milestone.", kind: "task", at: daysFromNow(8, 11), category: "Work", priority: "medium", status: "pending" },
  { title: "Complete reading notes", description: "Summarise chapters four and five.", kind: "task", at: daysFromNow(-5, 18), category: "University", priority: "medium", status: "completed" },
];

let pool;
let phase = "configuration";
let endpoint = { user: "unknown", host: "unknown", port: "5432", database: "unknown" };

try {
  const fileUrl = await prepareLocalEnvironment();
  const source = process.env.DATABASE_URL ? "the current shell/process environment" : ".env.local";
  const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL || fileUrl);
  endpoint = describeDatabaseUrl(connectionString);
  console.log(`Using DATABASE_URL from ${source}.`);

  pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    max: 4,
  });

  phase = "connection";
  const identity = await waitForDatabase(pool);
  console.log(
    `Authenticated as ${identity.current_user} to ${identity.current_database} at ${identity.server_address || endpoint.host}.`,
  );

  phase = "schema";
  const schema = await readFile(resolve("database/schema.sql"), "utf8");
  await pool.query(schema);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const migrationNames = (await readdir(resolve("database/migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrationNames) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) continue;
    const migration = await readFile(resolve("database/migrations", name), "utf8");
    const client = await pool.connect();
    try {
      phase = `migration ${name}`;
      await client.query("BEGIN");
      await client.query(migration);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied migration ${name}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  phase = "seed";
  const count = Number((await pool.query("SELECT COUNT(*) AS count FROM planner_items")).rows[0].count);

  if (count === 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const demoProject = await client.query(
        `INSERT INTO projects (title, category_id)
         SELECT 'University capstone', id FROM categories WHERE name = 'University' AND deleted_at IS NULL
         RETURNING id`,
      );
      const demoProjectId = demoProject.rows[0]?.id || null;
      for (const item of demoItems) {
        const taskEnd = new Date(new Date(item.at).getTime() + 60 * 60 * 1000).toISOString();
        await client.query(
          `INSERT INTO planner_items (title, description, kind, start_at, end_at, due_at, category_id, project_id, priority, status)
           VALUES ($1, $2, $3, $4, $5, $6,
             COALESCE((SELECT id FROM categories WHERE name = $7 AND deleted_at IS NULL LIMIT 1),
                      (SELECT default_category_id FROM planner_settings WHERE id = 1)),
             $8, $9, $10)`,
          [
            item.title, item.description, item.kind,
            item.kind === "task" ? item.at : null,
            item.kind === "task" ? taskEnd : null,
            item.kind === "deadline" ? item.at : null,
            item.category, item.category === "University" ? demoProjectId : null,
            item.priority, item.status,
          ],
        );
      }
      await client.query("COMMIT");
      console.log(`Database is ready. Added ${demoItems.length} demo items.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    console.log(`Database is ready. Kept the ${count} existing planner items.`);
  }
} catch (error) {
  printFailure(error, phase, endpoint);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
