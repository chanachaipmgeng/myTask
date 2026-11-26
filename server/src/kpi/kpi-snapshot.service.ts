import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  KpiPeriodType,
  buildPeriodSnapshots,
  parsePeriodKey,
  previousMonthKey,
  previousQuarterKey,
  shouldCapturePreviousQuarter,
} from '../../../shared/domain/kpi-snapshot';
import { todayInBangkok } from '../../../shared/domain/workflow';
import { listPeople } from '../data/people.repo';
import { upsertKpiSnapshots } from '../data/kpi-snapshots.repo';
import { deleteExpiredSessions } from '../data/sessions.repo';
import { getSettings } from '../data/settings.repo';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Injectable()
export class KpiSnapshotService {
  private readonly log = new Logger(KpiSnapshotService.name);

  constructor(private readonly db: Db) {}

  /** Daily 03:00 — purge expired sessions so sessions table stays bounded. */
  @Cron('0 3 * * *')
  async cleanupExpiredSessions(): Promise<void> {
    try {
      await deleteExpiredSessions(this.db);
    } catch (error) {
      this.log.warn(`expired session cleanup failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** 1st of each month at 02:00 — capture previous month (and quarter when due). */
  @Cron('0 2 1 * *')
  async scheduledCapture(): Promise<void> {
    const asOf = todayInBangkok();
    try {
      await this.capture('month', previousMonthKey(asOf), null);
      if (shouldCapturePreviousQuarter(asOf)) {
        await this.capture('quarter', previousQuarterKey(asOf), null);
      }
    } catch (error) {
      this.log.warn(`scheduled KPI capture failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async capture(
    periodType: KpiPeriodType,
    periodKey: string,
    capturedBy: string | null,
  ): Promise<{ ok: true; count: number; periodType: KpiPeriodType; periodKey: string }> {
    parsePeriodKey(periodType, periodKey);
    const outcome = await this.db.withAdvisoryLock(727102, async () => {
      const [people, tickets, settings] = await Promise.all([
        listPeople(this.db, true),
        listWorkItems(this.db),
        getSettings(this.db),
      ]);
      const rows = buildPeriodSnapshots(people, tickets, periodType, periodKey, settings.trackWeights);
      const count = await upsertKpiSnapshots(this.db, rows, capturedBy);
      this.log.log(`captured ${count} KPI rows for ${periodType} ${periodKey}`);
      return { ok: true as const, count, periodType, periodKey };
    });
    if (!outcome.acquired) {
      throw new Error('KPI snapshot capture already running');
    }
    return outcome.result;
  }
}
