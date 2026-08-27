"use client";

import { useState } from "react";
import { FolderCog, Plus, Trash2, X } from "lucide-react";
import { descendantsOf } from "@/lib/categories";

export default function CategoryPanel({ categories, settings, onChanged, label = "Manage categories" }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState({ name: "", color: "#5e6c70", parent_id: "", is_hidden: false });
  const [impact, setImpact] = useState(null);
  const [replacement, setReplacement] = useState("");
  const [message, setMessage] = useState("");

  const choose = (id) => {
    setEditingId(id);
    const category = categories.find((item) => item.id === id);
    setForm(category ? { name: category.name, color: category.color, parent_id: category.parent_id || "", is_hidden: category.is_hidden } : { name: "", color: "#5e6c70", parent_id: "", is_hidden: false });
    setImpact(null); setMessage("");
  };

  const save = async (event) => {
    event.preventDefault(); setMessage("");
    const response = await fetch(editingId ? `/api/categories/${editingId}` : "/api/categories", {
      method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, parent_id: form.parent_id || null }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    choose(data.category.id); await onChanged();
  };

  const previewDelete = async () => {
    const response = await fetch(`/api/categories/${editingId}`, { method: "DELETE" });
    const data = await response.json();
    if (response.status === 409) {
      setImpact(data.impact);
      const deletedIds = descendantsOf(categories, editingId);
      setReplacement(deletedIds.has(settings?.default_category_id) ? "" : settings?.default_category_id || "");
    }
    else setMessage(data.error || "Could not calculate the impact.");
  };

  const confirmDelete = async () => {
    const response = await fetch(`/api/categories/${editingId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, replacement_category_id: replacement || null }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    setImpact(null); choose(""); await onChanged();
  };

  const updateSettings = async (changes) => {
    const response = await fetch("/api/settings/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    await onChanged();
  };

  return (
    <>
      <button className="category-manage-button" type="button" onClick={() => setOpen(true)}><FolderCog size={15} /><span>{label}</span></button>

      {open ? <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section className="modal category-manager" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
          <div className="modal-heading"><div><p className="eyebrow">Folder system</p><h2 id="category-manager-title">Manage categories</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close category manager"><X size={20} /></button></div>
          <div className="manager-grid">
            <div className="manager-list"><button type="button" onClick={() => choose("")}><Plus size={14} /> New category</button>{categories.map((category) => <button className={editingId === category.id ? "active" : ""} type="button" key={category.id} onClick={() => choose(category.id)}><span style={{ background: category.color }} />{category.name}</button>)}</div>
            <form className="manager-form" onSubmit={save}>
              <label className="field"><span>Name</span><input required maxLength={60} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <div className="form-grid"><label className="field"><span>Color</span><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label><label className="field"><span>Parent folder</span><select value={form.parent_id} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}><option value="">Top level</option>{categories.filter((category) => !descendantsOf(categories, editingId).has(category.id)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div>
              <label className="check-field"><input type="checkbox" checked={form.is_hidden} onChange={(event) => setForm({ ...form, is_hidden: event.target.checked })} /> Hide this category from normal filters</label>
              {message ? <p className="form-error">{message}</p> : null}
              <div className="manager-actions"><button className="primary-button" type="submit">{editingId ? "Save changes" : "Create category"}</button>{editingId ? <button className="danger-button" type="button" onClick={previewDelete}><Trash2 size={14} /> Move to Trash</button> : null}</div>
            </form>
          </div>
          <div className="category-settings"><label>Default category<select value={settings?.default_category_id || ""} onChange={(event) => updateSettings({ default_category_id: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Maximum nesting depth<input type="number" min="1" max="8" value={settings?.max_category_depth || 4} onChange={(event) => updateSettings({ max_category_depth: Number(event.target.value) })} /></label></div>
          {impact ? <div className="impact-warning"><strong>Move this category to Trash?</strong><p>{impact.categories} {impact.categories === 1 ? "category" : "categories"} will move to Trash. {impact.items} standalone tasks/deadlines will stay active and move to the replacement category. Project work remains organized by project.</p><label className="field"><span>Replacement category</span><select value={replacement} onChange={(event) => setReplacement(event.target.value)}><option value="">Select category</option>{categories.filter((category) => !descendantsOf(categories, editingId).has(category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div><button type="button" className="secondary-button" onClick={() => setImpact(null)}>Cancel</button><button type="button" className="danger-button" disabled={!replacement} onClick={confirmDelete}>Reassign and move to Trash</button></div></div> : null}
        </section>
      </div> : null}
    </>
  );
}
