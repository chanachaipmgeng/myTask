import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { listDepartments, listPeople, listTeams } from '../data/people.repo';
import { Db } from '../db/db.service';

@Controller('api/org')
export class OrgController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  async org() {
    const [departments, teams, people] = await Promise.all([
      listDepartments(this.db),
      listTeams(this.db),
      listPeople(this.db),
    ]);
    return { departments, teams, people };
  }
}
