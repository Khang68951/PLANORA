import { NextResponse } from "next/server";
import { toAICommandModel } from "@/lib/ai-commands";
import { toAIRunModel } from "@/lib/ai-runs";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";

export async function GET(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") || 1);
    const limit = Number(params.get("limit") || 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return NextResponse.json({ error: "Page and limit must be valid positive integers; limit cannot exceed 50." }, { status: 400 });
    }
    const total = Number((await query("SELECT COUNT(*) FROM project_ai_runs WHERE project_id = $1", [id])).rows[0].count);
    const runs = await query(`SELECT id, project_id AS "projectId", request_message AS "requestMessage", response_message AS "responseMessage", intent, scopes,
      status, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM project_ai_runs WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [id, limit, (page - 1) * limit]);
    const runIds = runs.rows.map((run) => run.id);
    const commandRows = runIds.length ? (await query(`SELECT id, run_id AS "runId", name, safety, mode, arguments, summary, status, result, error,
      created_at AS "createdAt", decided_at AS "decidedAt" FROM project_ai_commands WHERE run_id = ANY($1::uuid[]) ORDER BY created_at, id`, [runIds])).rows : [];
    const commandsByRun = commandRows.map(toAICommandModel).reduce((groups, command) => {
      if (!groups.has(command.runId)) groups.set(command.runId, []);
      groups.get(command.runId).push(command);
      return groups;
    }, new Map());
    return NextResponse.json({
      runs: runs.rows.map((run) => toAIRunModel(run, commandsByRun.get(run.id) || [])),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET project AI runs", error);
    return NextResponse.json({ error: "AI approval history could not be loaded." }, { status: 500 });
  }
}
