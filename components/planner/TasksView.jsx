"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import {
  itemEnd,
  itemStart,
  NO_PROJECT,
  relativeItemDate,
  TASK_FILTER_DEFAULTS,
} from "@/lib/task-selectors";

const quickFilters = [
  ["all", "All"],
  ["task", "Tasks"],
  ["deadline", "Deadlines"],
  ["overdue", "Overdue"],
];

const sortOptions = [
  ["date-asc", "Date: earliest first"],
  ["date-desc", "Date: latest first"],
  ["title-asc", "Title: A–Z"],
  ["title-desc", "Title: Z–A"],
  ["priority-desc", "Priority: high–low"],
  ["priority-asc", "Priority: low–high"],
  ["created", "Recently created"],
  ["updated", "Recently updated"],
];

const timeOptions = [
  ["", "Any time"],
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["next7", "Next 7 days"],
  ["month", "This month"],
  ["custom", "Custom range"],
];

function toggleSelection(values, value) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function FilterCheckbox({ checked, children, onChange }) {
  return (
    <label className="task-filter-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="category-check-box" aria-hidden="true"><Check size={11} /></span>
      <span>{children}</span>
    </label>
  );
}

function MultiSelectGroup({ title, values, selected, onChange, searchable = false, color = false }) {
  const [query, setQuery] = useState("");
  const visible = values.filter((entry) => entry.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <fieldset className="task-filter-group">
      <legend>{title}</legend>
      {searchable ? (
        <label className="filter-mini-search">
          <Search size={14} />
          <span className="sr-only">Search {title.toLocaleLowerCase()}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLocaleLowerCase()}`} />
        </label>
      ) : null}
      <div className="task-filter-options">
        {visible.map((entry) => (
          <FilterCheckbox
            key={entry.value}
            checked={selected.includes(entry.value)}
            onChange={() => onChange(toggleSelection(selected, entry.value))}
          >
            {color ? <span className="category-swatch" style={{ background: entry.color }} /> : null}
            {entry.label}
          </FilterCheckbox>
        ))}
      </div>
    </fieldset>
  );
}

function FilterPanel({ categories, projects, members, filters, updateFilter, onClose, onClear }) {
  return (
    <div className="task-filter-surface" role="dialog" aria-modal="false" aria-label="Task and deadline filters">
      <div className="task-filter-surface-heading">
        <div>
          <strong>Filters</strong>
          <span>Narrow the list without losing context.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close filters"><X size={18} /></button>
      </div>
      <div className="task-filter-grid">
        <MultiSelectGroup
          title="Kind"
          values={[{ value: "task", label: "Tasks" }, { value: "deadline", label: "Deadlines" }]}
          selected={filters.kinds}
          onChange={(value) => updateFilter("kinds", value)}
        />
        <MultiSelectGroup
          title="Status"
          values={[{ value: "pending", label: "Pending" }, { value: "completed", label: "Completed" }]}
          selected={filters.statuses}
          onChange={(value) => updateFilter("statuses", value)}
        />
        <MultiSelectGroup
          title="Priority"
          values={["high", "medium", "low"].map((value) => ({ value, label: `${value[0].toUpperCase()}${value.slice(1)}` }))}
          selected={filters.priorities}
          onChange={(value) => updateFilter("priorities", value)}
        />
        <fieldset className="task-filter-group">
          <legend>Scheduled time</legend>
          <select value={filters.time} onChange={(event) => updateFilter("time", event.target.value)}>
            {timeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {filters.time === "custom" ? (
            <div className="custom-date-range">
              <label>From<input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
              <label>To<input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
            </div>
          ) : null}
        </fieldset>
        <MultiSelectGroup
          title="Standalone categories"
          searchable
          color
          values={categories.map((category) => ({ value: category.id, label: category.name, color: category.color }))}
          selected={filters.categories}
          onChange={(value) => updateFilter("categories", value)}
        />
        <MultiSelectGroup
          title="Projects"
          searchable
          values={[{ value: NO_PROJECT, label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          selected={filters.projects}
          onChange={(value) => updateFilter("projects", value)}
        />
        <MultiSelectGroup
          title="PIC"
          searchable
          values={members.map((member) => ({ value: member.id, label: member.role ? `${member.name} · ${member.role}` : member.name }))}
          selected={filters.assignees}
          onChange={(value) => updateFilter("assignees", value)}
        />
      </div>
      <div className="task-filter-surface-actions">
        <button className="text-button" type="button" onClick={onClear}>Clear all</button>
        <button className="primary-button" type="button" onClick={onClose}>Show results</button>
      </div>
    </div>
  );
}

function ItemRow({ item, onToggle, onDelete, onEdit }) {
  const start = itemStart(item);
  const end = itemEnd(item);
  const dateLabel = item.kind === "task"
    ? `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : `${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  return (
    <article className={`item-row task-detail-row ${item.status === "completed" ? "is-complete" : ""}`}>
      <button
        className="check-button"
        type="button"
        aria-label={item.status === "completed" ? `Reopen ${item.title}` : `Complete ${item.title}`}
        onClick={() => onToggle(item)}
      >
        {item.status === "completed" ? <Check size={15} /> : null}
      </button>
      <span className={item.projectId ? "project-item-dot" : "category-dot"} style={item.projectId ? undefined : { background: item.categoryColor || "#5e6c70" }} aria-hidden="true" />
      <div className="item-copy">
        <div className="item-title-line">
          <h3>{item.title}</h3>
          <span className={`kind-pill ${item.kind}`}>{item.kind}</span>
          <span className={`priority-pill ${item.priority}`}>{item.priority}</span>
          <span className={`status-pill ${item.status}`}>{item.status}</span>
        </div>
        {item.description ? <p>{item.description}</p> : null}
        <div className="item-meta">
          <span><Clock3 size={13} /> {dateLabel}</span>
          <span className={relativeItemDate(item).includes("overdue") ? "overdue" : ""}>{relativeItemDate(item)}</span>
          {!item.projectId ? <span className="category-compact-chip"><i style={{ background: item.categoryColor }} />{item.categoryName}</span> : null}
          {item.projectTitle ? <span>Project: {item.projectTitle}</span> : <span>No project</span>}
          {item.assignees?.length ? <span className="item-pic"><Users size={13} /><strong>PIC:</strong> {item.assignees.map((member) => member.name).join(", ")}</span> : null}
        </div>
      </div>
      <div className="item-actions">
        <button className="edit-button" type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`}><Pencil size={16} /></button>
        <button className="delete-button" type="button" onClick={() => onDelete(item)} aria-label={`Move ${item.title} to Trash`}><Trash2 size={17} /></button>
      </div>
    </article>
  );
}

