import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { KpiPeriodType, parsePeriodKey } from '../../../shared/domain/kpi-snapshot';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { listKpiSnapshotPeriods, listKpiSnapshots } from '../data/kpi-snapshots.repo';
import { Db } from '../db/db.service';
import { KpiSnapshotService } from '../kpi/kpi-snapshot.service';

@Controller('api/kpi-snapshots')
export class KpiSnapshotsController {
  constructor(
    private readonly db: Db,
    private readonly snapshots: KpiSnapshotService,
    private readonly scope: VisibilityScopeService,
  ) {}

  @Get('periods')
  async periods() {
    return { periods: await listKpiSnapshotPeriods(this.db) };
  }

  @Get()
  async list(
    @Query('periodType') periodTypeRaw: string | undefined,
    @Query('periodKey') periodKeyRaw: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const periodType = periodTypeRaw as KpiPeriodType;
    const periodKey = (periodKeyRaw ?? '').trim();
    if (periodType !== 'month' && periodType !== 'quarter') {
      return { ok: false, message: 'periodType must be month or quarter', rows: [] };
    }
    if (!periodKey) {
      return { ok: false, message: 'periodKey required', rows: [] };
    }
    try {
      parsePeriodKey(periodType, periodKey);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'invalid period',
        rows: [],
      };
    }
    const ctx = await this.scope.resolve(req.authUser);
    const allRows = await listKpiSnapshots(this.db, periodType, periodKey);
    const rows = ctx.isAdmin
      ? allRows
      : ctx.access === 'member'
        ? allRows.filter((r) => r.personId === ctx.selfId)
        : ctx.allowedPersonIds
          ? allRows.filter((r) => ctx.allowedPersonIds!.has(r.personId))
          : allRows;
    return { ok: true, rows };
  }

  @Post('capture')
  @Roles('admin', 'lead')
  async capture(
    @Body() body: { periodType?: string; periodKey?: string },
    @Req() req: AuthedRequest,
  ) {
    const periodType = body.periodType as KpiPeriodType;
    const periodKey = (body.periodKey ?? '').trim();
    if (periodType !== 'month' && periodType !== 'quarter') {
      return { ok: false, message: 'periodType must be month or quarter' };
    }
    if (!periodKey) {
      return { ok: false, message: 'periodKey required' };
    }
    try {
      return await this.snapshots.capture(periodType, periodKey, req.authUser?.person.id ?? null);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'capture failed' };
    }
  }
}
