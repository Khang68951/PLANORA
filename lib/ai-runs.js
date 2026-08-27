const documentCommands = new Set(["documents.update", "documents.insert", "documents.remove"]);

export function commandResource(commandName) {
  if (commandName.startsWith("work.")) return "work";
  if (commandName.startsWith("members.")) return "members";
  if (commandName.startsWith("documents.")) return "documents";
  if (commandName.startsWith("files.")) return "files";
  return "project";
}

export function summarizeAICommands(commands) {
  const counts = { work: 0, members: 0, documents: 0, files: 0, project: 0 };
  for (const command of commands) counts[commandResource(command.name)] += 1;
  const labels = [
    ["work", "task/deadline"],
    ["members", "member"],
    ["documents", "document"],
    ["files", "file"],
    ["project", "project update"],
  ].filter(([key]) => counts[key]).map(([key, label]) => `${counts[key]} ${label}${counts[key] === 1 ? "" : "s"}`);
  return `${commands.length} proposed change${commands.length === 1 ? "" : "s"}${labels.length ? ` — ${labels.join(", ")}` : ""}`;
}

export function deriveAIRunStatus(commands) {
  if (!commands.length) return "complete";
  const statuses = new Set(commands.map((command) => command.status));
  if (statuses.has("running")) return "running";
  if (statuses.has("pending")) return statuses.size === 1 ? "pending" : "partial";
  if (statuses.has("failed")) return statuses.size === 1 ? "failed" : "partial";
  if ([...statuses].every((status) => ["discarded", "undone"].includes(status))) return "rejected";
  return "complete";
}

export function eligibleBatchCommands(commands) {
  return commands.filter((command) => command.status === "pending" && !documentCommands.has(command.name));
}

export function toAIRunModel(row, commands = []) {
  const total = commands.length;
  const applied = commands.filter((command) => command.status === "applied").length;
  const decided = commands.filter((command) => !["pending", "running"].includes(command.status)).length;
  return {
    id: row.id,
    projectId: row.projectId || row.project_id,
    requestMessage: row.requestMessage || row.request_message,
    responseMessage: row.responseMessage || row.response_message,
    intent: row.intent,
    scopes: row.scopes || [],
    status: commands.length ? deriveAIRunStatus(commands) : row.status || "complete",
    summary: summarizeAICommands(commands),
    progress: { applied, decided, total },
    commands,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || row.created_at,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || row.updated_at,
  };
}
