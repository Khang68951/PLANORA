"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, File, FilePlus2, FileText, FolderKanban, LayoutDashboard, ListChecks, MessageSquare, Paperclip, Plus, Save, Sparkles, Trash2, TriangleAlert, Users, X } from "lucide-react";

const workspaceTabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "files", label: "Files", icon: Paperclip },
  { id: "tasks", label: "Tasks & Deadlines", icon: ListChecks },
  { id: "members", label: "Members", icon: Users },
];
const emptyProject = { name: "", description: "", categoryId: "", type: "other", startDate: "", deadline: "", status: "active", progress: 0 };
const api = async (url, options) => { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed."); return data; };
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const readChatStream = async (response, onEvent) => {
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "AI request failed."); }
  if (!response.body) throw new Error("The AI response stream was unavailable.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/); buffer = done ? "" : lines.pop();
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
    if (done) break;
  }
};

function ProjectForm({ categories, initial = emptyProject, onSave, onCancel }) {
  const [form, setForm] = useState({ ...emptyProject, ...initial, startDate: initial.startDate || "", deadline: initial.deadline || "", categoryId: initial.categoryId || categories[0]?.id || "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (event) => { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ ...form, progress: Number(form.progress), startDate: form.startDate || null, deadline: form.deadline || null }); } catch (saveError) { setError(saveError.message); } finally { setSaving(false); } };
  return <form className="project-form" onSubmit={submit}>
    <label className="field"><span>Project name</span><input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label className="field"><span>Description <small>optional</small></span><textarea maxLength={4000} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
    <div className="form-grid"><label className="field"><span>Category</span><select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label className="field"><span>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{["academic", "work", "personal", "research", "other"].map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div>
    <div className="form-grid"><label className="field"><span>Start date</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label><label className="field"><span>Deadline</span><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label></div>
    <div className="form-grid"><label className="field"><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["planned", "active", "on_hold", "completed"].map((value) => <option value={value} key={value}>{value.replace("_", " ")}</option>)}</select></label><label className="field"><span>Progress: {form.progress}%</span><input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} /></label></div>
    {error ? <p className="form-error">{error}</p> : null}<div className="modal-actions">{onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button> : null}<button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save project"}</button></div>
  </form>;
}

function Overview({ data, categories, reload }) {
  const [editing, setEditing] = useState(false); const { project, members, items } = data;
  const upcoming = items.filter((item) => item.status !== "completed").slice(0, 5);
  if (editing) return <section className="project-section panel"><ProjectForm categories={categories} initial={project} onCancel={() => setEditing(false)} onSave={async (form) => { await api(`/api/projects/${project.id}`, json("PATCH", form)); setEditing(false); await reload(); }} /></section>;
  return <div className="project-overview-grid"><section className="project-section panel"><div className="panel-heading"><div><p className="eyebrow">Project information</p><h2>{project.name}</h2></div><button className="secondary-button" onClick={() => setEditing(true)}>Edit</button></div><p className="project-description">{project.description || "No description yet."}</p><div className="project-meta-grid"><span><small>Type</small>{project.type}</span><span><small>Status</small>{project.status.replace("_", " ")}</span><span><small>Start</small>{project.startDate || "Not set"}</span><span><small>Deadline</small>{project.deadline || "Not set"}</span></div><div className="project-progress"><span><strong>{project.progress}%</strong> complete</span><div><i style={{ width: `${project.progress}%` }} /></div></div></section><section className="project-section panel"><div className="panel-heading"><div><p className="eyebrow">Team</p><h2>{members.length} members</h2></div></div><div className="member-chips">{members.slice(0, 8).map((member) => <span key={member.id}>{member.name}<small>{member.role || "Member"}</small></span>)}</div></section><section className="project-section panel project-upcoming"><div className="panel-heading"><div><p className="eyebrow">Next up</p><h2>Tasks & deadlines</h2></div></div>{upcoming.length ? upcoming.map((item) => <div className="project-item-line" key={item.id}><span style={{ background: project.categoryColor }} /><div><strong>{item.title}</strong><small>{item.kind === "task" ? new Date(item.endAt).toLocaleString() : new Date(item.dueAt).toLocaleString()}</small></div></div>) : <p className="muted-copy">Nothing upcoming.</p>}</section></div>;
}

function DocumentEditor({ projectId, selected, reload, onDelete, onDirtyChange }) {
  const [title, setTitle] = useState(selected.title); const [dirty, setDirty] = useState(false); const [message, setMessage] = useState(""); const editor = useRef(null);
  const markDirty = () => { setDirty(true); onDirtyChange(true); };
  const save = useCallback(async () => { if (!selected || !editor.current) return; setMessage(""); try { await api(`/api/projects/${projectId}/documents/${selected.id}`, json("PATCH", { title, contentHtml: editor.current.innerHTML })); setDirty(false); onDirtyChange(false); setMessage("Saved"); await reload(); } catch (error) { setMessage(error.message); } }, [onDirtyChange, projectId, reload, selected, title]);
  useEffect(() => { const key = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [save]);
  useEffect(() => { const warning = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warning); return () => window.removeEventListener("beforeunload", warning); }, [dirty]);
  const remove = async () => { if (!window.confirm(`Delete “${selected.title}”?`)) return; await api(`/api/projects/${projectId}/documents/${selected.id}`, { method: "DELETE" }); onDelete(); await reload(); };
  return <><div className="document-toolbar"><input aria-label="Document title" value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} /><div><span className={dirty ? "unsaved" : "saved"}>{dirty ? "Unsaved" : message || "Saved"}</span><button onClick={() => document.execCommand("bold")}><strong>B</strong></button><button onClick={() => document.execCommand("italic")}><em>I</em></button><button onClick={() => document.execCommand("insertUnorderedList")}>List</button><button className="save-document" onClick={save}><Save size={14} /> Save</button><button className="document-delete" onClick={remove} aria-label="Delete document"><Trash2 size={15} /></button></div></div><div className="rich-editor" ref={editor} contentEditable suppressContentEditableWarning onInput={markDirty} dangerouslySetInnerHTML={{ __html: selected.contentHtml || "" }} /></>;
}

