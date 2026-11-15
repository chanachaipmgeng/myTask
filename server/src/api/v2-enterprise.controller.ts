import {
  Body,
  Controller,
  Get,
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
import { TicketAllocation, TicketDispute } from '../../../shared/domain/models';
import { SEED_ALLOCATIONS, SEED_DISPUTES, SEED_LEAVES, SEED_STAGE_LOGS } from '../../../shared/seed';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { listPeople } from '../data/people.repo';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api/v2')
export class V2EnterpriseController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('work/handoff-sla')
  async getHandoffSla() {
    const [people, tickets] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
    ]);
    const report = computeHandoffSlaSummary(tickets, [...SEED_STAGE_LOGS], people);
    return { ok: true, ...report };
  }

  @Roles('admin', 'lead')
  @Post('work/handoff-ping/:ticketId')
  async pingHandoff(
    @Param('ticketId') ticketId: string,
    @Body() body: { target?: string; message?: string },
    @Req() req: AuthedRequest,
  ) {
    await this.db.audit(req.authUser?.person.id ?? null, 'handoff.ping', ticketId, {
      target: body.target,
      message: body.message,
    });
    return {
      ok: true,
      sentAt: new Date().toISOString(),
      ticketId,
      message: `ส่งการแจ้งเตือนสำหรับใบงาน ${ticketId} สำเร็จ`,
    };
  }

  @Public()
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
    await this.db.audit(req.authUser?.person.id ?? null, 'ticket.allocations.update', id, {
      count: body.allocations?.length ?? 0,
    });
    return { ok: true, ticketId: id, allocations: body.allocations ?? [] };
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

  @Public()
  @Get('disputes')
  async getDisputes(@Req() req: AuthedRequest) {
    const requesterId = req.authUser?.access === 'member' ? req.authUser.person.id : undefined;
    const disputes = [...SEED_DISPUTES];
    const filtered = requesterId ? disputes.filter((d) => d.requesterId === requesterId) : disputes;
    return { ok: true, disputes: filtered };
  }

  @Public()
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
    const person = people.find((p) => p.id === (req.authUser?.person.id ?? ticket?.assigneeId));

    const sim = ticket && person
      ? simulateDisputeImpact(ticket, person, tickets, body.requestedFlag)
      : { scoreBefore: 60, scoreProjected: 100, scoreDiff: 40, personIndexBefore: 70, personIndexProjected: 76, personIndexDiff: 6 };

    const dispute: TicketDispute = {
      id: `dsp-${Date.now()}`,
      disputeCode: `DSP-2026-${Math.floor(100 + Math.random() * 900)}`,
      ticketId: body.ticketId,
      requesterId: person?.id ?? 'natthaphat',
      requestedFlag: body.requestedFlag,
      reason: body.reason,
      evidenceUrl: body.evidenceUrl,
      scoreBefore: sim.scoreBefore,
      scoreProjected: sim.scoreProjected,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

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
    await this.db.audit(req.authUser?.person.id ?? null, 'dispute.resolve', id, {
      status: body.status,
      comment: body.comment,
    });
    return {
      ok: true,
      id,
      status: body.status,
      resolvedAt: new Date().toISOString(),
      reviewerId: req.authUser?.person.id,
      reviewerComment: body.comment,
    };
  }

  @Roles('admin', 'lead')
  @Get('snapshots/preflight-check')
  async getPreflightCheck() {
    const [people, tickets] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
    ]);
    const report = runPreflightChecklist(people, tickets, [...SEED_DISPUTES], [...SEED_LEAVES]);
    return { ok: true, ...report };
  }
}
