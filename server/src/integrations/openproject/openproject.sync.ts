import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AccessRole, Level, Person } from '../../../../shared/domain/models';
import { WEEKLY_QUOTA } from '../../../../shared/domain/scoring';
import {
  isPersonActiveForStaging,
  mapDepartmentToTeam,
  normalizeOpenProjectAvatarUrl,
  teamLabelForId,
} from '../../../../shared/domain/op-team-staging';
import { todayInBangkok } from '../../../../shared/domain/workflow';
import { APP_CONFIG, AppConfig } from '../../config';
import { Db } from '../../db/db.service';
import {
  listPeople,
  personByOpUserMap,
  upsertDepartment,
  upsertOpUserSeen,
  upsertPerson,
  upsertTeam,
} from '../../data/people.repo';
import { connectionToken, getConnection, getSettings, saveSettings } from '../../data/settings.repo';
import {
  finishSyncRun,
  getWorkItemByOpId,
  lastSuccessfulSync,
  startSyncRun,
  upsertWorkItem,
} from '../../data/work-items.repo';
import { OpenProjectClient } from './openproject.client';
import {
  idFromHref,
  isoDurationToHours,
  mapWorkPackage,
  OpLink,
  OpWorkPackage,
} from './openproject.mapper';

export interface SyncResult {
  runId: number;
  status: 'success' | 'failed';
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

/** ตรวจ job title ว่าเป็นหัวหน้าทีม (ทุกสาย ไม่จำกัด R&D) */
function jobTitleLooksLikeLead(roleTitle: string | null | undefined): boolean {
  const t = (roleTitle ?? '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('lead') ||
    t.includes('หัวหน้า') ||
    t.includes('manager') ||
    t.includes('ผู้จัดการ') ||
    t.includes('team lead') ||
    t.includes('tech lead')
  );
}

function plannedMdForLevel(
  level: Level,
  weeklyQuotas: Partial<Record<Level, number>> | undefined,
): number {
  const fromSettings = weeklyQuotas?.[level];
  if (typeof fromSettings === 'number' && Number.isFinite(fromSettings) && fromSettings > 0) {
    return fromSettings;
  }
  return WEEKLY_QUOTA[level] ?? WEEKLY_QUOTA.Mid;
}

@Injectable()
export class OpenProjectSyncService implements OnModuleInit {
  private readonly log = new Logger(OpenProjectSyncService.name);
  private running = false;

  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expr = this.config.openproject.cron.trim();
    if (!expr) {
      this.log.log('OpenProject scheduled sync disabled (OPENPROJECT_SYNC_CRON empty)');
      return;
    }
    try {
      const job = new CronJob(expr, () => {
        void this.scheduledSync();
      });
      this.schedulerRegistry.addCronJob('openproject-sync', job);
      job.start();
      this.log.log(`OpenProject scheduled sync registered: ${expr}`);
    } catch (error) {
      this.log.warn(
        `Invalid OPENPROJECT_SYNC_CRON "${expr}": ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async scheduledSync(): Promise<void> {
    if (!this.config.openproject.cron.trim()) {
      return;
    }
    try {
      await this.sync('schedule', null);
    } catch (error) {
      this.log.warn(`scheduled sync skipped/failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async sync(trigger: 'manual' | 'schedule', startedBy: string | null): Promise<SyncResult> {
    if (this.running) {
      throw new Error('OpenProject sync already running');
    }
    const creds = await this.resolveCredentials();
    if (!creds) {
      throw new Error('OpenProject URL/token is not configured');
    }

    const last = await lastSuccessfulSync(this.db, 'openproject');
    const since = last?.finished_at ? new Date(last.finished_at) : null;
    const runId = await startSyncRun(this.db, {
      connection: 'openproject',
      trigger,
      startedBy,
      since,
    });

    this.running = true;
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    try {
      const settings = await getSettings(this.db);
      const mapping = settings.openprojectMapping;
      const client = new OpenProjectClient(creds.url, creds.token);
      // Refresh OpenProject Type & Status catalogs dynamically during sync (best-effort)
      try {
        const [opTypes, opStatuses] = await Promise.all([client.listTypes(), client.listStatuses()]);
        settings.openprojectTypeCatalog = opTypes
          .filter((t) => t.name?.trim())
          .map((t) => ({
            id: t.id,
            name: (t.name ?? '').trim(),
            ...(t.color ? { color: t.color } : {}),
            isMilestone: Boolean(t.isMilestone),
          }));
        settings.openprojectStatusCatalog = opStatuses
          .filter((s) => s.name?.trim())
          .map((s) => ({
            id: s.id,
            name: (s.name ?? '').trim(),
            isClosed: Boolean(s.isClosed),
            ...(s.color ? { color: s.color } : {}),
          }));
        await saveSettings(this.db, settings, startedBy);
      } catch (catErr) {
        this.log.warn(`Skipped OP type/status catalog refresh: ${catErr instanceof Error ? catErr.message : catErr}`);
      }
      const spentHours = await this.loadSpentHours(client, since);
      const staging = this.config.openproject.teamStaging;
      const personByOp = await this.refreshUserMap(client, staging === 'rd');
      const peopleForTrack = await listPeople(this.db, staging === 'rd');
      const personTrackById = new Map(
        peopleForTrack.filter((p) => p.track).map((p) => [p.id, p.track] as const),
      );

      if (!mapping.projects?.length) {
        this.log.warn(
          'OpenProject sync: mapping.projects is empty — syncing every project the token can see. Set project identifiers on /integrations to narrow scope.',
        );
      }

      const updatedSince = since ? since.toISOString() : null;
      for await (const wp of client.paginateWorkPackages({
        updatedSince,
        projects: mapping.projects,
      })) {
        try {
          const assigneeUser = idFromHref(singleLink(wp._links?.['assignee'])?.href);
          // โหมด rd (POC): ข้ามใบที่ assignee ยังไม่อยู่ในคน active
          // โหมด all: ซิงก์ทุกใบในโปรเจกต์ที่เลือก แม้ยังไม่แมปคน (จำ op_users_seen แทน)
          if (staging === 'rd' && assigneeUser !== null && !personByOp.has(assigneeUser)) {
            continue;
          }

          await this.rememberAssignee(client, wp, personByOp);
          const existing = await getWorkItemByOpId(this.db, wp.id);
          const activities = mapping.countReopens ? await client.getActivities(wp.id) : undefined;

          // Check if there is an approved due shift for this ticket
          let approvedDueShift: string | null = null;
          if (existing) {
            try {
              const shiftRows = await this.db.query<{ new_first_due_on: string }>(
                `SELECT new_first_due_on::text FROM ticket_due_shifts WHERE ticket_id = $1 AND status = 'APPROVED' ORDER BY approved_at DESC LIMIT 1`,
                [existing.id],
              );
              if (shiftRows.length > 0 && shiftRows[0]?.new_first_due_on) {
                approvedDueShift = shiftRows[0].new_first_due_on.slice(0, 10);
              }
            } catch {
              // If table not yet queried or migrated
            }
          }

          const mapped = mapWorkPackage(wp, {
            mapping,
            hoursPerMd: settings.hoursPerMd,
            personByOpUser: personByOp,
            personTrackById,
            spentHours,
            existing: existing ?? undefined,
            activities,
            today: todayInBangkok(),
            approvedDueShift,
          });
          if (existing && stableTicketJson(existing) === stableTicketJson(mapped)) {
            unchanged += 1;
            continue;
          }
          await upsertWorkItem(this.db, mapped, new Date());
          if (existing) {
            updated += 1;
          } else {
            added += 1;
          }
        } catch (error) {
          errors.push(`WP ${wp.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const status = errors.length > 0 && added + updated === 0 ? 'failed' : 'success';
      await finishSyncRun(this.db, runId, { status, added, updated, unchanged, errors });
      await this.db.audit(startedBy, 'openproject.sync', 'openproject', {
        runId,
        status,
        added,
        updated,
        unchanged,
      });
      return { runId, status, added, updated, unchanged, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      await finishSyncRun(this.db, runId, {
        status: 'failed',
        added,
        updated,
        unchanged,
        errors,
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async rememberAssignee(
    client: OpenProjectClient,
    wp: OpWorkPackage,
    personByOp: Map<number, string>,
  ): Promise<void> {
    const link = singleLink(wp._links?.['assignee']);
    const opUserId = idFromHref(link?.href);
    if (opUserId === null || personByOp.has(opUserId)) {
      return;
    }
    const user = await client.getUser(opUserId);
    const name = user?.name || link?.title || `User ${opUserId}`;
    const login = user?.login ?? null;
    const email = user?.email ?? null;
    await upsertOpUserSeen(this.db, { opUserId, name, login, email });

    const people = await listPeople(this.db, false);
    const match =
      people.find((person) => email && person.email?.toLowerCase() === email.toLowerCase()) ??
      people.find((person) => login && person.gitlabUsername?.toLowerCase() === login.toLowerCase()) ??
      null;
    if (match && match.openprojectUserId == null) {
      await upsertPerson(this.db, { ...match, openprojectUserId: opUserId });
      personByOp.set(opUserId, match.id);
    }
  }

  private async refreshUserMap(
    client: OpenProjectClient,
    activeOnly = true,
  ): Promise<Map<number, string>> {
    void client;
    return personByOpUserMap(this.db, activeOnly);
  }

  private async loadSpentHours(client: OpenProjectClient, since: Date | null): Promise<Map<number, number>> {
    const spent = new Map<number, number>();
    const spentFrom = since ? since.toISOString().slice(0, 10) : null;
    for await (const entry of client.paginateTimeEntries({ spentFrom })) {
      const wpId = client.workPackageIdFromTimeEntry(entry);
      if (wpId === null) {
        continue;
      }
      const hours = isoDurationToHours(entry.hours);
      spent.set(wpId, (spent.get(wpId) ?? 0) + hours);
    }
    return spent;
  }

  /**
   * When OPENPROJECT_WRITEBACK is true, PATCH assignee on the work package.
   * Returns an error string on failure; null when skipped or succeeded.
   */
  async writebackAssignee(opId: number, opUserId: number): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return null;
    }
    const creds = await this.resolveCredentials();
    if (!creds) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      const client = new OpenProjectClient(creds.url, creds.token);
      const wp = await client.getWorkPackage(opId);
      const lockVersion = typeof wp.lockVersion === 'number' ? wp.lockVersion : 0;
      await client.patchAssignee(opId, opUserId, lockVersion);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`writeback assignee OP-${opId} failed: ${message}`);
      return message;
    }
  }

  /**
   * When OPENPROJECT_WRITEBACK is true, PATCH startDate / dueDate on the work package.
   * Never touches firstDueOn (scorecard-owned locked promise).
   */
  async writebackDates(
    opId: number,
    dates: { startDate?: string | null; dueDate?: string | null },
  ): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return null;
    }
    const creds = await this.resolveCredentials();
    if (!creds) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      const client = new OpenProjectClient(creds.url, creds.token);
      const wp = await client.getWorkPackage(opId);
      const lockVersion = typeof wp.lockVersion === 'number' ? wp.lockVersion : 0;
      await client.patchDates(opId, dates, lockVersion);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`writeback dates OP-${opId} failed: ${message}`);
      return message;
    }
  }

  async postActivity(opId: number, commentMarkdown: string): Promise<string | null> {
    const creds = await this.resolveCredentials();
    if (!creds) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      const client = new OpenProjectClient(creds.url, creds.token);
      await client.postActivityComment(opId, commentMarkdown);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`postActivity OP-${opId} failed: ${message}`);
      return message;
    }
  }

  async syncUsers(startedBy: string | null): Promise<{
    total: number;
    created: number;
    updated: number;
    linked: number;
    errors: string[];
  }> {
    const creds = await this.resolveCredentials();
    if (!creds) {
      throw new Error('OpenProject URL/token is not configured');
    }
    const client = new OpenProjectClient(creds.url, creds.token);
    const settings = await getSettings(this.db);
    const weeklyQuotas = settings.weeklyQuotas;

    const errors: string[] = [];
    let total = 0;
    let created = 0;
    let updated = 0;
    let linked = 0;

    const people = await listPeople(this.db, false);
    const personByOp = new Map<number, Person>();
    const personByEmail = new Map<string, Person>();
    const personById = new Map<string, Person>();
    const usedGitlabUsernames = new Set<string>();

    for (const p of people) {
      if (p.openprojectUserId != null) {
        personByOp.set(p.openprojectUserId, p);
      }
      if (p.email) {
        personByEmail.set(p.email.toLowerCase().trim(), p);
      }
      personById.set(p.id.toLowerCase().trim(), p);
      if (p.gitlabUsername) {
        usedGitlabUsernames.add(p.gitlabUsername.toLowerCase().trim());
      }
    }

    try {
      for await (const user of client.paginateUsers()) {
        total += 1;
        const opUserId = user.id;
        const name =
          user.name ||
          (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : `User ${opUserId}`);
        const login = user.login?.trim() ?? null;
        const email = user.email?.trim() ?? null;

        await upsertOpUserSeen(this.db, { opUserId, name, login, email });

        const deptTitle = user._links?.customField1?.title ?? null;
        const unitTitle = user._links?.customField2?.title ?? null;
        const roleTitle = user._links?.customField3?.title ?? null;
        const avatarUrl = normalizeOpenProjectAvatarUrl(user.avatar, opUserId, creds.url);
        const teamMap = mapDepartmentToTeam(deptTitle, unitTitle, roleTitle);
        const staging = this.config.openproject.teamStaging;
        const locked = user.status === 'locked';
        const active = isPersonActiveForStaging(staging, { isRd: teamMap.isRd, locked });

        let existing: Person | null = personByOp.get(opUserId) ?? null;
        if (!existing && email) {
          existing = personByEmail.get(email.toLowerCase().trim()) ?? null;
        }
        if (!existing && login) {
          existing = personById.get(login.toLowerCase().trim()) ?? null;
        }
        // Match by login prefix: e.g. 'chanachai.o@myhr.co.th' -> 'chanachai'
        if (!existing && login) {
          const prefix = login.split('.')[0]?.toLowerCase().trim();
          if (prefix && personById.has(prefix)) {
            existing = personById.get(prefix) ?? null;
          }
        }

        if (existing) {
          let changed = false;
          const patch: Person & { access?: AccessRole; active?: boolean } = { ...existing };
          if (patch.openprojectUserId !== opUserId) {
            patch.openprojectUserId = opUserId;
            changed = true;
            linked += 1;
          }
          if (!patch.email && email) {
            patch.email = email;
            changed = true;
          }
          if ((!patch.fullName || patch.fullName.startsWith('User ')) && name) {
            patch.fullName = name;
            changed = true;
          }
          if (avatarUrl && patch.avatarUrl !== avatarUrl) {
            patch.avatarUrl = avatarUrl;
            changed = true;
          }
          if (deptTitle && patch.department !== deptTitle) {
            patch.department = deptTitle;
            changed = true;
          }
          if (unitTitle && patch.unit !== unitTitle) {
            patch.unit = unitTitle;
            changed = true;
          }
          if (roleTitle && patch.jobTitle !== roleTitle) {
            patch.jobTitle = roleTitle;
            patch.role = roleTitle;
            changed = true;
          }
          if (deptTitle) {
            if (patch.track !== teamMap.track) {
              patch.track = teamMap.track;
              changed = true;
            }
            if (patch.teamId !== teamMap.teamId) {
              patch.teamId = teamMap.teamId;
              changed = true;
            }
          }
          if (patch.active !== active) {
            patch.active = active;
            changed = true;
          }
          if (user.admin && patch.access !== 'admin') {
            patch.access = 'admin';
            changed = true;
          } else if (!user.admin && jobTitleLooksLikeLead(roleTitle) && patch.access === 'member') {
            // ไม่ทับ admin/lead ที่ตั้งเอง — ยกเฉพาะ member → lead จากตำแหน่ง
            patch.access = 'lead';
            changed = true;
          }
          if (changed) {
            await this.ensureOrgRows(teamMap.teamId, deptTitle);
            await upsertPerson(this.db, patch);
            personByOp.set(opUserId, patch);
            if (email) personByEmail.set(email.toLowerCase().trim(), patch);
            personById.set(patch.id.toLowerCase().trim(), patch);
            updated += 1;
          }
        } else {
          const rawId =
            (login ? login.toLowerCase().replace(/[^a-z0-9_-]/g, '') : `op-${opUserId}`) ||
            `op-${opUserId}`;
          let candidateId = rawId;
          let suffix = 1;
          while (personById.has(candidateId)) {
            candidateId = `${rawId}-${suffix++}`;
          }

          const candidateGitlab =
            login && !usedGitlabUsernames.has(login.toLowerCase()) ? login : null;
          if (candidateGitlab) {
            usedGitlabUsernames.add(candidateGitlab.toLowerCase());
          }

          const nickname =
            user.firstName ||
            (name.includes(' ') ? name.split(' ')[0] : name) ||
            login ||
            `User ${opUserId}`;
          const level: Level = 'Mid';
          const newPerson: Person & { access?: AccessRole; active?: boolean } = {
            id: candidateId,
            nickname,
            fullName: name,
            role: roleTitle || (user.admin ? 'Lead' : 'Developer'),
            level,
            track: teamMap.track,
            plannedMd: plannedMdForLevel(level, weeklyQuotas),
            teamId: teamMap.teamId,
            access: user.admin ? 'admin' : jobTitleLooksLikeLead(roleTitle) ? 'lead' : 'member',
            email,
            gitlabUsername: candidateGitlab,
            openprojectUserId: opUserId,
            active,
            avatarUrl,
            department: deptTitle,
            unit: unitTitle,
            jobTitle: roleTitle,
          };

          await this.ensureOrgRows(teamMap.teamId, deptTitle);
          await upsertPerson(this.db, newPerson);
          personByOp.set(opUserId, newPerson);
          if (email) personByEmail.set(email.toLowerCase(), newPerson);
          personById.set(candidateId, newPerson);
          created += 1;
        }
      }

      // โหมด POC (rd): ปิดคนที่ไม่อยู่ในขอบเขต R&D — โหมด all ไม่บังคับปิด
      if (this.config.openproject.teamStaging === 'rd') {
        await this.db.query(
          `UPDATE people SET active = false
           WHERE active = true
             AND track != 'RD'
             AND (department IS NULL OR department NOT LIKE 'RD-%')
             AND COALESCE(team_id, '') != 'rd'`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
      this.log.error(`syncUsers failed: ${msg}`);
    }

    await this.db.audit(startedBy, 'openproject.sync_users', 'openproject', {
      total,
      created,
      updated,
      linked,
      errors,
    });

    return { total, created, updated, linked, errors };
  }

  /** Returns a live OpenProject client when URL+token are configured; otherwise null. */
  async getClient(): Promise<OpenProjectClient | null> {
    const creds = await this.resolveCredentials();
    return creds ? new OpenProjectClient(creds.url, creds.token) : null;
  }

  /** สร้างแถว departments/teams จากแผนกจริงที่เจอใน myProject ตอน sync-users */
  private async ensureOrgRows(teamId: string, departmentTitle: string | null): Promise<void> {
    if (!teamId || teamId === 'unassigned') {
      return;
    }
    const realName = departmentTitle?.trim() || teamLabelForId(teamId);
    try {
      await upsertDepartment(this.db, { id: teamId, name: realName });
      await upsertTeam(this.db, {
        id: teamId,
        departmentId: teamId,
        name: realName,
        leadId: null,
      });
    } catch (error) {
      this.log.warn(
        `ensureOrgRows ${teamId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async resolveCredentials(): Promise<{ url: string; token: string } | null> {
    const envUrl = this.config.openproject.url;
    const envToken = this.config.openproject.token;
    if (envUrl && envToken) {
      return { url: envUrl, token: envToken };
    }
    const row = await getConnection(this.db, 'openproject');
    if (!row) {
      return null;
    }
    const token = envToken || connectionToken(row, this.config.tokenEncKey);
    const url = envUrl || row.base_url;
    if (!url || !token || (!row.enabled && !(envUrl && envToken))) {
      return null;
    }
    return { url, token };
  }

  /**
   * When OPENPROJECT_WRITEBACK is true, POST a time entry on the work package.
   * Returns null on success, or an error message.
   */
  async writebackTimeEntry(payload: {
    workPackageId: number;
    hours: string;
    spentOn: string;
    comment?: string;
  }): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return 'writebackDisabled';
    }
    const client = await this.getClient();
    if (!client) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      await client.createTimeEntry(payload);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`writeback time entry OP-${payload.workPackageId} failed: ${message}`);
      return message;
    }
  }

  async writebackComment(opId: number, commentMarkdown: string): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return 'writebackDisabled';
    }
    return this.postActivity(opId, commentMarkdown);
  }

  async writebackStatus(opId: number, statusId: number): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return 'writebackDisabled';
    }
    const client = await this.getClient();
    if (!client) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      const wp = await client.getWorkPackage(opId);
      const lockVersion = typeof wp.lockVersion === 'number' ? wp.lockVersion : 0;
      await client.patchStatus(opId, statusId, lockVersion);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`writeback status OP-${opId} failed: ${message}`);
      return message;
    }
  }
}

function singleLink(link: OpLink | OpLink[] | undefined): OpLink | undefined {
  return Array.isArray(link) ? link[0] : link;
}

function stableTicketJson(ticket: unknown): string {
  return JSON.stringify(ticket);
}
