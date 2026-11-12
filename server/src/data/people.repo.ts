import { AccessRole, Department, Person, Team } from '../../../shared/domain/models';
import { Queryable } from '../db/db.service';
import {
  DepartmentRow,
  OpUserSeenRow,
  PersonRow,
  TeamRow,
  departmentFromRow,
  personFromRow,
  teamFromRow,
} from './types';

export async function listPeople(db: Queryable, activeOnly = true): Promise<Person[]> {
  const rows = await db.query<PersonRow>(
    `SELECT * FROM people ${activeOnly ? 'WHERE active = true' : ''} ORDER BY nickname`,
  );
  return rows.map(personFromRow);
}

export async function getPerson(db: Queryable, id: string): Promise<Person | null> {
  const rows = await db.query<PersonRow>('SELECT * FROM people WHERE id = $1', [id]);
  return rows[0] ? personFromRow(rows[0]) : null;
}

export async function findPersonByGitlabUsername(db: Queryable, username: string): Promise<Person | null> {
  const rows = await db.query<PersonRow>('SELECT * FROM people WHERE lower(gitlab_username) = lower($1)', [username]);
  return rows[0] ? personFromRow(rows[0]) : null;
}

export async function upsertPerson(
  db: Queryable,
  person: Person & { access?: AccessRole; active?: boolean },
): Promise<Person> {
  await db.query(
    `INSERT INTO people (
       id, nickname, full_name, role_title, level, track, planned_md, team_id, access,
       email, gitlab_username, openproject_user_id, active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET
       nickname = EXCLUDED.nickname,
       full_name = EXCLUDED.full_name,
       role_title = EXCLUDED.role_title,
       level = EXCLUDED.level,
       track = EXCLUDED.track,
       planned_md = EXCLUDED.planned_md,
       team_id = EXCLUDED.team_id,
       access = EXCLUDED.access,
       email = EXCLUDED.email,
       gitlab_username = EXCLUDED.gitlab_username,
       openproject_user_id = EXCLUDED.openproject_user_id,
       active = EXCLUDED.active`,
    [
      person.id,
      person.nickname,
      person.fullName,
      person.role,
      person.level,
      person.track,
      person.plannedMd,
      person.teamId ?? null,
      person.access ?? 'member',
      person.email ?? null,
      person.gitlabUsername ?? null,
      person.openprojectUserId ?? null,
      person.active ?? true,
    ],
  );
  const saved = await getPerson(db, person.id);
  if (!saved) {
    throw new Error(`failed to upsert person ${person.id}`);
  }
  return saved;
}

export async function setPersonOpenProjectUser(
  db: Queryable,
  personId: string,
  openprojectUserId: number | null,
): Promise<void> {
  await db.query('UPDATE people SET openproject_user_id = $2 WHERE id = $1', [personId, openprojectUserId]);
}

export async function listDepartments(db: Queryable): Promise<Department[]> {
  const rows = await db.query<DepartmentRow>('SELECT * FROM departments ORDER BY name');
  return rows.map(departmentFromRow);
}

export async function listTeams(db: Queryable): Promise<Team[]> {
  const rows = await db.query<TeamRow>('SELECT * FROM teams ORDER BY name');
  return rows.map(teamFromRow);
}

export async function upsertDepartment(db: Queryable, department: Department): Promise<void> {
  await db.query(
    `INSERT INTO departments (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [department.id, department.name],
  );
}

export async function upsertTeam(db: Queryable, team: Team): Promise<void> {
  await db.query(
    `INSERT INTO teams (id, department_id, name, lead_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       department_id = EXCLUDED.department_id,
       name = EXCLUDED.name,
       lead_id = EXCLUDED.lead_id`,
    [team.id, team.departmentId, team.name, team.leadId],
  );
}

export async function peopleCount(db: Queryable): Promise<number> {
  const rows = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM people');
  return Number(rows[0]?.count ?? 0);
}

export async function upsertOpUserSeen(
  db: Queryable,
  user: { opUserId: number; name: string; login?: string | null; email?: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO op_users_seen (op_user_id, name, login, email, last_seen)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (op_user_id) DO UPDATE SET
       name = EXCLUDED.name,
       login = COALESCE(EXCLUDED.login, op_users_seen.login),
       email = COALESCE(EXCLUDED.email, op_users_seen.email),
       last_seen = now()`,
    [user.opUserId, user.name, user.login ?? null, user.email ?? null],
  );
}

export async function listUnmappedOpUsers(db: Queryable): Promise<OpUserSeenRow[]> {
  return db.query<OpUserSeenRow>(
    `SELECT u.*
     FROM op_users_seen u
     LEFT JOIN people p ON p.openproject_user_id = u.op_user_id
     WHERE p.id IS NULL
     ORDER BY u.name`,
  );
}

export async function personByOpUserMap(db: Queryable): Promise<Map<number, string>> {
  const rows = await db.query<{ id: string; openproject_user_id: number }>(
    'SELECT id, openproject_user_id FROM people WHERE openproject_user_id IS NOT NULL',
  );
  return new Map(rows.map((row) => [row.openproject_user_id, row.id]));
}
