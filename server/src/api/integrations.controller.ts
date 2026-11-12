import { Body, Controller, Get, Put, Post, Query, Req } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { APP_CONFIG, AppConfig } from '../config';
import { listPeople, listUnmappedOpUsers, setPersonOpenProjectUser } from '../data/people.repo';
import {
  connectionToken,
  getConnection,
  getSettings,
  saveSettings,
  upsertConnection,
} from '../data/settings.repo';
import { listSyncRuns } from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { validateMapping } from '../integrations/openproject/openproject.mapper';
import { OpenProjectSyncService } from '../integrations/openproject/openproject.sync';

@Controller('api')
export class IntegrationsController {
  constructor(
    private readonly db: Db,
    private readonly syncService: OpenProjectSyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('integrations/openproject')
  async getOpenProject() {
    const [settings, connection, runs, unmapped, people] = await Promise.all([
      getSettings(this.db),
      getConnection(this.db, 'openproject'),
      listSyncRuns(this.db, 'openproject', 10),
      listUnmappedOpUsers(this.db),
      listPeople(this.db, false),
    ]);
    const envConfigured = Boolean(this.config.openproject.url && this.config.openproject.token);
    const hasDbToken = Boolean(connection?.token_enc);
    return {
      configured: envConfigured || Boolean(connection?.base_url && (hasDbToken || this.config.openproject.token)),
      enabled: envConfigured || Boolean(connection?.enabled),
      writeback: this.config.openproject.writeback,
      baseUrl: this.config.openproject.url || connection?.base_url || '',
      hasToken: envConfigured || hasDbToken,
      mapping: settings.openprojectMapping,
      hoursPerMd: settings.hoursPerMd,
      lastRuns: runs,
      unmappedUsers: unmapped.map((row) => ({
        opUserId: row.op_user_id,
        name: row.name,
        login: row.login,
        email: row.email,
        lastSeen: row.last_seen,
      })),
      people: people.map((person) => ({
        id: person.id,
        nickname: person.nickname,
        openprojectUserId: person.openprojectUserId ?? null,
      })),
    };
  }

  @Put('integrations/openproject')
  @Roles('admin')
  async putOpenProject(
    @Body()
    body: {
      baseUrl?: string;
      token?: string;
      enabled?: boolean;
      mapping?: unknown;
      hoursPerMd?: number;
    },
    @Req() req: AuthedRequest,
  ) {
    if (body.mapping !== undefined) {
      const checked = validateMapping(body.mapping);
      if (!checked.mapping) {
        return { ok: false, errors: checked.errors };
      }
      const settings = await getSettings(this.db);
      settings.openprojectMapping = checked.mapping;
      if (typeof body.hoursPerMd === 'number') {
        settings.hoursPerMd = body.hoursPerMd;
      }
      await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    } else if (typeof body.hoursPerMd === 'number') {
      const settings = await getSettings(this.db);
      settings.hoursPerMd = body.hoursPerMd;
      await saveSettings(this.db, settings, req.authUser?.person.id ?? null);
    }

    if (body.baseUrl !== undefined || body.token !== undefined || body.enabled !== undefined) {
      const existing = await getConnection(this.db, 'openproject');
      await upsertConnection(this.db, {
        id: 'openproject',
        baseUrl: body.baseUrl ?? existing?.base_url ?? this.config.openproject.url ?? '',
        token: body.token === undefined ? null : body.token,
        enabled: body.enabled ?? existing?.enabled ?? true,
        updatedBy: req.authUser?.person.id ?? null,
        encKey: this.config.tokenEncKey,
      });
    }

    return this.getOpenProject();
  }

  @Post('integrations/openproject/sync')
  @Roles('admin', 'lead', 'member')
  async syncNow(@Req() req: AuthedRequest) {
    const result = await this.syncService.sync('manual', req.authUser?.person.id ?? null);
    return { ok: result.status === 'success', ...result };
  }

  @Put('integrations/openproject/user-map')
  @Roles('admin')
  async mapUser(
    @Body() body: { personId?: string; opUserId?: number | null },
    @Req() req: AuthedRequest,
  ) {
    if (!body.personId) {
      return { ok: false, message: 'personId required' };
    }
    await setPersonOpenProjectUser(this.db, body.personId, body.opUserId ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'openproject.user_map', body.personId, {
      opUserId: body.opUserId ?? null,
    });
    return this.getOpenProject();
  }

  @Public()
  @Get('sync-runs')
  async syncRuns(@Query('connection') connection = 'openproject') {
    return { runs: await listSyncRuns(this.db, connection, 30) };
  }

  /** Dev helper: whether a DB-stored token decrypts (never returns the secret). */
  @Get('integrations/openproject/token-check')
  @Roles('admin')
  async tokenCheck() {
    const row = await getConnection(this.db, 'openproject');
    try {
      const token = this.config.openproject.token || connectionToken(row, this.config.tokenEncKey);
      return { ok: Boolean(token), source: this.config.openproject.token ? 'env' : row?.token_enc ? 'db' : 'none' };
    } catch {
      return { ok: false, source: 'error' };
    }
  }
}
