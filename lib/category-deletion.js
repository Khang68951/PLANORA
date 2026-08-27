export async function reassignCategoryAndTrash({ client, categoryIds, replacementCategoryId, trashBatchId, replaceDefault }) {
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM categories WHERE id = ANY($1::uuid[]) OR id = $2 FOR UPDATE", [categoryIds, replacementCategoryId]);
    await client.query("UPDATE planner_items SET category_id = $1, updated_at = NOW() WHERE category_id = ANY($2::uuid[]) AND deleted_at IS NULL", [replacementCategoryId, categoryIds]);
    await client.query("UPDATE projects SET category_id = $1, updated_at = NOW() WHERE category_id = ANY($2::uuid[]) AND deleted_at IS NULL", [replacementCategoryId, categoryIds]);
    if (replaceDefault) await client.query("UPDATE planner_settings SET default_category_id = $1, updated_at = NOW() WHERE id = 1", [replacementCategoryId]);
    await client.query("UPDATE categories SET deleted_at = NOW(), trash_batch_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[]) AND deleted_at IS NULL", [trashBatchId, categoryIds]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
