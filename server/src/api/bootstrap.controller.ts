import { Controller, Get, Inject, Req } from '@nestjs/common';
import { listAllocations, listDisputes, listLeaves, listStageLogs } from '../data/multi-team.repo';
import { listDepartments, listPeople, listTeams } from '../data/people.repo';
import { getSettings } from '../data/settings.repo';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { AuthedRequest, Public } from '../auth/auth.guard';
import { APP_CONFIG, AppConfig } from '../config';

@Controller('api')
export class BootstrapController {
  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('bootstrap')
  async bootstrap(@Req() req: AuthedRequest) {
    const [people, tickets, settings, departments, teams, disputes, leaves, stageLogs, allocations] =
      await Promise.all([
        listPeople(this.db),
        listWorkItems(this.db),
        getSettings(this.db),
        listDepartments(this.db),
        listTeams(this.db),
        listDisputes(this.db),
        listLeaves(this.db),
        listStageLogs(this.db),
        listAllocations(this.db),
      ]);
    return {
      people,
      tickets,
      settings,
      departments,
      teams,
      disputes,
      leaves,
      stageLogs,
      allocations,
      auth: req.authUser
        ? {
            authenticated: true,
            person: req.authUser.person,
            access: req.authUser.access,
            devLoginEnabled: this.config.devLogin,
          }
        : {
            authenticated: false,
            person: null,
            access: null,
            devLoginEnabled: this.config.devLogin,
          },
    };
  }
}
