import { Controller, Get, Req } from '@nestjs/common';
import { listDepartments, listPeople, listTeams } from '../data/people.repo';
import { getSettings } from '../data/settings.repo';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';
import { AuthedRequest, Public } from '../auth/auth.guard';

@Controller('api')
export class BootstrapController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('bootstrap')
  async bootstrap(@Req() req: AuthedRequest) {
    const [people, tickets, settings, departments, teams] = await Promise.all([
      listPeople(this.db),
      listWorkItems(this.db),
      getSettings(this.db),
      listDepartments(this.db),
      listTeams(this.db),
    ]);
    return {
      people,
      tickets,
      settings,
      departments,
      teams,
      auth: req.authUser
        ? { authenticated: true, person: req.authUser.person, access: req.authUser.access }
        : { authenticated: false, person: null, access: null },
    };
  }
}
