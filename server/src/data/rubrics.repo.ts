import { DEFAULT_RUBRICS, RubricDefinition } from '../../../shared/domain/rubrics';
import { Db } from '../db/db.service';

export async function listRubrics(db: Db): Promise<RubricDefinition[]> {
  const result = await db.pool.query<RubricDefinition>(
    `SELECT rubric_id, version, category, title, applicable_track, params, description, is_active, updated_by, updated_at
     FROM rubric_registry
     ORDER BY category, rubric_id ASC`,
  );
  if (result.rows.length === 0) {
    return Object.values(DEFAULT_RUBRICS);
  }
  return result.rows;
}

export async function getRubric(db: Db, rubricId: string): Promise<RubricDefinition | null> {
  const result = await db.pool.query<RubricDefinition>(
    `SELECT rubric_id, version, category, title, applicable_track, params, description, is_active, updated_by, updated_at
     FROM rubric_registry
     WHERE rubric_id = $1`,
    [rubricId],
  );
  if (result.rows.length === 0) {
    return DEFAULT_RUBRICS[rubricId] ?? null;
  }
  return result.rows[0];
}

export async function updateRubric(
  db: Db,
  rubricId: string,
  patch: Partial<RubricDefinition>,
  updatedBy: string | null,
): Promise<RubricDefinition | null> {
  const existing = await getRubric(db, rubricId);
  if (!existing) {
    return null;
  }

  const updatedParams = patch.params !== undefined ? JSON.stringify(patch.params) : JSON.stringify(existing.params);
  const updatedTitle = patch.title ?? existing.title;
  const updatedDesc = patch.description ?? existing.description;
  const updatedActive = patch.is_active !== undefined ? patch.is_active : existing.is_active;

  const result = await db.pool.query<RubricDefinition>(
    `UPDATE rubric_registry
     SET params = $1::jsonb,
         title = $2,
         description = $3,
         is_active = $4,
         updated_by = $5,
         updated_at = NOW()
     WHERE rubric_id = $6
     RETURNING rubric_id, version, category, title, applicable_track, params, description, is_active, updated_by, updated_at`,
    [updatedParams, updatedTitle, updatedDesc, updatedActive, updatedBy, rubricId],
  );

  return result.rows[0] ?? null;
}
