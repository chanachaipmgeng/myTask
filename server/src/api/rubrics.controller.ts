import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { AuthedRequest, Public, Roles } from '../auth/auth.guard';
import { listRubrics, updateRubric } from '../data/rubrics.repo';
import { Db } from '../db/db.service';
import { RubricDefinition } from '../../../shared/domain/rubrics';

@Controller('api/rubrics')
export class RubricsController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  async getRubrics() {
    const rubrics = await listRubrics(this.db);
    return { rubrics };
  }

  @Put(':id')
  @Roles('admin')
  async saveRubric(
    @Param('id') rubricId: string,
    @Body() body: Partial<RubricDefinition>,
    @Req() req: AuthedRequest,
  ) {
    const userId = req.authUser?.person.id ?? null;
    const updated = await updateRubric(this.db, rubricId, body, userId);
    if (!updated) {
      return { ok: false, error: 'Rubric not found' };
    }
    await this.db.audit(userId, 'rubric.update', rubricId, {
      title: updated.title,
      params: updated.params,
    });
    return { ok: true, rubric: updated };
  }
}
