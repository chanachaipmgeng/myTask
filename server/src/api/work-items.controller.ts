import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Ticket } from '../../../shared/domain/models';
import { applyGanttDateEdit } from '../../../shared/domain/work-views';
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
}
