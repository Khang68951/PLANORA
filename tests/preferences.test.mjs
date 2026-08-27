import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APP_PREFERENCES, normalizeAppPreferences } from "../lib/preferences.js";

test("app preferences accept supported display choices", () => {
  assert.deepEqual(normalizeAppPreferences({ theme: "night", defaultCalendarView: "week", reducedMotion: true }), {
    theme: "night",
    defaultCalendarView: "week",
    reducedMotion: true,
  });
});

test("app preferences safely fall back when local data is missing or invalid", () => {
  assert.deepEqual(normalizeAppPreferences({ theme: "neon", defaultCalendarView: "year", reducedMotion: "yes" }), DEFAULT_APP_PREFERENCES);
  assert.deepEqual(normalizeAppPreferences(null), DEFAULT_APP_PREFERENCES);
});
