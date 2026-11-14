import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { todayInBangkok } from '../../../../shared/domain/workflow';
import { APP_CONFIG, AppConfig } from '../../config';
import { Db } from '../../db/db.service';
import { listPeople, personByOpUserMap, upsertOpUserSeen, upsertPerson } from '../../data/people.repo';
import { connectionToken, getConnection, getSettings } from '../../data/settings.repo';
import {
  finishSyncRun,
  getWorkItemByOpId,
  lastSuccessfulSync,
  startSyncRun,
  upsertWorkItem,
} from '../../data/work-items.repo';
import { OpenProjectClient } from './openproject.client';
import {
  idFromHref,
  isoDurationToHours,
  mapWorkPackage,
  OpLink,
  OpWorkPackage,
} from './openproject.mapper';

export interface SyncResult {
  runId: number;
  status: 'success' | 'failed';
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

@Injectable()
export class OpenProjectSyncService {
  private readonly log = new Logger(OpenProjectSyncService.name);
  private running = false;

  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron('*/15 * * * *')
  async scheduledSync(): Promise<void> {
    if (!this.config.openproject.cron.trim()) {
      return;
    }
    try {
      await this.sync('schedule', null);
    } catch (error) {
      this.log.warn(`scheduled sync skipped/failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async sync(trigger: 'manual' | 'schedule', startedBy: string | null): Promise<SyncResult> {
    if (this.running) {
      throw new Error('OpenProject sync already running');
    }
    const creds = await this.resolveCredentials();
    if (!creds) {
      throw new Error('OpenProject URL/token is not configured');
    }

    const last = await lastSuccessfulSync(this.db, 'openproject');
    const since = last?.finished_at ? new Date(last.finished_at) : null;
    const runId = await startSyncRun(this.db, {
      connection: 'openproject',
      trigger,
      startedBy,
      since,
    });

    this.running = true;
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    try {
      const settings = await getSettings(this.db);
      const mapping = settings.openprojectMapping;
      const client = new OpenProjectClient(creds.url, creds.token);
      const spentHours = await this.loadSpentHours(client, since);
      const personByOp = await this.refreshUserMap(client);

      const updatedSince = since ? since.toISOString() : null;
      for await (const wp of client.paginateWorkPackages({
        updatedSince,
        projects: mapping.projects,
      })) {
        try {
          await this.rememberAssignee(client, wp, personByOp);
          const existing = await getWorkItemByOpId(this.db, wp.id);
          const activities = mapping.countReopens ? await client.getActivities(wp.id) : undefined;
          const mapped = mapWorkPackage(wp, {
            mapping,
            hoursPerMd: settings.hoursPerMd,
            personByOpUser: personByOp,
            spentHours,
            existing: existing ?? undefined,
            activities,
            today: todayInBangkok(),
          });
          if (existing && stableTicketJson(existing) === stableTicketJson(mapped)) {
            unchanged += 1;
            continue;
          }
          await upsertWorkItem(this.db, mapped, new Date());
          if (existing) {
            updated += 1;
          } else {
            added += 1;
          }
        } catch (error) {
          errors.push(`WP ${wp.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const status = errors.length > 0 && added + updated === 0 ? 'failed' : 'success';
      await finishSyncRun(this.db, runId, { status, added, updated, unchanged, errors });
      await this.db.audit(startedBy, 'openproject.sync', 'openproject', {
        runId,
        status,
        added,
        updated,
        unchanged,
      });
      return { runId, status, added, updated, unchanged, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      await finishSyncRun(this.db, runId, {
        status: 'failed',
        added,
        updated,
        unchanged,
        errors,
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async rememberAssignee(
    client: OpenProjectClient,
    wp: OpWorkPackage,
    personByOp: Map<number, string>,
  ): Promise<void> {
    const link = singleLink(wp._links?.['assignee']);
    const opUserId = idFromHref(link?.href);
    if (opUserId === null || personByOp.has(opUserId)) {
      return;
    }
    const user = await client.getUser(opUserId);
    const name = user?.name || link?.title || `User ${opUserId}`;
    const login = user?.login ?? null;
    const email = user?.email ?? null;
    await upsertOpUserSeen(this.db, { opUserId, name, login, email });

    const people = await listPeople(this.db, false);
    const match =
      people.find((person) => email && person.email?.toLowerCase() === email.toLowerCase()) ??
      people.find((person) => login && person.gitlabUsername?.toLowerCase() === login.toLowerCase()) ??
      null;
    if (match && match.openprojectUserId == null) {
      await upsertPerson(this.db, { ...match, openprojectUserId: opUserId });
      personByOp.set(opUserId, match.id);
    }
  }

  private async refreshUserMap(client: OpenProjectClient): Promise<Map<number, string>> {
    void client;
    return personByOpUserMap(this.db);
  }

  private async loadSpentHours(client: OpenProjectClient, since: Date | null): Promise<Map<number, number>> {
    const spent = new Map<number, number>();
    const spentFrom = since ? since.toISOString().slice(0, 10) : null;
    for await (const entry of client.paginateTimeEntries({ spentFrom })) {
      const wpId = client.workPackageIdFromTimeEntry(entry);
      if (wpId === null) {
        continue;
      }
      const hours = isoDurationToHours(entry.hours);
      spent.set(wpId, (spent.get(wpId) ?? 0) + hours);
    }
    return spent;
  }

  /**
   * When OPENPROJECT_WRITEBACK is true, PATCH assignee on the work package.
   * Returns an error string on failure; null when skipped or succeeded.
   */
  async writebackAssignee(opId: number, opUserId: number): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return null;
    }
    const creds = await this.resolveCredentials();
    if (!creds) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      const client = new OpenProjectClient(creds.url, creds.token);
      const wp = await client.getWorkPackage(opId);
      const lockVersion = typeof wp.lockVersion === 'number' ? wp.lockVersion : 0;
      await client.patchAssignee(opId, opUserId, lockVersion);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`writeback assignee OP-${opId} failed: ${message}`);
      return message;
    }
  }

  /**
   * When OPENPROJECT_WRITEBACK is true, PATCH startDate / dueDate on the work package.
   * Never touches firstDueOn (scorecard-owned locked promise).
   */
  async writebackDates(
    opId: number,
    dates: { startDate?: string | null; dueDate?: string | null },
  ): Promise<string | null> {
    if (!this.config.openproject.writeback) {
      return null;
    }
    const creds = await this.resolveCredentials();
    if (!creds) {
      return 'OpenProject URL/token is not configured';
    }
    try {
      const client = new OpenProjectClient(creds.url, creds.token);
      const wp = await client.getWorkPackage(opId);
      const lockVersion = typeof wp.lockVersion === 'number' ? wp.lockVersion : 0;
      await client.patchDates(opId, dates, lockVersion);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`writeback dates OP-${opId} failed: ${message}`);
      return message;
    }
  }

  private async resolveCredentials(): Promise<{ url: string; token: string } | null> {
    const envUrl = this.config.openproject.url;
    const envToken = this.config.openproject.token;
    if (envUrl && envToken) {
      return { url: envUrl, token: envToken };
    }
    const row = await getConnection(this.db, 'openproject');
    if (!row) {
      return null;
    }
    const token = envToken || connectionToken(row, this.config.tokenEncKey);
    const url = envUrl || row.base_url;
    if (!url || !token || (!row.enabled && !(envUrl && envToken))) {
      return null;
    }
    return { url, token };
  }
}

function singleLink(link: OpLink | OpLink[] | undefined): OpLink | undefined {
  return Array.isArray(link) ? link[0] : link;
}

function stableTicketJson(ticket: unknown): string {
  return JSON.stringify(ticket);
}
