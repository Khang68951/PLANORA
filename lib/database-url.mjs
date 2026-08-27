export const DEFAULT_DATABASE_URL = "postgresql://planora:planora@127.0.0.1:5432/planora";

export function normalizeDatabaseUrl(value) {
  if (!value || typeof value !== "string") {
    throw new Error("DATABASE_URL is not configured. Run npm run db:setup first.");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must start with postgresql:// or postgres://.");
  }

  // Ubuntu can resolve localhost to ::1, which may reach a native PostgreSQL
  // service instead of the Docker port published on IPv4.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";

  return url.toString();
}

export function describeDatabaseUrl(value) {
  const url = new URL(normalizeDatabaseUrl(value));
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, "") || "(default)",
    user: decodeURIComponent(url.username) || "(default)",
  };
}

export function normalizeDatabaseEnvText(text) {
  let changed = false;
  const nextText = text.replace(/^DATABASE_URL=(.+)$/m, (line, value) => {
    const normalized = normalizeDatabaseUrl(value);
    if (normalized === value.trim()) return line;
    changed = true;
    return `DATABASE_URL=${normalized}`;
  });

  return { changed, text: nextText };
}
