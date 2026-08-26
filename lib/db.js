import pg from "pg";

const globalForDb = globalThis;

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Run npm run db:setup first.");
  }

  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export function getPool() {
  if (!globalForDb.planoraPool) globalForDb.planoraPool = createPool();
  return globalForDb.planoraPool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
