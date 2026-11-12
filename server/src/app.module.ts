import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { BootstrapController } from './api/bootstrap.controller';
import { IntegrationsController } from './api/integrations.controller';
import { OrgController } from './api/org.controller';
import { SettingsController } from './api/settings.controller';
import { WorkItemsController } from './api/work-items.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { OpenProjectSyncService } from './integrations/openproject/openproject.sync';

@Module({
  imports: [DbModule, ScheduleModule.forRoot(), AuthModule],
  controllers: [
    BootstrapController,
    WorkItemsController,
    SettingsController,
    IntegrationsController,
    OrgController,
  ],
  providers: [OpenProjectSyncService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
