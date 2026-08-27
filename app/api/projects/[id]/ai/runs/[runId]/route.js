import { NextResponse } from "next/server";
import { executeAICommand, toAICommandModel } from "@/lib/ai-commands";
import { deriveAIRunStatus, eligibleBatchCommands, toAIRunModel } from "@/lib/ai-runs";
import { isUuid } from "@/lib/categories";
import { getPool, query } from "@/lib/db";
import { readJson } from "@/lib/http";
import { executeAICommandBatch } from "@/lib/ai-batch";

const commandSelect = `id, run_id AS "runId", name, safety, mode, arguments, summary, status, result, error,
  created_at AS "createdAt", decided_at AS "decidedAt"`;

async function loadRun(projectId, runId) {
  const run = (await query(`SELECT id, project_id AS "projectId", request_message AS "requestMessage", response_message AS "responseMessage", intent, scopes,
    status, created_at AS "createdAt", updated_at AS "updatedAt" FROM project_ai_runs WHERE id=$1 AND project_id=$2`, [runId, projectId])).rows[0];
  if (!run) return null;
  const commands = (await query(`SELECT ${commandSelect} FROM project_ai_commands WHERE run_id=$1 ORDER BY created_at,id`, [runId])).rows.map(toAICommandModel);
  return toAIRunModel(run, commands);
}

export async function GET(_request, context) {
  const { id, runId } = await context.params;
  if (!isUuid(id) || !isUuid(runId)) return NextResponse.json({ error: "Invalid AI run." }, { status: 400 });
  const run = await loadRun(id, runId);
  return run ? NextResponse.json({ run }) : NextResponse.json({ error: "AI run not found." }, { status: 404 });
}

export async function PATCH(request, context) {
  try {
    const { id, runId } = await context.params;
    if (!isUuid(id) || !isUuid(runId)) return NextResponse.json({ error: "Invalid AI run." }, { status: 400 });
    const body = await readJson(request);
    if (!["approve_all", "reject_all"].includes(body.action)) return NextResponse.json({ error: "Choose approve_all or reject_all." }, { status: 400 });
    const existing = await loadRun(id, runId);
    if (!existing) return NextResponse.json({ error: "AI run not found." }, { status: 404 });
    if (body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
      return NextResponse.json({ error: "This review changed elsewhere. Reload it before deciding." }, { status: 409 });
    }

    if (body.action === "reject_all") {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const claimed = await client.query("UPDATE project_ai_runs SET status='running',updated_at=NOW() WHERE id=$1 AND project_id=$2 AND updated_at=$3 RETURNING id", [runId, id, existing.updatedAt]);
        if (!claimed.rowCount) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "This review changed elsewhere. Reload it before deciding." }, { status: 409 });
        }
        await client.query("UPDATE project_ai_commands SET status='discarded',decided_at=NOW() WHERE run_id=$1 AND status='pending'", [runId]);
        await client.query("UPDATE project_ai_runs SET status='rejected',updated_at=NOW() WHERE id=$1", [runId]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
      return NextResponse.json({ run: await loadRun(id, runId) });
    }

    const claimedRun = await query("UPDATE project_ai_runs SET status='running',updated_at=NOW() WHERE id=$1 AND project_id=$2 AND updated_at=$3 RETURNING id", [runId, id, existing.updatedAt]);
    if (!claimedRun.rowCount) return NextResponse.json({ error: "This review changed elsewhere. Reload it before deciding." }, { status: 409 });
    const eligible = eligibleBatchCommands(existing.commands);
    const outcomes = await executeAICommandBatch(eligible, {
      claim: async (command) => Boolean((await query(`UPDATE project_ai_commands SET status='running',decided_at=NOW() WHERE id=$1 AND run_id=$2 AND status='pending' RETURNING id`, [command.id, runId])).rowCount),
      execute: (command) => executeAICommand({ projectId: id, name: command.name, arguments: command.arguments }),
      applied: (command, result) => query("UPDATE project_ai_commands SET status='applied',result=$1,error=NULL,decided_at=NOW() WHERE id=$2", [result, command.id]),
      failed: (command, error) => query("UPDATE project_ai_commands SET status='failed',error=$1,decided_at=NOW() WHERE id=$2", [error.message, command.id]),
    });
    const updated = await loadRun(id, runId);
    await query("UPDATE project_ai_runs SET status=$1,updated_at=NOW() WHERE id=$2", [deriveAIRunStatus(updated.commands), runId]);
    const incomplete = outcomes.some((entry) => entry.status !== "applied");
    return NextResponse.json({ run: await loadRun(id, runId), outcomes, atomic: false, message: incomplete ? "Some eligible changes failed or were already decided; successful changes remain recorded individually." : "All eligible changes were applied. Document reviews still require individual approval." });
  } catch (error) {
    console.error("PATCH project AI run", error);
    return NextResponse.json({ error: "The approval group could not be updated." }, { status: 500 });
  }
}
