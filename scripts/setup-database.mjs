import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const defaultUrl = "postgresql://planora:planora@localhost:5432/planora";
const envPath = resolve(".env.local");

if (!existsSync(envPath)) {
  await writeFile(envPath, `DATABASE_URL=${defaultUrl}\n`, "utf8");
  console.log("Created .env.local with the local Planora database address.");
}

const envText = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
const fileUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const connectionString = process.env.DATABASE_URL || fileUrl || defaultUrl;
const pool = new pg.Pool({ connectionString });

const daysFromNow = (days, hour = 17) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};

const demoItems = [
  ["Submit research proposal", "Upload the final PDF and check the submission receipt.", "deadline", daysFromNow(2, 23), "University", "high", "pending"],
  ["Prepare presentation slides", "Turn the project notes into a short, visual presentation.", "task", daysFromNow(5, 14), "University", "medium", "pending"],
  ["Renew library books", "Return or renew the borrowed design books.", "deadline", daysFromNow(-2, 17), "Personal", "high", "pending"],
  ["Weekly planning", "Review priorities and plan the next seven days.", "task", daysFromNow(1, 9), "Planning", "low", "pending"],
  ["Team project check-in", "Share progress and agree on the next milestone.", "task", daysFromNow(8, 11), "Work", "medium", "pending"],
  ["Complete reading notes", "Summarise chapters four and five.", "task", daysFromNow(-5, 18), "University", "medium", "completed"],
];

try {
  const schema = await readFile(resolve("database/schema.sql"), "utf8");
  await pool.query(schema);
  const count = Number((await pool.query("SELECT COUNT(*) AS count FROM planner_items")).rows[0].count);

  if (count === 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of demoItems) {
        await client.query(
          `INSERT INTO planner_items (title, description, kind, due_at, category, priority, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          item,
        );
      }
      await client.query("COMMIT");
      console.log(`Created the planner_items table and added ${demoItems.length} demo items.`);
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
  console.error("\nPlanora could not connect to PostgreSQL.");
  console.error("Start it with: docker compose up -d");
  console.error("Then run:       npm run db:setup\n");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
