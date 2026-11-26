import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AiController } from './api/ai.controller';
import { AnalyticsController } from './api/analytics.controller';
import { BootstrapController } from './api/bootstrap.controller';
import { IntegrationsController } from './api/integrations.controller';
import { KpiSnapshotsController } from './api/kpi-snapshots.controller';
import { OrgController } from './api/org.controller';
import { RubricsController } from './api/rubrics.controller';
import { ScorecardCyclesController } from './api/scorecard-cycles.controller';
import { SettingsController } from './api/settings.controller';
import { TeamsIntegrationController } from './api/teams-integration.controller';
import { TimeEntriesController } from './api/time-entries.controller';
import { V2EnterpriseController } from './api/v2-enterprise.controller';
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
    ScorecardCyclesController,
    RubricsController,
    IntegrationsController,
    TeamsIntegrationController,
    TimeEntriesController,
    OrgController,
    KpiSnapshotsController,
    AnalyticsController,
    AiController,
    V2EnterpriseController,
  ],
  providers: [
    OpenProjectSyncService,
    KpiSnapshotService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
