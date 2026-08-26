import pg from "pg";
import { normalizeDatabaseUrl } from "./database-url.mjs";

const globalForDb = globalThis;

function createPool(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));
  return pool;
}

export function getPool() {
  const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);

  if (globalForDb.planoraPool && globalForDb.planoraPoolUrl !== connectionString) {
    void globalForDb.planoraPool.end().catch(() => {});
    globalForDb.planoraPool = undefined;
  }

  if (!globalForDb.planoraPool) {
    globalForDb.planoraPool = createPool(connectionString);
    globalForDb.planoraPoolUrl = connectionString;
  }

  return globalForDb.planoraPool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
