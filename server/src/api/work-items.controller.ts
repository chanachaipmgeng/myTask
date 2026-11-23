import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { extractTicketIdFromText } from '../../../shared/domain/gitlab-mr';
import { Ticket, TicketDueShift, TicketStageLog } from '../../../shared/domain/models';
import { scoreTicket } from '../../../shared/domain/scoring';
import { addWorkingDays, applyGanttDateEdit, detectActiveWipTickets } from '../../../shared/domain/work-views';
import { todayInBangkok, workflowStatusOf } from '../../../shared/domain/workflow';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { compareByField, paginateItems, parseListQuery } from '../common/list-query';
import { APP_CONFIG, AppConfig } from '../config';
import { closeOpenStageLog, insertDueShift, insertStageLog } from '../data/multi-team.repo';
import { getPerson } from '../data/people.repo';
import { connectionToken, getConnection, getSettings } from '../data/settings.repo';
import {
  getWorkItem,
  insertWorkItems,
  listWorkItems,
  nextLocalTicketId,
  upsertWorkItem,
} from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { GitLabClient } from '../integrations/gitlab/gitlab.client';
import { isoDurationToHours } from '../integrations/openproject/openproject.mapper';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

@Controller('api/work-items')
export class WorkItemsController {
  constructor(
    private readonly db: Db,
    private readonly openProject: OpenProjectSyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async list(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
  ) {
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir },
      { defaultSort: 'id', defaultDir: 'asc' },
    );
    let tickets = await listWorkItems(this.db);
    if (listQuery.q) {
      const needle = listQuery.q.toLowerCase();
      tickets = tickets.filter(
        (ticket) =>
          ticket.id.toLowerCase().includes(needle) ||
          (ticket.title ?? '').toLowerCase().includes(needle) ||
          (ticket.module ?? '').toLowerCase().includes(needle) ||
          (ticket.assigneeId ?? '').toLowerCase().includes(needle),
      );
    }
    const sortField = listQuery.sort || 'id';
    tickets = tickets
      .slice()
      .sort((a, b) => compareByField(a, b, sortField, listQuery.dir));
    const pageResult = paginateItems(tickets, listQuery);
    return {
      ...pageResult,
      /** คงชื่อเดิมไว้ให้ผู้เรียกเก่าที่อ่าน `.tickets` */
      tickets: pageResult.items,
    };
  }

  @Get('live-search')
  @Roles('admin', 'lead', 'member')
  async liveSearch(@Query('q') qRaw: string | undefined) {
    const q = (qRaw ?? '').trim();
    if (!q) {
      return { source: 'offline' as const, local: [], live: [], writeback: this.config.openproject.writeback };
    }
    const needle = q.toLowerCase();
    const all = await listWorkItems(this.db);
    const local = all
      .filter(
        (t) =>
          t.id.toLowerCase().includes(needle) ||
          (t.title ?? '').toLowerCase().includes(needle) ||
          (t.module ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        title: t.title ?? t.id,
        status: workflowStatusOf(t),
        assigneeId: t.assigneeId,
        opId: t.opId ?? null,
        source: t.source,
      }));

    const client = await this.openProject.getClient();
    if (!client) {
      return { source: 'offline' as const, local, live: [], writeback: this.config.openproject.writeback };
    }
    try {
      const found = await client.searchWorkPackages(q, { pageSize: 20 });
      const live = found.map((wp) => ({
        id: `OP-${wp.id}`,
        opId: wp.id,
        title: wp.subject ?? `OP-${wp.id}`,
        status: wp._embedded?.status?.name ?? '',
        updatedAt: wp.updatedAt ?? null,
      }));
      return { source: 'live' as const, local, live, writeback: this.config.openproject.writeback };
    } catch (err) {
      return {
        source: 'offline' as const,
        local,
        live: [],
        writeback: this.config.openproject.writeback,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Get(':id/detail')
  @Roles('admin', 'lead', 'member')
  async detail(@Param('id') id: string) {
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน', source: 'offline' as const };
    }
    const scores = scoreTicket(ticket);
    const writeback = this.config.openproject.writeback;
    const client = await this.openProject.getClient();
    const opId = typeof ticket.opId === 'number' ? ticket.opId : null;

    let description = '';
    let relations: {
      id: number;
      type: string;
      fromTitle: string;
      toTitle: string;
      fromId: number | null;
      toId: number | null;
    }[] = [];
    let attachments: {
      id: number;
      fileName: string;
      fileSize: number;
      contentType: string;
      downloadUrl: string;
    }[] = [];
    let timeEntries: {
      id: number;
      spentOn: string;
      hours: number;
      userTitle: string;
      comment: string;
    }[] = [];
    let activities: { createdAt: string; text: string }[] = [];
    let source: 'live' | 'offline' = 'offline';
    const errors: string[] = [];

    if (client && opId != null) {
      source = 'live';
      try {
        const [wp, rels, atts, entries, acts] = await Promise.all([
          client.getWorkPackage(opId),
          client.getWorkPackageRelations(opId),
          client.getWorkPackageAttachments(opId),
          client.listWorkPackageTimeEntries(opId),
          client.getActivities(opId),
        ]);
        description = String((wp as { description?: { raw?: string } }).description?.raw ?? '');
        relations = rels.map((r) => ({
          id: r.id,
          type: r.type ?? r.reverseType ?? 'relates',
          fromTitle: r._links?.from?.title ?? '',
          toTitle: r._links?.to?.title ?? '',
          fromId: idFromHrefSafe(r._links?.from?.href),
          toId: idFromHrefSafe(r._links?.to?.href),
        }));
        attachments = atts.map((a) => ({
          id: a.id,
          fileName: a.fileName ?? `file-${a.id}`,
          fileSize: a.fileSize ?? 0,
          contentType: a.contentType ?? '',
          downloadUrl:
            a._links?.downloadLocation?.href || a._links?.staticDownloadLocation?.href || '',
        }));
        timeEntries = entries.map((e) => ({
          id: e.id,
          spentOn: e.spentOn ?? '',
          hours: isoDurationToHours(e.hours),
          userTitle: e._links?.user?.title ?? '',
          comment:
            typeof e.comment === 'string'
              ? e.comment
              : e.comment && typeof e.comment === 'object'
                ? e.comment.raw ?? ''
                : '',
        }));
        activities = acts.map((a) => {
          const commentText =
            typeof a.comment === 'string'
              ? a.comment
              : a.comment && typeof a.comment === 'object'
                ? a.comment.raw ?? ''
                : '';
          const detailText = (a.details ?? []).map((d) => d.raw ?? '').filter(Boolean).join(' · ');
          return {
            createdAt: a.createdAt ?? '',
            text: commentText || detailText || 'อัปเดต',
          };
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        source = 'offline';
      }
    }

    if (timeEntries.length === 0 && ticket.actualMd > 0) {
      timeEntries = [
        {
          id: 0,
          spentOn: String(ticket.closedOn || ticket.dueOn || '').slice(0, 10),
          hours: Math.round(ticket.actualMd * ((await getSettings(this.db)).hoursPerMd || 6) * 100) / 100,
          userTitle: ticket.assigneeId,
          comment: 'จากข้อมูลในสกอร์การ์ด (โหมดออฟไลน์)',
        },
      ];
    }

    const mrs = await this.resolveTicketMrs(ticket);

    const opUrl =
      opId != null
        ? `${(await this.openProject.resolveCredentials())?.url?.replace(/\/+$/, '') ?? ''}/work_packages/${opId}`
        : null;

    return {
      ok: true,
      source,
      writeback,
      ticket,
      scores: {
        week: scores.week,
        accuracy: scores.accuracy,
        review: scores.review,
        reopen: scores.reopen,
        total: scores.total,
      },
      description,
      relations,
      attachments,
      timeEntries,
      activities,
      mrs,
      opUrl: opUrl || null,
      errors,
    };
  }

  @Post(':id/time-entries')
  @Roles('admin', 'lead', 'member')
  async createTimeEntry(
    @Param('id') id: string,
    @Body() body: { hours?: number; spentOn?: string; comment?: string },
    @Req() req: AuthedRequest,
  ) {
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    if (!this.config.openproject.writeback) {
      return { ok: false, writebackDisabled: true, message: 'Writeback ยังปิดอยู่ (OPENPROJECT_WRITEBACK=false)' };
    }
    const opId = ticket.opId;
    if (typeof opId !== 'number') {
      return { ok: false, message: 'ใบงานนี้ยังไม่ได้ผูกกับ myProject' };
    }
    const role = req.authUser?.access ?? 'member';
    const selfId = req.authUser?.person.id;
    if (role === 'member' && ticket.assigneeId !== selfId) {
      return { ok: false, message: 'ลงเวลาได้เฉพาะใบงานของตัวเอง' };
    }
    const hours = typeof body.hours === 'number' && body.hours > 0 ? body.hours : 0;
    if (!hours) {
      return { ok: false, message: 'hours ต้องมากกว่า 0' };
    }
    const spentOn = (body.spentOn ?? todayInBangkok()).slice(0, 10);
    const isoHours = hoursToIsoDuration(hours);
    const err = await this.openProject.writebackTimeEntry({
      workPackageId: opId,
      hours: isoHours,
      spentOn,
      comment: body.comment?.trim() || undefined,
    });
    if (err === 'writebackDisabled') {
      return { ok: false, writebackDisabled: true, message: 'Writeback ยังปิดอยู่' };
    }
    if (err) {
      return { ok: false, message: err };
    }
    await this.db.audit(selfId ?? null, 'work_item.time_entry', id, { hours, spentOn });
    return { ok: true };
  }

  @Post(':id/comments')
  @Roles('admin', 'lead', 'member')
  async postComment(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Req() req: AuthedRequest,
  ) {
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    if (!this.config.openproject.writeback) {
      return { ok: false, writebackDisabled: true, message: 'Writeback ยังปิดอยู่ (OPENPROJECT_WRITEBACK=false)' };
    }
    const opId = ticket.opId;
    if (typeof opId !== 'number') {
      return { ok: false, message: 'ใบงานนี้ยังไม่ได้ผูกกับ myProject' };
    }
    const comment = (body.comment ?? '').trim();
    if (!comment) {
      return { ok: false, message: 'comment required' };
    }
    const err = await this.openProject.writebackComment(opId, comment);
    if (err === 'writebackDisabled') {
      return { ok: false, writebackDisabled: true, message: 'Writeback ยังปิดอยู่' };
    }
    if (err) {
      return { ok: false, message: err };
    }
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.comment', id, { length: comment.length });
    return { ok: true };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const ticket = await getWorkItem(this.db, id);
    return ticket ? { ticket } : { ticket: null };
  }

  private async resolveTicketMrs(ticket: Ticket) {
    const empty: {
      iid: number;
      projectId: string;
      title: string;
      webUrl: string;
      state: string;
      ciStatus: string;
      commitSpan: { firstCommitOn: string | null; lastCommitOn: string | null; commitCount: number };
      unresolvedThreads: number;
      reviewRounds: number;
      reviewers: string[];
    }[] = [];

    if (ticket.mrLink) {
      empty.push({
        iid: 0,
        projectId: '',
        title: ticket.mrLink,
        webUrl: ticket.mrLink,
        state: 'linked',
        ciStatus: 'unknown',
        commitSpan: { firstCommitOn: null, lastCommitOn: null, commitCount: 0 },
        unresolvedThreads: 0,
        reviewRounds: ticket.reviewRounds ?? 1,
        reviewers: ticket.reviewers ?? [],
      });
    }

    const gitlab = await this.resolveGitLabClient();
    if (!gitlab || gitlab.projectIds.length === 0) {
      return empty;
    }
    const { client, projectIds } = gitlab;
    const results: typeof empty = [];
    for (const projectId of projectIds) {
      try {
        const [opened, merged] = await Promise.all([
          client.listMergeRequests(projectId, { state: 'opened' }),
          client.listMergeRequests(projectId, { state: 'merged' }),
        ]);
        for (const mr of [...opened, ...merged]) {
          if (!mr.iid) continue;
          const ticketId =
            extractTicketIdFromText(mr.title) ||
            extractTicketIdFromText(mr.source_branch) ||
            extractTicketIdFromText(mr.description);
          const matches =
            ticketId.toUpperCase() === ticket.id.toUpperCase() ||
            (ticket.opId != null && ticketId === `OP-${ticket.opId}`) ||
            (ticket.mrLink && mr.web_url && ticket.mrLink === mr.web_url);
          if (!matches) continue;
          let commitSpan = { firstCommitOn: null as string | null, lastCommitOn: null as string | null, commitCount: 0 };
          let unresolvedThreads = 0;
          let reviewRounds = ticket.reviewRounds ?? 1;
          let ciStatus = 'unknown';
          try {
            const [commits, discussions, pipelines] = await Promise.all([
              client.getMrCommits(projectId, mr.iid),
              client.getMrDiscussions(projectId, mr.iid),
              client.getMrPipelines(projectId, mr.iid),
            ]);
            commitSpan = GitLabClient.commitSpan(commits);
            const summary = GitLabClient.discussionSummary(discussions);
            unresolvedThreads = summary.unresolvedThreads;
            reviewRounds = summary.reviewRounds;
            ciStatus = GitLabClient.latestCiStatus(pipelines);
          } catch {
            // keep defaults
          }
          results.push({
            iid: mr.iid,
            projectId: String(projectId),
            title: (mr.title ?? '').trim() || `!${mr.iid}`,
            webUrl: (mr.web_url ?? '').trim(),
            state: mr.merged_at ? 'merged' : 'opened',
            ciStatus,
            commitSpan,
            unresolvedThreads,
            reviewRounds,
            reviewers: (mr.reviewers ?? [])
              .map((r) => r.username?.trim().toLowerCase())
              .filter((u): u is string => Boolean(u)),
          });
        }
      } catch {
        // skip project
      }
    }
    return results.length > 0 ? results : empty;
  }

  private async resolveGitLabClient(): Promise<{
    client: GitLabClient;
    projectIds: string[];
  } | null> {
    const connection = await getConnection(this.db, 'gitlab');
    const stored = connection?.base_url ?? '';
    const [basePart = '', hash = ''] = stored.split('#projects=');
    const storedProjects = hash
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const baseUrl = (this.config.gitlab.url || basePart).replace(/\/+$/, '');
    const projectIds =
      this.config.gitlab.projectIds.length > 0 ? this.config.gitlab.projectIds : storedProjects;
    const token = this.config.gitlab.apiToken || connectionToken(connection, this.config.tokenEncKey);
    if (!baseUrl || !token) {
      return null;
    }
    return { client: new GitLabClient(baseUrl, token), projectIds };
  }

  @Post()
  @Roles('admin', 'lead', 'member')
  async create(@Body() body: { ticket?: Omit<Ticket, 'id'> & { id?: string } }, @Req() req: AuthedRequest) {
    const input = body.ticket;
    if (!input) {
      return { ok: false, message: 'ticket required' };
    }
    const id = input.id?.trim() || (await nextLocalTicketId(this.db));
    const ticket: Ticket = { ...input, id, source: input.source ?? 'local' };
    const saved = await upsertWorkItem(this.db, ticket);
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.create', id, { id });
    return { ok: true, ticket: saved };
  }

  @Post('import')
  @Roles('admin', 'lead', 'member')
  async importMany(@Body() body: { tickets?: Ticket[] }, @Req() req: AuthedRequest) {
    const incoming = body.tickets ?? [];
    const added = await insertWorkItems(this.db, incoming);
    const skipped = incoming.filter((ticket) => !added.includes(ticket.id)).map((ticket) => ticket.id);
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.import', null, {
      added: added.length,
      skipped: skipped.length,
    });
    return { ok: true, added, skipped };
  }

  @Patch(':id')
  @Roles('admin', 'lead', 'member')
  async replace(
    @Param('id') id: string,
    @Body() body: { ticket?: Ticket },
    @Req() req: AuthedRequest,
  ) {
    if (!body.ticket || body.ticket.id !== id) {
      return { ok: false, message: 'ticket.id must match path' };
    }
    const existing = await getWorkItem(this.db, id);
    if (!existing) {
      return { ok: false, message: 'not found' };
    }
    const saved = await upsertWorkItem(this.db, body.ticket);
    const fromStatus = workflowStatusOf(existing);
    const toStatus = workflowStatusOf(saved);
    if (fromStatus !== toStatus) {
      const nowIso = new Date().toISOString();
      await closeOpenStageLog(this.db, id, nowIso);
      const stageLog: TicketStageLog = {
        id: `slog-${id}-${Date.now()}`,
        ticketId: id,
        fromStatus,
        toStatus,
        changedBy: req.authUser?.person.id ?? null,
        blockingTeam: saved.blocker || saved.varianceCode === 'BLK' || saved.varianceCode === 'ENV' ? 'INFRA' : null,
        blockerFlag: saved.varianceCode !== 'NONE' ? saved.varianceCode : saved.blocker ? 'BLK' : 'NONE',
        enteredAt: nowIso,
        exitedAt: null,
        durationHours: null,
      };
      await insertStageLog(this.db, stageLog);
    }
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.replace', id, {
      fromStatus,
      toStatus,
    });
    return { ok: true, ticket: saved };
  }

  @Post(':id/assign')
  @Roles('admin', 'lead')
  async assign(
    @Param('id') id: string,
    @Body() body: { assigneeId?: string },
    @Req() req: AuthedRequest,
  ) {
    const assigneeId = body.assigneeId?.trim() ?? '';
    if (!assigneeId) {
      return { ok: false, message: 'assigneeId required' };
    }
    const person = await getPerson(this.db, assigneeId);
    if (!person) {
      return { ok: false, message: 'person not found' };
    }
    const ticket = await getWorkItem(this.db, id);
    if (!ticket || ticket.assigneeId !== '') {
      return { ok: false, message: 'ticket missing or already assigned' };
    }
    const saved = await upsertWorkItem(this.db, { ...ticket, assigneeId });
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.assign', id, { assigneeId });

    let writebackError: string | undefined;
    const opId = saved.opId;
    const opUserId = person.openprojectUserId ?? null;
    if (
      this.config.openproject.writeback &&
      saved.source === 'openproject' &&
      typeof opId === 'number' &&
      typeof opUserId === 'number'
    ) {
      const err = await this.openProject.writebackAssignee(opId, opUserId);
      if (err) {
        writebackError = err;
        await this.db.audit(req.authUser?.person.id ?? null, 'work_item.assign_writeback_failed', id, {
          opId,
          opUserId,
          error: err,
        });
      } else {
        await this.db.audit(req.authUser?.person.id ?? null, 'work_item.assign_writeback', id, { opId, opUserId });
      }
    }

    return writebackError ? { ok: true, ticket: saved, writebackError } : { ok: true, ticket: saved };
  }

  @Post(':id/dates')
  @Roles('admin', 'lead')
  async updateDates(
    @Param('id') id: string,
    @Body() body: { startDate?: string | null; dueDate?: string | null },
    @Req() req: AuthedRequest,
  ) {
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    const edited = applyGanttDateEdit(ticket, {
      startDate: body.startDate,
      dueDate: body.dueDate,
    });
    if (!edited.ok) {
      return { ok: false, message: edited.message };
    }
    const saved = await upsertWorkItem(this.db, edited.ticket);
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.dates', id, {
      startDate: saved.actualStartOn ?? null,
      dueDate: saved.dueOn ?? null,
      firstDueOn: saved.firstDueOn ?? null,
    });

    let writebackError: string | undefined;
    const opId = saved.opId;
    if (this.config.openproject.writeback && saved.source === 'openproject' && typeof opId === 'number') {
      const err = await this.openProject.writebackDates(opId, {
        startDate: saved.actualStartOn ?? null,
        dueDate: saved.dueOn ?? null,
      });
      if (err) {
        writebackError = err;
        await this.db.audit(req.authUser?.person.id ?? null, 'work_item.dates_writeback_failed', id, {
          opId,
          error: err,
        });
      } else {
        await this.db.audit(req.authUser?.person.id ?? null, 'work_item.dates_writeback', id, { opId });
      }
    }

    return writebackError ? { ok: true, ticket: saved, writebackError } : { ok: true, ticket: saved };
  }

  @Post('md-mandate/detect-wip')
  @Roles('admin', 'lead', 'member')
  async detectWip(
    @Body() body: { assigneeId: string; excludeTicketId?: string },
  ) {
    const tickets = await listWorkItems(this.db);
    const active = detectActiveWipTickets(tickets, body.assigneeId, body.excludeTicketId);
    return { ok: true, activeTickets: active };
  }

  @Post('md-mandate/shift')
  @Roles('admin', 'lead', 'member')
  async shiftForMdMandate(
    @Body()
    body: {
      mdTicketId: string;
      targetTicketIds: string[];
      shiftDays: number;
    },
    @Req() req: AuthedRequest,
  ) {
    const mdTicket = await getWorkItem(this.db, body.mdTicketId);
    if (!mdTicket) {
      return { ok: false, message: 'ไม่พบใบงาน MD Mandate' };
    }

    const shiftDays = body.shiftDays > 0 ? body.shiftDays : Math.max(1, Math.ceil(mdTicket.estimateMd || 1));
    const nowIso = new Date().toISOString();
    const updatedTickets: Ticket[] = [];

    for (const targetId of body.targetTicketIds) {
      const ticket = await getWorkItem(this.db, targetId);
      if (!ticket) continue;

      const originalFirstDueOn = ticket.originalFirstDueOn || ticket.firstDueOn || null;
      const newFirstDueOn = addWorkingDays(ticket.firstDueOn || originalFirstDueOn, shiftDays);
      const newDueOn = addWorkingDays(ticket.dueOn || ticket.firstDueOn, shiftDays);

      const pausedTicket: Ticket = {
        ...ticket,
        isPaused: true,
        pausedReason: 'Paused (By MD Mandate)',
        originalFirstDueOn,
        firstDueOn: newFirstDueOn,
        dueOn: newDueOn,
        pausedAt: nowIso,
        pausedDays: (ticket.pausedDays || 0) + shiftDays,
        pausedByTicketId: mdTicket.id,
      };

      const saved = await upsertWorkItem(this.db, pausedTicket);
      updatedTickets.push(saved);

      if (ticket.firstDueOn && newFirstDueOn) {
        const dueShift: TicketDueShift = {
          id: `shift-${targetId}-${Date.now()}`,
          ticketId: targetId,
          previousFirstDueOn: ticket.firstDueOn,
          newFirstDueOn,
          shiftDays,
          reason: `MD Mandate pause from ${mdTicket.id}`,
          status: 'APPROVED',
          approvedBy: req.authUser?.person.id ?? null,
          approvedAt: nowIso,
          createdAt: nowIso,
        };
        await insertDueShift(this.db, dueShift);
      }

      if (ticket.opId && this.config.openproject.writeback) {
        await this.openProject.writebackDates(ticket.opId, { dueDate: newDueOn });
        const approverName = req.authUser?.person.nickname || 'Admin/Lead';
        const commentMarkdown = [
          `⚡ **[MD Central Sync — Auto-Shift Notification]**`,
          `- **การดำเนินการ:** ขยายกำหนดส่งออกไป **+${shiftDays} วันทำงาน** (กำหนดส่งเดิม: \`${ticket.dueOn || ticket.firstDueOn || '-'}\` → กำหนดส่งใหม่: \`${newDueOn}\`)`,
          `- **สาเหตุอ้างอิง:** ผู้รับผิดชอบได้รับมอบหมายงานด่วนสั่งตรงจาก MD ใบงานเลขที่ **#${mdTicket.opId ?? mdTicket.id}** (*${mdTicket.title}*)`,
          `- **สถานะ KPI ภายในทีม R&D:** หยุดเวลาใบงานนี้ชั่วคราว (Paused) และยกเว้นการหักคะแนนความตรงต่อเวลา (อนุมัติโดย: ${approverName})`,
        ].join('\n');
        await this.openProject.postActivity(ticket.opId, commentMarkdown);
      }

      await this.db.audit(req.authUser?.person.id ?? null, 'work_item.md_mandate_shift', targetId, {
        mdTicketId: mdTicket.id,
        shiftDays,
        originalFirstDueOn,
        newFirstDueOn,
      });
    }

    return { ok: true, updatedTickets, shiftDays };
  }

  @Post('md-mandate/resume')
  @Roles('admin', 'lead', 'member')
  async resumeTicket(
    @Body() body: { ticketId: string },
    @Req() req: AuthedRequest,
  ) {
    const ticket = await getWorkItem(this.db, body.ticketId);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }

    const resumedTicket: Ticket = {
      ...ticket,
      isPaused: false,
      pausedReason: null,
      pausedAt: null,
    };

    const saved = await upsertWorkItem(this.db, resumedTicket);
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.md_mandate_resume', body.ticketId, {
      pausedDays: saved.pausedDays,
    });

    return { ok: true, ticket: saved };
  }
}

function idFromHrefSafe(href: string | null | undefined): number | null {
  if (!href) return null;
  const match = /\/(\d+)(?:\?|$)/.exec(href);
  return match ? Number(match[1]) : null;
}

/** Convert decimal hours to ISO-8601 duration (e.g. 1.5 → PT1H30M). */
function hoursToIsoDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0 && m === 0) return 'PT0S';
  if (m === 0) return `PT${h}H`;
  if (h === 0) return `PT${m}M`;
  return `PT${h}H${m}M`;
}
