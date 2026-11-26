import { Controller, Get, Inject, Req } from '@nestjs/common';
import { normalizeOpenProjectAvatarUrl } from '../../../shared/domain/op-team-staging';
import { computeEffectiveAllowedTeams } from '../../../shared/domain/team-visibility';
import { filterPeopleByWorkspace } from '../../../shared/domain/workspace-scope';
import { listAllocations, listDisputes, listLeaves, listStageLogs } from '../data/multi-team.repo';
import { listDepartments, listPeople, listTeams } from '../data/people.repo';
import { getSettings } from '../data/settings.repo';
import { getVisibilityConfig } from '../data/visibility.repo';
import { listWorkItemsForWorkspace } from '../data/work-items.repo';
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

  /**
   * Shell bootstrap — people/settings/visibility เท่านั้น (ไม่ยัดใบงานทั้งฐาน)
   * ใบงานโหลดต่อที่ GET /api/bootstrap/tickets
   */
  @Public()
  @Get('bootstrap')
  async bootstrap(@Req() req: AuthedRequest) {
    const [rawPeople, settings, departments, teams, disputes, leaves, stageLogs, allocations, visibility] =
      await Promise.all([
        listPeople(this.db),
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
    const authUser = req.authUser;
    const effectiveAllowedTeams = authUser?.person
      ? computeEffectiveAllowedTeams(authUser.person, visibility)
      : null;

    const scope = { allowedTeams: effectiveAllowedTeams ?? undefined };
    const people =
      effectiveAllowedTeams === null
        ? enrichedPeople
        : filterPeopleByWorkspace(enrichedPeople, scope);

    return {
      people,
      /** ใบงานย้ายไป /api/bootstrap/tickets — คงคีย์ไว้ให้ client เก่าไม่พัง */
      tickets: [] as const,
      ticketsDeferred: true as const,
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

  /** Workspace ticket slice สำหรับ Scorecard hubs (SQL filter ไม่ SELECT *) */
  @Get('bootstrap/tickets')
  async bootstrapTickets(@Req() req: AuthedRequest) {
    const [rawPeople, visibility] = await Promise.all([
      listPeople(this.db),
      getVisibilityConfig(this.db),
    ]);
    const staging = this.config.openproject.teamStaging === 'rd' ? 'rd' : 'all';
    const activePeopleIds = rawPeople.map((p) => p.id);
    const authUser = req.authUser;
    const effectiveAllowedTeams = authUser?.person
      ? computeEffectiveAllowedTeams(authUser.person, visibility)
      : null;

    let allowedAssigneeIds: string[] | null = null;
    if (effectiveAllowedTeams !== null) {
      const scopedPeople = filterPeopleByWorkspace(rawPeople, {
        allowedTeams: effectiveAllowedTeams,
      });
      allowedAssigneeIds = scopedPeople.map((p) => p.id);
    }

    const tickets = await listWorkItemsForWorkspace(this.db, {
      mode: staging,
      activePeopleIds,
      allowedAssigneeIds,
      closedWithinDays: 120,
    });

    return {
      tickets,
      source: 'workspace' as const,
      count: tickets.length,
    };
  }
}
