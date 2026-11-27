import { Controller, Get, Inject, Req, ServiceUnavailableException } from '@nestjs/common';
import { normalizeOpenProjectAvatarUrl } from '../../../shared/domain/op-team-staging';
import { computeEffectiveAllowedTeams } from '../../../shared/domain/team-visibility';
import { filterPeopleByWorkspace } from '../../../shared/domain/workspace-scope';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { getRuntimeMetricsSnapshot } from '../common/observability';
import { APP_CONFIG, AppConfig } from '../config';
import { listAllocations, listDisputes, listLeaves, listStageLogs } from '../data/multi-team.repo';
import { listDepartments, listPeople, listTeams } from '../data/people.repo';
import { listRubrics } from '../data/rubrics.repo';
import { getSettings } from '../data/settings.repo';
import { getVisibilityConfig } from '../data/visibility.repo';
import { listWorkItemsForWorkspace } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api')
export class BootstrapController {
  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('health/live')
  healthLive() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('health')
  async health() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.db.query('SELECT 1'),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('DB healthcheck timeout')), 2000);
        }),
      ]);
      return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  @Roles('admin')
  @Get('health/metrics')
  healthMetrics() {
    return getRuntimeMetricsSnapshot(this.db);
  }

  /**
   * Shell bootstrap — คืนข้อมูลเฉพาะเมื่อยืนยันตัวตนแล้วเท่านั้น
   */
  @Public()
  @Get('bootstrap')
  async bootstrap(@Req() req: AuthedRequest) {
    const authUser = req.authUser;
    const staging = this.config.openproject.teamStaging;
    if (!authUser?.person) {
      return {
        people: [],
        tickets: [] as const,
        ticketsDeferred: true as const,
        settings: null,
        teamStaging: staging,
        departments: [],
        teams: [],
        disputes: [],
        leaves: [],
        stageLogs: [],
        allocations: [],
        rubrics: [],
        visibility: null,
        auth: {
          authenticated: false,
          person: null,
          access: null,
          effectiveAllowedTeams: null,
          devLoginEnabled: this.config.devLogin,
        },
      };
    }

    const [
      rawPeople,
      settings,
      departments,
      teams,
      disputes,
      leaves,
      stageLogs,
      allocations,
      visibility,
      rubrics,
    ] = await Promise.all([
      listPeople(this.db),
      getSettings(this.db),
      listDepartments(this.db),
      listTeams(this.db),
      listDisputes(this.db),
      listLeaves(this.db),
      listStageLogs(this.db, undefined, { maxAgeDays: 90, limit: 2500 }),
      listAllocations(this.db),
      getVisibilityConfig(this.db),
      listRubrics(this.db),
    ]);

    const opBaseUrl = this.config.openproject.url;
    const effectiveAllowedTeams = computeEffectiveAllowedTeams(authUser.person, visibility);
    const isAdmin = authUser.access === 'admin';
    const isMember = authUser.access === 'member';
    const selfId = authUser.person.id;

    const enrichedPeople = rawPeople.map((p) => ({
      ...p,
      avatarUrl: normalizeOpenProjectAvatarUrl(p.avatarUrl, p.openprojectUserId, opBaseUrl),
      allowedTeams: isAdmin || p.id === selfId ? (visibility.userOverrides[p.id] ?? []) : [],
    }));

    const scope = { allowedTeams: effectiveAllowedTeams ?? undefined };
    const people =
      effectiveAllowedTeams === null
        ? enrichedPeople
        : filterPeopleByWorkspace(enrichedPeople, scope);

    const visiblePersonIds = new Set(people.map((p) => p.id));
    const sensitivePersonIds = isAdmin
      ? null
      : isMember
        ? new Set([selfId])
        : visiblePersonIds;

    const scopedDisputes = sensitivePersonIds
      ? disputes.filter((d) => sensitivePersonIds.has(d.requesterId))
      : disputes;
    const scopedLeaves = sensitivePersonIds
      ? leaves.filter((l) => sensitivePersonIds.has(l.userId))
      : leaves;
    const scopedAllocations = sensitivePersonIds
      ? allocations.filter((a) => sensitivePersonIds.has(a.userId))
      : allocations;
    const scopedStageLogs = isAdmin
      ? stageLogs
      : stageLogs.filter((s) => !s.changedBy || visiblePersonIds.has(s.changedBy));

    const scopedVisibility = isAdmin
      ? visibility
      : {
          matrix: [],
          userOverrides: {
            [selfId]: visibility.userOverrides[selfId] ?? [],
          },
        };

    return {
      people,
      tickets: [] as const,
      ticketsDeferred: true as const,
      settings,
      teamStaging: staging,
      departments,
      teams,
      disputes: scopedDisputes,
      leaves: scopedLeaves,
      stageLogs: scopedStageLogs,
      allocations: scopedAllocations,
      rubrics,
      visibility: scopedVisibility,
      auth: {
        authenticated: true,
        person: {
          ...authUser.person,
          avatarUrl: normalizeOpenProjectAvatarUrl(
            authUser.person.avatarUrl,
            authUser.person.openprojectUserId,
            opBaseUrl,
          ),
          allowedTeams: visibility.userOverrides[selfId] ?? [],
        },
        access: authUser.access,
        effectiveAllowedTeams,
        devLoginEnabled: this.config.devLogin,
      },
    };
  }

  /** Workspace ticket slice สำหรับ Scorecard hubs (SQL filter ไม่ SELECT * ทั้งตาราง) */
  @Get('bootstrap/tickets')
  async bootstrapTickets(@Req() req: AuthedRequest) {
    const [rawPeople, visibility, settings] = await Promise.all([
      listPeople(this.db),
      getVisibilityConfig(this.db),
      getSettings(this.db),
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

    const inactiveProjectKeys = (settings.openprojectProjectCatalog ?? [])
      .filter((p) => p.active === false)
      .flatMap((p) => [p.name, p.identifier])
      .map((s) => (s ?? '').trim())
      .filter(Boolean);

    const { tickets, truncated } = await listWorkItemsForWorkspace(this.db, {
      mode: staging,
      activePeopleIds,
      allowedAssigneeIds,
      inactiveProjectKeys,
      closedWithinDays: 180,
      openWithinDays: 365,
      maxRows: 2_500,
    });

    return {
      tickets,
      source: 'workspace' as const,
      count: tickets.length,
      truncated,
    };
  }
}
