"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  CircleAlert,
  File,
  FilePlus2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Paperclip,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { buildDocumentDiff } from "@/lib/document-diff";
import { insertDocumentHtml, removeDocumentHtml } from "@/lib/document-insertion";
import AIApprovalReview from "./project/AIApprovalReview";

const workspaceTabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "files", label: "Files", icon: Paperclip },
  { id: "tasks", label: "Tasks & Deadlines", icon: ListChecks },
  { id: "members", label: "Members", icon: Users },
];
const projectTabResources = {
  overview: ["members", "items"],
  documents: ["documents"],
  files: ["files"],
  tasks: ["items", "members"],
  members: ["members"],
};
const projectResourceUrl = (projectId, tab) => {
  const include = [...new Set(["messages", "runs", ...(projectTabResources[tab] || [])])];
  return `/api/projects/${projectId}?include=${include.join(",")}`;
};
const emptyWorkspaceResources = { members: [], documents: [], files: [], items: [], messages: [], tools: [], runs: [], commands: [] };
const emptyProject = {
  name: "",
  description: "",
  type: "other",
  startDate: "",
  deadline: "",
  status: "active",
  progress: 0,
};
const api = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const formatBytes = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const readChatStream = async (response, onEvent) => {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "AI request failed.");
  }
  if (!response.body)
    throw new Error("The AI response stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop();
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
    if (done) break;
  }
};

