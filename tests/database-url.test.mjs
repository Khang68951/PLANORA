import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DATABASE_URL,
  describeDatabaseUrl,
  normalizeDatabaseEnvText,
  normalizeDatabaseUrl,
} from "../lib/database-url.mjs";

test("the local default uses explicit IPv4", () => {
  assert.equal(DEFAULT_DATABASE_URL, "postgresql://planora:planora@127.0.0.1:5432/planora");
});

test("localhost is normalized without changing credentials or database", () => {
  assert.equal(
    normalizeDatabaseUrl("postgresql://someone:secret@localhost:5544/calendar"),
    "postgresql://someone:secret@127.0.0.1:5544/calendar",
  );
});

test("remote database hosts are preserved", () => {
  assert.equal(
    normalizeDatabaseUrl("postgresql://user:secret@db.example.com:5432/planora"),
    "postgresql://user:secret@db.example.com:5432/planora",
  );
});

test("safe descriptions never include the password", () => {
  assert.deepEqual(describeDatabaseUrl("postgresql://planora:super-secret@localhost:5432/planora"), {
    host: "127.0.0.1",
    port: "5432",
    database: "planora",
    user: "planora",
  });
});

test("existing local env text is migrated and other lines are preserved", () => {
  const result = normalizeDatabaseEnvText(
    "DATABASE_URL=postgresql://planora:planora@localhost:5432/planora\nOTHER=value\n",
  );
  assert.equal(result.changed, true);
  assert.equal(
    result.text,
    "DATABASE_URL=postgresql://planora:planora@127.0.0.1:5432/planora\nOTHER=value\n",
  );
});

test("invalid and non-PostgreSQL URLs are rejected", () => {
  assert.throws(() => normalizeDatabaseUrl("not a url"), /valid PostgreSQL URL/);
  assert.throws(() => normalizeDatabaseUrl("https://example.com"), /must start/);
});
