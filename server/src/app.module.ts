import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsController } from './api/analytics.controller';
import { BootstrapController } from './api/bootstrap.controller';
import { IntegrationsController } from './api/integrations.controller';
import { KpiSnapshotsController } from './api/kpi-snapshots.controller';
import { OrgController } from './api/org.controller';
import { SettingsController } from './api/settings.controller';
import { WorkItemsController } from './api/work-items.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { OpenProjectSyncService } from './integrations/openproject/openproject.sync';
import { KpiSnapshotService } from './kpi/kpi-snapshot.service';

@Module({
  imports: [DbModule, ScheduleModule.forRoot(), AuthModule],
  controllers: [
    BootstrapController,
    WorkItemsController,
    SettingsController,
    IntegrationsController,
    OrgController,
    KpiSnapshotsController,
    AnalyticsController,
  ],
  providers: [
    OpenProjectSyncService,
    KpiSnapshotService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
