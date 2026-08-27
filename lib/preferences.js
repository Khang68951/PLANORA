export const APP_THEMES = ["paper", "ocean", "night"];
export const CALENDAR_VIEWS = ["day", "week", "month"];

export const DEFAULT_APP_PREFERENCES = Object.freeze({
  theme: "paper",
  defaultCalendarView: "month",
  reducedMotion: false,
});

export function normalizeAppPreferences(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    theme: APP_THEMES.includes(input.theme) ? input.theme : DEFAULT_APP_PREFERENCES.theme,
    defaultCalendarView: CALENDAR_VIEWS.includes(input.defaultCalendarView) ? input.defaultCalendarView : DEFAULT_APP_PREFERENCES.defaultCalendarView,
    reducedMotion: typeof input.reducedMotion === "boolean" ? input.reducedMotion : DEFAULT_APP_PREFERENCES.reducedMotion,
  };
}
