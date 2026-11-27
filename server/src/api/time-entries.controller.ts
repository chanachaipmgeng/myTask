import { BadRequestException, Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { mapPool } from '../common/ttl-cache';
import { APP_CONFIG, AppConfig } from '../config';
import { getSettings } from '../data/settings.repo';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { gitlabEventsCache, resolveGitLabConnection } from '../integrations/gitlab/gitlab-resolver';
import { isoDurationToHours } from '../integrations/openproject/openproject.mapper';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

@Controller('api')
export class TimeEntriesController {
  constructor(
    private readonly db: Db,
    private readonly syncService: OpenProjectSyncService,
    private readonly scope: VisibilityScopeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('team-time')
  @Roles('admin', 'lead', 'member')
  async teamTime(
    @Query('from') fromRaw: string | undefined,
    @Query('to') toRaw: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const settings = await getSettings(this.db);
    const hoursPerMd = settings.hoursPerMd || 6;
    const { from, to } = resolveWeekRange(fromRaw, toRaw);
    const days = enumerateDates(from, to, 62);
    const activeVisible = ctx.visiblePeople.filter((p) => p.active !== false);
    const visiblePeople =
      ctx.access === 'member'
        ? activeVisible.filter((p) => p.id === ctx.selfId)
        : activeVisible;

    const client = await this.syncService.getClient();
    type DayCell = {
      date: string;
      hours: number;
      ticketIds: string[];
      hasGitlabActivity: boolean;
    };
    type PersonRow = {
      personId: string;
      nickname: string;
      openprojectUserId: number | null;
      gitlabUsername: string | null;
      days: DayCell[];
      totalHours: number;
    };

    const rows: PersonRow[] = visiblePeople.map((person) => ({
      personId: person.id,
      nickname: person.nickname,
      openprojectUserId: person.openprojectUserId ?? null,
      gitlabUsername: person.gitlabUsername ?? null,
      days: days.map((date) => ({ date, hours: 0, ticketIds: [], hasGitlabActivity: false })),
      totalHours: 0,
    }));
    const byPerson = new Map(rows.map((r) => [r.personId, r]));
    const byOpUser = new Map(
      rows.filter((r) => r.openprojectUserId != null).map((r) => [r.openprojectUserId!, r]),
    );

    let source: 'live' | 'offline' = 'offline';
    const errors: string[] = [];

    if (client) {
      source = 'live';
      try {
        for await (const entry of client.paginateTimeEntries({ spentFrom: from, spentTo: to })) {
          const userId = client.userIdFromTimeEntry(entry);
          const row = userId != null ? byOpUser.get(userId) : undefined;
          if (!row) continue;
          const spentOn = (entry.spentOn ?? '').slice(0, 10);
          const cell = row.days.find((d) => d.date === spentOn);
          if (!cell) continue;
          const hours = isoDurationToHours(entry.hours);
          cell.hours = Math.round((cell.hours + hours) * 100) / 100;
          const wpId = client.workPackageIdFromTimeEntry(entry);
          if (wpId != null) {
            const ticketId = `OP-${wpId}`;
            if (!cell.ticketIds.includes(ticketId)) {
              cell.ticketIds.push(ticketId);
            }
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        source = 'offline';
      }
    }

    if (source === 'offline') {
      const tickets = await listWorkItems(this.db);
      for (const ticket of tickets) {
        if (!ticket.assigneeId || !ticket.actualMd) continue;
        const row = byPerson.get(ticket.assigneeId);
        if (!row) continue;
        const closedOn = normalizeDate(ticket.closedOn) || normalizeDate(ticket.dueOn);
        if (!closedOn || closedOn < from || closedOn > to) continue;
        const cell = row.days.find((d) => d.date === closedOn);
        if (!cell) continue;
        const hours = Math.round(ticket.actualMd * hoursPerMd * 100) / 100;
        cell.hours = Math.round((cell.hours + hours) * 100) / 100;
        if (!cell.ticketIds.includes(ticket.id)) {
          cell.ticketIds.push(ticket.id);
        }
      }
    }

    // Optional GitLab activity dots — parallel + TTL cache (ไม่ยิงทีละคนแบบ serial)
    const gitlab = await resolveGitLabConnection(this.db, this.config);
    if (gitlab) {
      const withGit = rows.filter((r) => r.gitlabUsername);
      await mapPool(withGit, 4, async (row) => {
        const username = row.gitlabUsername!;
        const cacheKey = `events:${username}:${from}:${to}`;
        try {
          const events = await gitlabEventsCache.getOrSet(cacheKey, () =>
            gitlab.client.getUserEvents(username, { after: from, before: to, perPage: 50 }),
          );
          for (const event of events) {
            const day = (event.created_at ?? '').slice(0, 10);
            const cell = row.days.find((d) => d.date === day);
            if (cell) cell.hasGitlabActivity = true;
          }
        } catch {
          // ignore per-user event errors
        }
      });
    }

    for (const row of rows) {
      row.totalHours = Math.round(row.days.reduce((sum, d) => sum + d.hours, 0) * 100) / 100;
    }

    return {
      source,
      from,
      to,
      days,
      hoursPerDayTarget: hoursPerMd,
      writeback: this.config.openproject.writeback,
      rows,
      errors,
    };
  }

  /**
   * รายการ time entry แบบแถว (คน/ช่วงวัน) — ต่างจาก team-time ที่เป็น matrix
   * GET /api/time-entries?personId=&from=&to=&page=&pageSize=
   */
  @Get('time-entries')
  @Roles('admin', 'lead', 'member')
  async listTimeEntries(
    @Req() req: AuthedRequest,
    @Query('personId') personIdRaw?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const { from, to } = resolveWeekRange(fromRaw, toRaw);
    enumerateDates(from, to, 93);
    const people = ctx.visiblePeople.filter((p) => p.active !== false);
    const personId = (personIdRaw ?? '').trim() || (ctx.access === 'member' ? ctx.selfId : '');
    if (personId) {
      ctx.assertCanAccessPerson(personId, { selfOnlyForMember: true });
    }

    const person = personId ? people.find((p) => p.id === personId) : undefined;
    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 25));

    type TimeEntryRow = {
      id: number | string;
      personId: string;
      nickname: string;
      spentOn: string;
      hours: number;
      ticketId: string | null;
      opWorkPackageId: number | null;
      comment: string;
    };

    const items: TimeEntryRow[] = [];
    let source: 'live' | 'offline' = 'offline';
    const errors: string[] = [];
    const client = await this.syncService.getClient();
    const opUserId = person?.openprojectUserId ?? null;

    if (client && (opUserId != null || !personId)) {
      source = 'live';
      try {
        const tickets = await listWorkItems(this.db);
        const byOpId = new Map(
          tickets
            .filter((t) => typeof t.opId === 'number')
            .map((t) => [t.opId as number, t.id]),
        );
        for await (const entry of client.paginateTimeEntries({
          spentFrom: from,
          spentTo: to,
          userId: opUserId,
        })) {
          const hours = isoDurationToHours(entry.hours) || 0;
          const wpHref = entry._links?.workPackage?.href ?? '';
          const wpMatch = /\/work_packages\/(\d+)/.exec(wpHref);
          const opWpId = wpMatch ? Number(wpMatch[1]) : null;
          const spentOn = String(entry.spentOn ?? '').slice(0, 10);
          const userHref = entry._links?.user?.href ?? '';
          const userMatch = /\/users\/(\d+)/.exec(userHref);
          const entryUserId = userMatch ? Number(userMatch[1]) : null;
          const matchedPerson =
            people.find((p) => p.openprojectUserId === entryUserId) ?? (personId ? person : null) ?? null;
          if (!ctx.isAdmin && !matchedPerson) continue;
          if (personId && matchedPerson && matchedPerson.id !== personId) continue;
          items.push({
            id: entry.id ?? `${spentOn}-${items.length}`,
            personId: matchedPerson?.id ?? personId ?? '',
            nickname: matchedPerson?.nickname ?? '',
            spentOn,
            hours: Math.round(hours * 100) / 100,
            ticketId: opWpId != null ? byOpId.get(opWpId) ?? null : null,
            opWorkPackageId: opWpId,
            comment: timeEntryComment(entry.comment),
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        source = 'offline';
      }
    }

    items.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.hours - a.hours);
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(pageNum, pageCount);
    const offset = (safePage - 1) * size;
    const pageItems = items.slice(offset, offset + size);

    return {
      source,
      from,
      to,
      personId: personId || null,
      items: pageItems,
      result: pageItems,
      count: total,
      total,
      page: safePage,
      pageSize: size,
      errors,
    };
  }
}

function normalizeDate(raw: string | Date | null | undefined): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function timeEntryComment(
  comment: { raw?: string; html?: string } | string | null | undefined,
): string {
  if (!comment) return '';
  if (typeof comment === 'string') return comment.trim();
  const raw = comment.raw?.trim();
  if (raw) return raw;
  return (comment.html ?? '').replace(/<[^>]+>/g, '').trim();
}

function resolveWeekRange(fromRaw?: string, toRaw?: string): { from: string; to: string } {
  const today = new Date();
  const to = normalizeDate(toRaw) || today.toISOString().slice(0, 10);
  if (normalizeDate(fromRaw)) {
    return { from: normalizeDate(fromRaw), to };
  }
  const toDate = new Date(`${to}T12:00:00Z`);
  const day = toDate.getUTCDay(); // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(toDate);
  monday.setUTCDate(toDate.getUTCDate() + mondayOffset);
  return { from: monday.toISOString().slice(0, 10), to };
}

function enumerateDates(from: string, to: string, maxDays = 62): string[] {
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (
    Number.isNaN(cursor.getTime()) ||
    Number.isNaN(end.getTime()) ||
    cursor.getTime() > end.getTime()
  ) {
    throw new BadRequestException('ช่วงวันที่ไม่ถูกต้อง (from ต้องไม่เกิน to)');
  }
  const diffDays = Math.floor((end.getTime() - cursor.getTime()) / 86_400_000) + 1;
  if (diffDays > maxDays) {
    throw new BadRequestException(`ช่วงวันที่ต้องไม่เกิน ${maxDays} วัน`);
  }
  const out: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
