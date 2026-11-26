import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  ScorecardCycle,
  createYearCycle,
  normalizeCycle,
  normalizeCycleSettings,
} from '../../../shared/domain/scorecard-cycle';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { getSettings, updateSettingsTransactional } from '../data/settings.repo';
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
    const draft = createYearCycle({
      yearCe: body.yearCe,
      yearBe: body.yearBe,
      label: body.label,
      teamIds: body.teamIds,
      status: body.status ?? 'open',
      note: body.note,
    });
    const baseCycle = normalizeCycle({
      ...draft,
      startOn: body.startOn ?? draft.startOn,
      endOn: body.endOn ?? draft.endOn,
    });
    if (!baseCycle) {
      return { ok: false, message: 'ข้อมูลรอบไม่ถูกต้อง' };
    }
    const actorId = req.authUser?.person.id ?? null;
    let createdCycle: ScorecardCycle = baseCycle;
    const saved = await updateSettingsTransactional(
      this.db,
      (settings) => {
        const cycle = settings.scorecardCycles.cycles.some((row) => row.id === baseCycle.id)
          ? { ...baseCycle, id: `${baseCycle.id}-${Date.now().toString(36)}` }
          : baseCycle;
        createdCycle = cycle;
        const cycles = [...settings.scorecardCycles.cycles, cycle];
        const activeCycleId = body.activate === false ? settings.scorecardCycles.activeCycleId : cycle.id;
        settings.scorecardCycles = normalizeCycleSettings({ cycles, activeCycleId });
        return settings;
      },
      actorId,
    );
    await this.db.audit(actorId, 'scorecard-cycle.create', createdCycle.id, {
      label: createdCycle.label,
    });
    return { ok: true, cycle: createdCycle, ...saved.scorecardCycles };
  }

  @Put(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<ScorecardCycle> & { activate?: boolean },
    @Req() req: AuthedRequest,
  ) {
    const actorId = req.authUser?.person.id ?? null;
    let errMessage: string | null = null;
    let updatedCycle: ScorecardCycle | null = null;
    const saved = await updateSettingsTransactional(
      this.db,
      (settings) => {
        const index = settings.scorecardCycles.cycles.findIndex((row) => row.id === id);
        if (index < 0) {
          errMessage = `ไม่พบรอบ ${id}`;
          return settings;
        }
        const merged = normalizeCycle({
          ...settings.scorecardCycles.cycles[index],
          ...body,
          id,
        });
        if (!merged) {
          errMessage = 'ข้อมูลรอบไม่ถูกต้อง';
          return settings;
        }
        const cycles = settings.scorecardCycles.cycles.map((row, i) => (i === index ? merged : row));
        const activeCycleId = body.activate === true ? merged.id : settings.scorecardCycles.activeCycleId;
        settings.scorecardCycles = normalizeCycleSettings({ cycles, activeCycleId });
        updatedCycle = merged;
        return settings;
      },
      actorId,
    );
    if (!updatedCycle) {
      return { ok: false, message: errMessage ?? 'อัปเดตรอบไม่สำเร็จ' };
    }
    const resolvedCycle: ScorecardCycle = updatedCycle;
    await this.db.audit(actorId, 'scorecard-cycle.update', id, {
      label: resolvedCycle.label,
      status: resolvedCycle.status,
    });
    return { ok: true, cycle: resolvedCycle, ...saved.scorecardCycles };
  }

  @Post(':id/activate')
  @Roles('admin', 'lead')
  async activate(@Param('id') id: string, @Req() req: AuthedRequest) {
    const actorId = req.authUser?.person.id ?? null;
    let found = false;
    const saved = await updateSettingsTransactional(
      this.db,
      (settings) => {
        if (!settings.scorecardCycles.cycles.some((row) => row.id === id)) {
          return settings;
        }
        found = true;
        settings.scorecardCycles = normalizeCycleSettings({
          cycles: settings.scorecardCycles.cycles,
          activeCycleId: id,
        });
        return settings;
      },
      actorId,
    );
    if (!found) {
      return { ok: false, message: `ไม่พบรอบ ${id}` };
    }
    await this.db.audit(actorId, 'scorecard-cycle.activate', id, {});
    return { ok: true, ...saved.scorecardCycles };
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    const actorId = req.authUser?.person.id ?? null;
    let removed = false;
    const saved = await updateSettingsTransactional(
      this.db,
      (settings) => {
        const cycles = settings.scorecardCycles.cycles.filter((row) => row.id !== id);
        if (cycles.length === settings.scorecardCycles.cycles.length) {
          return settings;
        }
        removed = true;
        const activeCycleId =
          settings.scorecardCycles.activeCycleId === id
            ? cycles.find((c) => c.status === 'open')?.id ?? cycles[0]?.id ?? null
            : settings.scorecardCycles.activeCycleId;
        settings.scorecardCycles = normalizeCycleSettings({ cycles, activeCycleId });
        return settings;
      },
      actorId,
    );
    if (!removed) {
      return { ok: false, message: `ไม่พบรอบ ${id}` };
    }
    await this.db.audit(actorId, 'scorecard-cycle.delete', id, {});
    return { ok: true, ...saved.scorecardCycles };
  }
}
