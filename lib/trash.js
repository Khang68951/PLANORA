const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export function groupTrashEntries(trash = {}) {
  const groups = new Map();
  const add = (entry, type) => {
    const batch = entry.trash_batch_id;
    if (!batch) return;
    const group = groups.get(batch) || { id: batch, categories: [], projects: [], items: [], deletedAt: entry.deleted_at };
    group[type].push(entry);
    if (new Date(entry.deleted_at) > new Date(group.deletedAt)) group.deletedAt = entry.deleted_at;
    groups.set(batch, group);
  };

  for (const entry of trash.categories || []) add(entry, "categories");
  for (const entry of trash.projects || []) add(entry, "projects");
  for (const entry of trash.items || []) add(entry, "items");

  return [...groups.values()].map((group) => {
    const primary = group.projects[0] || group.categories[0] || group.items[0];
    const tasks = group.items.filter((item) => item.kind === "task").length;
    const deadlines = group.items.length - tasks;
    const parts = [
      group.projects.length ? countLabel(group.projects.length, "project") : null,
      group.categories.length ? countLabel(group.categories.length, "category", "categories") : null,
      tasks ? countLabel(tasks, "task") : null,
      deadlines ? countLabel(deadlines, "deadline") : null,
    ].filter(Boolean);
    return {
      id: group.id,
      label: primary.title || primary.name,
      summary: parts.join(" · "),
      deletedAt: group.deletedAt,
      counts: {
        categories: group.categories.length,
        projects: group.projects.length,
        tasks,
        deadlines,
      },
    };
  }).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
}

export function permanentDeleteWarning(group) {
  const projectWarning = group.counts?.projects
    ? " Project documents, files, members, AI history, and all associated work will also be deleted."
    : "";
  return `This will permanently delete ${group.summary}.${projectWarning} This action cannot be undone.`;
}

export async function purgeTrashBatchRecords({ client, batch }) {
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM categories WHERE trash_batch_id = $1 FOR UPDATE", [batch]);
    const projects = await client.query("SELECT id FROM projects WHERE trash_batch_id = $1 FOR UPDATE", [batch]);
    const projectIds = projects.rows.map((project) => project.id);
    await client.query("SELECT id FROM planner_items WHERE trash_batch_id = $1 OR project_id = ANY($2::uuid[]) FOR UPDATE", [batch, projectIds]);
    const files = projectIds.length
      ? await client.query("SELECT project_id, stored_name FROM project_files WHERE project_id = ANY($1::uuid[])", [projectIds])
      : { rows: [] };
    const items = await client.query("DELETE FROM planner_items WHERE trash_batch_id = $1 OR project_id = ANY($2::uuid[]) RETURNING id", [batch, projectIds]);
    const deletedProjects = await client.query("DELETE FROM projects WHERE trash_batch_id = $1 RETURNING id", [batch]);
    await client.query("UPDATE categories SET parent_id = NULL WHERE trash_batch_id = $1", [batch]);
    const categories = await client.query("DELETE FROM categories WHERE trash_batch_id = $1 RETURNING id", [batch]);
    if (!items.rowCount && !deletedProjects.rowCount && !categories.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
    return {
      deleted: {
        categories: categories.rowCount,
        projects: deletedProjects.rowCount,
        items: items.rowCount,
      },
      files: files.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