export function UnsavedDocumentDialog({ onCancel, onDiscard }) {
  useEffect(() => { const closeOnEscape = (event) => { if (event.key === "Escape") onCancel(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onCancel]);
  return <div className="modal-backdrop unsaved-warning-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="modal unsaved-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-warning-title" aria-describedby="unsaved-warning-description"><div className="unsaved-warning-icon"><TriangleAlert size={23} /></div><p className="eyebrow">Unsaved document</p><h2 id="unsaved-warning-title">Discard your changes?</h2><p id="unsaved-warning-description">This document has changes that have not been saved. If you continue, those changes will be lost.</p><div className="modal-actions"><button className="secondary-button" type="button" autoFocus onClick={onCancel}>Keep editing</button><button className="danger-button" type="button" onClick={onDiscard}>Discard changes</button></div></section></div>;
}

function Documents({ projectId, documents, reload, onDirtyChange, requestDiscard }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.id || ""); const [createOpen, setCreateOpen] = useState(false); const [createName, setCreateName] = useState("Untitled document"); const [createError, setCreateError] = useState(""); const [creating, setCreating] = useState(false);
  const selected = documents.find((document) => document.id === selectedId) || documents[0];
  const updateDirty = (value) => onDirtyChange(value);
  const choose = (id) => requestDiscard(() => { updateDirty(false); setSelectedId(id); });
  useEffect(() => { if (!createOpen) return; const closeOnEscape = (event) => { if (event.key === "Escape" && !creating) setCreateOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [createOpen, creating]);
  const openCreate = () => requestDiscard(() => { updateDirty(false); setCreateName("Untitled document"); setCreateError(""); setCreateOpen(true); });
  const closeCreate = () => { if (!creating) setCreateOpen(false); };
  const create = async (event) => { event.preventDefault(); const name = createName.trim(); if (!name) return setCreateError("Enter a document name."); setCreating(true); setCreateError(""); try { const data = await api(`/api/projects/${projectId}/documents`, json("POST", { title: name, contentHtml: "<p></p>" })); updateDirty(false); setCreateOpen(false); await reload(); setSelectedId(data.document.id); } catch (error) { setCreateError(error.message); } finally { setCreating(false); } };
  return <><section className="project-section panel document-workspace"><aside className="document-tabs"><button className="document-add" onClick={openCreate}><Plus size={14} /> New document</button>{documents.map((document) => <button className={document.id === selected?.id ? "active" : ""} key={document.id} onClick={() => choose(document.id)}>{document.title}</button>)}</aside><div className="document-editor-shell">{selected ? <DocumentEditor key={`${selected.id}-${selected.updatedAt}`} projectId={projectId} selected={selected} reload={reload} onDirtyChange={updateDirty} onDelete={() => { updateDirty(false); setSelectedId(""); }} /> : <div className="project-empty"><FilePlus2 size={28} /><h3>Create your first document</h3><p>Documents save manually with Save or Ctrl+S.</p><button className="primary-button" onClick={openCreate}>New document</button></div>}</div></section>{createOpen ? <div className="modal-backdrop document-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}><section className="modal document-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-document-title"><div className="modal-heading"><div className="document-create-heading"><span className="document-create-icon"><FilePlus2 size={20} /></span><div><p className="eyebrow">Project document</p><h2 id="create-document-title">Create a new document</h2><p>Give this document a clear name. You can rename it later.</p></div></div><button type="button" onClick={closeCreate} disabled={creating} aria-label="Close document dialog"><X size={18} /></button></div><form onSubmit={create}><label className="field" htmlFor="new-document-name"><span>Document name</span><input id="new-document-name" autoFocus required maxLength={120} value={createName} onChange={(event) => setCreateName(event.target.value)} onFocus={(event) => event.target.select()} placeholder="For example, Project proposal" /></label><p className="document-name-hint">Use up to 120 characters.</p>{createError ? <p className="form-error" role="alert">{createError}</p> : null}<div className="modal-actions"><button className="secondary-button" type="button" onClick={closeCreate} disabled={creating}>Cancel</button><button className="primary-button" disabled={creating || !createName.trim()}>{creating ? "Creating…" : "Create document"}</button></div></form></section></div> : null}</>;
}

function Files({ projectId, files, reload }) {
  const [preview, setPreview] = useState(null); const [uploading, setUploading] = useState(false); const [error, setError] = useState("");
  const upload = async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); setError(""); try { const body = new FormData(); body.append("file", file); await api(`/api/projects/${projectId}/files`, { method: "POST", body }); await reload(); } catch (uploadError) { setError(uploadError.message); } finally { setUploading(false); event.target.value = ""; } };
  const remove = async (file) => { if (!window.confirm(`Delete “${file.name}”?`)) return; await api(`/api/projects/${projectId}/files/${file.id}`, { method: "DELETE" }); if (preview?.id === file.id) setPreview(null); await reload(); };
  return <div className="file-workspace"><section className="project-section panel"><div className="panel-heading"><div><p className="eyebrow">Local attachments</p><h2>Files</h2></div><label className="primary-button file-upload"><Paperclip size={16} />{uploading ? "Uploading…" : "Upload file"}<input type="file" disabled={uploading} onChange={upload} /></label></div><p className="muted-copy">Up to 10 MB. Images, PDFs, and text files can be previewed; text formats can be read by project AI.</p>{error ? <p className="form-error">{error}</p> : null}<div className="file-list">{files.map((file) => <article key={file.id}><File size={20} /><div><strong>{file.name}</strong><small>{formatBytes(file.sizeBytes)} · {file.mimeType}{file.aiReadable ? " · AI readable" : ""}</small></div>{file.previewable ? <button onClick={() => setPreview(file)}>Preview</button> : <span className="file-no-preview">No preview</span>}<button onClick={() => remove(file)} aria-label={`Delete ${file.name}`}><Trash2 size={15} /></button></article>)}</div></section>{preview ? <section className="project-section panel file-preview"><div className="panel-heading"><h2>{preview.name}</h2><button onClick={() => setPreview(null)}><X size={17} /></button></div><iframe title={`Preview ${preview.name}`} src={`/api/projects/${projectId}/files/${preview.id}/content`} /></section> : null}</div>;
}

function Members({ projectId, members, reload }) {
  const [form, setForm] = useState({ name: "", role: "" }); const [error, setError] = useState("");
  const add = async (event) => { event.preventDefault(); try { await api(`/api/projects/${projectId}/members`, json("POST", form)); setForm({ name: "", role: "" }); await reload(); } catch (addError) { setError(addError.message); } };
  const remove = async (member) => { if (!window.confirm(`Remove ${member.name}? Their task assignments will also be removed.`)) return; await api(`/api/projects/${projectId}/members/${member.id}`, { method: "DELETE" }); await reload(); };
  const edit = async (member) => { const name = window.prompt("Member name", member.name); if (!name) return; const role = window.prompt("Role (optional)", member.role || ""); if (role === null) return; try { await api(`/api/projects/${projectId}/members/${member.id}`, json("PATCH", { name, role })); await reload(); } catch (editError) { setError(editError.message); } };
  return <section className="project-section panel"><div className="panel-heading"><div><p className="eyebrow">People</p><h2>Members</h2></div></div><form className="member-add-form" onSubmit={add}><input required maxLength={100} placeholder="Member name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input maxLength={80} placeholder="Role (optional)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /><button className="primary-button">Add member</button></form>{error ? <p className="form-error">{error}</p> : null}<div className="member-list">{members.map((member) => <article key={member.id}><span>{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.role || "Member"}</small></div><div className="member-actions"><button onClick={() => edit(member)}>Edit</button><button onClick={() => remove(member)} aria-label={`Remove ${member.name}`}><Trash2 size={15} /></button></div></article>)}</div></section>;
}

function ProjectTasks({ data, reload }) {
  const { project, members, items } = data; const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); const initial = now.toISOString().slice(0, 16);
  const [form, setForm] = useState({ title: "", kind: "task", at: initial, end: new Date(now.getTime() + 3600000).toISOString().slice(0, 16), priority: "medium", assigneeIds: [] }); const [error, setError] = useState("");
  const add = async (event) => { event.preventDefault(); const payload = { title: form.title, kind: form.kind, categoryId: project.categoryId, projectId: project.id, priority: form.priority, status: "pending", assigneeIds: form.assigneeIds, ...(form.kind === "task" ? { startAt: new Date(form.at).toISOString(), endAt: new Date(form.end).toISOString() } : { dueAt: new Date(form.at).toISOString() }) }; try { await api("/api/items", json("POST", payload)); setForm({ ...form, title: "", assigneeIds: [] }); await reload(); } catch (addError) { setError(addError.message); } };
  const toggle = async (item) => { await api(`/api/items/${item.id}`, json("PATCH", { status: item.status === "completed" ? "pending" : "completed" })); await reload(); };
  const assign = async (item, memberId) => { const current = item.assignees?.map((member) => member.id) || []; const assigneeIds = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]; try { await api(`/api/items/${item.id}`, json("PATCH", { assigneeIds })); await reload(); } catch (assignError) { setError(assignError.message); } };
  return <div className="project-task-layout"><section className="project-section panel"><div className="panel-heading"><div><p className="eyebrow">Project work</p><h2>Tasks & deadlines</h2></div></div><div className="project-task-list">{items.map((item) => <article key={item.id}><button className={`check-button ${item.status === "completed" ? "checked" : ""}`} onClick={() => toggle(item)}>{item.status === "completed" ? <Check size={14} /> : null}</button><div className="project-item-details"><strong>{item.title}</strong><small>{item.kind} · {item.assignees?.map((member) => member.name).join(", ") || "Unassigned"}</small>{members.length ? <div className="inline-assignees">{members.map((member) => <label key={member.id}><input type="checkbox" checked={Boolean(item.assignees?.some((assigned) => assigned.id === member.id))} onChange={() => assign(item, member.id)} />{member.name}</label>)}</div> : null}</div><span>{new Date(item.kind === "task" ? item.endAt : item.dueAt).toLocaleDateString()}</span></article>)}</div>{error ? <p className="form-error">{error}</p> : null}</section><section className="project-section panel"><h2>Add work</h2><form onSubmit={add}><label className="field"><span>Title</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="form-grid"><label className="field"><span>Type</span><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="task">Task</option><option value="deadline">Deadline</option></select></label><label className="field"><span>Priority</span><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option></select></label></div><label className="field"><span>{form.kind === "task" ? "Start" : "Due"}</span><input type="datetime-local" required value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} /></label>{form.kind === "task" ? <label className="field"><span>End</span><input type="datetime-local" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label> : null}<fieldset className="assignee-picker"><legend>Assign members</legend>{members.map((member) => <label key={member.id}><input type="checkbox" checked={form.assigneeIds.includes(member.id)} onChange={() => setForm({ ...form, assigneeIds: form.assigneeIds.includes(member.id) ? form.assigneeIds.filter((id) => id !== member.id) : [...form.assigneeIds, member.id] })} />{member.name}</label>)}</fieldset>{error ? <p className="form-error">{error}</p> : null}<button className="primary-button">Add to project</button></form></section></div>;
}

