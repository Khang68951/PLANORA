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
  LayoutDashboard,
  ListTodo,
  Menu,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "items", label: "Tasks & deadlines", icon: ListTodo },
];

const categoryColors = {
  University: "#7558e9",
  Work: "#148a72",
  Planning: "#db7f45",
  Personal: "#3975b8",
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const isPast = (item) => item.status !== "completed" && new Date(item.due_at) < new Date();
const colorFor = (category) => categoryColors[category] || "#5e6c70";
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function relativeDue(item) {
  const due = new Date(item.due_at);
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

function ItemRow({ item, onToggle, onDelete, compact = false }) {
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
      <span className="category-dot" style={{ background: colorFor(item.category) }} />
      <div className="item-copy">
        <div className="item-title-line">
          <h3>{item.title}</h3>
          <span className={`kind-pill ${item.kind}`}>{item.kind}</span>
        </div>
        {!compact && item.description ? <p>{item.description}</p> : null}
        <div className="item-meta">
          <span className={overdue ? "overdue" : ""}><Clock3 size={13} /> {relativeDue(item)}</span>
          <span>{new Date(item.due_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          <span>{item.category}</span>
        </div>
      </div>
      <button className="delete-button" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}>
        <Trash2 size={17} />
      </button>
    </article>
  );
}

function Dashboard({ items, onNavigate, onToggle, onDelete, onAdd }) {
  const active = items.filter((item) => item.status !== "completed");
  const overdue = active.filter(isPast);
  const today = active.filter((item) => sameDay(new Date(item.due_at), new Date()));
  const upcoming = active.filter((item) => {
    const diff = startOfDay(new Date(item.due_at)) - startOfDay(new Date());
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
        {focus.length ? <div className="item-list">{focus.map((item) => <ItemRow compact key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />)}</div> : <EmptyState title="You’re all caught up" message="Nothing urgent is waiting. Enjoy the breathing room." />}
      </section>
    </div>
  );
}

function CalendarView({ items, cursor, setCursor, onAdd, onToggle, onDelete }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const monthItems = items.filter((item) => new Date(item.due_at).getMonth() === month && new Date(item.due_at).getFullYear() === year);

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div><p className="eyebrow">See the whole month</p><h1>Calendar</h1><p className="lead">Select any day to quickly plan something new.</p></div>
        <button className="primary-button" type="button" onClick={() => onAdd()}><Plus size={18} /> Add item</button>
      </section>
      <section className="calendar-layout">
        <div className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div><h2>{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><span>{monthItems.length} items this month</span></div>
            <div className="calendar-controls">
              <button type="button" onClick={() => setCursor(new Date())}>Today</button>
              <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}><ArrowLeft size={17} /></button>
              <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}><ArrowRight size={17} /></button>
            </div>
          </div>
          <div className="calendar-grid week-labels">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid days-grid">
            {days.map((day) => {
              const dayItems = items.filter((item) => sameDay(new Date(item.due_at), day));
              const muted = day.getMonth() !== month;
              return (
                <button key={dateKey(day)} className={`day-cell ${muted ? "muted" : ""} ${sameDay(day, new Date()) ? "today" : ""}`} type="button" onClick={() => onAdd(day)}>
                  <span className="day-number">{day.getDate()}</span>
                  <span className="day-items">
                    {dayItems.slice(0, 3).map((item) => <span className={`calendar-item ${item.status === "completed" ? "is-complete" : ""}`} key={item.id} style={{ "--item-color": colorFor(item.category) }}>{item.title}</span>)}
                    {dayItems.length > 3 ? <span className="more-items">+{dayItems.length - 3} more</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <aside className="panel calendar-aside">
          <div className="panel-heading"><div><p className="eyebrow">Next up</p><h2>Coming soon</h2></div></div>
          <div className="mini-list">
            {items.filter((item) => item.status !== "completed" && new Date(item.due_at) >= new Date()).slice(0, 4).map((item) => <ItemRow compact key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />)}
          </div>
        </aside>
      </section>
    </div>
  );
}

function ItemsView({ items, onAdd, onToggle, onDelete }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const visible = items.filter((item) => {
    const matchesFilter = filter === "all" || filter === "overdue" && isPast(item) || item.kind === filter || item.status === filter;
    return matchesFilter && `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div><p className="eyebrow">Everything in one place</p><h1>Tasks & deadlines</h1><p className="lead">Stay clear on what to do and when it matters.</p></div>
        <button className="primary-button" type="button" onClick={() => onAdd()}><Plus size={18} /> Add item</button>
      </section>
      <section className="panel list-panel">
        <div className="list-tools">
          <div className="filter-tabs" role="group" aria-label="Filter items">
            {["all", "task", "deadline", "overdue", "completed"].map((value) => <button key={value} className={filter === value ? "active" : ""} type="button" onClick={() => setFilter(value)}>{value === "all" ? "All" : `${value[0].toUpperCase()}${value.slice(1)}`}</button>)}
          </div>
          <label className="search-box"><Search size={17} /><span className="sr-only">Search items</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
        </div>
        {visible.length ? <div className="item-list">{visible.map((item) => <ItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />)}</div> : <EmptyState title="No items found" message="Try another filter or add something new." />}
      </section>
    </div>
  );
}

function ItemModal({ initialDate, onClose, onCreate, saving }) {
  const suggested = initialDate || new Date();
  const localDate = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: "", description: "", kind: "task", date: localDate, time: "17:00", category: "Personal", priority: "medium" });
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError("Give this item a short title.");
    const due = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(due.getTime())) return setError("Choose a valid date and time.");
    await onCreate({ ...form, due_at: due.toISOString() });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><p className="eyebrow">Plan something</p><h2 id="modal-title">Add a new item</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={submit}>
          <div className="kind-picker">
            {[["task", ListTodo], ["deadline", Clock3]].map(([value, Icon]) => <button key={value} className={form.kind === value ? "active" : ""} type="button" onClick={() => setForm({ ...form, kind: value })}><Icon size={18} /> {value === "task" ? "Task" : "Deadline"}</button>)}
          </div>
          <label className="field full"><span>Title</span><input autoFocus maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to happen?" /></label>
          <label className="field full"><span>Notes <small>optional</small></span><textarea maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add a little more context" /></label>
          <div className="form-grid">
            <label className="field"><span>Date</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label className="field"><span>Time</span><input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
            <label className="field"><span>Category</span><input maxLength={40} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
            <label className="field"><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : "Add to Planora"}</button></div>
        </form>
      </section>
    </div>
  );
}

export default function PlannerApp() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");
  const [modalDate, setModalDate] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date());

  const sortedItems = useMemo(() => [...items].sort((a, b) => new Date(a.due_at) - new Date(b.due_at)), [items]);

  useEffect(() => {
    fetch("/api/items", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setItems(data.items);
      })
      .catch((error) => setDbError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const navigate = (tab) => { setActiveTab(tab); setMenuOpen(false); };
  const openAdd = (date = null) => { setModalDate(date); setModalOpen(true); };

  const createItem = async (form) => {
    setSaving(true);
    try {
      const response = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((current) => [...current, data.item]);
      setModalOpen(false);
      setDbError("");
    } catch (error) {
      setDbError(error.message);
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
    if (!window.confirm(`Remove “${item.title}”?`)) return;
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
        <div className="sidebar-quote"><span>“</span><p>A little progress each day adds up to big results.</p></div>
        <div className="sidebar-foot"><span className="avatar">Y</span><div><strong>Your workspace</strong><small>Local Planora</small></div></div>
      </aside>
      {menuOpen ? <button className="sidebar-scrim" aria-label="Close menu" type="button" onClick={() => setMenuOpen(false)} /> : null}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="today-label"><span className="live-dot" />{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <button className="quick-add" type="button" onClick={() => openAdd()}><Plus size={17} /><span>Quick add</span></button>
        </header>
        <div className="page-content">
          {dbError ? <div className="notice" role="alert"><CircleAlert size={18} /><div><strong>Database setup needed</strong><span>{dbError}</span></div></div> : null}
          {loading ? <div className="loading"><span /><p>Gathering your plans…</p></div> : null}
          {!loading && activeTab === "dashboard" ? <Dashboard items={sortedItems} onNavigate={navigate} onToggle={toggleItem} onDelete={deleteItem} onAdd={openAdd} /> : null}
          {!loading && activeTab === "calendar" ? <CalendarView items={sortedItems} cursor={cursor} setCursor={setCursor} onToggle={toggleItem} onDelete={deleteItem} onAdd={openAdd} /> : null}
          {!loading && activeTab === "items" ? <ItemsView items={sortedItems} onToggle={toggleItem} onDelete={deleteItem} onAdd={openAdd} /> : null}
        </div>
      </main>
      {modalOpen ? <ItemModal initialDate={modalDate} onClose={() => setModalOpen(false)} onCreate={createItem} saving={saving} /> : null}
    </div>
  );
}
