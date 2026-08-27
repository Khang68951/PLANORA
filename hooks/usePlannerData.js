"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export function usePlannerData() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categorySettings, setCategorySettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [itemData, categoryData, projectData] = await Promise.all([
        api.get("/api/items?limit=200", { cache: "no-store" }),
        api.get("/api/categories", { cache: "no-store" }),
        api.get("/api/projects", { cache: "no-store" }),
      ]);
      setItems(itemData.items);
      setCategories(categoryData.categories);
      setCategorySettings(categoryData.settings);
      setProjects(projectData.projects);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }, []);

  useEffect(() => {
    // Loading the external workspace is the effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {}).finally(() => setLoading(false));
  }, [refresh]);

  return {
    items,
    setItems,
    categories,
    projects,
    categorySettings,
    loading,
    error,
    setError,
    refresh,
  };
}