const readableDocumentText = (html = "") => html
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|h[1-3]|li|blockquote|pre)>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

function AIWorkspace({ data, reload, documentDirty }) {
  const { project, messages, tools, documents } = data;
  const [text, setText] = useState("");
  const [chatMessages, setChatMessages] = useState(messages);
  const [thinking, setThinking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [proposals, setProposals] = useState([]);
  const [toolForm, setToolForm] = useState({ name: "", prompt: "" });
  const chatRef = useRef(null);
  const builtIns = [{ name: "Create Proposal", prompt: "Create a polished project proposal as a new rich-text document. Propose it for review." }, { name: "Break Into Tasks", prompt: "Break this project into practical tasks and deadlines. Propose database changes for review." }, { name: "Summarize Files", prompt: "Summarize the project files you can read and clearly list files you cannot read." }];
  const busy = thinking || applying;
  const hasDocumentUpdates = proposals.some((proposal) => proposal.type === "updateDocument");
  const answerStreaming = chatMessages.some((message) => message.streaming);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chatMessages, thinking]);

  const send = async (customMessage) => {
    const fromComposer = customMessage === undefined;
    const outgoing = (fromComposer ? text : customMessage).trim();
    if (!outgoing || thinking) return;
    const optimisticId = `pending-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    let assistantStarted = false;
    let completed = false;
    setChatMessages((current) => [...current, { id: optimisticId, role: "user", content: outgoing }]);
    if (fromComposer) setText("");
    setThinking(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/ai/chat`, json("POST", { message: outgoing }));
      await readChatStream(response, (event) => {
        if (event.type === "error") throw new Error(event.message || "AI streaming failed.");
        if (event.type === "delta") {
          if (!assistantStarted) {
            assistantStarted = true;
            setChatMessages((current) => [...current, { id: streamingId, role: "assistant", content: event.text, streaming: true }]);
          } else setChatMessages((current) => current.map((message) => message.id === streamingId ? { ...message, content: message.content + event.text } : message));
        }
        if (event.type === "replace") {
          assistantStarted = true;
          setChatMessages((current) => current.some((message) => message.id === streamingId)
            ? current.map((message) => message.id === streamingId ? { ...message, content: event.text, streaming: true } : message)
            : [...current, { id: streamingId, role: "assistant", content: event.text, streaming: true }]);
        }
        if (event.type === "done") {
          completed = true;
          setChatMessages((current) => [...current.filter((message) => ![optimisticId, streamingId].includes(message.id)), ...(event.messages || [])]);
          setProposals(event.proposedChanges || []);
        }
      });
      if (!completed) throw new Error("The AI response ended before it could be saved. Please try again.");
    } catch (sendError) {
      setChatMessages((current) => current.filter((message) => ![optimisticId, streamingId].includes(message.id)));
      if (fromComposer) setText(outgoing);
      setError(sendError.message);
    } finally { setThinking(false); }
  };

  const confirm = async () => {
    setApplying(true); setError("");
    try {
      for (const change of proposals) {
        if (change.type === "createDocument") await api(`/api/projects/${project.id}/documents`, json("POST", change.data));
        if (change.type === "updateDocument") {
          const { documentId, title, contentHtml, expectedUpdatedAt } = change.data;
          await api(`/api/projects/${project.id}/documents/${documentId}`, json("PATCH", { title, contentHtml, expectedUpdatedAt }));
        }
        if (["createTask", "createDeadline"].includes(change.type)) await api("/api/items", json("POST", { ...change.data, categoryId: project.categoryId, projectId: project.id, status: "pending" }));
      }
      setProposals([]); await reload();
    } catch (confirmError) { setError(confirmError.message); } finally { setApplying(false); }
  };
  const addTool = async (event) => { event.preventDefault(); try { await api(`/api/projects/${project.id}/ai/tools`, json("POST", toolForm)); setToolForm({ name: "", prompt: "" }); await reload(); } catch (toolError) { setError(toolError.message); } };
  const removeTool = async (tool) => { if (!window.confirm(`Delete “${tool.name}”?`)) return; await api(`/api/projects/${project.id}/ai/tools/${tool.id}`, { method: "DELETE" }); await reload(); };
  return <div className="ai-workspace ai-workspace-rail"><section className="project-section panel ai-chat" aria-busy={thinking}><div className="panel-heading"><div><p className="eyebrow">Project-only context</p><h2>AI Workspace</h2></div><Bot size={22} /></div><div className="chat-messages" ref={chatRef} aria-live="polite">{chatMessages.length ? chatMessages.map((message) => <article className={message.role} key={message.id}><strong>{message.role === "user" ? "You" : "Planora AI"}</strong><p>{message.content}{message.streaming ? <span className="streaming-cursor" aria-hidden="true" /> : null}</p></article>) : !thinking ? <div className="project-empty"><MessageSquare size={26} /><p>Ask about project information, members, documents, tasks, deadlines, or supported files.</p></div> : null}{thinking && !answerStreaming ? <article className="assistant chat-thinking" role="status"><strong>Planora AI</strong><span aria-label="Thinking"><i /><i /><i /></span></article> : null}</div>{proposals.length ? <div className="ai-review"><strong>Review required</strong><p>The AI proposed {proposals.length} database change{proposals.length === 1 ? "" : "s"}. Nothing is saved until you approve it.</p><div className="ai-review-list">{proposals.map((change, index) => { const document = change.type === "updateDocument" ? documents.find((item) => item.id === change.data.documentId) : null; return <section className="ai-review-item" key={`${change.type}-${index}`}><span>{change.type === "updateDocument" ? "Edit document" : change.type}</span><strong>{change.data?.title || document?.title || "Untitled"}</strong>{document ? <details><summary>Review current and proposed text</summary><div className="ai-document-comparison"><section><strong>Current</strong><pre>{readableDocumentText(document.contentHtml) || "Empty document"}</pre></section><section><strong>Proposed</strong><pre>{readableDocumentText(change.data.contentHtml) || "Empty document"}</pre></section></div></details> : null}</section>; })}</div>{documentDirty && hasDocumentUpdates ? <p className="ai-review-warning" role="status">Save or discard your current document changes before applying this AI edit.</p> : null}<div className="ai-review-actions"><button className="secondary-button" onClick={() => setProposals([])}>Discard</button><button className="primary-button" disabled={applying || (documentDirty && hasDocumentUpdates)} onClick={confirm}>{applying ? "Applying…" : "Approve and apply"}</button></div></div> : null}<div className="chat-compose"><textarea maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder="Ask Planora AI…" /><button className="primary-button" disabled={busy || !text.trim()} onClick={() => send()}>{thinking ? "Thinking…" : "Send"}</button></div>{error ? <p className="form-error" role="alert">{error}</p> : null}</section><section className="project-section panel ai-tools"><div className="panel-heading"><div><p className="eyebrow">Reusable prompts</p><h2>AI Skills</h2></div></div><div className="ai-tool-buttons">{[...builtIns, ...tools].map((tool) => <div className="ai-tool-row" key={tool.id || tool.name}><button disabled={busy} onClick={() => send(tool.prompt)}><Sparkles size={15} /><span><strong>{tool.name}</strong><small>{tool.prompt}</small></span></button>{tool.id ? <button className="ai-tool-delete" onClick={() => removeTool(tool)} aria-label={`Delete ${tool.name}`}><Trash2 size={14} /></button> : null}</div>)}</div><form className="custom-tool-form" onSubmit={addTool}><input required maxLength={60} placeholder="Custom skill name" value={toolForm.name} onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })} /><textarea required maxLength={2000} placeholder="What should the AI do?" value={toolForm.prompt} onChange={(e) => setToolForm({ ...toolForm, prompt: e.target.value })} /><button className="secondary-button">Add AI skill</button></form></section></div>;
}

