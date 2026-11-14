import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { AccessRole, Level, Track } from '../../../shared/domain/models';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { getPerson, listDepartments, listPeople, listTeams, upsertPerson } from '../data/people.repo';
import { Db } from '../db/db.service';

export interface AuditLogDto {
  id: number;
  actorId: string | null;
  actorName: string;
  action: string;
  target: string | null;
  detail: string;
  createdAt: string;
}

@Controller('api/org')
export class OrgController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  async org() {
    const [departments, teams, people] = await Promise.all([
      listDepartments(this.db),
      listTeams(this.db),
      listPeople(this.db),
    ]);
    return { departments, teams, people };
  }

  @Roles('admin')
  @Put('people/:id')
  async updatePerson(
    @Param('id') id: string,
    @Body()
    body: {
      access?: AccessRole;
      level?: Level;
      track?: Track;
      gitlabUsername?: string | null;
      openprojectUserId?: number | null;
    },
    @Req() req: AuthedRequest,
  ) {
    const existing = await getPerson(this.db, id);
    if (!existing) {
      return { ok: false, message: 'ไม่พบพนักงาน' };
    }
    const nextAccess: AccessRole =
      body.access === 'admin' || body.access === 'lead' || body.access === 'member'
        ? body.access
        : (existing.access ?? 'member');
    const nextLevel: Level =
      body.level === 'Senior' || body.level === 'Mid' || body.level === 'Junior' || body.level === 'FirstMonth'
        ? body.level
        : existing.level;
    const nextTrack: Track =
      body.track === 'Implement' || body.track === 'RD' ? body.track : existing.track;

    const saved = await upsertPerson(this.db, {
      ...existing,
      access: nextAccess,
      level: nextLevel,
      track: nextTrack,
      gitlabUsername:
        body.gitlabUsername !== undefined ? body.gitlabUsername?.trim() || null : existing.gitlabUsername,
      openprojectUserId:
        body.openprojectUserId !== undefined ? body.openprojectUserId : existing.openprojectUserId,
    });
    await this.db.audit(req.authUser?.person.id ?? null, 'person.update_access', id, {
      access: nextAccess,
      level: nextLevel,
      track: nextTrack,
      gitlabUsername: saved.gitlabUsername,
    });
    return { ok: true, person: saved };
  }

  @Roles('admin')
  @Get('audit-logs')
  async auditLogs(): Promise<{ logs: AuditLogDto[] }> {
    const rows = await this.db.query<{
      id: number;
      actor_id: string | null;
      actor_name: string | null;
      action: string;
      target: string | null;
      detail: unknown;
      created_at: Date | string;
    }>(
      `SELECT a.id, a.actor_id, p.nickname AS actor_name, a.action, a.target, a.detail, a.created_at
       FROM audit_log a
       LEFT JOIN people p ON p.id = a.actor_id
       ORDER BY a.id DESC
       LIMIT 100`,
    );
    return {
      logs: rows.map((row) => ({
        id: Number(row.id),
        actorId: row.actor_id,
        actorName: row.actor_name ?? row.actor_id ?? 'ระบบ',
        action: row.action,
        target: row.target,
        detail: typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail ?? {}),
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
      })),
    };
  }
}
