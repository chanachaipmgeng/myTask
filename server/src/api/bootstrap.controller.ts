import { Controller, Get, Inject, Req } from '@nestjs/common';
import { normalizeOpenProjectAvatarUrl } from '../../../shared/domain/op-team-staging';
import { computeEffectiveAllowedTeams } from '../../../shared/domain/team-visibility';
import {
  filterPeopleByWorkspace,
  filterTicketsByWorkspace,
} from '../../../shared/domain/workspace-scope';
import { listAllocations, listDisputes, listLeaves, listStageLogs } from '../data/multi-team.repo';
import { listDepartments, listPeople, listTeams } from '../data/people.repo';
import { getSettings } from '../data/settings.repo';
import { getVisibilityConfig } from '../data/visibility.repo';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { AuthedRequest, Public } from '../auth/auth.guard';
import { APP_CONFIG, AppConfig } from '../config';

@Controller('api')
export class BootstrapController {
  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('bootstrap')
  async bootstrap(@Req() req: AuthedRequest) {
    const [rawPeople, allTickets, settings, departments, teams, disputes, leaves, stageLogs, allocations, visibility] =
      await Promise.all([
        listPeople(this.db),
        listWorkItems(this.db),
        getSettings(this.db),
        listDepartments(this.db),
        listTeams(this.db),
        listDisputes(this.db),
        listLeaves(this.db),
        listStageLogs(this.db),
        listAllocations(this.db),
        getVisibilityConfig(this.db),
      ]);
    const staging = this.config.openproject.teamStaging;
    const opBaseUrl = this.config.openproject.url;
    const enrichedPeople = rawPeople.map((p) => ({
      ...p,
      avatarUrl: normalizeOpenProjectAvatarUrl(p.avatarUrl, p.openprojectUserId, opBaseUrl),
      allowedTeams: visibility.userOverrides[p.id] ?? [],
    }));
    const activePeopleIds = new Set(enrichedPeople.map((p) => p.id));
    // โหมด rd: ใบ RD หรือ assignee ที่ active
    // โหมด all: ส่งเฉพาะใบที่มีความเคลื่อนไหว (มีผู้รับ, แผนวันที่, ปิดแล้ว, หรือ RD) ไม่ส่งขยะ backlog ไร้ผู้รับ 13,000+ ใบ
    const trimmedTickets =
      staging === 'all'
        ? allTickets.filter(
            (t) =>
              t.track === 'RD' ||
              t.closed ||
              (t.assigneeId && activePeopleIds.has(t.assigneeId)) ||
              Boolean(t.dueOn || t.firstDueOn || t.actualStartOn),
          )
        : allTickets.filter(
            (t) => t.track === 'RD' || (t.assigneeId && activePeopleIds.has(t.assigneeId)),
          );
    const authUser = req.authUser;
    const effectiveAllowedTeams = authUser?.person
      ? computeEffectiveAllowedTeams(authUser.person, visibility)
      : null;

    // บังคับขอบเขตทีมฝั่งเซิร์ฟเวอร์ให้ตรง frontend (admin = null = ไม่จำกัด)
    const scope = { allowedTeams: effectiveAllowedTeams ?? undefined };
    const people =
      effectiveAllowedTeams === null
        ? enrichedPeople
        : filterPeopleByWorkspace(enrichedPeople, scope);
    const tickets =
      effectiveAllowedTeams === null
        ? trimmedTickets
        : filterTicketsByWorkspace(trimmedTickets, enrichedPeople, scope);

    return {
      people,
      tickets,
      settings,
      teamStaging: staging,
      departments,
      teams,
      disputes,
      leaves,
      stageLogs,
      allocations,
      visibility,
      auth: authUser
        ? {
            authenticated: true,
            person: {
              ...authUser.person,
              avatarUrl: normalizeOpenProjectAvatarUrl(
                authUser.person.avatarUrl,
                authUser.person.openprojectUserId,
                opBaseUrl,
              ),
              allowedTeams: visibility.userOverrides[authUser.person.id] ?? [],
            },
            access: authUser.access,
            effectiveAllowedTeams,
            devLoginEnabled: this.config.devLogin,
          }
        : {
            authenticated: false,
            person: null,
            access: null,
            effectiveAllowedTeams: null,
            devLoginEnabled: this.config.devLogin,
          },
    };
  }
}
