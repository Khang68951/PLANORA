/**
 * Executes independently auditable AI commands in order. A failed command does not roll back
 * already-applied unrelated commands; every outcome is explicit for an honest partial result.
 */
export async function executeAICommandBatch(commands, handlers) {
  const outcomes = [];
  for (const command of commands) {
    const claimed = await handlers.claim(command);
    if (!claimed) {
      outcomes.push({ id: command.id, status: "skipped", error: "Command was already decided." });
      continue;
    }
    try {
      const result = await handlers.execute(command);
      await handlers.applied(command, result);
      outcomes.push({ id: command.id, status: "applied" });
    } catch (error) {
      await handlers.failed(command, error);
      outcomes.push({ id: command.id, status: "failed", error: error.message });
    }
  }
  return outcomes;
}
