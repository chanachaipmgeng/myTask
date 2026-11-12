import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Ticket } from '../../../shared/domain/models';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { getPerson } from '../data/people.repo';
import {
  getWorkItem,
  insertWorkItems,
  listWorkItems,
  nextLocalTicketId,
  upsertWorkItem,
} from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api/work-items')
export class WorkItemsController {
  constructor(private readonly db: Db) {}

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
  @Roles('admin', 'lead', 'member')
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
    return { ok: true, ticket: saved };
  }
}
