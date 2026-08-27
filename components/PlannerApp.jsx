"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import CategoryPanel from "./CategoryPanel";
import ProjectWorkspace, { UnsavedDocumentDialog } from "./ProjectWorkspace";
import { descendantsOf, visibleCategoryTree } from "@/lib/categories";
import { calendarDays, filterItemsByProjects, NO_PROJECT_FILTER, shiftCalendarCursor, startOfDay } from "@/lib/calendar";
import { DEFAULT_APP_PREFERENCES, normalizeAppPreferences } from "@/lib/preferences";

const PREFERENCES_KEY = "planora-app-preferences";

function storedPreferences() {
  if (typeof window === "undefined") return DEFAULT_APP_PREFERENCES;
  try {
    return normalizeAppPreferences(JSON.parse(window.localStorage.getItem(PREFERENCES_KEY)));
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "items", label: "Tasks & deadlines", icon: ListTodo },
  { id: "projects", label: "Projects", icon: FolderKanban },
];

const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const scheduleStart = (item) => new Date(item.kind === "task" ? item.startAt : item.dueAt);
const scheduleEnd = (item) => new Date(item.kind === "task" ? item.endAt : item.dueAt);
const isPast = (item) => item.status !== "completed" && scheduleEnd(item) < new Date();
const colorFor = (item) => item.categoryColor || "#5e6c70";
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const occursOnDay = (item, day) => scheduleStart(item) < new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) && scheduleEnd(item) >= startOfDay(day);

function relativeDue(item) {
  const due = scheduleEnd(item);
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(due) - today) / 86_400_000);
  if (item.status === "completed") return "Completed";
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return `In ${diff} days`;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Sparkles size={21} /></span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function CategoryFilter({ categories, selected, onChange, viewLabel, collapsible = false }) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const ordered = useMemo(() => visibleCategoryTree(categories, collapsible ? collapsedIds : new Set()), [categories, collapsible, collapsedIds]);
  const allIds = useMemo(() => categories.map((category) => category.id), [categories]);
  const selectedIds = useMemo(() => {
    const available = new Set(allIds);
    return new Set((selected === null ? allIds : selected).filter((id) => available.has(id)));
  }, [selected, allIds]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  const toggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const toggleCollapsed = (id) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <fieldset className="category-filter-panel">
      <legend className="sr-only">Filter {viewLabel} by category</legend>
      <div className="category-filter-heading">
        <div><strong>Categories shown in {viewLabel}</strong><span>{selectedIds.size} of {allIds.length} selected</span></div>
        <div><button type="button" onClick={() => onChange(null)}>Show all</button><button type="button" onClick={() => onChange([])}>Hide all</button></div>
      </div>
      {ordered.length ? <div className="category-checkboxes">
        <label className="category-check all-categories"><input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [] : null)} /><span className="category-check-box"><Check size={11} /></span><strong>All categories</strong></label>
        {ordered.map((category) => collapsible ? (
          <div className="category-tree-row" style={{ "--category-depth": category.depth }} key={category.id}>
            {category.hasChildren ? <button className={`category-tree-toggle ${collapsedIds.has(category.id) ? "collapsed" : ""}`} type="button" onClick={() => toggleCollapsed(category.id)} aria-expanded={!collapsedIds.has(category.id)} aria-label={`${collapsedIds.has(category.id) ? "Expand" : "Collapse"} ${category.name}`}><ChevronRight size={14} /></button> : <span className="category-tree-spacer" aria-hidden="true" />}
            <label className="category-check"><input type="checkbox" checked={selectedIds.has(category.id)} onChange={() => toggle(category.id)} /><span className="category-check-box"><Check size={11} /></span><span className="category-swatch" style={{ background: category.color }} /><span>{category.name}</span></label>
          </div>
        ) : <label className="category-check" style={{ "--category-depth": category.depth }} key={category.id}><input type="checkbox" checked={selectedIds.has(category.id)} onChange={() => toggle(category.id)} /><span className="category-check-box"><Check size={11} /></span><span className="category-swatch" style={{ background: category.color }} /><span>{category.name}</span></label>)}
      </div> : <p className="category-filter-empty">Create a category to filter this view.</p>}
    </fieldset>
  );
}

