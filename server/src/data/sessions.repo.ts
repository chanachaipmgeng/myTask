import { Queryable } from '../db/db.service';
import { sha256 } from '../common/crypto';

export async function createSession(
  db: Queryable,
  personId: string,
  rawToken: string,
  expiresAt: Date,
): Promise<void> {
  await db.query('INSERT INTO sessions (id_hash, person_id, expires_at) VALUES ($1, $2, $3)', [
    sha256(rawToken),
    personId,
    expiresAt,
  ]);
}

export async function findSessionPersonId(db: Queryable, rawToken: string): Promise<string | null> {
  const rows = await db.query<{ person_id: string }>(
    `SELECT person_id FROM sessions
     WHERE id_hash = $1 AND expires_at > now()`,
    [sha256(rawToken)],
  );
  return rows[0]?.person_id ?? null;
}

export async function deleteSession(db: Queryable, rawToken: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id_hash = $1', [sha256(rawToken)]);
}

export async function deleteExpiredSessions(db: Queryable): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at <= now()');
}
