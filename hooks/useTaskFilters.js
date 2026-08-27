"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeTaskFilterCount,
  selectPlannerItems,
  TASK_FILTER_DEFAULTS,
  taskFiltersFromSearchParams,
  taskFiltersToSearchParams,
} from "@/lib/task-selectors";

export function useTaskFilters(items) {
  const [filters, setFilters] = useState(() => typeof window === "undefined"
    ? { ...TASK_FILTER_DEFAULTS }
    : taskFiltersFromSearchParams(window.location.search));

  useEffect(() => {
    const updateFromNavigation = () => setFilters(taskFiltersFromSearchParams(window.location.search));
    window.addEventListener("popstate", updateFromNavigation);
    return () => window.removeEventListener("popstate", updateFromNavigation);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const managedKeys = Object.keys(TASK_FILTER_DEFAULTS);
    for (const key of managedKeys) url.searchParams.delete(key);
    const next = taskFiltersToSearchParams(filters);
    for (const [key, value] of next) url.searchParams.append(key, value);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [filters]);

  const updateFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);
  const clearFilters = useCallback(() => setFilters({ ...TASK_FILTER_DEFAULTS }), []);
  const visibleItems = useMemo(() => selectPlannerItems(items, filters), [items, filters]);
  const activeCount = useMemo(() => activeTaskFilterCount(filters), [filters]);

  return { filters, setFilters, updateFilter, clearFilters, visibleItems, activeCount };
}
