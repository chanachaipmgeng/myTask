import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  ScorecardCycle,
  createYearCycle,
  normalizeCycle,
  normalizeCycleSettings,
} from '../../../shared/domain/scorecard-cycle';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { getSettings, saveSettings } from '../data/settings.repo';
import { Db } from '../db/db.service';

@Controller('api/scorecard-cycles')
export class ScorecardCyclesController {
  constructor(private readonly db: Db) {}

  @Get()
  async list() {
    const settings = await getSettings(this.db);
    return {
      ok: true,
      ...settings.scorecardCycles,
    };
  }

  @Post()
  @Roles('admin')
  async create(
    @Body()
    body: {
      yearCe?: number;
      yearBe?: number;
      label?: string;
      startOn?: string;
      endOn?: string;
      teamIds?: string[];
      status?: ScorecardCycle['status'];
      note?: string | null;
      activate?: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const settings = await getSettings(this.db);
    const draft = createYearCycle({
      yearCe: body.yearCe,
      yearBe: body.yearBe,
      label: body.label,
      teamIds: body.teamIds,
      status: body.status ?? 'open',
      note: body.note,
    });
    const cycle = normalizeCycle({
      ...draft,
      startOn: body.startOn ?? draft.startOn,
      endOn: body.endOn ?? draft.endOn,
    });
    if (!cycle) {
      return { ok: false, message: 'ข้อมูลรอบไม่ถูกต้อง' };
    }
    if (settings.scorecardCycles.cycles.some((row) => row.id === cycle.id)) {
      cycle.id = `${cycle.id}-${Date.now().toString(36)}`;
    }
    const cycles = [...settings.scorecardCycles.cycles, cycle];
    const activeCycleId = body.activate === false ? settings.scorecardCycles.activeCycleId : cycle.id;
    settings.scorecardCycles = normalizeCycleSettings({ cycles, activeCycleId });
    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'scorecard-cycle.create', cycle.id, {
      label: cycle.label,
    });
    return { ok: true, cycle, ...settings.scorecardCycles };
  }

  @Put(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<ScorecardCycle> & { activate?: boolean },
    @Req() req: AuthedRequest,
  ) {
    const settings = await getSettings(this.db);
    const index = settings.scorecardCycles.cycles.findIndex((row) => row.id === id);
    if (index < 0) {
      return { ok: false, message: `ไม่พบรอบ ${id}` };
    }
    const merged = normalizeCycle({
      ...settings.scorecardCycles.cycles[index],
      ...body,
      id,
    });
    if (!merged) {
      return { ok: false, message: 'ข้อมูลรอบไม่ถูกต้อง' };
    }
    const cycles = settings.scorecardCycles.cycles.map((row, i) => (i === index ? merged : row));
    let activeCycleId = settings.scorecardCycles.activeCycleId;
    if (body.activate === true) {
      activeCycleId = merged.id;
    }
    settings.scorecardCycles = normalizeCycleSettings({ cycles, activeCycleId });
    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'scorecard-cycle.update', id, {
      label: merged.label,
      status: merged.status,
    });
    return { ok: true, cycle: merged, ...settings.scorecardCycles };
  }

  @Post(':id/activate')
  @Roles('admin', 'lead')
  async activate(@Param('id') id: string, @Req() req: AuthedRequest) {
    const settings = await getSettings(this.db);
    if (!settings.scorecardCycles.cycles.some((row) => row.id === id)) {
      return { ok: false, message: `ไม่พบรอบ ${id}` };
    }
    settings.scorecardCycles = normalizeCycleSettings({
      cycles: settings.scorecardCycles.cycles,
      activeCycleId: id,
    });
    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'scorecard-cycle.activate', id, {});
    return { ok: true, ...settings.scorecardCycles };
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    const settings = await getSettings(this.db);
    const cycles = settings.scorecardCycles.cycles.filter((row) => row.id !== id);
    if (cycles.length === settings.scorecardCycles.cycles.length) {
      return { ok: false, message: `ไม่พบรอบ ${id}` };
    }
    const activeCycleId =
      settings.scorecardCycles.activeCycleId === id
        ? cycles.find((c) => c.status === 'open')?.id ?? cycles[0]?.id ?? null
        : settings.scorecardCycles.activeCycleId;
    settings.scorecardCycles = normalizeCycleSettings({ cycles, activeCycleId });
    await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'scorecard-cycle.delete', id, {});
    return { ok: true, ...settings.scorecardCycles };
  }
}