function ProjectFilter({ projects, selected, onChange }) {
  const allIds = useMemo(() => [NO_PROJECT_FILTER, ...projects.map((project) => project.id)], [projects]);
  const selectedIds = useMemo(() => {
    const available = new Set(allIds);
    return new Set((selected === null ? allIds : selected).filter((id) => available.has(id)));
  }, [selected, allIds]);
  const allSelected = allIds.every((id) => selectedIds.has(id));
  const toggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <fieldset className="category-filter-panel project-filter-panel">
      <legend className="sr-only">Filter Calendar by project</legend>
      <div className="category-filter-heading">
        <div><strong>Projects shown in Calendar</strong><span>{selectedIds.size} of {allIds.length} selected</span></div>
        <div><button type="button" onClick={() => onChange(null)}>Show all</button><button type="button" onClick={() => onChange([])}>Hide all</button></div>
      </div>
      <div className="category-checkboxes">
        <label className="category-check all-categories"><input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [] : null)} /><span className="category-check-box"><Check size={11} /></span><strong>All projects</strong></label>
        <label className="category-check"><input type="checkbox" checked={selectedIds.has(NO_PROJECT_FILTER)} onChange={() => toggle(NO_PROJECT_FILTER)} /><span className="category-check-box"><Check size={11} /></span><span className="project-filter-swatch" /><span>No project</span></label>
        {projects.map((project) => <label className="category-check" key={project.id}><input type="checkbox" checked={selectedIds.has(project.id)} onChange={() => toggle(project.id)} /><span className="category-check-box"><Check size={11} /></span><span className="category-swatch" style={{ background: project.categoryColor }} /><span>{project.name}</span></label>)}
      </div>
    </fieldset>
  );
}

