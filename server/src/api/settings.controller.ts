import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { AppSettings } from '../data/types';
import { getSettings, mergeSettings, saveSettings } from '../data/settings.repo';
import { Db } from '../db/db.service';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  async get() {
    return { settings: await getSettings(this.db) };
  }

  @Put()
  @Roles('admin')
  async put(@Body() body: { settings?: Partial<AppSettings> }, @Req() req: AuthedRequest) {
    const current = await getSettings(this.db);
    const next = mergeSettings({ ...current, ...(body.settings ?? {}) });
    const saved = await saveSettings(this.db, next, req.authUser?.person.id ?? null);
    await this.db.audit(req.authUser?.person.id ?? null, 'settings.update', 'app', {});
    return { ok: true, settings: saved };
  }
}
