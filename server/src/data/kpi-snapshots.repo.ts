import { Track } from '../../../shared/domain/models';
import { KpiPeriodType, KpiSnapshotRow } from '../../../shared/domain/kpi-snapshot';
import { PersonScore } from '../../../shared/domain/scoring';
import { Queryable } from '../db/db.service';

export interface KpiSnapshotPeriod {
  periodType: KpiPeriodType;
  periodKey: string;
  capturedAt: string;
  rowCount: number;
}

export interface StoredKpiSnapshot extends KpiSnapshotRow {
  capturedAt: string;
  capturedBy: string | null;
}

interface PeriodRow {
  period_type: KpiPeriodType;
  period_key: string;
  captured_at: Date | string;
  row_count: string | number;
}

interface SnapshotRow {
  period_type: KpiPeriodType;
  period_key: string;
  person_id: string;
  track: Track;
  nickname: string;
  score: PersonScore | string;
  captured_at: Date | string;
  captured_by: string | null;
}

export async function listKpiSnapshotPeriods(db: Queryable): Promise<KpiSnapshotPeriod[]> {
  const rows = await db.query<PeriodRow>(
    `SELECT period_type, period_key,
            max(captured_at) AS captured_at,
            count(*)::int AS row_count
     FROM kpi_snapshots
     GROUP BY period_type, period_key
     ORDER BY period_type, period_key DESC`,
  );
  return rows.map((row) => ({
    periodType: row.period_type,
    periodKey: row.period_key,
    capturedAt: toIso(row.captured_at),
    rowCount: Number(row.row_count),
  }));
}

export async function listKpiSnapshots(
  db: Queryable,
  periodType: KpiPeriodType,
  periodKey: string,
): Promise<StoredKpiSnapshot[]> {
  const rows = await db.query<SnapshotRow>(
    `SELECT period_type, period_key, person_id, track, nickname, score, captured_at, captured_by
     FROM kpi_snapshots
     WHERE period_type = $1 AND period_key = $2
     ORDER BY nickname`,
    [periodType, periodKey],
  );
  return rows.map(fromRow);
}

export async function upsertKpiSnapshots(
  db: Queryable,
  rows: readonly KpiSnapshotRow[],
  capturedBy: string | null,
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    await db.query(
      `INSERT INTO kpi_snapshots (
         period_type, period_key, person_id, track, nickname, score, captured_at, captured_by
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), $7)
       ON CONFLICT (period_type, period_key, person_id) DO UPDATE SET
         track = EXCLUDED.track,
         nickname = EXCLUDED.nickname,
         score = EXCLUDED.score,
         captured_at = now(),
         captured_by = EXCLUDED.captured_by`,
      [
        row.periodType,
        row.periodKey,
        row.personId,
        row.track,
        row.nickname,
        JSON.stringify(row.score),
        capturedBy,
      ],
    );
    count += 1;
  }
  return count;
}

function fromRow(row: SnapshotRow): StoredKpiSnapshot {
  const score = typeof row.score === 'string' ? (JSON.parse(row.score) as PersonScore) : row.score;
  return {
    periodType: row.period_type,
    periodKey: row.period_key,
    personId: row.person_id,
    track: row.track,
    nickname: row.nickname,
    score,
    capturedAt: toIso(row.captured_at),
    capturedBy: row.captured_by,
  };
}

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}