export default function ProjectWorkspace({ categories, projects, onProjectsChanged, onDocumentDirtyChange }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id || ""); const [activeTab, setActiveTab] = useState("overview"); const [data, setData] = useState(null); const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(Boolean(projects[0])); const [error, setError] = useState(""); const [documentDirty, setDocumentDirty] = useState(false); const [pendingDiscardAction, setPendingDiscardAction] = useState(null);
  const effectiveSelectedId = projects.some((project) => project.id === selectedId) ? selectedId : projects[0]?.id || "";
  const load = useCallback(async () => { if (!effectiveSelectedId) return; setError(""); try { setData(await api(`/api/projects/${effectiveSelectedId}`, { cache: "no-store" })); } catch (loadError) { setError(loadError.message); } }, [effectiveSelectedId]);
  useEffect(() => {
    if (!effectiveSelectedId) return;
    let cancelled = false;
    fetch(`/api/projects/${effectiveSelectedId}`, { cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Request failed."); return result; })
      .then((result) => { if (!cancelled) { setData(result); setError(""); setLoading(false); } })
      .catch((loadError) => { if (!cancelled) { setError(loadError.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [effectiveSelectedId]);
  const create = async (form) => { const result = await api("/api/projects", json("POST", form)); setCreating(false); await onProjectsChanged(); setSelectedId(result.project.id); };
  const updateDocumentDirty = (value) => { setDocumentDirty(value); onDocumentDirtyChange?.(value); };
  const requestDiscard = (action) => { if (documentDirty) setPendingDiscardAction(() => action); else action(); };
  const cancelDiscard = useCallback(() => setPendingDiscardAction(null), []);
  const confirmDiscard = () => { const action = pendingDiscardAction; setPendingDiscardAction(null); updateDocumentDirty(false); action?.(); };
  const switchProject = (id) => { if (id === effectiveSelectedId) return; requestDiscard(() => { updateDocumentDirty(false); setLoading(true); setSelectedId(id); setActiveTab("overview"); }); };
  const switchTab = (tab) => { if (tab === activeTab) return; requestDiscard(() => { if (tab !== "documents") updateDocumentDirty(false); setActiveTab(tab); }); };
  return <div className="project-page"><section className="page-heading project-page-heading"><div><p className="eyebrow">Everything for the work</p><h1>Projects</h1><p className="lead">Navigate the workspace on the left, focus in the middle, and keep project AI ready on the right.</p></div><button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> New project</button></section>{projects.length ? loading ? <div className="project-loading">Loading project…</div> : error ? <div className="notice"><strong>{error}</strong></div> : data ? <div className="project-notebook-shell"><aside className="project-workspace-sidebar panel"><div className="project-switcher"><label htmlFor="active-project">Current project</label><select id="active-project" value={effectiveSelectedId} onChange={(event) => switchProject(event.target.value)}>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><div><span style={{ background: data.project.categoryColor }} /><p><strong>{data.project.name}</strong><small>{data.project.categoryName} · {data.project.progress}% complete</small></p></div></div><nav className="project-tabs" aria-label="Project workspace">{workspaceTabs.map(({ id, label, icon: Icon }) => <button className={activeTab === id ? "active" : ""} key={id} onClick={() => switchTab(id)}><Icon size={16} /><span>{label}</span></button>)}</nav></aside><section className="project-main" aria-label="Selected project content"><header className="project-header panel"><div><span className="project-type">{data.project.type}</span><h2>{data.project.name}</h2><p>{data.project.categoryName}</p></div><div className="project-header-progress"><strong>{data.project.progress}%</strong><span>complete</span></div></header><div className="project-content-pane">{activeTab === "overview" ? <Overview data={data} categories={categories} reload={load} /> : null}{activeTab === "documents" ? <Documents projectId={effectiveSelectedId} documents={data.documents} reload={load} onDirtyChange={updateDocumentDirty} requestDiscard={requestDiscard} /> : null}{activeTab === "files" ? <Files projectId={effectiveSelectedId} files={data.files} reload={load} /> : null}{activeTab === "tasks" ? <ProjectTasks data={data} reload={load} /> : null}{activeTab === "members" ? <Members projectId={effectiveSelectedId} members={data.members} reload={load} /> : null}</div></section><aside className="project-ai-column" aria-label="Project AI and skills"><AIWorkspace key={data.project.id} data={data} reload={load} documentDirty={documentDirty} /></aside></div> : null : <div className="panel project-empty"><FolderKanban size={35} /><h2>No projects yet</h2><p>Create a project to group its people, plans, documents, files, and AI context.</p><button className="primary-button" onClick={() => setCreating(true)}>Create project</button></div>}{creating ? <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title"><div className="modal-heading"><div><p className="eyebrow">New workspace</p><h2 id="new-project-title">Create project</h2></div><button onClick={() => setCreating(false)}><X size={18} /></button></div><ProjectForm categories={categories} onSave={create} onCancel={() => setCreating(false)} /></section></div> : null}{pendingDiscardAction ? <UnsavedDocumentDialog onCancel={cancelDiscard} onDiscard={confirmDiscard} /> : null}</div>;
}
