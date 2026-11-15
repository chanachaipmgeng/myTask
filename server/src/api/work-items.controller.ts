import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Ticket } from '../../../shared/domain/models';
import { addWorkingDays, applyGanttDateEdit, detectActiveWipTickets } from '../../../shared/domain/work-views';
import { todayInBangkok } from '../../../shared/domain/workflow';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { APP_CONFIG, AppConfig } from '../config';
import { getPerson } from '../data/people.repo';
import {
  getWorkItem,
  insertWorkItems,
  listWorkItems,
  nextLocalTicketId,
  upsertWorkItem,
} from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

@Controller('api/work-items')
export class WorkItemsController {
  constructor(
    private readonly db: Db,
    private readonly openProject: OpenProjectSyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async list() {
    return { tickets: await listWorkItems(this.db) };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const ticket = await getWorkItem(this.db, id);
    return ticket ? { ticket } : { ticket: null };
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
    await this.db.audit(req.authUser?.person.id ?? null, 'work_item.replace', id, {});
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
