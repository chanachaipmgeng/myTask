import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { aiCoreEnabled, createAiCoreClient } from '../ai/ai-core.client';
import { AiChatRequest, AiCopilotService } from '../ai/ai-copilot.service';
import { AuthedRequest, Roles } from '../auth/auth.guard';
import { VisibilityScopeService } from '../auth/visibility-scope.service';
import { APP_CONFIG, AppConfig } from '../config';
import { getPerson } from '../data/people.repo';
import { WorkItemRow, ticketFromRow } from '../data/types';
import { Db } from '../db/db.service';

@Controller('api/ai')
export class AiController {
  constructor(
    private readonly db: Db,
    private readonly scope: VisibilityScopeService,
    private readonly copilot: AiCopilotService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('status')
  async status() {
    return this.copilot.getStatus();
  }

  @Post('chat')
  async chat(@Body() body: AiChatRequest, @Req() req: AuthedRequest) {
    const ctxScope = await this.scope.resolve(req.authUser);
    return this.copilot.chat(ctxScope, req.authUser!, body);
  }

  @Post('briefing')
  @Roles('admin', 'lead')
  async briefing(
    @Body() body: { period?: 'daily' | 'weekly'; channel?: string; sendToTeams?: boolean },
    @Req() req: AuthedRequest,
  ) {
    const ctxScope = await this.scope.resolve(req.authUser);
    return this.copilot.briefing(ctxScope, req.authUser!, body ?? {});
  }

  @Post('recommend-assignees')
  @Roles('admin', 'lead')
  async recommendAssignees(
    @Body()
    body: {
      ticketId?: string;
      title?: string;
      module?: string;
      track?: string;
      estimateMd?: number;
    },
    @Req() req: AuthedRequest,
  ) {
    const ctxScope = await this.scope.resolve(req.authUser);
    return this.copilot.recommendAssignees(ctxScope, req.authUser!, body ?? {});
  }

  @Post('draft-ticket-from-branch')
  async draftTicketFromBranch(
    @Body()
    body: {
      branchName: string;
      projectName?: string;
      lastCommitTitle?: string;
      authorName?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.copilot.draftTicketFromBranch(req.authUser!, body);
  }

  @Post('estimate-effort')
  async estimateEffort(
    @Body()
    body: {
      title: string;
      module?: string;
      track?: string;
      type?: string;
      currentEstimateMd?: number;
    },
    @Req() req: AuthedRequest,
  ) {
    const ctxScope = await this.scope.resolve(req.authUser);
    return this.copilot.estimateEffort(ctxScope, req.authUser!, body ?? { title: '' });
  }

  @Post('dispute-copilot')
  async disputeCopilot(
    @Body()
    body: {
      mode: 'draft' | 'review';
      ticketId: string;
      rawText?: string;
      requestedFlag?: string;
      disputeReason?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    const ctxScope = await this.scope.resolve(req.authUser);
    return this.copilot.disputeCopilot(ctxScope, req.authUser!, body);
  }

  @Post('coach-summary')
  async coachSummary(
    @Body() body: { personId: string; prompt?: string },
    @Req() req: AuthedRequest,
  ) {
    const personId = (body.personId ?? '').trim();
    if (!personId) {
      return { ok: false, error: 'ไม่ระบุรหัสพนักงาน' };
    }
    const ctxScope = await this.scope.resolve(req.authUser);
    ctxScope.assertCanAccessPerson(personId, { selfOnlyForMember: true });

    const person = await getPerson(this.db, personId);
    if (!person) {
      return { ok: false, error: 'ไม่พบข้อมูลพนักงาน' };
    }

    const rows = await this.db.query<WorkItemRow>(
      'SELECT * FROM work_items WHERE assignee_id = $1 ORDER BY id',
      [person.id],
    );
    const personTickets = rows.map(ticketFromRow);
    const closedTickets = personTickets.filter((t) => t.closed);
    const activeTickets = personTickets.filter((t) => !t.closed);

    const totalEstimate = closedTickets.reduce((sum, t) => sum + (t.estimateMd || 0), 0);
    const totalActual = closedTickets.reduce((sum, t) => sum + (t.actualMd || 0), 0);
    const reopenTotal = closedTickets.reduce((sum, t) => sum + (t.reopenCount || 0), 0);
    const mdMandateTickets = personTickets.filter((t) => t.isMdDirect);
    const mdMandateMd = mdMandateTickets.reduce((sum, t) => sum + (t.estimateMd || 0), 0);

    const bugCauses: Record<string, number> = {};
    for (const t of closedTickets) {
      if (t.bugCause) {
        bugCauses[t.bugCause] = (bugCauses[t.bugCause] || 0) + 1;
      }
    }

    const promptQuestion = (body.prompt?.trim() || 'สรุปประเด็นสำหรับคุย 1-on-1 สิ้นเดือนนี้').slice(0, 500);
    const viaCore = aiCoreEnabled(this.config.aiCoreUrl, this.config.aiCoreApiKey);
    const apiKey = (this.config.geminiApiKey || process.env['GEMINI_API_KEY'] || '').trim();

    if (viaCore || apiKey) {
      try {
        const response = await this.callGemini({
          person,
          closedCount: closedTickets.length,
          activeCount: activeTickets.length,
          totalEstimate,
          totalActual,
          reopenTotal,
          mdMandateMd,
          bugCauses,
          promptQuestion,
        });
        if (response) {
          return { ok: true, summary: response, provider: 'gemini', via: viaCore ? 'ai-core' : 'direct' };
        }
      } catch {
        // Fallback to rule-based synthesis below
      }
    }

    const ruleBased = this.synthesizeRuleBasedCoaching({
      person,
      closedCount: closedTickets.length,
      activeCount: activeTickets.length,
      totalEstimate,
      totalActual,
      reopenTotal,
      mdMandateMd,
      bugCauses,
      promptQuestion,
    });

    return { ok: true, summary: ruleBased, provider: 'rule-based' };
  }

  private async callGemini(ctx: any): Promise<string | null> {
    const systemText = `คุณคือหัวหน้าทีมและโค้ชวิศวกรรมซอฟต์แวร์ผู้เชี่ยวชาญ กำลังเตรียมข้อเสนอแนะสำหรับการพูดคุย 1-on-1 แบบ Data-Driven
ข้อมูลบริบท:
- พนักงาน: ${ctx.person.nickname} (${ctx.person.fullName}), บทบาท: ${ctx.person.roleTitle || ctx.person.role}, สายงาน: ${ctx.person.track}, ระดับ: ${ctx.person.level}
- งานปิดแล้ว: ${ctx.closedCount} ใบ (${ctx.totalEstimate} Estimate MD / ${ctx.totalActual} Actual MD)
- งานด่วนสั่งตรงจาก MD: ${ctx.mdMandateMd} MD
- ถูกตีกลับ (Reopen): ${ctx.reopenTotal} ครั้ง (สาเหตุหลัก: ${JSON.stringify(ctx.bugCauses)})
- งานค้างในมือ (Active WIP): ${ctx.activeCount} ใบ

จงตอบเป็น Markdown ภาษาไทยที่กระชับ ตรงประเด็น ประกอบด้วย 4 หัวข้อ:
1. 🌟 ข้อชื่นชมและจุดแข็ง (Strengths)
2. ⚠️ จุดเฝ้าระวังและงานค้าง (Watchpoints)
3. 💬 คำถามชวนคุย 1-on-1 (Suggested Questions)
4. 🎯 ข้อตกลงและเป้าหมาย Sprint ถัดไป (Next Sprint Agreements)`;

    if (aiCoreEnabled(this.config.aiCoreUrl, this.config.aiCoreApiKey)) {
      const client = createAiCoreClient(this.config.aiCoreUrl, this.config.aiCoreApiKey);
      const result = await client.generate([{ role: 'user', content: ctx.promptQuestion }], {
        system: systemText,
        timeoutMs: 15_000,
      });
      return result.text?.trim() || null;
    }

    const apiKey = (this.config.geminiApiKey || process.env['GEMINI_API_KEY'] || '').trim();
    if (!apiKey) return null;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: [{ text: ctx.promptQuestion }] }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }

  private synthesizeRuleBasedCoaching(ctx: any): string {
    const p = ctx.person;
    const estAcc = ctx.totalEstimate > 0 ? ctx.totalEstimate / (ctx.totalActual || 1) : 1.0;
    const accLabel =
      estAcc >= 0.8 && estAcc <= 1.3
        ? 'มีความแม่นยำสูงอยู่ในกรอบ Tiered Tolerance'
        : 'มีการใช้เวลาจริงคลาดเคลื่อนจากแผน';

    const lines: string[] = [
      `### 🤖 สรุปแนวทางโค้ชชิ่ง 1-on-1 สำหรับ ${p.nickname} (${p.fullName})`,
      `**สายงาน:** ${p.track} (${p.roleTitle || p.level}) · **สถานะผลงาน:** ปิดงาน ${ctx.closedCount} ใบ (${ctx.totalEstimate} MD) · งานด่วน MD: ${ctx.mdMandateMd} MD`,
      '',
      '#### 1. 🌟 ข้อชื่นชมและจุดแข็ง (Strengths)',
      `- ความรับผิดชอบต่อเป้าหมาย: สามารถปิดงานตามแผนไปได้ ${ctx.closedCount} ใบ รวม ${ctx.totalEstimate} Man-day`,
      `- ความแม่นยำในการประเมินเวลา: ${accLabel}`,
      ctx.mdMandateMd > 0
        ? `- มีความยืดหยุ่นสูงในการช่วยรับงานด่วนสั่งตรงจาก MD (${ctx.mdMandateMd} MD) โดยรักษาระดับคุณภาพงานเดิมได้ดี`
        : '- รักษาโฟกัสของ Sprint ได้อย่างต่อเนื่องโดยไม่มีงานแทรก',
      '',
      '#### 2. ⚠️ จุดเฝ้าระวังและงานค้าง (Watchpoints)',
      ctx.reopenTotal > 0
        ? `- สถิติการถูกตีกลับ (Reopen): พบการ Reopen รวม ${ctx.reopenTotal} ครั้ง ควรทบทวนการทำ Local Test หรือ Definition of Done (DoD) ก่อนส่งเข้า QA`
        : '- คุณภาพงานรอบแรก (First-Time Right): ยอดเยี่ยม ไม่มีประวัติการถูกส่งกลับแก้ไขในเดือนนี้',
      ctx.activeCount > 2
        ? `- ปริมาณงานค้างในมือ (WIP Limit): มีงาน Active อยู่ ${ctx.activeCount} ใบ ซึ่งเกินเกณฑ์ WIP Limit 2 ใบ ควรเร่งปิดงานเดิมก่อนรับงานใหม่`
        : `- ปริมาณงานในมือสมดุล (${ctx.activeCount} ใบ) อยู่ในกรอบ WIP Limit`,
      '',
      '#### 3. 💬 คำถามชวนคุย 1-on-1 (Suggested Questions)',
      '- *"งานชิ้นไหนในเดือนนี้ที่รู้สึกว่าท้าทายที่สุด และติดปัญหาด้านสเปกหรือสภาพแวดล้อมระบบบ้างหรือไม่?"*',
      '- *"ในส่วนของกระบวนการ Code Review และการช่วยตรวจโค้ดเพื่อน (Peer Review Credit) มีจุดไหนที่อยากให้ทีมช่วยเสริมบ้าง?"*',
      '- *"สำหรับงานแทรกหรืองานด่วนที่เข้ามา รู้สึกว่าการพักเวลา (Auto-Pause) ช่วยลดความกดดันได้เหมาะสมหรือไม่?"*',
      '',
      '#### 4. 🎯 ข้อตกลงและเป้าหมาย Sprint ถัดไป (Next Sprint Agreements)',
      `- ควบคุมชั่วโมงทำงานจริงให้อยู่ในกรอบ Tiered Tolerance ตามขนาดงาน (${p.level === 'Senior' ? '±15%' : '±20%'})`,
      '- ส่งเสริมการช่วยตรวจโค้ดเพื่อนเพื่อสะสม Peer Review Quota อย่างน้อย 0.5 MD/สัปดาห์',
      '- ตรวจสอบผลการทดสอบ Staging และแนบลิงก์ Merge Request ให้ครบถ้วนก่อนส่งมอบทุกครั้ง',
    ];

    return lines.join('\n');
  }
}
