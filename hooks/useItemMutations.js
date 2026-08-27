"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api-client";

export function useItemMutations({ items, setItems, setError }) {
  const [saving, setSaving] = useState(false);

  const saveItem = useCallback(async (editingItem, form) => {
    setSaving(true);
    try {
      const data = editingItem
        ? await api.patch(`/api/items/${editingItem.id}`, { ...form, expectedUpdatedAt: editingItem.updatedAt })
        : await api.post("/api/items", form);
      setItems((current) => editingItem
        ? current.map((item) => item.id === data.item.id ? data.item : item)
        : [...current, data.item]);
      setError("");
      return data.item;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [setError, setItems]);

  const toggleItem = useCallback(async (item) => {
    const status = item.status === "completed" ? "pending" : "completed";
    const previous = items;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status } : candidate));
    try {
      const data = await api.patch(`/api/items/${item.id}`, { status, expectedUpdatedAt: item.updatedAt });
      setItems((current) => current.map((candidate) => candidate.id === data.item.id ? data.item : candidate));
    } catch (error) {
      setItems(previous);
      setError(error.message);
    }
  }, [items, setError, setItems]);

  const trashItem = useCallback(async (item) => {
    const previous = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await api.delete(`/api/items/${item.id}`);
    } catch (error) {
      setItems(previous);
      setError(error.message);
      throw error;
    }
  }, [items, setError, setItems]);

  return { saving, saveItem, toggleItem, trashItem };
}
