import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
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
import { APP_CONFIG, AppConfig } from '../config';
import {
  deleteLeave,
  insertDispute,
  listAllocations,
  listDisputes,
  listLeaves,
  listStageLogs,
  replaceAllocations,
  resolveDisputeRow,
  upsertLeave,
} from '../data/multi-team.repo';
import { listPeople } from '../data/people.repo';
import { connectionToken, getConnection } from '../data/settings.repo';
import { getWorkItem, listWorkItems, upsertWorkItem } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api/v2')
export class V2EnterpriseController {
  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('work/handoff-sla')
  async getHandoffSla() {
    const [people, tickets, stageLogs] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
      listStageLogs(this.db),
    ]);
    const report = computeHandoffSlaSummary(tickets, stageLogs, people);
    return { ok: true, ...report };
  }

  @Roles('admin', 'lead')
  @Post('work/handoff-ping/:ticketId')
  async pingHandoff(
    @Param('ticketId') ticketId: string,
    @Body() body: { target?: string; message?: string },
    @Req() req: AuthedRequest,
  ) {
    const messageText =
      body.message?.trim() ||
      `แจ้งเตือนการส่งต่องาน ${ticketId}${body.target ? ` ถึง ${body.target}` : ''} เกิน SLA`;

    const connection = await getConnection(this.db, 'teams');
    const webhookUrl = this.config.teams.webhookUrl || connectionToken(connection, this.config.tokenEncKey);

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

  @Get('quality/audit')
  async getQualityAudit() {
    const [people, tickets] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
    ]);
    const report = computeQualityAuditSummary(tickets, people);
    return { ok: true, ...report };
  }

  @Roles('admin', 'lead')
  @Patch('tickets/:id/allocations')
  async saveAllocations(
    @Param('id') id: string,
    @Body() body: { allocations: TicketAllocation[] },
    @Req() req: AuthedRequest,
  ) {
    const ticket = await getWorkItem(this.db, id);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    const allocations = (body.allocations ?? []).map((a) => ({
      ...a,
      ticketId: id,
      id: a.id || `alloc-${id}-${a.userId}-${a.subRole ?? 'main'}`,
    }));
    const saved = await replaceAllocations(this.db, id, allocations);
    await upsertWorkItem(this.db, {
      ...ticket,
      isSplitEffort: saved.length > 0,
      allocations: saved,
    });
    await this.db.audit(req.authUser?.person.id ?? null, 'ticket.allocations.update', id, {
      count: saved.length,
    });
    return { ok: true, ticketId: id, allocations: saved };
  }

  @Get('tickets/:id/allocations')
  async getAllocations(@Param('id') id: string) {
    const allocations = await listAllocations(this.db, id);
    return { ok: true, allocations };
  }

  @Roles('admin', 'lead')
  @Get('analytics/time-audit')
  async getTimeAudit() {
    const [people, tickets] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
    ]);
    const report = computeThreeWayTimeAudit(tickets, people);
    return { ok: true, ...report };
  }

  @Get('disputes')
  async getDisputes(@Req() req: AuthedRequest) {
    const requesterId = req.authUser?.access === 'member' ? req.authUser.person.id : undefined;
    const disputes = await listDisputes(this.db, requesterId);
    return { ok: true, disputes };
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
    const [people, tickets] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
    ]);
    const ticket = tickets.find((t) => t.id === body.ticketId);
    if (!ticket) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    const person = people.find((p) => p.id === (req.authUser?.person.id ?? ticket.assigneeId));
    if (!person) {
      return { ok: false, message: 'ไม่พบผู้ยื่นคำขอ' };
    }

    const sim = simulateDisputeImpact(ticket, person, tickets, body.requestedFlag);
    const dispute: TicketDispute = {
      id: `dsp-${Date.now()}`,
      disputeCode: `DSP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      ticketId: body.ticketId,
      requesterId: person.id,
      requestedFlag: body.requestedFlag,
      reason: body.reason,
      evidenceUrl: body.evidenceUrl,
      scoreBefore: sim.scoreBefore,
      scoreProjected: sim.scoreProjected,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    await insertDispute(this.db, dispute);
    await this.db.audit(req.authUser?.person.id ?? null, 'dispute.created', dispute.disputeCode, {
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
    const existing = (await listDisputes(this.db)).find((d) => d.id === id);
    if (!existing) {
      return { ok: false, message: 'ไม่พบคำขอยุทธรณ์' };
    }
    if (existing.status !== 'PENDING') {
      return { ok: false, message: 'คำขอนี้ได้รับการพิจารณาแล้ว', dispute: existing };
    }

    const dispute = await resolveDisputeRow(
      this.db,
      id,
      body.status,
      req.authUser?.person.id ?? null,
      body.comment,
    );
    if (!dispute) {
      return { ok: false, message: 'อัปเดตคำขอไม่สำเร็จ' };
    }

    let ticket = null;
    if (body.status === 'APPROVED') {
      const current = await getWorkItem(this.db, dispute.ticketId);
      if (current) {
        ticket = await upsertWorkItem(this.db, {
          ...current,
          varianceCode: dispute.requestedFlag,
          reopenCount:
            dispute.requestedReopenOverride ??
            (dispute.requestedFlag === 'REQ' || dispute.requestedFlag === 'BLK' ? 0 : current.reopenCount),
          blocker: dispute.requestedFlag === 'BLK' ? false : current.blocker,
        });
      }
    }

    await this.db.audit(req.authUser?.person.id ?? null, 'dispute.resolve', id, {
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
  async getLeaves() {
    const leaves = await listLeaves(this.db);
    return { ok: true, leaves };
  }

  @Roles('admin', 'lead')
  @Post('leaves')
  async createLeave(@Body() body: Omit<EmployeeLeave, 'id'> & { id?: string }, @Req() req: AuthedRequest) {
    const leave: EmployeeLeave = {
      id: body.id ?? `leave-${Date.now()}`,
      userId: body.userId,
      leaveDate: body.leaveDate,
      leaveType: body.leaveType,
      deductMd: body.deductMd,
      reason: body.reason,
    };
    const saved = await upsertLeave(this.db, leave);
    await this.db.audit(req.authUser?.person.id ?? null, 'leave.upsert', saved.id, {
      userId: saved.userId,
      leaveDate: saved.leaveDate,
    });
    return { ok: true, leave: saved };
  }

  @Roles('admin', 'lead')
  @Delete('leaves/:id')
  async removeLeave(@Param('id') id: string, @Req() req: AuthedRequest) {
    const ok = await deleteLeave(this.db, id);
    if (ok) {
      await this.db.audit(req.authUser?.person.id ?? null, 'leave.delete', id, {});
    }
    return { ok };
  }

  @Roles('admin', 'lead')
  @Get('snapshots/preflight-check')
  async getPreflightCheck() {
    const [people, tickets, disputes, leaves] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
      listDisputes(this.db),
      listLeaves(this.db),
    ]);
    const report = runPreflightChecklist(people, tickets, disputes, leaves);
    return { ok: true, ...report };
  }
}
