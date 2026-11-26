import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { extractTicketIdFromText } from '../../../shared/domain/gitlab-mr';
import { Ticket, TicketDueShift, TicketStageLog } from '../../../shared/domain/models';
import { scoreTicket } from '../../../shared/domain/scoring';
import {
  addWorkingDays,
  applyGanttDateEdit,
  detectActiveWipTickets,
} from '../../../shared/domain/work-views';
import { canMoveWorkflowByRole, todayInBangkok, workflowStatusOf } from '../../../shared/domain/workflow';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { ListQuery, parseListQuery, toListPageResult } from '../common/list-query';
import { APP_CONFIG, AppConfig } from '../config';
import { closeOpenStageLog, insertDueShift, insertStageLog } from '../data/multi-team.repo';
import { getPerson } from '../data/people.repo';
import { connectionToken, getConnection, getSettings } from '../data/settings.repo';
import {
  getWorkItem,
  insertWorkItems,
  listWorkItems,
  nextLocalTicketId,
  queryWorkItemsPage,
  searchWorkItemsLocal,
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
    private readonly scope: VisibilityScopeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('teamId') teamId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('statusScope') statusScope?: string,
    @Query('project') project?: string,
    @Query('opType') opType?: string,
    @Query('track') track?: string,
    @Query('filters') filters?: string,
  ) {
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir, teamId, assigneeId, statusScope, project, opType, track, filters },
      { defaultSort: 'id', defaultDir: 'asc' },
    );
    const { tickets, total, unclosedCount, closedCount } = await this.queryTickets(req, listQuery);
    const pageResult = listQuery.pagingRequested
      ? {
          items: tickets,
          total,
          page: listQuery.page,
          pageSize: listQuery.pageSize,
        }
      : toListPageResult(tickets, { ...listQuery, pagingRequested: true, page: 1, pageSize: tickets.length || 1, offset: 0 });

    return {
      ...pageResult,
      unclosedCount,
      closedCount,
      /** คงชื่อเดิมไว้ให้ผู้เรียกเก่าที่อ่าน `.tickets` */
      tickets: pageResult.items,
      result: pageResult.items,
      count: pageResult.total,
    };
  }

  /** ส่งออก CSV ด้วยฟิลเตอร์เดียวกับ list (ไม่จำกัดหน้า) */
  @Get('export')
  @Roles('admin', 'lead', 'member')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('teamId') teamId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('statusScope') statusScope?: string,
    @Query('project') project?: string,
    @Query('opType') opType?: string,
    @Query('track') track?: string,
    @Query('filters') filters?: string,
    @Query('format') format?: string,
  ) {
    const listQuery = parseListQuery(
      { q, sort, dir, teamId, assigneeId, statusScope, project, opType, track, filters },
      { defaultSort: 'id', defaultDir: 'asc' },
    );
    const exportQuery = {
      ...listQuery,
      pagingRequested: false,
      page: 1,
      pageSize: 50_000,
      offset: 0,
    };
    const { tickets } = await this.queryTickets(req, exportQuery, 50_000);
    const fmt = (format ?? 'csv').toLowerCase();
    const stamp = todayInBangkok().replace(/-/g, '');
    if (fmt === 'xlsx' || fmt === 'xls') {
      // ยังไม่มีไลบรารี XLSX — ส่ง CSV ที่เปิดใน Excel ได้ (BOM)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="work-items-${stamp}.csv"`,
      );
    } else {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="work-items-${stamp}.csv"`,
      );
    }
    res.send(ticketsToCsv(tickets));
  }

  private async queryTickets(
    req: AuthedRequest,
    listQuery: ListQuery,
    maxLimit = 100,
  ): Promise<{
    tickets: Ticket[];
    total: number;
    unclosedCount: number;
    closedCount: number;
  }> {
    const ctx = await this.scope.resolve(req.authUser);

    if (listQuery.assigneeId) {
      ctx.assertCanAccessPerson(listQuery.assigneeId);
    }
    const assigneeIds = ctx.resolveTeamAssignees(listQuery.teamId);

    const page = await queryWorkItemsPage(this.db, {
      q: listQuery.q || undefined,
      statusScope: listQuery.statusScope,
      assigneeId: listQuery.assigneeId,
      assigneeIds: listQuery.assigneeId ? null : assigneeIds,
      project: listQuery.project,
      opType: listQuery.opType,
      track: listQuery.track,
      sort: listQuery.sort || 'id',
      dir: listQuery.dir,
      limit: listQuery.pagingRequested ? listQuery.pageSize : maxLimit,
      offset: listQuery.pagingRequested ? listQuery.offset : 0,
      maxLimit,
      filters: listQuery.filters,
    });

    return {
      tickets: page.items,
      total: page.total,
      unclosedCount: page.unclosedCount,
      closedCount: page.closedCount,
    };
  }

  @Get('live-search')
  @Roles('admin', 'lead', 'member')
  async liveSearch(@Query('q') qRaw: string | undefined, @Req() req: AuthedRequest) {
    const q = (qRaw ?? '').trim();
    if (!q) {
      return { source: 'offline' as const, local: [], live: [], writeback: this.config.openproject.writeback };
    }
    const ctx = await this.scope.resolve(req.authUser);
    const foundLocal = (await searchWorkItemsLocal(this.db, q, 20)).filter((t) =>
      ctx.canAccessTicket(t),
    );
    const local = foundLocal.map((t) => ({
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
  async detail(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน', source: 'offline' as const };
    }
    ctx.assertCanAccessTicket(ticket);
    const scores = scoreTicket(ticket);
    const writeback = this.config.openproject.writeback;
    const client = await this.openProject.getClient();
    const opId = typeof ticket.opId === 'number' ? ticket.opId : null;

    let description = '';
    let authorName: string | null = null;
    let createdAt: string | null = null;
    let updatedAt: string | null = null;
    let projectTitle: string | null = ticket.opProject ?? null;
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
    let watchers: { id: number; name: string }[] = [];
    let timeEntries: {
      id: number;
      spentOn: string;
      hours: number;
      userTitle: string;
      comment: string;
    }[] = [];
    let activities: { createdAt: string; text: string; userTitle?: string }[] = [];
    let source: 'live' | 'offline' = 'offline';
    const errors: string[] = [];

    if (client && opId != null) {
      source = 'live';
      try {
        const creds = await this.openProject.resolveCredentials();
        const opBase = (creds?.url ?? '').replace(/\/+$/, '');
        const absUrl = (href: string | null | undefined): string => {
          const raw = (href ?? '').trim();
          if (!raw) return '';
          if (/^https?:\/\//i.test(raw)) return raw;
          if (raw.startsWith('/') && opBase) return `${opBase}${raw}`;
          return raw;
        };
        const [wp, rels, atts, entries, acts, watcherRows] = await Promise.all([
          client.getWorkPackage(opId),
          client.getWorkPackageRelations(opId),
          client.getWorkPackageAttachments(opId),
          client.listWorkPackageTimeEntries(opId),
          client.getActivities(opId),
          client.listWorkPackageWatchers(opId).catch(() => []),
        ]);
        description = String((wp as { description?: { raw?: string } }).description?.raw ?? '');
        createdAt = wp.createdAt ?? null;
        updatedAt = wp.updatedAt ?? null;
        const authorLink = wp._links?.['author'];
        const author =
          authorLink && !Array.isArray(authorLink) ? authorLink : Array.isArray(authorLink) ? authorLink[0] : null;
        authorName = author?.title?.trim() || null;
        const projectLink = wp._links?.['project'];
        const project =
          projectLink && !Array.isArray(projectLink)
            ? projectLink
            : Array.isArray(projectLink)
              ? projectLink[0]
              : null;
        if (project?.title?.trim()) {
          projectTitle = project.title.trim();
        }
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
          downloadUrl: absUrl(
            a._links?.downloadLocation?.href || a._links?.staticDownloadLocation?.href || '',
          ),
        }));
        watchers = watcherRows.map((w) => ({ id: w.id, name: w.name }));
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
            userTitle: a._links?.user?.title ?? '',
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
      authorName,
      createdAt,
      updatedAt,
      projectTitle,
      relations,
      attachments,
      watchers,
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
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    ctx.assertCanAccessTicket(ticket);
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
  async one(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, id);
    if (ticket) {
      ctx.assertCanAccessTicket(ticket);
    }
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
  @Roles('admin', 'lead')
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
    const ctx = await this.scope.resolve(req.authUser);
    const existing = await getWorkItem(this.db, id);
    if (!existing) {
      return { ok: false, message: 'not found' };
    }
    ctx.assertCanAccessTicket(existing, { allowUnassignedForMember: false });

    const fromStatus = workflowStatusOf(existing);
    const toStatus = workflowStatusOf(body.ticket);
    const roleCheck = canMoveWorkflowByRole(ctx.access, fromStatus, toStatus);
    if (!roleCheck.ok) {
      throw new ForbiddenException(roleCheck.message);
    }

    let nextTicket: Ticket;
    if (ctx.access === 'member') {
      if (existing.assigneeId !== ctx.selfId) {
        throw new ForbiddenException('สมาชิกแก้ไขได้เฉพาะใบงานที่มอบหมายให้ตนเอง');
      }
      if (body.ticket.closed === true || toStatus === 'Done') {
        throw new ForbiddenException('สมาชิกไม่สามารถปิดใบงานเป็น Done ได้ด้วยตนเอง');
      }
      nextTicket = {
        ...existing,
        workflowStatus: body.ticket.workflowStatus ?? existing.workflowStatus,
        actualMd: typeof body.ticket.actualMd === 'number' ? body.ticket.actualMd : existing.actualMd,
        actualStartOn:
          body.ticket.actualStartOn !== undefined ? body.ticket.actualStartOn : existing.actualStartOn,
        mrLink: body.ticket.mrLink !== undefined ? body.ticket.mrLink : existing.mrLink,
        dodChecklist:
          body.ticket.dodChecklist !== undefined ? body.ticket.dodChecklist : existing.dodChecklist,
        bugCause: body.ticket.bugCause !== undefined ? body.ticket.bugCause : existing.bugCause,
        pocResult: body.ticket.pocResult !== undefined ? body.ticket.pocResult : existing.pocResult,
        blocker: typeof body.ticket.blocker === 'boolean' ? body.ticket.blocker : existing.blocker,
        note: body.ticket.note !== undefined ? body.ticket.note : existing.note,
        readyForQaAt:
          body.ticket.readyForQaAt !== undefined ? body.ticket.readyForQaAt : existing.readyForQaAt,
        devDeliveredOn:
          body.ticket.devDeliveredOn !== undefined ? body.ticket.devDeliveredOn : existing.devDeliveredOn,
      };
    } else {
      nextTicket = {
        ...body.ticket,
        id: existing.id,
        // ป้องกันการเขียนทับ firstDueOn ที่มีอยู่แล้วจาก PATCH ทั่วไป (ยกเว้น admin หรือคำสั่ง shift)
        firstDueOn:
          ctx.isAdmin || !existing.firstDueOn
            ? body.ticket.firstDueOn
            : existing.firstDueOn,
      };
    }

    const saved = await upsertWorkItem(this.db, nextTicket);
    const finalStatus = workflowStatusOf(saved);
    if (fromStatus !== finalStatus) {
      const nowIso = new Date().toISOString();
      await closeOpenStageLog(this.db, id, nowIso);
      const stageLog: TicketStageLog = {
        id: `slog-${id}-${Date.now()}`,
        ticketId: id,
        fromStatus,
        toStatus: finalStatus,
        changedBy: ctx.selfId,
        blockingTeam: saved.blocker || saved.varianceCode === 'BLK' || saved.varianceCode === 'ENV' ? 'INFRA' : null,
        blockerFlag: saved.varianceCode !== 'NONE' ? saved.varianceCode : saved.blocker ? 'BLK' : 'NONE',
        enteredAt: nowIso,
        exitedAt: null,
        durationHours: null,
      };
      await insertStageLog(this.db, stageLog);
    }
    await this.db.audit(ctx.selfId, 'work_item.replace', id, {
      fromStatus,
      toStatus: finalStatus,
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
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    ctx.assertCanAccessPerson(body.assigneeId);
    const tickets = await listWorkItems(this.db);
    const active = detectActiveWipTickets(tickets, body.assigneeId, body.excludeTicketId);
    return { ok: true, activeTickets: active };
  }

  @Post('md-mandate/shift')
  @Roles('admin', 'lead')
  async shiftForMdMandate(
    @Body()
    body: {
      mdTicketId: string;
      targetTicketIds: string[];
      shiftDays: number;
    },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const mdTicket = await getWorkItem(this.db, body.mdTicketId);
    if (!mdTicket) {
      return { ok: false, message: 'ไม่พบใบงาน MD Mandate' };
    }
    ctx.assertCanAccessTicket(mdTicket);

    const shiftDays = body.shiftDays > 0 ? body.shiftDays : Math.max(1, Math.ceil(mdTicket.estimateMd || 1));
    const nowIso = new Date().toISOString();
    const updatedTickets: Ticket[] = [];

    for (const targetId of body.targetTicketIds) {
      const ticket = await getWorkItem(this.db, targetId);
      if (!ticket) continue;
      ctx.assertCanAccessTicket(ticket);

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
          approvedBy: ctx.selfId,
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

      await this.db.audit(ctx.selfId, 'work_item.md_mandate_shift', targetId, {
        mdTicketId: mdTicket.id,
        shiftDays,
        originalFirstDueOn,
        newFirstDueOn,
      });
    }

    return { ok: true, updatedTickets, shiftDays };
  }

  @Post('md-mandate/resume')
  @Roles('admin', 'lead')
  async resumeTicket(
    @Body() body: { ticketId: string },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, body.ticketId);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    ctx.assertCanAccessTicket(ticket);

    const resumedTicket: Ticket = {
      ...ticket,
      isPaused: false,
      pausedReason: null,
      pausedAt: null,
    };

    const saved = await upsertWorkItem(this.db, resumedTicket);
    await this.db.audit(ctx.selfId, 'work_item.md_mandate_resume', body.ticketId, {
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

export function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function ticketsToCsv(tickets: readonly Ticket[]): string {
  const headers = [
    'id',
    'title',
    'track',
    'type',
    'opType',
    'module',
    'size',
    'assigneeId',
    'workflowStatus',
    'estimateMd',
    'actualMd',
    'closed',
    'dueOn',
    'firstDueOn',
    'closedOn',
    'opProject',
    'reviewRounds',
    'reopenCount',
  ];
  const lines = [headers.join(',')];
  for (const t of tickets) {
    lines.push(
      [
        t.id,
        t.title ?? '',
        t.track,
        t.type,
        t.opType ?? '',
        t.module ?? '',
        t.size,
        t.assigneeId ?? '',
        workflowStatusOf(t),
        t.estimateMd,
        t.actualMd,
        t.closed ? '1' : '0',
        t.dueOn ?? '',
        t.firstDueOn ?? '',
        t.closedOn ?? '',
        t.opProject ?? '',
        t.reviewRounds,
        t.reopenCount,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