function ItemRow({ item, onToggle, onDelete, onEdit, compact = false, showPic = false }) {
  const overdue = isPast(item);
  return (
    <article className={`item-row ${item.status === "completed" ? "is-complete" : ""}`}>
      <button
        className="check-button"
        type="button"
        aria-label={item.status === "completed" ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`}
        onClick={() => onToggle(item)}
      >
        {item.status === "completed" ? <Check size={15} /> : null}
      </button>
      <span className="category-dot" style={{ background: colorFor(item) }} />
      <div className="item-copy">
        <div className="item-title-line">
          <h3>{item.title}</h3>
          <span className={`kind-pill ${item.kind}`}>{item.kind}</span>
        </div>
        {!compact && item.description ? <p>{item.description}</p> : null}
        <div className="item-meta">
          <span className={overdue ? "overdue" : ""}><Clock3 size={13} /> {relativeDue(item)}</span>
          <span>{item.kind === "task" ? `${scheduleStart(item).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${scheduleEnd(item).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : scheduleEnd(item).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          <span>{item.categoryName}</span>
          {item.projectTitle ? <span>Project: {item.projectTitle}</span> : null}
          {showPic && item.assignees?.length ? <span className="item-pic"><Users size={13} /><strong>PIC:</strong> {item.assignees.map((member) => member.name).join(", ")}</span> : null}
        </div>
      </div>
      <div className="item-actions"><button className="edit-button" type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`}><Pencil size={16} /></button><button className="delete-button" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}><Trash2 size={17} /></button></div>
    </article>
  );
}

function Dashboard({ items, categories, categoryFilter, onCategoryFilter, onNavigate, onToggle, onDelete, onEdit, onAdd }) {
  const active = items.filter((item) => item.status !== "completed");
  const overdue = active.filter(isPast);
  const today = active.filter((item) => occursOnDay(item, new Date()));
  const upcoming = active.filter((item) => {
    const diff = startOfDay(scheduleStart(item)) - startOfDay(new Date());
    return diff > 0 && diff <= 7 * 86_400_000;
  });
  const focus = [...overdue, ...today, ...upcoming].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).slice(0, 5);

  return (
    <div className="view-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">Your daily overview</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}.</h1>
          <p className="lead">Here’s what deserves your attention today.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => onAdd()}><Plus size={18} /> Add item</button>
      </section>

      <CategoryFilter categories={categories} selected={categoryFilter} onChange={onCategoryFilter} viewLabel="Dashboard" />

      <section className="stat-grid" aria-label="Plan summary">
        <button className="stat-card today-card" onClick={() => onNavigate("items")}>
          <span className="stat-icon"><CalendarDays size={20} /></span>
          <span><strong>{today.length}</strong><small>Due today</small></span>
          <ChevronRight size={18} />
        </button>
        <button className="stat-card week-card" onClick={() => onNavigate("calendar")}>
          <span className="stat-icon"><Clock3 size={20} /></span>
          <span><strong>{upcoming.length}</strong><small>Next 7 days</small></span>
          <ChevronRight size={18} />
        </button>
        <button className="stat-card overdue-card" onClick={() => onNavigate("items")}>
          <span className="stat-icon"><CircleAlert size={20} /></span>
          <span><strong>{overdue.length}</strong><small>Overdue</small></span>
          <ChevronRight size={18} />
        </button>
        <button className="stat-card done-card" onClick={() => onNavigate("items")}>
          <span className="stat-icon"><CheckCircle2 size={20} /></span>
          <span><strong>{items.filter((item) => item.status === "completed").length}</strong><small>Completed</small></span>
          <ChevronRight size={18} />
        </button>
      </section>

      <section className="panel focus-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Priority queue</p><h2>Needs attention</h2></div>
          <button className="text-button" type="button" onClick={() => onNavigate("items")}>View all <ArrowRight size={15} /></button>
        </div>
        {focus.length ? <div className="item-list">{focus.map((item) => <ItemRow compact showPic key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}</div> : <EmptyState title="You’re all caught up" message="Nothing urgent is waiting. Enjoy the breathing room." />}
      </section>
    </div>
  );
}

function CalendarView({ items, categories, projects, categoryFilter, onCategoryFilter, projectFilter, onProjectFilter, cursor, setCursor, onAdd, onToggle, onDelete, onEdit, defaultMode = "month" }) {
  const [mode, setMode] = useState(defaultMode);
  const days = calendarDays(cursor, mode);
  const rangeEnd = new Date(days.at(-1).getFullYear(), days.at(-1).getMonth(), days.at(-1).getDate() + 1);
  const periodItems = items.filter((item) => scheduleStart(item) < rangeEnd && scheduleEnd(item) >= days[0]);
  const periodLabel = mode === "day" ? "day" : mode === "week" ? "week" : "month";
  const title = mode === "month"
    ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : mode === "day"
      ? cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days.at(-1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const move = (amount) => setCursor(shiftCalendarCursor(cursor, mode, amount));
  const dayItems = mode === "day" ? items.filter((item) => occursOnDay(item, days[0])) : [];

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div><p className="eyebrow">Choose your level of detail</p><h1>Calendar</h1><p className="lead">Move between a focused day, one week, or the whole month.</p></div>
        <button className="primary-button" type="button" onClick={() => onAdd()}><Plus size={18} /> Add item</button>
      </section>
      <section className="calendar-layout">
        <div className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div><h2>{title}</h2><span>{periodItems.length} {periodItems.length === 1 ? "item" : "items"} this {periodLabel}</span></div>
            <div className="calendar-toolbar-actions">
              <div className="calendar-view-switch" role="group" aria-label="Calendar view">
                {["day", "week", "month"].map((view) => <button className={mode === view ? "active" : ""} type="button" key={view} onClick={() => setMode(view)} aria-pressed={mode === view}>{view[0].toUpperCase() + view.slice(1)}</button>)}
              </div>
              <div className="calendar-controls">
                <button type="button" onClick={() => setCursor(new Date())}>Today</button>
                <button type="button" aria-label={`Previous ${periodLabel}`} onClick={() => move(-1)}><ArrowLeft size={17} /></button>
                <button type="button" aria-label={`Next ${periodLabel}`} onClick={() => move(1)}><ArrowRight size={17} /></button>
              </div>
            </div>
          </div>
          {mode === "day" ? <div className="day-agenda">
            <button className="day-add-area" type="button" onClick={() => onAdd(days[0])}><Plus size={16} /> Plan something on this day</button>
            {dayItems.length ? <div className="item-list day-item-list">{dayItems.map((item) => <ItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}</div> : <EmptyState title="Nothing planned" message="Use the button above to add a task or deadline." />}
          </div> : <div className={`calendar-grid-shell ${mode}-calendar-grid-shell`}>
            <div className="calendar-grid week-labels">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className={`calendar-grid days-grid ${mode === "week" ? "week-days-grid" : "month-days-grid"}`}>
              {days.map((day) => {
                const itemsForDay = items.filter((item) => occursOnDay(item, day));
                const muted = mode === "month" && day.getMonth() !== cursor.getMonth();
                const limit = mode === "week" ? 8 : 3;
                return (
                  <button key={dateKey(day)} className={`day-cell ${muted ? "muted" : ""} ${sameDay(day, new Date()) ? "today" : ""}`} type="button" onClick={() => onAdd(day)}>
                    <span className="day-number">{day.getDate()}</span>
                    <span className="day-items">
                      {itemsForDay.slice(0, limit).map((item) => <span className={`calendar-item ${item.status === "completed" ? "is-complete" : ""}`} key={item.id} style={{ "--item-color": colorFor(item) }}>{item.title}</span>)}
                      {itemsForDay.length > limit ? <span className="more-items">+{itemsForDay.length - limit} more</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>}
        </div>
        <aside className="calendar-side-column" aria-label="Calendar controls and upcoming items">
          <div className="calendar-category-filter"><CategoryFilter categories={categories} selected={categoryFilter} onChange={onCategoryFilter} viewLabel="Calendar" collapsible /></div>
          <div className="calendar-project-filter"><ProjectFilter projects={projects} selected={projectFilter} onChange={onProjectFilter} /></div>
          <section className="panel calendar-aside">
            <div className="panel-heading"><div><p className="eyebrow">Next up</p><h2>Coming soon</h2></div></div>
            <div className="mini-list">
              {items.filter((item) => item.status !== "completed" && scheduleEnd(item) >= new Date()).slice(0, 4).map((item) => <ItemRow compact key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function ItemsView({ items, categories, categoryFilter, onCategoryFilter, onAdd, onToggle, onDelete, onEdit }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const visible = items.filter((item) => {
    const matchesFilter = filter === "all" || filter === "overdue" && isPast(item) || item.kind === filter || item.status === filter;
    return matchesFilter && `${item.title} ${item.description || ""} ${item.categoryName} ${item.projectTitle || ""}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div><p className="eyebrow">Everything in one place</p><h1>Tasks & deadlines</h1><p className="lead">Stay clear on what to do and when it matters.</p></div>
        <button className="primary-button" type="button" onClick={() => onAdd()}><Plus size={18} /> Add item</button>
      </section>
      <CategoryFilter categories={categories} selected={categoryFilter} onChange={onCategoryFilter} viewLabel="Tasks & deadlines" />
      <section className="panel list-panel">
        <div className="list-tools">
          <div className="filter-tabs" role="group" aria-label="Filter items">
            {["all", "task", "deadline", "overdue", "completed"].map((value) => <button key={value} className={filter === value ? "active" : ""} type="button" onClick={() => setFilter(value)}>{value === "all" ? "All" : `${value[0].toUpperCase()}${value.slice(1)}`}</button>)}
          </div>
          <label className="search-box"><Search size={17} /><span className="sr-only">Search items</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
        </div>
        {visible.length ? <div className="item-list">{visible.map((item) => <ItemRow showPic key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}</div> : <EmptyState title="No items found" message="Try another filter or add something new." />}
      </section>
    </div>
  );
}

const localParts = (value) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
};

function ItemModal({ initialDate, item, onClose, onSave, saving, categories, projects, settings }) {
  const suggested = item ? scheduleStart(item) : new Date(initialDate || new Date());
  if (!item && initialDate) suggested.setHours(9, 0, 0, 0);
  const start = localParts(item?.startAt || suggested);
  const end = localParts(item?.endAt || new Date(suggested.getTime() + 60 * 60 * 1000));
  const due = localParts(item?.dueAt || item?.endAt || new Date(suggested.getFullYear(), suggested.getMonth(), suggested.getDate(), 17));
  const [form, setForm] = useState({
    title: item?.title || "", description: item?.description || "", kind: item?.kind || "task",
    startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time,
    dueDate: due.date, dueTime: due.time,
    categoryId: item?.categoryId || settings?.default_category_id || categories[0]?.id || "",
    projectId: item?.projectId || "", priority: item?.priority || "medium", status: item?.status || "pending",
  });
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);

  const selectedProject = projects.find((project) => project.id === form.projectId);
  const suggestCategory = async () => {
    if (!form.title.trim()) return setError("Enter a title before asking for suggestions.");
    setSuggesting(true); setError("");
    try {
      const response = await fetch("/api/categories/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, description: form.description }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuggestions(data.suggestions);
      if (!data.suggestions.length) setError("No confident match yet. Keep the default or choose a category.");
    } catch (requestError) { setError(requestError.message); }
    finally { setSuggesting(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError("Give this item a short title.");
    const firstDate = new Date(form.kind === "task" ? `${form.startDate}T${form.startTime}` : `${form.dueDate}T${form.dueTime}`);
    const lastDate = form.kind === "task" ? new Date(`${form.endDate}T${form.endTime}`) : firstDate;
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastDate.getTime())) return setError("Choose valid dates and times.");
    const temporal = form.kind === "task"
      ? { startAt: firstDate.toISOString(), endAt: lastDate.toISOString() }
      : { dueAt: firstDate.toISOString() };
    if (form.kind === "task" && new Date(temporal.endAt) <= new Date(temporal.startAt)) return setError("Task end must be after its start.");
    try {
      await onSave({ title: form.title, description: form.description || null, kind: form.kind, ...temporal, categoryId: form.categoryId, projectId: form.projectId || null, priority: form.priority, status: form.status });
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><p className="eyebrow">{item ? "Update the plan" : "Plan something"}</p><h2 id="modal-title">{item ? `Edit ${item.kind}` : "Add a new item"}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={submit}>
          <div className="kind-picker">
            {[["task", ListTodo], ["deadline", Clock3]].map(([value, Icon]) => <button key={value} className={form.kind === value ? "active" : ""} type="button" onClick={() => setForm({ ...form, kind: value })}><Icon size={18} /> {value === "task" ? "Task" : "Deadline"}</button>)}
          </div>
          <label className="field full"><span>Title</span><input autoFocus maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to happen?" /></label>
          <label className="field full"><span>Notes <small>optional</small></span><textarea maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add a little more context" /></label>
          {form.kind === "task" ? <div className="form-grid temporal-fields">
            <label className="field"><span>Start date</span><input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
            <label className="field"><span>Start time</span><input required type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
            <label className="field"><span>End date</span><input required type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
            <label className="field"><span>End time</span><input required type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
          </div> : <div className="form-grid temporal-fields">
            <label className="field"><span>Due date</span><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
            <label className="field"><span>Due time</span><input required type="time" value={form.dueTime} onChange={(event) => setForm({ ...form, dueTime: event.target.value })} /></label>
          </div>}
          <div className="form-grid">
            <label className="field"><span>Project <small>optional</small></span><select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label className="field"><span>Category</span><select required disabled={Boolean(selectedProject)} value={selectedProject?.categoryId || form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categories.filter((category) => !category.is_hidden || category.id === form.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{selectedProject ? <small>Inherited from {selectedProject.name}</small> : null}</label>
            <label className="field"><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="field"><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="pending">Pending</option><option value="completed">Completed</option></select></label>
          </div>
          <div className="suggestion-row"><button className="secondary-button" type="button" disabled={suggesting} onClick={suggestCategory}><Sparkles size={15} /> {suggesting ? "Suggesting…" : "Suggest category"}</button>{suggestions.map((category) => <button type="button" className="suggestion-chip" key={category.id} onClick={() => setForm({ ...form, projectId: "", categoryId: category.id })}><span style={{ background: category.color }} />{category.name}</button>)}</div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : item ? "Save changes" : "Add to Planora"}</button></div>
        </form>
      </section>
    </div>
  );
}

function AppSettingsModal({ preferences, onClose, onSave }) {
  const [draft, setDraft] = useState(preferences);
  const [ai, setAi] = useState(null);
  const [providers, setProviders] = useState(null);
  const [aiModels, setAiModels] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/settings/ai", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setAi(data.config); setProviders(data.providers); setAiModels(data.models || []); }).catch((loadError) => setError(loadError.message));
  }, []);
  const themes = [
    { id: "paper", name: "Paper", note: "Warm and calm", colors: ["#f5f4ed", "#214e47"] },
    { id: "ocean", name: "Ocean", note: "Cool and clear", colors: ["#eef5f7", "#245c70"] },
    { id: "night", name: "Night", note: "Low-light focus", colors: ["#0f1716", "#91cbb8"] },
  ];
  const saveAll = async () => {
    setSaving(true); setError("");
    try {
      if (ai) { const response = await fetch("/api/settings/ai", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ai) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); }
      onSave(draft);
    } catch (saveError) { setError(saveError.message); setSaving(false); }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal app-settings-modal" id="app-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="app-settings-title">
        <div className="modal-heading"><div><p className="eyebrow">Your preferences</p><h2 id="app-settings-title">Settings</h2><p>Adjust how Planora looks and opens on this device.</p></div><button type="button" onClick={onClose} aria-label="Close settings"><X size={19} /></button></div>
        <div className="settings-section">
          <div><strong>Theme</strong><span>Choose a comfortable appearance.</span></div>
          <div className="theme-choice-grid">
            {themes.map((theme) => <button className={`theme-choice ${draft.theme === theme.id ? "active" : ""}`} type="button" key={theme.id} onClick={() => setDraft({ ...draft, theme: theme.id })} aria-pressed={draft.theme === theme.id}>
              <span className="theme-choice-preview" style={{ "--theme-bg": theme.colors[0], "--theme-accent": theme.colors[1] }}><i /><i /><i /></span>
              <span><strong>{theme.name}</strong><small>{theme.note}</small></span>
              {draft.theme === theme.id ? <Check size={16} /> : null}
            </button>)}
          </div>
        </div>
        <div className="settings-section settings-row">
          <label htmlFor="default-calendar-view"><strong>Default Calendar view</strong><span>Used whenever Calendar opens.</span></label>
          <select id="default-calendar-view" value={draft.defaultCalendarView} onChange={(event) => setDraft({ ...draft, defaultCalendarView: event.target.value })}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select>
        </div>
        <div className="settings-section settings-row">
          <label htmlFor="reduced-motion"><strong>Reduce motion</strong><span>Turns off decorative movement and transitions.</span></label>
          <label className="settings-switch"><input id="reduced-motion" type="checkbox" checked={draft.reducedMotion} onChange={(event) => setDraft({ ...draft, reducedMotion: event.target.checked })} /><span /></label>
        </div>
        <div className="settings-section">
          <div><strong>Project AI provider</strong><span>API keys stay on the server and are never sent to this browser.</span></div>
          {ai && providers ? <div className="ai-settings-grid"><label className="field"><span>Configured model</span><select value={`${ai.provider}/${ai.model}`} onChange={(event) => { const selected = aiModels[Number(event.target.selectedOptions[0].dataset.index)]; if (selected) setAi({ provider: selected.provider, model: selected.model }); }}>{aiModels.map((entry, index) => <option key={`${entry.provider}/${entry.model}`} value={`${entry.provider}/${entry.model}`} data-index={index} disabled={!entry.keyConfigured}>{entry.provider} · {entry.model}{entry.keyConfigured ? "" : " (API key missing)"}</option>)}</select></label><p className={providers[ai.provider]?.keyConfigured ? "ai-key-ready" : "ai-key-missing"}>{providers[ai.provider]?.keyConfigured ? "Server API key configured" : "Server API key missing — add it to .env.local"}</p></div> : <p className="muted-copy">Loading AI settings…</p>}
        </div>
        <p className="settings-storage-note">Display preferences are saved in this browser. AI provider choices are saved in PostgreSQL; secret keys remain in .env.local.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !ai} type="button" onClick={saveAll}>{saving ? "Saving…" : "Save settings"}</button></div>
      </section>
    </div>
  );
}

export default function PlannerApp() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [categoryFilters, setCategoryFilters] = useState({ dashboard: null, calendar: null, items: null });
  const [calendarProjectFilter, setCalendarProjectFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");
  const [modalDate, setModalDate] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const [preferences, setPreferences] = useState(storedPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectDocumentDirty, setProjectDocumentDirty] = useState(false);
  const [pendingMainTab, setPendingMainTab] = useState(null);

  const filterCategories = useMemo(() => {
    const hiddenIds = new Set(categories.filter((category) => category.is_hidden).flatMap((category) => [...descendantsOf(categories, category.id)]));
    return categories.filter((category) => !hiddenIds.has(category.id));
  }, [categories]);
  const sortedItems = useMemo(() => [...items].sort((a, b) => scheduleStart(a) - scheduleStart(b)), [items]);
  const itemsForTab = (tab) => {
    const allowed = new Set(categoryFilters[tab] === null ? filterCategories.map((category) => category.id) : categoryFilters[tab]);
    return sortedItems.filter((item) => allowed.has(item.categoryId));
  };
  const updateCategoryFilter = (tab, selected) => setCategoryFilters((current) => ({ ...current, [tab]: selected }));
  const calendarItems = filterItemsByProjects(itemsForTab("calendar"), calendarProjectFilter);

  const loadWorkspace = async () => {
    const [itemsResponse, categoriesResponse, projectsResponse] = await Promise.all([
      fetch("/api/items", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    const [itemsData, categoriesData, projectsData] = await Promise.all([itemsResponse.json(), categoriesResponse.json(), projectsResponse.json()]);
    if (!itemsResponse.ok) throw new Error(itemsData.error);
    if (!categoriesResponse.ok) throw new Error(categoriesData.error);
    if (!projectsResponse.ok) throw new Error(projectsData.error);
    setItems(itemsData.items);
    setCategories(categoriesData.categories);
    setSettings(categoriesData.settings);
    setProjects(projectsData.projects);
  };

  useEffect(() => {
    // Loading the external workspace is the effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorkspace()
      .catch((error) => setDbError(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appTheme = preferences.theme;
    document.documentElement.classList.toggle("reduce-motion", preferences.reducedMotion);
  }, [preferences]);

  const refreshWorkspace = async () => {
    try { await loadWorkspace(); setDbError(""); }
    catch (error) { setDbError(error.message); }
  };

  const navigate = (tab) => { if (tab === activeTab) return setMenuOpen(false); if (activeTab === "projects" && projectDocumentDirty) { setPendingMainTab(tab); setMenuOpen(false); return; } setActiveTab(tab); setMenuOpen(false); };
  const confirmMainNavigation = () => { const tab = pendingMainTab; setPendingMainTab(null); setProjectDocumentDirty(false); if (tab) setActiveTab(tab); };
  const openAdd = (date = null) => { setEditingItem(null); setModalDate(date); setModalOpen(true); };
  const openEdit = (item) => { setEditingItem(item); setModalDate(null); setModalOpen(true); };
  const savePreferences = (next) => {
    const normalized = normalizeAppPreferences(next);
    setPreferences(normalized);
    try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalized)); } catch {}
    setSettingsOpen(false);
  };

  const saveItem = async (form) => {
    setSaving(true);
    try {
      const response = await fetch(editingItem ? `/api/items/${editingItem.id}` : "/api/items", { method: editingItem ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((current) => editingItem ? current.map((item) => item.id === data.item.id ? data.item : item) : [...current, data.item]);
      setModalOpen(false);
      setEditingItem(null);
      setDbError("");
    } catch (error) {
      setDbError(error.message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item) => {
    const status = item.status === "completed" ? "pending" : "completed";
    const previous = items;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status } : candidate));
    const response = await fetch(`/api/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) setItems(previous);
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Move “${item.title}” to Trash?`)) return;
    const previous = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    const response = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (!response.ok) setItems(previous);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Sparkles size={19} /></span><span>Planora</span></div>
        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? "active" : ""} type="button" onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}
        </nav>
        <CategoryPanel categories={categories} settings={settings} onChanged={refreshWorkspace} />
        <div className="sidebar-foot"><span className="avatar">Y</span><div><strong>Your workspace</strong><small>Local Planora</small></div></div>
      </aside>
      {menuOpen ? <button className="sidebar-scrim" aria-label="Close menu" type="button" onClick={() => setMenuOpen(false)} /> : null}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="today-label"><span className="live-dot" />{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <div className="topbar-actions">
            <button className="quick-add" type="button" onClick={() => openAdd()}><Plus size={17} /><span>Quick add</span></button>
            <button className="settings-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" aria-haspopup="dialog" aria-controls="app-settings-dialog" title="Settings"><SettingsIcon size={18} /></button>
          </div>
        </header>
        <div className="page-content">
          {dbError ? <div className="notice" role="alert"><CircleAlert size={18} /><div><strong>Database setup needed</strong><span>{dbError}</span></div></div> : null}
          {loading ? <div className="loading"><span /><p>Gathering your plans…</p></div> : null}
          {!loading && activeTab === "dashboard" ? <Dashboard items={itemsForTab("dashboard")} categories={filterCategories} categoryFilter={categoryFilters.dashboard} onCategoryFilter={(selected) => updateCategoryFilter("dashboard", selected)} onNavigate={navigate} onToggle={toggleItem} onDelete={deleteItem} onEdit={openEdit} onAdd={openAdd} /> : null}
          {!loading && activeTab === "calendar" ? <CalendarView key={preferences.defaultCalendarView} defaultMode={preferences.defaultCalendarView} items={calendarItems} categories={filterCategories} projects={projects} categoryFilter={categoryFilters.calendar} onCategoryFilter={(selected) => updateCategoryFilter("calendar", selected)} projectFilter={calendarProjectFilter} onProjectFilter={setCalendarProjectFilter} cursor={cursor} setCursor={setCursor} onToggle={toggleItem} onDelete={deleteItem} onEdit={openEdit} onAdd={openAdd} /> : null}
          {!loading && activeTab === "items" ? <ItemsView items={itemsForTab("items")} categories={filterCategories} categoryFilter={categoryFilters.items} onCategoryFilter={(selected) => updateCategoryFilter("items", selected)} onToggle={toggleItem} onDelete={deleteItem} onEdit={openEdit} onAdd={openAdd} /> : null}
          {!loading && activeTab === "projects" ? <ProjectWorkspace categories={filterCategories} projects={projects} onProjectsChanged={refreshWorkspace} onWorkspaceChanged={refreshWorkspace} onDocumentDirtyChange={setProjectDocumentDirty} /> : null}
        </div>
      </main>
      {modalOpen ? <ItemModal initialDate={modalDate} item={editingItem} onClose={() => { setModalOpen(false); setEditingItem(null); }} onSave={saveItem} saving={saving} categories={categories} projects={projects} settings={settings} /> : null}
      {settingsOpen ? <AppSettingsModal preferences={preferences} onClose={() => setSettingsOpen(false)} onSave={savePreferences} /> : null}
      {pendingMainTab ? <UnsavedDocumentDialog onCancel={() => setPendingMainTab(null)} onDiscard={confirmMainNavigation} /> : null}
    </div>
  );
}
