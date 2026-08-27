const scopeRules = {
  documents: /\b(document|documents|doc|write|rewrite|paragraph|text|proposal|draft|insert|remove|delete text|edit)\b/i,
  files: /\b(file|files|attachment|attachments|upload|pdf|csv|markdown)\b/i,
  work: /\b(task|tasks|deadline|deadlines|work|schedule|priority|assignee|assign|focus|upcoming|next)\b/i,
  members: /\b(member|members|role|roles|person|people|team)\b/i,
  project: /\b(project|progress|status|category|overview|start date)\b/i,
};

const commandScopes = {
  documents: "documents.",
  files: "files.",
  work: "work.",
  members: "members.",
  project: "project.",
};

export function routeProjectAIRequest(message, commandCatalog) {
  const matched = Object.entries(scopeRules)
    .filter(([, pattern]) => pattern.test(message))
    .map(([scope]) => scope);
  const scopes = matched.length ? matched : ["project"];
  const allowedCommands = commandCatalog.filter((command) =>
    scopes.some((scope) => command.name.startsWith(commandScopes[scope])),
  );
  const intent = scopes.length === 1 ? `${scopes[0]}_request` : "multi_scope_request";
  return {
    intent,
    scopes,
    allowedCommands,
    stages: ["route", "context", "provider", "validate", "review"],
  };
}

export function scopedProjectContext(context, scopes) {
  const include = (scope) => scopes.includes(scope);
  return {
    project: context.project,
    ...(include("members") || include("work") ? { members: context.members } : {}),
    ...(include("work") ? { tasksAndDeadlines: context.items } : {}),
    ...(include("documents") ? { documents: context.documents } : {}),
    ...(include("files") ? { files: context.files, readableFileContents: context.readableFiles } : {}),
  };
}

export function conversationSystemInstruction({ workflow, context }) {
  return `You are Planora AI, the conversational assistant for one project. Planora has routed this request as ${workflow.intent} and supplied only these relevant scopes: ${workflow.scopes.join(", ")}. Answer the user helpfully using the supplied project context. Do not emit commands, tool calls, proposedChanges, IDs, or database syntax; a separate command-planner AI handles actions after your response. When the user asks Planora to create or edit content, acknowledge the plan concisely instead of placing the full generated document in chat. Do not claim that a change has already been applied. Return ONLY valid JSON shaped as {"message":"your user-facing response"}.\nROUTED PROJECT CONTEXT:\n${JSON.stringify(context)}`;
}

export function commandPlannerSystemInstruction({ workflow, context, commandMode, currentTime }) {
  return `You are Planora's internal command-planner AI. You do not chat with the user. Convert the user's request and the conversational AI's response into a complete, non-conflicting list of Planora commands. Return ONLY valid JSON shaped as {"commands":[{"name":"command.name","arguments":{},"summary":"short user-facing explanation"}],"clarificationQuestion":""}.

If essential user-controlled information is genuinely missing, return no commands and ask one concise, specific question in clarificationQuestion. Do not ask for values that can be safely inferred: use the current time as the start of a relative duration, use the current project's category, choose pending status and medium priority by default, and create a reasonable task schedule within a requested duration.

Planora independently validates, records, and approves or executes every command. Never claim success. Use only these routed commands: ${JSON.stringify(workflow.allowedCommands)}.

Important resource rules:
- A "document" means a rich-text document in the project's Documents tab. An uploaded attachment is a "file" and uses files.* commands only when the user explicitly refers to a file, attachment, or upload.
- When asked to create and write a new document, emit ONE documents.create command containing both title and the complete contentHtml. Never follow it with documents.insert/update because a new document has no ID yet.
- Existing document commands must use an exact documentId from context. documents.insert uses contentHtml plus position start/end/before/after; before/after also needs exact anchorText. documents.remove uses exact targetText and optional 1-based occurrence. documents.update replaces the complete document only for a genuine rewrite.
- Create each requested task or deadline with a separate work.create command and all required fields. Tasks use kind task, startAt, and endAt. Deadlines use kind deadline and dueAt. Include status, priority, and the project's categoryId when available. PIC is optional: when the user names one or more existing project members, include their exact context IDs in assigneeIds on work.create. Omit assigneeIds or use [] when no PIC is requested. Use work.assign with workId and assigneeIds to replace the PIC on existing work.
- Use project.update for requested project dates or duration. Translate relative durations into explicit ISO dates using the current time.
- Use exact IDs from context for documentId, fileId, workId, and memberId. Never invent an ID or make one command depend on an ID created by another command.
- Permanent deletion is unavailable; use the applicable trash/remove command. Preserve anything the user did not ask to change.

Current command mode: ${commandMode}. Current time: ${currentTime}.
ROUTED PROJECT CONTEXT:\n${JSON.stringify(context)}`;
}

export function parseCommandPlannerResult(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  try {
    const parsed = JSON.parse((fenced || content).replace(/\\([<>])/g, "$1"));
    const commands = Array.isArray(parsed.commands)
      ? parsed.commands
      : parsed.commands && typeof parsed.commands === "object"
        ? [parsed.commands]
        : [];
    const clarificationQuestion = typeof parsed.clarificationQuestion === "string"
      ? parsed.clarificationQuestion.trim().slice(0, 500)
      : "";
    return { commands, clarificationQuestion, parseFailed: false };
  } catch {
    return { commands: [], clarificationQuestion: "", parseFailed: true };
  }
}

export function fallbackClarificationQuestion(rejections = []) {
  const names = new Set(rejections.map((rejection) => rejection.name));
  if (names.has("work.create")) return "What dates or working times should I use for the tasks and deadlines?";
  if ([...names].some((name) => name.startsWith("documents."))) return "Which document should I change, and what exact content should I add, remove, or replace?";
  if (names.has("project.update")) return "What project start date and deadline should I use?";
  return "Could you provide the missing details for the changes you want me to make?";
}