function activeChips(filters, categories, projects, members, updateFilter) {
  const chips = [];
  const addArray = (key, entries) => {
    for (const value of filters[key]) {
      const label = entries.find((entry) => entry.value === value)?.label || value;
      chips.push({ key: `${key}-${value}`, label, remove: () => updateFilter(key, filters[key].filter((entry) => entry !== value)) });
    }
  };
  addArray("kinds", [{ value: "task", label: "Task" }, { value: "deadline", label: "Deadline" }]);
  addArray("statuses", [{ value: "pending", label: "Pending" }, { value: "completed", label: "Completed" }]);
  addArray("priorities", ["high", "medium", "low"].map((value) => ({ value, label: value })));
  addArray("categories", categories.map((entry) => ({ value: entry.id, label: entry.name })));
  addArray("projects", [{ value: NO_PROJECT, label: "No project" }, ...projects.map((entry) => ({ value: entry.id, label: entry.name }))]);
  addArray("assignees", members.map((entry) => ({ value: entry.id, label: `PIC: ${entry.name}` })));
  if (filters.time) chips.push({ key: "time", label: timeOptions.find(([value]) => value === filters.time)?.[1] || filters.time, remove: () => updateFilter("time", "") });
  return chips;
}

export default function TasksView({ items, categories, projects, onAdd, onToggle, onDelete, onEdit }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { filters, updateFilter, clearFilters, visibleItems, activeCount } = useTaskFilters(items);
  const members = useMemo(() => {
    const unique = new Map();
    for (const item of items) for (const member of item.assignees || []) unique.set(member.id, member);
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const chips = activeChips(filters, categories, projects, members, updateFilter);

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Everything in one place</p>
          <h1>Tasks & deadlines</h1>
          <p className="lead">Find the work that matters, then keep the rest out of the way.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => onAdd()}><Plus size={18} /> Add item</button>
      </section>
      <section className="panel list-panel task-list-panel">
        <div className="task-toolbar">
          <label className="search-box task-search">
            <Search size={18} />
            <span className="sr-only">Search tasks and deadlines</span>
            <input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Search tasks, projects, categories, or PIC" />
          </label>
          <div className="filter-tabs task-quick-filters" role="group" aria-label="Quick filters">
            {quickFilters.map(([value, label]) => (
              <button key={value} className={filters.quick === value ? "active" : ""} type="button" onClick={() => updateFilter("quick", value)} aria-pressed={filters.quick === value}>{label}</button>
            ))}
          </div>
          <button className={`secondary-button filter-trigger ${activeCount ? "active" : ""}`} type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
            <Filter size={16} /> Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
          <label className="sort-control">
            <span className="sr-only">Sort tasks and deadlines</span>
            <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>
              {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
        </div>
        {filtersOpen ? (
          <FilterPanel categories={categories} projects={projects} members={members} filters={filters} updateFilter={updateFilter} onClose={() => setFiltersOpen(false)} onClear={clearFilters} />
        ) : null}
        <div className="task-results-summary" aria-live="polite">
          <strong>{visibleItems.length} {visibleItems.length === 1 ? "result" : "results"}</strong>
          {chips.length ? (
            <div className="active-filter-chips">
              {chips.map((chip) => <button type="button" key={chip.key} onClick={chip.remove}>{chip.label}<X size={12} /></button>)}
              <button className="clear-filter-chip" type="button" onClick={clearFilters}>Clear all</button>
            </div>
          ) : <span>Showing all planned work</span>}
        </div>
        {visibleItems.length ? (
          <div className="item-list">
            {visibleItems.map((item) => <ItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />)}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No matching work</h3>
            <p>Remove a filter or change your search to see more items.</p>
            <button className="secondary-button" type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        )}
      </section>
    </div>
  );
}
