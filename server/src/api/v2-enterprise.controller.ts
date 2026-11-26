import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  computeHandoffSlaSummary,
  computeQualityAuditSummary,
  computeThreeWayTimeAudit,
  runPreflightChecklist,
  simulateDisputeImpact,
} from '../../../shared/domain/multi-team';
import { EmployeeLeave, TicketAllocation, TicketDispute } from '../../../shared/domain/models';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { compareByField, parseListQuery, toListPageResult } from '../common/list-query';
import { sanitizeEvidenceUrl } from '../common/security';
import { APP_CONFIG, AppConfig } from '../config';
import {
  deleteLeave,
  getDispute,
  insertDispute,
  listAllocations,
  listDisputes,
  listLeaves,
  listStageLogs,
  nextDisputeCode,
  replaceAllocations,
  resolveDisputeRow,
  upsertLeave,
} from '../data/multi-team.repo';
import { getPerson } from '../data/people.repo';
import { connectionToken, getConnection } from '../data/settings.repo';
import { getWorkItem, listWorkItems, upsertWorkItem } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api/v2')
export class V2EnterpriseController {
  constructor(
    private readonly db: Db,
    private readonly scope: VisibilityScopeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('work/handoff-sla')
  async getHandoffSla(@Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const [tickets, stageLogs] = await Promise.all([
      listWorkItems(this.db),
      listStageLogs(this.db),
    ]);
    const scopedTickets = ctx.isAdmin ? tickets : tickets.filter((t) => ctx.canAccessTicket(t));
    const report = computeHandoffSlaSummary(scopedTickets, stageLogs, ctx.visiblePeople);
    return { ok: true, ...report };
  }

  @Roles('admin', 'lead')
  @Post('work/handoff-ping/:ticketId')
  async pingHandoff(
    @Param('ticketId') ticketId: string,
    @Body() body: { target?: string; message?: string },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, ticketId);
    if (ticket) {
      ctx.assertCanAccessTicket(ticket);
    }

    const messageText =
      body.message?.trim() ||
      `แจ้งเตือนการส่งต่องาน ${ticketId}${body.target ? ` ถึง ${body.target}` : ''} เกิน SLA`;

    const connection = await getConnection(this.db, 'teams');
    const webhookUrl =
      this.config.teams.webhookUrl ||
      connectionToken(connection, this.config.tokenEncKey, this.config.tokenEncKeyPrev);

    let sent = false;
    let sendError: string | undefined;
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `**Handoff SLA Ping**\n- ใบงาน: **${ticketId}**\n- ข้อความ: ${messageText}`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          sendError = `Teams webhook HTTP ${response.status}`;
        } else {
          sent = true;
        }
      } catch (err) {
        sendError = err instanceof Error ? err.message : String(err);
      }
    } else {
      sendError = 'ยังไม่ได้ตั้งค่า TEAMS_WEBHOOK_URL';
    }

    await this.db.audit(req.authUser?.person.id ?? null, 'handoff.ping', ticketId, {
      target: body.target,
      message: messageText,
      sent,
      sendError,
    });

    return {
      ok: !sendError || sent,
      sent,
      sentAt: new Date().toISOString(),
      ticketId,
      message: sent
        ? `ส่งการแจ้งเตือน Teams สำหรับใบงาน ${ticketId} สำเร็จ`
        : `บันทึกการ Ping แล้ว${sendError ? ` (${sendError})` : ''}`,
      sendError,
    };
  }

  @Roles('admin', 'lead')
  @Get('quality/audit')
  async getQualityAudit(@Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const tickets = await listWorkItems(this.db);
    const scopedTickets = ctx.isAdmin ? tickets : tickets.filter((t) => ctx.canAccessTicket(t));
    const report = computeQualityAuditSummary(scopedTickets, ctx.visiblePeople);
    return { ok: true, ...report };
  }

  @Roles('admin', 'lead')
  @Patch('tickets/:id/allocations')
  async saveAllocations(
    @Param('id') id: string,
    @Body() body: { allocations: TicketAllocation[] },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    ctx.assertCanAccessTicket(ticket);
    const allocations = (body.allocations ?? []).map((a) => ({
      ...a,
      ticketId: id,
      id: a.id || `alloc-${id}-${a.userId}-${a.subRole ?? 'main'}`,
    }));
    const saved = await this.db.tx(async (tx) => {
      const nextAllocs = await replaceAllocations(tx, id, allocations);
      await upsertWorkItem(tx, {
        ...ticket,
        isSplitEffort: nextAllocs.length > 0,
        allocations: nextAllocs,
      });
      return nextAllocs;
    });
    await this.db.audit(req.authUser?.person.id ?? null, 'ticket.allocations.update', id, {
      count: saved.length,
    });
    return { ok: true, ticketId: id, allocations: saved };
  }

  @Get('tickets/:id/allocations')
  async getAllocations(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, id);
    if (ticket) {
      ctx.assertCanAccessTicket(ticket);
    }
    const allocations = await listAllocations(this.db, id);
    return { ok: true, allocations };
  }

  @Roles('admin', 'lead')
  @Get('analytics/time-audit')
  async getTimeAudit(@Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const tickets = await listWorkItems(this.db);
    const scopedTickets = ctx.isAdmin ? tickets : tickets.filter((t) => ctx.canAccessTicket(t));
    const report = computeThreeWayTimeAudit(scopedTickets, ctx.visiblePeople);
    return { ok: true, ...report };
  }

  @Get('disputes')
  async getDisputes(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('statusScope') statusScope?: string,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir, statusScope },
      { defaultSort: 'createdAt', defaultDir: 'desc', defaultPageSize: 25 },
    );
    const requesterId = ctx.access === 'member' ? ctx.selfId : undefined;
    let disputes = await listDisputes(this.db, requesterId);
    if (!ctx.isAdmin && ctx.allowedPersonIds) {
      disputes = disputes.filter((d) => ctx.allowedPersonIds!.has(d.requesterId));
    }

    if (listQuery.statusScope === 'unclosed') {
      disputes = disputes.filter((d) => d.status === 'PENDING');
    } else if (listQuery.statusScope === 'closed') {
      disputes = disputes.filter((d) => d.status !== 'PENDING');
    }

    if (listQuery.q) {
      const needle = listQuery.q.toLowerCase();
      disputes = disputes.filter(
        (d) =>
          d.id.toLowerCase().includes(needle) ||
          d.disputeCode.toLowerCase().includes(needle) ||
          d.ticketId.toLowerCase().includes(needle) ||
          d.reason.toLowerCase().includes(needle) ||
          d.status.toLowerCase().includes(needle),
      );
    }

    const sortField = listQuery.sort || 'createdAt';
    disputes = disputes
      .slice()
      .sort((a, b) => compareByField(a, b, sortField, listQuery.dir));

    const pageResult = toListPageResult(disputes, listQuery);
    return {
      ok: true,
      ...pageResult,
      disputes: pageResult.items,
      result: pageResult.items,
      count: pageResult.total,
    };
  }

  @Post('disputes')
  async createDispute(
    @Body()
    body: {
      ticketId: string;
      requestedFlag: 'REQ' | 'BLK' | 'ENV';
      reason: string;
      evidenceUrl?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const ticket = await getWorkItem(this.db, body.ticketId);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    ctx.assertCanAccessTicket(ticket);
    if (ctx.access === 'member' && ticket.assigneeId !== ctx.selfId) {
      throw new ForbiddenException('สมาชิกยื่นคำขอทบทวนคะแนนได้เฉพาะใบงานของตนเอง');
    }

    const person = await getPerson(this.db, ctx.selfId);
    if (!person) {
      return { ok: false, message: 'ไม่พบผู้ยื่นคำขอ' };
    }

    const cleanEvidenceUrl = sanitizeEvidenceUrl(body.evidenceUrl);
    const tickets = await listWorkItems(this.db);
    const personTickets = tickets.filter((t) => t.assigneeId === person.id);
    const sim = simulateDisputeImpact(ticket, person, personTickets, body.requestedFlag);
    const disputeCode = await nextDisputeCode(this.db);
    const dispute: TicketDispute = {
      id: `dsp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      disputeCode,
      ticketId: body.ticketId,
      requesterId: person.id,
      requestedFlag: body.requestedFlag,
      reason: body.reason,
      evidenceUrl: cleanEvidenceUrl,
      scoreBefore: sim.scoreBefore,
      scoreProjected: sim.scoreProjected,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    await insertDispute(this.db, dispute);
    await this.db.audit(ctx.selfId, 'dispute.created', dispute.disputeCode, {
      ticketId: body.ticketId,
      flag: body.requestedFlag,
    });

    return { ok: true, dispute, simulation: sim };
  }

  @Roles('admin', 'lead')
  @Patch('disputes/:id/resolve')
  async resolveDispute(
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; comment?: string },
    @Req() req: AuthedRequest,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const existing = await getDispute(this.db, id);
    if (!existing) {
      return { ok: false, message: 'ไม่พบคำขอทบทวนคะแนน' };
    }
    if (existing.requesterId === ctx.selfId && !ctx.isAdmin) {
      throw new ForbiddenException('ไม่สามารถอนุมัติคำขอทบทวนคะแนนของตนเองได้');
    }
    ctx.assertCanAccessPerson(existing.requesterId);

    if (existing.status !== 'PENDING') {
      return { ok: false, message: 'คำขอนี้ได้รับการพิจารณาแล้ว', dispute: existing };
    }

    const result = await this.db.tx(async (tx) => {
      const dispute = await resolveDisputeRow(tx, id, body.status, ctx.selfId, body.comment);
      if (!dispute) {
        return null;
      }
      let ticket = null;
      if (body.status === 'APPROVED') {
        const current = await getWorkItem(tx, dispute.ticketId);
        if (current) {
          ticket = await upsertWorkItem(tx, {
            ...current,
            varianceCode: dispute.requestedFlag,
            reopenCount:
              dispute.requestedReopenOverride ??
              (dispute.requestedFlag === 'REQ' || dispute.requestedFlag === 'BLK'
                ? 0
                : current.reopenCount),
            blocker: dispute.requestedFlag === 'BLK' ? false : current.blocker,
          });
        }
      }
      return { dispute, ticket };
    });

    if (!result) {
      throw new ConflictException('คำขอนี้ได้รับการพิจารณาไปแล้ว');
    }
    const { dispute, ticket } = result;

    await this.db.audit(ctx.selfId, 'dispute.resolve', id, {
      status: body.status,
      comment: body.comment,
      ticketId: dispute.ticketId,
    });

    return {
      ok: true,
      dispute,
      ticket,
      id,
      status: body.status,
      resolvedAt: dispute.resolvedAt,
      reviewerId: dispute.reviewerId,
      reviewerComment: dispute.reviewerComment,
    };
  }

  @Get('leaves')
  async getLeaves(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    const ctx = await this.scope.resolve(req.authUser);
    const listQuery = parseListQuery(
      { q, page, pageSize, sort, dir, assigneeId },
      { defaultSort: 'leaveDate', defaultDir: 'desc', defaultPageSize: 25 },
    );
    if (listQuery.assigneeId) {
      ctx.assertCanAccessPerson(listQuery.assigneeId, { selfOnlyForMember: true });
    }

    let leaves = await listLeaves(this.db);
    if (!ctx.isAdmin) {
      leaves =
        ctx.access === 'member'
          ? leaves.filter((row) => row.userId === ctx.selfId)
          : ctx.allowedPersonIds
            ? leaves.filter((row) => ctx.allowedPersonIds!.has(row.userId))
            : leaves;
    }

    if (listQuery.assigneeId) {
      leaves = leaves.filter((row) => row.userId === listQuery.assigneeId);
    }

    if (listQuery.q) {
      const needle = listQuery.q.toLowerCase();
      leaves = leaves.filter(
        (row) =>
          row.id.toLowerCase().includes(needle) ||
          row.userId.toLowerCase().includes(needle) ||
          row.leaveType.toLowerCase().includes(needle) ||
          (row.reason ?? '').toLowerCase().includes(needle) ||
          row.leaveDate.toLowerCase().includes(needle),
      );
    }

    const sortField = listQuery.sort || 'leaveDate';
    leaves = leaves.slice().sort((a, b) => compareByField(a, b, sortField, listQuery.dir));

    const pageResult = toListPageResult(leaves, listQuery);
    return {
      ok: true,
      ...pageResult,
      leaves: pageResult.items,
      result: pageResult.items,
      count: pageResult.total,
    };
  }

  @Roles('admin', 'lead')
  @Post('leaves')
  async createLeave(@Body() body: Omit<EmployeeLeave, 'id'> & { id?: string }, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    ctx.assertCanAccessPerson(body.userId);
    const leave: EmployeeLeave = {
      id: body.id ?? `leave-${Date.now()}`,
      userId: body.userId,
      leaveDate: body.leaveDate,
      leaveType: body.leaveType,
      deductMd: body.deductMd,
      reason: body.reason,
    };
    const saved = await upsertLeave(this.db, leave);
    await this.db.audit(ctx.selfId, 'leave.upsert', saved.id, {
      userId: saved.userId,
      leaveDate: saved.leaveDate,
    });
    return { ok: true, leave: saved };
  }

  @Roles('admin', 'lead')
  @Delete('leaves/:id')
  async removeLeave(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    if (!ctx.isAdmin) {
      const leaves = await listLeaves(this.db);
      const target = leaves.find((l) => l.id === id);
      if (target) {
        ctx.assertCanAccessPerson(target.userId);
      }
    }
    const ok = await deleteLeave(this.db, id);
    if (ok) {
      await this.db.audit(ctx.selfId, 'leave.delete', id, {});
    }
    return { ok };
  }

  @Roles('admin', 'lead')
  @Get('snapshots/preflight-check')
  async getPreflightCheck(@Req() req: AuthedRequest) {
    const ctx = await this.scope.resolve(req.authUser);
    const [tickets, disputes, leaves] = await Promise.all([
      listWorkItems(this.db),
      listDisputes(this.db),
      listLeaves(this.db),
    ]);
    const scopedTickets = ctx.isAdmin ? tickets : tickets.filter((t) => ctx.canAccessTicket(t));
    const scopedDisputes =
      !ctx.isAdmin && ctx.allowedPersonIds
        ? disputes.filter((d) => ctx.allowedPersonIds!.has(d.requesterId))
        : disputes;
    const scopedLeaves =
      !ctx.isAdmin && ctx.allowedPersonIds
        ? leaves.filter((l) => ctx.allowedPersonIds!.has(l.userId))
        : leaves;
    const report = runPreflightChecklist(ctx.visiblePeople, scopedTickets, scopedDisputes, scopedLeaves);
    return { ok: true, ...report };
  }
}
