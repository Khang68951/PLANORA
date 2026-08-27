import { NextResponse } from "next/server";
import { executeAICommand, toAICommandModel, undoAICommand } from "@/lib/ai-commands";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";

const commandSelect = `id, project_id AS "projectId", run_id AS "runId", name, safety, mode, arguments, summary, status, result, error,
  created_at AS "createdAt", decided_at AS "decidedAt"`;

async function refreshRunForCommand(commandId) {
  await query(`UPDATE project_ai_runs run SET status = summary.status, updated_at = NOW()
    FROM (
      SELECT command.run_id,
        CASE
          WHEN BOOL_OR(command.status = 'running') THEN 'running'
          WHEN BOOL_OR(command.status = 'pending') AND BOOL_OR(command.status <> 'pending') THEN 'partial'
          WHEN BOOL_OR(command.status = 'pending') THEN 'pending'
          WHEN BOOL_OR(command.status = 'failed') AND BOOL_OR(command.status <> 'failed') THEN 'partial'
          WHEN BOOL_OR(command.status = 'failed') THEN 'failed'
          WHEN BOOL_AND(command.status IN ('discarded','undone')) THEN 'rejected'
          ELSE 'complete'
        END AS status
      FROM project_ai_commands command
      WHERE command.run_id = (SELECT run_id FROM project_ai_commands WHERE id = $1)
      GROUP BY command.run_id
    ) summary WHERE run.id = summary.run_id`, [commandId]);
}

export async function PATCH(request, context) {
  try {
    const { id, commandId } = await context.params; const { action } = await request.json();
    if (!isUuid(id) || !isUuid(commandId)) return NextResponse.json({ error: "Invalid AI command." }, { status: 400 });
    if (!["approve", "discard", "undo"].includes(action)) return NextResponse.json({ error: "Choose approve, discard, or undo." }, { status: 400 });
    if (action === "discard") {
      const discarded = await query(`UPDATE project_ai_commands SET status='discarded', decided_at=NOW()
        WHERE id=$1 AND project_id=$2 AND status='pending' RETURNING ${commandSelect}`, [commandId, id]);
      if (!discarded.rowCount) return NextResponse.json({ error: "This command is no longer awaiting a decision." }, { status: 409 });
      await refreshRunForCommand(commandId);
      return NextResponse.json({ command: toAICommandModel(discarded.rows[0]) });
    }
    if (action === "undo") {
      const current = (await query(`SELECT ${commandSelect} FROM project_ai_commands WHERE id=$1 AND project_id=$2 AND status='applied'`, [commandId, id])).rows[0];
      if (!current) return NextResponse.json({ error: "This command cannot be undone." }, { status: 409 });
      const result = await undoAICommand({ projectId: id, command: toAICommandModel(current) });
      const undone = await query(`UPDATE project_ai_commands SET status='undone', result=result || $1::jsonb, decided_at=NOW()
        WHERE id=$2 AND project_id=$3 RETURNING ${commandSelect}`, [JSON.stringify({ undoResult: result }), commandId, id]);
      await refreshRunForCommand(commandId);
      return NextResponse.json({ command: toAICommandModel(undone.rows[0]) });
    }
    const running = await query(`UPDATE project_ai_commands SET status='running', decided_at=NOW()
      WHERE id=$1 AND project_id=$2 AND status='pending' RETURNING ${commandSelect}`, [commandId, id]);
    if (!running.rowCount) return NextResponse.json({ error: "This command is no longer awaiting approval." }, { status: 409 });
    const command = toAICommandModel(running.rows[0]);
    try {
      const result = await executeAICommand({ projectId: id, name: command.name, arguments: command.arguments });
      const applied = await query(`UPDATE project_ai_commands SET status='applied', result=$1, error=NULL, decided_at=NOW()
        WHERE id=$2 RETURNING ${commandSelect}`, [result, commandId]);
      await refreshRunForCommand(commandId);
      return NextResponse.json({ command: toAICommandModel(applied.rows[0]) });
    } catch (error) {
      await query("UPDATE project_ai_commands SET status='failed', error=$1, decided_at=NOW() WHERE id=$2", [error.message, commandId]);
      await refreshRunForCommand(commandId);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } catch (error) { console.error("PATCH project AI command", error); return NextResponse.json({ error: "AI command could not be updated." }, { status: 500 }); }
}
