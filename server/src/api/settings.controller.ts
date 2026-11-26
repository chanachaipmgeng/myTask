import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { AppSettings } from '../data/types';
import { getSettings, mergeSettings, updateSettingsTransactional } from '../data/settings.repo';
import { Db } from '../db/db.service';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly db: Db) {}

  @Get()
  async get() {
    return { settings: await getSettings(this.db) };
  }

  @Put()
  @Roles('admin')
  async put(@Body() body: { settings?: Partial<AppSettings> }, @Req() req: AuthedRequest) {
    const actorId = req.authUser?.person.id ?? null;
    const saved = await updateSettingsTransactional(
      this.db,
      (current) => mergeSettings({ ...current, ...(body.settings ?? {}) }),
      actorId,
    );
    await this.db.audit(actorId, 'settings.update', 'app', {});
    return { ok: true, settings: saved };
  }
}
