import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, Get, Post, Req } from '@nestjs/common';
import { AnalyticsReport, buildAnalyticsReport } from '../../../shared/domain/analytics';
import { Person, Ticket } from '../../../shared/domain/models';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { TtlCache } from '../common/ttl-cache';
import { listWorkItems } from '../data/work-items.repo';
import { Db } from '../db/db.service';

@Controller('api/analytics')
export class AnalyticsController {
  private readonly reportCache = new TtlCache<AnalyticsReport>(60_000, 50);

  constructor(
    private readonly db: Db,
    private readonly scope: VisibilityScopeService,
  ) {}

  @Roles('admin', 'lead')
  @Get('report')
  async getReport(@Req() req: AuthedRequest): Promise<AnalyticsReport> {
    const ctx = await this.scope.resolve(req.authUser);
    const cacheKey = ctx.isAdmin ? 'admin' : [...(ctx.allowedTeams ?? [])].sort().join(',');
    return this.reportCache.getOrSet(cacheKey, async () => {
      const allTickets = await listWorkItems(this.db);
      const scopedTickets = ctx.isAdmin ? allTickets : allTickets.filter((t) => ctx.canAccessTicket(t));
      return runPythonAnalyticsOrFallback(ctx.visiblePeople, scopedTickets);
    });
  }

  @Roles('admin', 'lead')
  @Post('run')
  async runNow(@Req() req: AuthedRequest): Promise<AnalyticsReport> {
    const ctx = await this.scope.resolve(req.authUser);
    const cacheKey = ctx.isAdmin ? 'admin' : [...(ctx.allowedTeams ?? [])].sort().join(',');
    const allTickets = await listWorkItems(this.db);
    const scopedTickets = ctx.isAdmin ? allTickets : allTickets.filter((t) => ctx.canAccessTicket(t));
    const report = await runPythonAnalyticsOrFallback(ctx.visiblePeople, scopedTickets);
    this.reportCache.set(cacheKey, report);
    await this.db.audit(req.authUser?.person.id ?? null, 'analytics.run', 'python_engine', {
      engine: report.engine,
      readinessScore: report.syncHygiene.readinessScore,
      issueCount: report.syncHygiene.issueCount,
    });
    return report;
  }
}

export async function runPythonAnalyticsOrFallback(
  people: readonly Person[],
  tickets: readonly Ticket[],
): Promise<AnalyticsReport> {
  const candidates = [
    resolve(process.cwd(), 'scripts/analytics_engine.py'),
    resolve(process.cwd(), '../scripts/analytics_engine.py'),
  ];
  const scriptPath = candidates.find((p) => existsSync(p));
  if (!scriptPath) {
    return buildAnalyticsReport(people, tickets, 'typescript-fallback');
  }

  for (const cmd of ['python', 'python3', 'py']) {
    try {
      const report = await invokePythonScript(cmd, scriptPath, { people, tickets });
      if (report && report.syncHygiene) {
        return report;
      }
    } catch {
      // Try next python binary candidate
    }
  }
  return buildAnalyticsReport(people, tickets, 'typescript-fallback');
}

function invokePythonScript(
  command: string,
  scriptPath: string,
  payload: { people: readonly Person[]; tickets: readonly Ticket[] },
): Promise<AnalyticsReport> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', () => undefined);
    child.stdin.on('error', () => undefined);
    child.on('error', (err) => rejectPromise(err));
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`python exited with code ${code}`));
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolvePromise(JSON.parse(text) as AnalyticsReport);
      } catch (err) {
        rejectPromise(err);
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
