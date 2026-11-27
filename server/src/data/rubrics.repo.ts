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
    `INSERT INTO rubric_registry (
       rubric_id, version, category, title, applicable_track, params, description, is_active, updated_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, NOW())
     ON CONFLICT (rubric_id) DO UPDATE SET
       params = EXCLUDED.params,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       is_active = EXCLUDED.is_active,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING rubric_id, version, category, title, applicable_track, params, description, is_active, updated_by, updated_at`,
    [
      rubricId,
      existing.version ?? 'v2026.4',
      existing.category,
      updatedTitle,
      existing.applicable_track ?? 'ALL',
      updatedParams,
      updatedDesc,
      updatedActive,
      updatedBy,
    ],
  );

  return result.rows[0] ?? null;
}