function ProjectForm({ initial = emptyProject, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial.name || "",
    description: initial.description || "",
    type: initial.type || "other",
    startDate: initial.startDate || "",
    deadline: initial.deadline || "",
    status: initial.status || "active",
    progress: initial.progress ?? 0,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...form,
        progress: Number(form.progress),
        startDate: form.startDate || null,
        deadline: form.deadline || null,
      });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="project-form" onSubmit={submit}>
      <label className="field">
        <span>Project name</span>
        <input
          required
          maxLength={120}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>
          Description <small>optional</small>
        </span>
        <textarea
          maxLength={4000}
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Type</span>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {["academic", "work", "personal", "research", "other"].map(
              (value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Start date</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Deadline</span>
          <input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Status</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {["planned", "active", "on_hold", "completed"].map((value) => (
              <option value={value} key={value}>
                {value.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Progress: {form.progress}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={form.progress}
            onChange={(e) => setForm({ ...form, progress: e.target.value })}
          />
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="modal-actions">
        {onCancel ? (
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className="primary-button" disabled={saving}>
          {saving ? "Saving…" : "Save project"}
        </button>
      </div>
    </form>
  );
}

function Overview({ data, reload }) {
  const [editing, setEditing] = useState(false);
  const { project, members, items } = data;
  const upcoming = items
    .filter((item) => item.status !== "completed")
    .slice(0, 5);
  if (editing)
    return (
      <section className="project-section panel">
        <ProjectForm
          initial={project}
          onCancel={() => setEditing(false)}
          onSave={async (form) => {
            await api(`/api/projects/${project.id}`, json("PATCH", form));
            setEditing(false);
            await reload();
          }}
        />
      </section>
    );
  return (
    <div className="project-overview-grid">
      <section className="project-section panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Project information</p>
            <h2>{project.name}</h2>
          </div>
          <button className="secondary-button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <p className="project-description">
          {project.description || "No description yet."}
        </p>
        <div className="project-meta-grid">
          <span>
            <small>Type</small>
            {project.type}
          </span>
          <span>
            <small>Status</small>
            {project.status.replace("_", " ")}
          </span>
          <span>
            <small>Start</small>
            {project.startDate || "Not set"}
          </span>
          <span>
            <small>Deadline</small>
            {project.deadline || "Not set"}
          </span>
        </div>
        <div className="project-progress">
          <span>
            <strong>{project.progress}%</strong> complete
          </span>
          <div>
            <i style={{ width: `${project.progress}%` }} />
          </div>
        </div>
      </section>
      <section className="project-section panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Team</p>
            <h2>{members.length} members</h2>
          </div>
        </div>
        <div className="member-chips">
          {members.slice(0, 8).map((member) => (
            <span key={member.id}>
              {member.name}
              <small>{member.role || "Member"}</small>
            </span>
          ))}
        </div>
      </section>
      <section className="project-section panel project-upcoming">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Next up</p>
            <h2>Tasks & deadlines</h2>
          </div>
        </div>
        {upcoming.length ? (
          upcoming.map((item) => (
            <div className="project-item-line" key={item.id}>
              <span className="project-work-marker" />
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.kind === "task"
                    ? new Date(item.endAt).toLocaleString()
                    : new Date(item.dueAt).toLocaleString()}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p className="muted-copy">Nothing upcoming.</p>
        )}
      </section>
    </div>
  );
}

function DocumentEditor({
  projectId,
  selected,
  reload,
  onDelete,
  onDirtyChange,
}) {
  const [title, setTitle] = useState(selected.title);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const editor = useRef(null);
  const markDirty = () => {
    setDirty(true);
    onDirtyChange(true);
  };
  const save = useCallback(async () => {
    if (!selected || !editor.current) return;
    setMessage("");
    try {
      await api(
        `/api/projects/${projectId}/documents/${selected.id}`,
        json("PATCH", { title, contentHtml: editor.current.innerHTML }),
      );
      setDirty(false);
      onDirtyChange(false);
      setMessage("Saved");
      await reload();
    } catch (error) {
      setMessage(error.message);
    }
  }, [onDirtyChange, projectId, reload, selected, title]);
  useEffect(() => {
    const key = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [save]);
  useEffect(() => {
    const warning = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);
  const remove = async () => {
    if (!window.confirm(`Delete “${selected.title}”?`)) return;
    await api(`/api/projects/${projectId}/documents/${selected.id}`, {
      method: "DELETE",
    });
    onDelete();
    await reload();
  };
  return (
    <>
      <div className="document-toolbar">
        <input
          aria-label="Document title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
        />
        <div>
          <span className={dirty ? "unsaved" : "saved"}>
            {dirty ? "Unsaved" : message || "Saved"}
          </span>
          <button onClick={() => document.execCommand("bold")}>
            <strong>B</strong>
          </button>
          <button onClick={() => document.execCommand("italic")}>
            <em>I</em>
          </button>
          <button onClick={() => document.execCommand("insertUnorderedList")}>
            List
          </button>
          <button className="save-document" onClick={save}>
            <Save size={14} /> Save
          </button>
          <button
            className="document-delete"
            onClick={remove}
            aria-label="Delete document"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div
        className="rich-editor"
        ref={editor}
        contentEditable
        suppressContentEditableWarning
        onInput={markDirty}
        dangerouslySetInnerHTML={{ __html: selected.contentHtml || "" }}
      />
    </>
  );
}

function DocumentAIReview({
  projectId,
  document,
  command,
  reload,
  onComplete,
}) {
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  let proposedContent = command.arguments.previewContentHtml || command.arguments.contentHtml;
  let insertionError = "";
  if (command.name === "documents.insert" && !command.arguments.previewContentHtml) {
    try {
      proposedContent = insertDocumentHtml(document.contentHtml, command.arguments);
    } catch (error) {
      insertionError = error.message;
      proposedContent = document.contentHtml;
    }
  }
  if (command.name === "documents.remove" && !command.arguments.previewContentHtml) {
    try {
      proposedContent = removeDocumentHtml(document.contentHtml, command.arguments);
    } catch (error) {
      insertionError = error.message;
      proposedContent = document.contentHtml;
    }
  }
  const diff = buildDocumentDiff(document.contentHtml, proposedContent);
  const proposedTitle = command.arguments.title?.trim() || document.title;
  const decide = async (action) => {
    setWorking(action);
    setError("");
    try {
      const result = await api(
        `/api/projects/${projectId}/ai/commands/${command.id}`,
        json("PATCH", { action }),
      );
      await reload();
      onComplete(result.command);
    } catch (decisionError) {
      setError(decisionError.message);
      setFailed(true);
      await reload();
    } finally {
      setWorking("");
    }
  };
  return (
    <section
      className="document-ai-review"
      aria-labelledby="document-ai-review-title"
    >
      <header className="document-review-toolbar">
        <div>
          <p className="eyebrow">AI edit shown in document</p>
          <h2 id="document-ai-review-title">{document.title}</h2>
        </div>
        <span>Not saved</span>
      </header>
      <div className="document-review-notice">
        <div>
          <strong>{command.summary}</strong>
          <p>
            The proposed edit is shown directly in the document. Green text
            will be added; red struck-through text will be removed.
          </p>
        </div>
        <div className="document-review-legend" aria-label="Change legend">
          <span className="added">Added</span>
          <span className="removed">Removed</span>
        </div>
      </div>
      <article className="document-review-page">
        {proposedTitle !== document.title ? (
          <div className="document-title-diff">
            <small>Title change</small>
            <del>{document.title}</del>
            <mark>{proposedTitle}</mark>
          </div>
        ) : (
          <h1>{document.title}</h1>
        )}
        <div
          className="document-diff"
          aria-label="Highlighted proposed document changes"
        >
          {diff.chunks.length ? (
            diff.chunks.map((chunk, index) =>
              chunk.type === "added" ? (
                <mark key={index}>{chunk.text}</mark>
              ) : chunk.type === "removed" ? (
                <del key={index}>{chunk.text}</del>
              ) : (
                <span key={index}>{chunk.text}</span>
              ),
            )
          ) : (
            <span className="muted-copy">The document will remain empty.</span>
          )}
        </div>
      </article>
      {insertionError || error ? (
        <p className="form-error document-review-error" role="alert">
          {insertionError || error}
        </p>
      ) : null}
      <footer className="document-review-actions">
        <p>
          {failed
            ? "This command can no longer be applied. Return to the document and ask the AI to prepare a new change."
            : "Nothing changes in PostgreSQL until you approve."}
        </p>
        <div>
          {failed ? (
            <button
              className="secondary-button"
              onClick={() => onComplete(command)}
            >
              Return to document
            </button>
          ) : (
            <>
              <button
                className="secondary-button"
                disabled={Boolean(working) || Boolean(insertionError)}
                onClick={() => decide("discard")}
              >
                {working === "discard" ? "Rejecting…" : "Reject AI change"}
              </button>
              <button
                className="primary-button"
                disabled={Boolean(working)}
                onClick={() => decide("approve")}
              >
                <Check size={15} />
                {working === "approve"
                  ? "Applying…"
                  : "Approve and update document"}
              </button>
            </>
          )}
        </div>
      </footer>
    </section>
  );
}

export function UnsavedDocumentDialog({ onCancel, onDiscard }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  return (
    <div
      className="modal-backdrop unsaved-warning-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="modal unsaved-warning-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-warning-title"
        aria-describedby="unsaved-warning-description"
      >
        <div className="unsaved-warning-icon">
          <TriangleAlert size={23} />
        </div>
        <p className="eyebrow">Unsaved document</p>
        <h2 id="unsaved-warning-title">Discard your changes?</h2>
        <p id="unsaved-warning-description">
          This document has changes that have not been saved. If you continue,
          those changes will be lost.
        </p>
        <div className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            autoFocus
            onClick={onCancel}
          >
            Keep editing
          </button>
          <button className="danger-button" type="button" onClick={onDiscard}>
            Discard changes
          </button>
        </div>
      </section>
    </div>
  );
}

function Documents({
  projectId,
  documents,
  reload,
  onDirtyChange,
  requestDiscard,
  reviewCommand,
  onReviewComplete,
}) {
  const [selectedId, setSelectedId] = useState(documents[0]?.id || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("Untitled document");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadedDocuments, setLoadedDocuments] = useState(() => new Map(documents.filter((document) => document.contentHtml !== undefined).map((document) => [document.id, document])));
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const reviewDocumentMetadata = reviewCommand
    ? documents.find(
        (document) => document.id === reviewCommand.arguments.documentId,
      )
    : null;
  const selectedMetadata = reviewDocumentMetadata || documents.find((document) => document.id === selectedId) || documents[0];
  const selected = selectedMetadata ? loadedDocuments.get(selectedMetadata.id) : null;
  useEffect(() => {
    if (!selectedMetadata) return;
    const loaded = loadedDocuments.get(selectedMetadata.id);
    if (loaded && new Date(loaded.updatedAt).getTime() === new Date(selectedMetadata.updatedAt).getTime()) return;
    let cancelled = false;
    // Fetching the selected document body is the effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocumentLoading(true);
    setDocumentError("");
    api(`/api/projects/${projectId}/documents/${selectedMetadata.id}`, { cache: "no-store" })
      .then((result) => {
        if (!cancelled) setLoadedDocuments((current) => new Map(current).set(result.document.id, result.document));
      })
      .catch((error) => { if (!cancelled) setDocumentError(error.message); })
      .finally(() => { if (!cancelled) setDocumentLoading(false); });
    return () => { cancelled = true; };
  }, [loadedDocuments, projectId, selectedMetadata]);
  const updateDirty = (value) => onDirtyChange(value);
  const choose = (id) =>
    requestDiscard(() => {
      updateDirty(false);
      setSelectedId(id);
    });
  useEffect(() => {
    if (!createOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !creating) setCreateOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createOpen, creating]);
  const openCreate = () =>
    requestDiscard(() => {
      updateDirty(false);
      setCreateName("Untitled document");
      setCreateError("");
      setCreateOpen(true);
    });
  const closeCreate = () => {
    if (!creating) setCreateOpen(false);
  };
  const create = async (event) => {
    event.preventDefault();
    const name = createName.trim();
    if (!name) return setCreateError("Enter a document name.");
    setCreating(true);
    setCreateError("");
    try {
      const data = await api(
        `/api/projects/${projectId}/documents`,
        json("POST", { title: name, contentHtml: "<p></p>" }),
      );
      updateDirty(false);
      setCreateOpen(false);
      await reload();
      setSelectedId(data.document.id);
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  };
  const completeReview = (command) => {
    setSelectedId(reviewCommand?.arguments.documentId || selectedId);
    onReviewComplete(command);
  };
  return (
    <>
      <section className="project-section panel document-workspace">
        <aside className="document-tabs">
          <button
            className="document-add"
            disabled={Boolean(reviewCommand)}
            onClick={openCreate}
          >
            <Plus size={14} /> New document
          </button>
          {documents.map((document) => (
            <button
              className={document.id === selectedMetadata?.id ? "active" : ""}
              key={document.id}
              disabled={Boolean(
                reviewCommand &&
                  reviewCommand.arguments.documentId !== document.id,
              )}
              onClick={() => choose(document.id)}
            >
              {document.title}
              {reviewCommand?.arguments.documentId === document.id ? (
                <span
                  className="document-review-dot"
                  title="AI change awaiting review"
                />
              ) : null}
            </button>
          ))}
        </aside>
        <div className="document-editor-shell">
          {documentLoading ? <div className="loading"><span /><p>Loading document…</p></div> : documentError ? <div className="notice" role="alert"><CircleAlert size={18} /><div><strong>Document unavailable</strong><span>{documentError}</span></div></div> : reviewCommand && selected ? (
            <DocumentAIReview
              key={reviewCommand.id}
              projectId={projectId}
              document={selected}
              command={reviewCommand}
              reload={reload}
              onComplete={completeReview}
            />
          ) : selected ? (
            <DocumentEditor
              key={`${selected.id}-${selected.updatedAt}`}
              projectId={projectId}
              selected={selected}
              reload={reload}
              onDirtyChange={updateDirty}
              onDelete={() => {
                updateDirty(false);
                setSelectedId("");
              }}
            />
          ) : (
            <div className="project-empty">
              <FilePlus2 size={28} />
              <h3>Create your first document</h3>
              <p>Documents save manually with Save or Ctrl+S.</p>
              <button className="primary-button" onClick={openCreate}>
                New document
              </button>
            </div>
          )}
        </div>
      </section>
      {createOpen ? (
        <div
          className="modal-backdrop document-create-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreate();
          }}
        >
          <section
            className="modal document-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-document-title"
          >
            <div className="modal-heading">
              <div className="document-create-heading">
                <span className="document-create-icon">
                  <FilePlus2 size={20} />
                </span>
                <div>
                  <p className="eyebrow">Project document</p>
                  <h2 id="create-document-title">Create a new document</h2>
                  <p>
                    Give this document a clear name. You can rename it later.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                disabled={creating}
                aria-label="Close document dialog"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={create}>
              <label className="field" htmlFor="new-document-name">
                <span>Document name</span>
                <input
                  id="new-document-name"
                  autoFocus
                  required
                  maxLength={120}
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  placeholder="For example, Project proposal"
                />
              </label>
              <p className="document-name-hint">Use up to 120 characters.</p>
              {createError ? (
                <p className="form-error" role="alert">
                  {createError}
                </p>
              ) : null}
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={creating || !createName.trim()}
                >
                  {creating ? "Creating…" : "Create document"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Files({ projectId, files, reload }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/projects/${projectId}/files`, { method: "POST", body });
      await reload();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const remove = async (file) => {
    if (!window.confirm(`Delete “${file.name}”?`)) return;
    await api(`/api/projects/${projectId}/files/${file.id}`, {
      method: "DELETE",
    });
    if (preview?.id === file.id) setPreview(null);
    await reload();
  };
  return (
    <div className="file-workspace">
      <section className="project-section panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Local attachments</p>
            <h2>Files</h2>
          </div>
          <label className="primary-button file-upload">
            <Paperclip size={16} />
            {uploading ? "Uploading…" : "Upload file"}
            <input type="file" disabled={uploading} onChange={upload} />
          </label>
        </div>
        <p className="muted-copy">
          Up to 10 MB. Images, PDFs, and text files can be previewed; text
          formats can be read by project AI.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="file-list">
          {files.map((file) => (
            <article key={file.id}>
              <File size={20} />
              <div>
                <strong>{file.name}</strong>
                <small>
                  {formatBytes(file.sizeBytes)} · {file.mimeType}
                  {file.aiReadable ? " · AI readable" : ""}
                </small>
              </div>
              {file.previewable ? (
                <button onClick={() => setPreview(file)}>Preview</button>
              ) : (
                <span className="file-no-preview">No preview</span>
              )}
              <button
                onClick={() => remove(file)}
                aria-label={`Delete ${file.name}`}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>
      {preview ? (
        <section className="project-section panel file-preview">
          <div className="panel-heading">
            <h2>{preview.name}</h2>
            <button onClick={() => setPreview(null)}>
              <X size={17} />
            </button>
          </div>
          <iframe
            title={`Preview ${preview.name}`}
            src={`/api/projects/${projectId}/files/${preview.id}/content`}
          />
        </section>
      ) : null}
    </div>
  );
}

function Members({ projectId, members, reload }) {
  const [form, setForm] = useState({ name: "", role: "" });
  const [error, setError] = useState("");
  const add = async (event) => {
    event.preventDefault();
    try {
      await api(`/api/projects/${projectId}/members`, json("POST", form));
      setForm({ name: "", role: "" });
      await reload();
    } catch (addError) {
      setError(addError.message);
    }
  };
  const remove = async (member) => {
    if (
      !window.confirm(
        `Remove ${member.name}? Their task assignments will also be removed.`,
      )
    )
      return;
    await api(`/api/projects/${projectId}/members/${member.id}`, {
      method: "DELETE",
    });
    await reload();
  };
  const edit = async (member) => {
    const name = window.prompt("Member name", member.name);
    if (!name) return;
    const role = window.prompt("Role (optional)", member.role || "");
    if (role === null) return;
    try {
      await api(
        `/api/projects/${projectId}/members/${member.id}`,
        json("PATCH", { name, role }),
      );
      await reload();
    } catch (editError) {
      setError(editError.message);
    }
  };
  return (
    <section className="project-section panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">People</p>
          <h2>Members</h2>
        </div>
      </div>
      <form className="member-add-form" onSubmit={add}>
        <input
          required
          maxLength={100}
          placeholder="Member name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          maxLength={80}
          placeholder="Role (optional)"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        />
        <button className="primary-button">Add member</button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="member-list">
        {members.map((member) => (
          <article key={member.id}>
            <span>{member.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{member.name}</strong>
              <small>{member.role || "Member"}</small>
            </div>
            <div className="member-actions">
              <button onClick={() => edit(member)}>Edit</button>
              <button
                onClick={() => remove(member)}
                aria-label={`Remove ${member.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectTasks({ data, reload }) {
  const { project, members, items } = data;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const initial = now.toISOString().slice(0, 16);
  const [form, setForm] = useState({
    title: "",
    kind: "task",
    at: initial,
    end: new Date(now.getTime() + 3600000).toISOString().slice(0, 16),
    priority: "medium",
    assigneeIds: [],
  });
  const [error, setError] = useState("");
  const add = async (event) => {
    event.preventDefault();
    const payload = {
      title: form.title,
      kind: form.kind,
      categoryId: project.categoryId,
      projectId: project.id,
      priority: form.priority,
      status: "pending",
      assigneeIds: form.assigneeIds,
      ...(form.kind === "task"
        ? {
            startAt: new Date(form.at).toISOString(),
            endAt: new Date(form.end).toISOString(),
          }
        : { dueAt: new Date(form.at).toISOString() }),
    };
    try {
      await api("/api/items", json("POST", payload));
      setForm({ ...form, title: "", assigneeIds: [] });
      await reload();
    } catch (addError) {
      setError(addError.message);
    }
  };
  const toggle = async (item) => {
    await api(
      `/api/items/${item.id}`,
      json("PATCH", {
        status: item.status === "completed" ? "pending" : "completed",
      }),
    );
    await reload();
  };
  const assign = async (item, memberId) => {
    const current = item.assignees?.map((member) => member.id) || [];
    const assigneeIds = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    try {
      await api(`/api/items/${item.id}`, json("PATCH", { assigneeIds }));
      await reload();
    } catch (assignError) {
      setError(assignError.message);
    }
  };
  return (
    <div className="project-task-layout">
      <section className="project-section panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Project work</p>
            <h2>Tasks & deadlines</h2>
          </div>
        </div>
        <div className="project-task-list">
          {items.map((item) => (
            <article key={item.id}>
              <button
                className={`check-button ${item.status === "completed" ? "checked" : ""}`}
                onClick={() => toggle(item)}
              >
                {item.status === "completed" ? <Check size={14} /> : null}
              </button>
              <div className="project-item-details">
                <strong>{item.title}</strong>
                <small>
                  {item.kind} · PIC: {" "}
                  {item.assignees?.map((member) => member.name).join(", ") ||
                    "None"}
                </small>
                {members.length ? (
                  <div className="inline-assignees">
                    <span>PIC</span>
                    {members.map((member) => (
                      <label key={member.id}>
                        <input
                          type="checkbox"
                          checked={Boolean(
                            item.assignees?.some(
                              (assigned) => assigned.id === member.id,
                            ),
                          )}
                          onChange={() => assign(item, member.id)}
                        />
                        {member.name}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <span>
                {new Date(
                  item.kind === "task" ? item.endAt : item.dueAt,
                ).toLocaleDateString()}
              </span>
            </article>
          ))}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </section>
      <section className="project-section panel">
        <h2>Add work</h2>
        <form onSubmit={add}>
          <label className="field">
            <span>Title</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Type</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="task">Task</option>
                <option value="deadline">Deadline</option>
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option>low</option>
                <option>medium</option>
                <option>high</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>{form.kind === "task" ? "Start" : "Due"}</span>
            <input
              type="datetime-local"
              required
              value={form.at}
              onChange={(e) => setForm({ ...form, at: e.target.value })}
            />
          </label>
          {form.kind === "task" ? (
            <label className="field">
              <span>End</span>
              <input
                type="datetime-local"
                required
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </label>
          ) : null}
          <fieldset className="assignee-picker">
            <legend>PIC (optional · choose one or more)</legend>
            {members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={form.assigneeIds.includes(member.id)}
                  onChange={() =>
                    setForm({
                      ...form,
                      assigneeIds: form.assigneeIds.includes(member.id)
                        ? form.assigneeIds.filter((id) => id !== member.id)
                        : [...form.assigneeIds, member.id],
                    })
                  }
                />
                {member.name}
              </label>
            ))}
            {!members.length ? <span>Add project members before choosing a PIC.</span> : null}
          </fieldset>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button">Add to project</button>
        </form>
      </section>
    </div>
  );
}

function AIWorkspace({ data, reload, onReviewDocument, reviewingCommandId }) {
  const { project, messages } = data;
  const [text, setText] = useState("");
  const [chatMessages, setChatMessages] = useState(messages);
  const [thinking, setThinking] = useState(false);
  const [commandWorking, setCommandWorking] = useState("");
  const [error, setError] = useState("");
  const [commandUpdates, setCommandUpdates] = useState([]);
  const [runUpdates, setRunUpdates] = useState([]);
  const [reviewRun, setReviewRun] = useState(null);
  const [mode, setMode] = useState(project.aiCommandMode || "approve_changes");
  const [pendingMode, setPendingMode] = useState("");
  const [aiConfig, setAiConfig] = useState(null);
  const [aiModels, setAiModels] = useState([]);
  const [workflow, setWorkflow] = useState({ stage: "ready", label: "Ready for a project request", scopes: [] });
  const chatRef = useRef(null);
  const composerRef = useRef(null);
  const commandTimers = useRef(new Set());
  const openedDocumentCommands = useRef(new Set());
  const requestController = useRef(null);
  const busy = thinking || Boolean(commandWorking);
  const answerStreaming = chatMessages.some((message) => message.streaming);
  const workflowStages = ["route", "context", "provider", "validate", "review"];

  const upsertCommand = (next) =>
    setCommandUpdates((current) =>
      [next, ...current.filter((command) => command.id !== next.id)].slice(
        0,
        40,
      ),
    );
  const finishStreamedCommand = (next) => {
    if (["pending", "running"].includes(next.status)) return upsertCommand(next);
    const timer = window.setTimeout(() => {
      upsertCommand(next);
      commandTimers.current.delete(timer);
    }, 900);
    commandTimers.current.add(timer);
  };
  const commands = useMemo(() => {
    const persistedCommands = data.commands || [];
    return [
      ...commandUpdates.filter((update) => {
        const persisted = persistedCommands.find(
          (command) => command.id === update.id,
        );
        return !persisted || ["pending", "running"].includes(persisted.status);
      }),
      ...persistedCommands.filter(
        (persisted) =>
          !commandUpdates.some(
            (update) =>
              update.id === persisted.id &&
              ["pending", "running"].includes(persisted.status),
          ),
      ),
    ];
  }, [commandUpdates, data.commands]);
  const runs = useMemo(() => {
    const persistedRuns = data.runs || [];
    return [
      ...runUpdates,
      ...persistedRuns.filter((run) => !runUpdates.some((update) => update.id === run.id)),
    ];
  }, [data.runs, runUpdates]);
  const upsertRun = (next) => {
    setRunUpdates((current) => [next, ...current.filter((run) => run.id !== next.id)].slice(0, 20));
    setReviewRun((current) => current?.id === next.id ? next : current);
  };
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages, thinking, commands.length]);
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 180)}px`;
    composer.style.overflowY = composer.scrollHeight > 180 ? "auto" : "hidden";
  }, [text]);
  useEffect(() => () => {
    requestController.current?.abort();
    for (const timer of commandTimers.current) window.clearTimeout(timer);
    commandTimers.current.clear();
  }, []);
  useEffect(() => {
    let cancelled = false;
    api("/api/settings/ai", { cache: "no-store" })
      .then((result) => {
        if (cancelled) return;
        setAiConfig(result.config);
        setAiModels(result.models || []);
      })
      .catch((settingsError) => {
        if (!cancelled) setError(settingsError.message);
      });
    return () => { cancelled = true; };
  }, []);

  const send = async (customMessage) => {
    const fromComposer = customMessage === undefined;
    const outgoing = (fromComposer ? text : customMessage).trim();
    if (!outgoing || thinking) return;
    const optimisticId = `pending-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    let assistantStarted = false;
    let completed = false;
    let changedProjectData = false;
    setChatMessages((current) => [
      ...current,
      { id: optimisticId, role: "user", content: outgoing },
    ]);
    if (fromComposer) setText("");
    setThinking(true);
    requestController.current = new AbortController();
    setWorkflow({ stage: "route", label: "Organizing your request", scopes: [] });
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${project.id}/ai/chat`,
        { ...json("POST", { message: outgoing }), signal: requestController.current.signal },
      );
      await readChatStream(response, (event) => {
        if (event.type === "error")
          throw new Error(event.message || "AI streaming failed.");
        if (event.type === "activity" && event.command)
          upsertCommand(event.command);
        if (event.type === "workflow")
          setWorkflow((current) => ({ ...current, ...event }));
        if (event.type === "delta") {
          if (!assistantStarted) {
            assistantStarted = true;
            setChatMessages((current) => [
              ...current,
              {
                id: streamingId,
                role: "assistant",
                content: event.text,
                streaming: true,
              },
            ]);
          } else
            setChatMessages((current) =>
              current.map((message) =>
                message.id === streamingId
                  ? { ...message, content: message.content + event.text }
                  : message,
              ),
            );
        }
        if (event.type === "replace") {
          assistantStarted = true;
          setChatMessages((current) =>
            current.some((message) => message.id === streamingId)
              ? current.map((message) =>
                  message.id === streamingId
                    ? { ...message, content: event.text, streaming: true }
                    : message,
                )
              : [
                  ...current,
                  {
                    id: streamingId,
                    role: "assistant",
                    content: event.text,
                    streaming: true,
                  },
                ],
          );
        }
        if (event.type === "done") {
          completed = true;
          setChatMessages((current) => [
            ...current.filter(
              (message) => ![optimisticId, streamingId].includes(message.id),
            ),
            ...(event.messages || []),
          ]);
          for (const command of event.commands || []) finishStreamedCommand(command);
          if (event.run) upsertRun(event.run);
          changedProjectData = (event.commands || []).some(
            (command) => command.status === "applied" && command.safety !== "read",
          );
          if (event.workflow)
            setWorkflow((current) => ({ ...current, ...event.workflow, label: event.workflow.stage === "review" ? "Waiting for your review" : event.workflow.stage === "error" ? "No valid review command was produced" : "Workflow complete" }));
          if (event.mode) setMode(event.mode);
        }
      });
      if (!completed)
        throw new Error(
          "The AI response ended before it could be saved. Please try again.",
        );
      if (changedProjectData) await reload();
    } catch (sendError) {
      setChatMessages((current) =>
        current.filter(
          (message) => ![optimisticId, streamingId].includes(message.id),
        ),
      );
      if (fromComposer) setText(outgoing);
      setWorkflow({ stage: "error", label: "Workflow stopped — review the error", scopes: [] });
      setError(sendError.message);
    } finally {
      requestController.current = null;
      setThinking(false);
    }
  };

  const commandAction = async (command, action) => {
    setCommandWorking(command.id);
    setError("");
    try {
      const result = await api(
        `/api/projects/${project.id}/ai/commands/${command.id}`,
        json("PATCH", { action }),
      );
      upsertCommand(result.command);
      if (command.runId) {
        const runResult = await api(`/api/projects/${project.id}/ai/runs/${command.runId}`, { cache: "no-store" });
        upsertRun(runResult.run);
      }
      await reload();
    } catch (actionError) {
      upsertCommand({
        ...command,
        status: "failed",
        error: actionError.message,
      });
      setError(actionError.message);
    } finally {
      setCommandWorking("");
    }
  };
  const runAction = async (run, action) => {
    setCommandWorking(run.id);
    setError("");
    try {
      const result = await api(`/api/projects/${project.id}/ai/runs/${run.id}`, json("PATCH", { action, expectedUpdatedAt: run.updatedAt }));
      upsertRun(result.run);
      for (const command of result.run.commands) upsertCommand(command);
      await reload();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setCommandWorking("");
    }
  };
  const saveMode = async (nextMode) => {
    setCommandWorking("mode");
    setError("");
    try {
      const result = await api(
        `/api/projects/${project.id}/ai/mode`,
        json("PATCH", { mode: nextMode }),
      );
      setMode(result.mode);
      setPendingMode("");
      await reload();
    } catch (modeError) {
      setError(modeError.message);
    } finally {
      setCommandWorking("");
    }
  };
  const chooseMode = (nextMode) => {
    if (nextMode === mode) return;
    if (nextMode === "auto") setPendingMode(nextMode);
    else void saveMode(nextMode);
  };
  const chooseModel = async (index) => {
    const selected = aiModels[index];
    if (!selected || !selected.keyConfigured) return;
    setCommandWorking("model");
    setError("");
    try {
      const result = await api(
        "/api/settings/ai",
        json("PATCH", { provider: selected.provider, model: selected.model }),
      );
      setAiConfig(result.config);
    } catch (modelError) {
      setError(modelError.message);
    } finally {
      setCommandWorking("");
    }
  };
  const activeRuns = runs.filter((run) => ["planning", "pending", "running", "partial"].includes(run.status) && run.commands.some((command) => ["pending", "running"].includes(command.status)));
  useEffect(() => {
    if (reviewingCommandId) return;
    const pendingDocumentEdit = commands.find(
      (command) =>
        command.status === "pending" &&
        ["documents.update", "documents.insert", "documents.remove"].includes(command.name) &&
        !openedDocumentCommands.current.has(command.id),
    );
    if (!pendingDocumentEdit) return;
    openedDocumentCommands.current.add(pendingDocumentEdit.id);
    onReviewDocument(pendingDocumentEdit);
  }, [commands, onReviewDocument, reviewingCommandId]);
  return (
    <>
      <div className="ai-workspace ai-workspace-rail">
        <section className="project-section panel ai-chat" aria-busy={thinking}>
          <div className="panel-heading ai-chat-heading">
            <div>
              <p className="eyebrow">Project-only context</p>
              <h2>AI Workspace</h2>
            </div>
          </div>
          <div className={`ai-workflow-status stage-${workflow.stage}`} role="status" aria-live="polite">
            <div>
              <span>Planora workflow</span>
              <strong>{workflow.label}</strong>
            </div>
            <ol aria-label="AI workflow progress">
              {workflowStages.map((stage, index) => {
                const activeIndex = workflow.stage === "complete" ? workflowStages.length : workflowStages.indexOf(workflow.stage);
                return <li className={index <= activeIndex ? "active" : ""} key={stage} title={stage} />;
              })}
            </ol>
          </div>
          <div className="chat-messages" ref={chatRef} aria-live="polite">
            {chatMessages.length ? (
              chatMessages.map((message) => (
                <article className={message.role} key={message.id}>
                  <strong>
                    {message.role === "user" ? "You" : "Planora AI"}
                  </strong>
                  <p>
                    {message.content}
                    {message.streaming ? (
                      <span className="streaming-cursor" aria-hidden="true" />
                    ) : null}
                  </p>
                </article>
              ))
            ) : !thinking ? (
              <div className="project-empty">
                <MessageSquare size={26} />
                <p>
                  Ask about project information, members, documents, tasks,
                  deadlines, or supported files.
                </p>
              </div>
            ) : null}
            {thinking && !answerStreaming ? (
              <article className="assistant chat-thinking" role="status">
                <strong>Planora AI</strong>
                <span aria-label="Thinking">
                  <i />
                  <i />
                  <i />
                </span>
              </article>
            ) : null}
            {activeRuns.map((run) => (
              <article className={`ai-run-summary status-${run.status}`} key={run.id} role="status">
                <div>
                  <strong>{run.summary}</strong>
                  <small>{run.progress.applied} applied · {run.progress.decided} of {run.progress.total} decided</small>
                </div>
                <div className="ai-run-summary-actions">
                  <button className="secondary-button" type="button" onClick={() => setReviewRun(run)}>Review changes</button>
                  <button className="primary-button" type="button" disabled={commandWorking === run.id || !run.commands.some((command) => command.status === "pending" && !["documents.update", "documents.insert", "documents.remove"].includes(command.name))} onClick={() => runAction(run, "approve_all")}>Approve eligible</button>
                </div>
              </article>
            ))}
          </div>
          <div className="chat-compose">
            <textarea
              ref={composerRef}
              rows={1}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Planora AI…"
            />
            <div className="chat-compose-footer">
              <div className="chat-compose-controls">
                <label className={`chat-compact-select ai-mode-${mode}`} title="Choose which AI commands need approval">
                  <span className="sr-only">Command approval mode</span>
                  <select value={mode} disabled={commandWorking === "mode"} onChange={(event) => chooseMode(event.target.value)}>
                    <option value="approve_all">Approve all</option>
                    <option value="approve_changes">Approve changes</option>
                    <option value="auto">Auto</option>
                  </select>
                </label>
                <label className="chat-compact-select" title="Choose an AI model configured in .env.local">
                  <span className="sr-only">AI model</span>
                  <select
                    value={Math.max(0, aiModels.findIndex((entry) => entry.provider === aiConfig?.provider && entry.model === aiConfig?.model))}
                    disabled={commandWorking === "model" || !aiModels.length}
                    onChange={(event) => chooseModel(Number(event.target.value))}
                  >
                    {!aiModels.length ? <option value="0">No .env model</option> : null}
                    {aiModels.map((entry, index) => (
                      <option value={index} disabled={!entry.keyConfigured} key={`${entry.provider}/${entry.model}`}>
                        {entry.provider} · {entry.model}{entry.keyConfigured ? "" : " · key missing"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="primary-button" disabled={!thinking && (busy || !text.trim())} onClick={() => thinking ? requestController.current?.abort() : send()}>
                {thinking ? "Stop" : "Send"}
              </button>
            </div>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </div>
      <AIApprovalReview
        run={reviewRun}
        workingId={commandWorking}
        onClose={() => setReviewRun(null)}
        onRunAction={runAction}
        onCommandAction={commandAction}
        onReviewDocument={onReviewDocument}
      />
      {pendingMode === "auto" ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal ai-auto-warning"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ai-auto-title"
          >
            <div className="unsaved-warning-icon">
              <TriangleAlert size={23} />
            </div>
            <p className="eyebrow">AI command permissions</p>
            <h2 id="ai-auto-title">Turn on Auto mode?</h2>
            <p>
              Planora AI will be allowed to read and modify most project data
              without asking each time. Document text edits still require
              highlighted review and approval. Actions remain recorded, and
              destructive commands move records out of active use with Undo
              instead of permanently deleting them.
            </p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setPendingMode("")}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={commandWorking === "mode"}
                onClick={() => saveMode("auto")}
              >
                {commandWorking === "mode" ? "Saving…" : "Turn on Auto"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default function ProjectWorkspace({
  projects,
  onProjectsChanged,
  onWorkspaceChanged,
  onDocumentDirtyChange,
}) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id || "");
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(Boolean(projects[0]));
  const [error, setError] = useState("");
  const [documentDirty, setDocumentDirty] = useState(false);
  const [documentReviewCommand, setDocumentReviewCommand] = useState(null);
  const [pendingDiscardAction, setPendingDiscardAction] = useState(null);
  const loadedProjectId = data?.project?.id || "";
  const effectiveSelectedId = projects.some(
    (project) => project.id === selectedId,
  )
    ? selectedId
    : "";
  const load = useCallback(async () => {
    if (!effectiveSelectedId) return;
    setError("");
    try {
      const result = await api(projectResourceUrl(effectiveSelectedId, activeTab), { cache: "no-store" });
      setData((current) => current?.project?.id === result.project.id ? { ...current, ...result } : { ...emptyWorkspaceResources, ...result });
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [activeTab, effectiveSelectedId]);
  const reloadWorkspace = useCallback(async () => {
    await Promise.all([load(), onWorkspaceChanged?.()]);
  }, [load, onWorkspaceChanged]);
  useEffect(() => {
    if (!effectiveSelectedId) return;
    let cancelled = false;
    fetch(projectResourceUrl(effectiveSelectedId, "overview"), { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Request failed.");
        return result;
      })
      .then((result) => {
        if (!cancelled) {
          setData({ ...emptyWorkspaceResources, ...result });
          setError("");
          setLoading(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedId]);
  useEffect(() => {
    if (!effectiveSelectedId || loadedProjectId !== effectiveSelectedId) return;
    // Loading the newly selected tab's resources is the effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [activeTab, effectiveSelectedId, load, loadedProjectId]);
  const create = async (form) => {
    const result = await api("/api/projects", json("POST", form));
    setCreating(false);
    await onProjectsChanged();
    setSelectedId(result.project.id);
  };
  const updateDocumentDirty = (value) => {
    setDocumentDirty(value);
    onDocumentDirtyChange?.(value);
  };
  const requestDiscard = (action) => {
    if (documentDirty) setPendingDiscardAction(() => action);
    else action();
  };
  const cancelDiscard = useCallback(() => setPendingDiscardAction(null), []);
  const confirmDiscard = () => {
    const action = pendingDiscardAction;
    setPendingDiscardAction(null);
    updateDocumentDirty(false);
    action?.();
  };
  const openDocumentReview = (command) => {
    requestDiscard(() => {
      updateDocumentDirty(false);
      setDocumentReviewCommand(command);
      setActiveTab("documents");
    });
  };
  const switchProject = (id) => {
    if (id === effectiveSelectedId) return;
    requestDiscard(() => {
      updateDocumentDirty(false);
      setLoading(true);
      setDocumentReviewCommand(null);
      setSelectedId(id);
      setActiveTab("overview");
    });
  };
  const closeProject = () => {
    requestDiscard(() => {
      updateDocumentDirty(false);
      setSelectedId("");
      setData(null);
      setError("");
      setLoading(false);
      setDocumentReviewCommand(null);
      setActiveTab("overview");
    });
  };
  const switchTab = (tab) => {
    if (tab === activeTab) return;
    requestDiscard(() => {
      if (tab !== "documents") updateDocumentDirty(false);
      setActiveTab(tab);
    });
  };
  return (
    <>
      <div className="project-page">
      {!effectiveSelectedId ? (
        <section className="page-heading project-page-heading">
          <div>
            <p className="eyebrow">Everything for the work</p>
            <h1>Projects</h1>
            <p className="lead">
              Create a workspace for the plan, people, documents, files, and
              project AI that belong together.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={() => setCreating(true)}>
            <Plus size={17} /> New project
          </button>
        </section>
      ) : null}
      {projects.length ? (
        !effectiveSelectedId ? (
          <section className="panel project-closed">
            <FolderKanban size={30} />
            <div>
              <h2>Choose a project to open</h2>
              <p>Closing a workspace does not delete or change any project data.</p>
            </div>
            <div className="project-closed-list">
              {projects.map((project) => (
                <button type="button" key={project.id} onClick={() => switchProject(project.id)}>
                  <FolderKanban size={17} aria-hidden="true" />
                  <strong>{project.name}</strong>
                </button>
              ))}
            </div>
          </section>
        ) : loading ? (
          <div className="project-loading">Loading project…</div>
        ) : error ? (
          <div className="notice">
            <strong>{error}</strong>
          </div>
        ) : data ? (
          <div className="project-notebook-shell">
            <aside className="project-workspace-sidebar panel">
              <div className="project-switcher">
                <div className="project-switcher-heading">
                  <label htmlFor="active-project">Current project</label>
                  <div className="project-switcher-actions">
                    <button type="button" onClick={() => setCreating(true)}>
                      <Plus size={13} /> New
                    </button>
                    <button type="button" onClick={closeProject}>
                      <X size={13} /> Close
                    </button>
                  </div>
                </div>
                <select
                  id="active-project"
                  value={effectiveSelectedId}
                  onChange={(event) => switchProject(event.target.value)}
                >
                  {projects.map((project) => (
                    <option value={project.id} key={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <div className="project-switcher-summary">
                  <FolderKanban size={16} aria-hidden="true" />
                  <p>
                    <strong>{data.project.name}</strong>
                    <small>{data.project.progress}% complete</small>
                  </p>
                </div>
              </div>
              <nav className="project-tabs" aria-label="Project workspace">
                {workspaceTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    className={activeTab === id ? "active" : ""}
                    key={id}
                    onClick={() => switchTab(id)}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </aside>
            <section
              className="project-main"
              aria-label="Selected project content"
            >
              <header className="project-header panel">
                <div>
                  <span className="project-type">{data.project.type}</span>
                  <h2>{data.project.name}</h2>
                </div>
                <div className="project-header-progress">
                  <strong>{data.project.progress}%</strong>
                  <span>complete</span>
                </div>
              </header>
              <div className="project-content-pane">
                {activeTab === "overview" ? (
                  <Overview data={data} reload={reloadWorkspace} />
                ) : null}
                {activeTab === "documents" ? (
                  <Documents
                    projectId={effectiveSelectedId}
                    documents={data.documents}
                    reload={reloadWorkspace}
                    onDirtyChange={updateDocumentDirty}
                    requestDiscard={requestDiscard}
                    reviewCommand={documentReviewCommand}
                    onReviewComplete={() => setDocumentReviewCommand(null)}
                  />
                ) : null}
                {activeTab === "files" ? (
                  <Files
                    projectId={effectiveSelectedId}
                    files={data.files}
                    reload={reloadWorkspace}
                  />
                ) : null}
                {activeTab === "tasks" ? (
                  <ProjectTasks data={data} reload={reloadWorkspace} />
                ) : null}
                {activeTab === "members" ? (
                  <Members
                    projectId={effectiveSelectedId}
                    members={data.members}
                    reload={reloadWorkspace}
                  />
                ) : null}
              </div>
            </section>
            <aside
              className="project-ai-column"
              aria-label="Project AI"
            >
              <AIWorkspace
                key={data.project.id}
                data={data}
                reload={reloadWorkspace}
                onReviewDocument={openDocumentReview}
                reviewingCommandId={documentReviewCommand?.id || ""}
              />
            </aside>
          </div>
        ) : null
      ) : (
        <div className="panel project-empty">
          <FolderKanban size={35} />
          <h2>No projects yet</h2>
          <p>
            Create a project to group its people, plans, documents, files, and
            AI context.
          </p>
          <button className="primary-button" type="button" onClick={() => setCreating(true)}>
            Create project
          </button>
        </div>
      )}
      </div>
      {creating ? (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">New workspace</p>
                <h2 id="new-project-title">Create project</h2>
              </div>
              <button type="button" onClick={() => setCreating(false)}>
                <X size={18} />
              </button>
            </div>
            <ProjectForm
              onSave={create}
              onCancel={() => setCreating(false)}
            />
          </section>
        </div>
      ) : null}
      {pendingDiscardAction ? (
        <UnsavedDocumentDialog
          onCancel={cancelDiscard}
          onDiscard={confirmDiscard}
        />
      ) : null}
    </>
  );
}
