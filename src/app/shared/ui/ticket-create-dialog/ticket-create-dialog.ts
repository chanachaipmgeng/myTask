import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  GitBranchItem,
  cleanBranchToTicketTitle,
} from '../../../../../shared/domain/git-branch';
import {
  openprojectProjectCatalog,
  openprojectTypeCatalog,
} from '../../../core/admin-settings';
import { ApiClient, AiEffortEstimateResponse } from '../../../core/api-client';
import { ScorecardService } from '../../../core/scorecard.service';
import { ShellNotice } from '../../../core/shell-notice';
import { SfDialogComponent } from '../../sf/sf-dialog/sf-dialog';
import { SfDropdownComponent } from '../../sf/sf-dropdown/sf-dropdown';
import { SfNumberComponent } from '../../sf/sf-number/sf-number';
import { SfTextBoxComponent } from '../../sf/sf-textbox/sf-textbox';
import { FormFieldComponent } from '../form-field/form-field';

@Component({
  selector: 'app-ticket-create-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    SfDialogComponent,
    SfTextBoxComponent,
    SfDropdownComponent,
    SfNumberComponent,
    FormFieldComponent,
  ],
  templateUrl: './ticket-create-dialog.html',
  styleUrl: './ticket-create-dialog.scss',
})
export class TicketCreateDialogComponent {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  @ViewChild('dialog') dialog?: SfDialogComponent;

  readonly created = output<{ ticketId: string; branchId?: number }>();

  protected readonly branch = signal<GitBranchItem | null>(null);
  protected readonly subject = signal('');
  protected readonly selectedProject = signal('');
  protected readonly selectedAssignee = signal('');
  protected readonly selectedType = signal<number>(1);
  protected readonly estimateMd = signal<number>(1.0);
  protected readonly submitting = signal(false);
  protected readonly draftingAi = signal(false);
  protected readonly aiDraftNote = signal<string | null>(null);
  protected readonly aiDraftProvider = signal<'gemini' | 'rule-based' | null>(null);
  protected readonly estimatingAi = signal(false);
  protected readonly effortEstimate = signal<AiEffortEstimateResponse | null>(null);

  protected async estimateEffortWithAi(): Promise<void> {
    if (this.estimatingAi() || !this.subject().trim()) return;
    this.estimatingAi.set(true);
    try {
      const b = this.branch();
      const res = await this.api.estimateEffortAi({
        title: this.subject().trim(),
        module: b?.projectName || this.selectedProject() || undefined,
        currentEstimateMd: this.estimateMd(),
      });
      this.effortEstimate.set(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถประเมิน MD จากประวัติได้';
      this.notice.error(msg);
    } finally {
      this.estimatingAi.set(false);
    }
  }

  protected applyRecommendedMd(md: number): void {
    this.estimateMd.set(md);
    this.notice.success(`ปรับ Estimate เป็น ${md} MD ตามคำแนะนำ AI แล้ว`);
  }

  protected async autoDraftWithAi(): Promise<void> {
    const b = this.branch();
    if (!b || this.draftingAi()) return;
    this.draftingAi.set(true);
    try {
      const res = await this.api.draftTicketFromBranchAi({
        branchName: b.branchName,
        projectName: b.projectName,
        lastCommitTitle: b.lastCommitTitle ?? undefined,
        authorName: b.personName ?? undefined,
      });
      const d = res.draft;
      this.subject.set(d.subject);
      this.estimateMd.set(d.estimateMd);
      this.aiDraftNote.set(d.reasoning);
      this.aiDraftProvider.set(res.provider);

      // Match best OpenProject Type option based on AI draft type
      const opts = this.typeOptions();
      const wanted = d.type.toLowerCase();
      const match =
        opts.find((o) => wanted.includes('bug') && /bug|fix/i.test(o.text)) ||
        opts.find((o) => wanted.includes('feature') && /enhanc|feat|implement/i.test(o.text)) ||
        opts.find((o) => wanted.includes('spike') && /spike|r&d|research/i.test(o.text)) ||
        opts.find((o) => wanted.includes('cr') && /cr|change|enhanc/i.test(o.text));
      if (match) {
        this.selectedType.set(match.value);
      }
      this.notice.success(`AI ร่างใบงานเรียบร้อย (${res.provider === 'gemini' ? 'Gemini 2.5' : 'Smart Engine'})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถร่างใบงานด้วย AI ได้';
      this.notice.error(msg);
    } finally {
      this.draftingAi.set(false);
    }
  }

  protected readonly projectOptions = computed(() => {
    const catalog = openprojectProjectCatalog();
    return catalog
      .filter((p) => p.active !== false)
      .map((p) => ({
        text: p.name || p.identifier,
        value: p.identifier || String(p.id),
      }))
      .sort((a, b) => a.text.localeCompare(b.text, 'th'));
  });

  protected readonly assigneeOptions = computed(() => {
    return this.scorecard
      .people()
      .map((p) => ({
        text: `${p.nickname || p.fullName} (${p.track || 'Dev'})`,
        value: p.id,
      }))
      .sort((a, b) => a.text.localeCompare(b.text, 'th'));
  });

  protected readonly typeOptions = computed(() => {
    const catalog = openprojectTypeCatalog();
    if (catalog.length > 0) {
      const nonMilestone = catalog.filter((t) => !t.isMilestone);
      const source = nonMilestone.length > 0 ? nonMilestone : catalog;
      return source.map((t) => ({
        text: t.name,
        value: t.id,
      }));
    }
    return [
      { text: 'PM-Implement', value: 1 },
      { text: 'DEV-Enhancement', value: 4 },
      { text: 'DEV-Bugs Fix', value: 13 },
    ];
  });

  open(branch: GitBranchItem): void {
    this.branch.set(branch);
    this.aiDraftNote.set(null);
    this.aiDraftProvider.set(null);
    this.effortEstimate.set(null);
    this.subject.set(cleanBranchToTicketTitle(branch.branchName));

    // Guess default project: find in catalog by branch's projectName or take first active
    const catalog = openprojectProjectCatalog().filter((p) => p.active !== false);
    const matchedProj = catalog.find(
      (p) =>
        p.identifier.toLowerCase() === branch.projectName.toLowerCase() ||
        branch.projectName.toLowerCase().includes(p.identifier.toLowerCase()),
    );
    this.selectedProject.set(
      matchedProj?.identifier || catalog[0]?.identifier || '',
    );

    // Default assignee to branch's personId or fallback to current viewer
    this.selectedAssignee.set(
      branch.personId || this.scorecard.people()[0]?.id || '',
    );
    this.estimateMd.set(1.0);
    const opts = this.typeOptions();
    const bLower = branch.branchName.toLowerCase();
    const preferred =
      /^(fix|bug|hotfix)\b/i.test(bLower)
        ? opts.find((o) => /bug|incident/i.test(o.text))
        : opts.find((o) => /enhancement|request|feature|implement/i.test(o.text));
    this.selectedType.set(preferred?.value ?? opts[0]?.value ?? 1);

    this.dialog?.open();
  }

  close(): void {
    this.dialog?.close();
  }

  async onSubmit(): Promise<void> {
    const b = this.branch();
    const proj = this.selectedProject();
    const subj = this.subject().trim();

    if (!proj || !subj) {
      this.notice.warning(
        'กรุณาระบุโปรเจกต์และชื่อใบงานให้ครบถ้วน',
        'ข้อมูลไม่ครบ',
      );
      return;
    }

    this.submitting.set(true);
    try {
      const res = await this.api.createTicketFromBranch({
        branchId: b ? b.id : 0,
        branchName: b ? b.branchName : subj,
        projectId: proj,
        subject: subj,
        assigneePersonId: this.selectedAssignee(),
        typeId: this.selectedType(),
        estimateMd: this.estimateMd() || 1.0,
      });

      if (res.ok && res.ticketId) {
        this.notice.success(
          `สร้างใบงาน #${res.ticketId} บน myProject และผูกกับ Branch เรียบร้อยแล้ว`,
          'สร้างใบงานสำเร็จ',
        );
        this.created.emit({ ticketId: res.ticketId, branchId: b?.id });
        this.close();
        await this.scorecard.reloadFromApi();
      } else {
        this.notice.error(res.message || '', 'สร้างใบงานไม่สำเร็จ');
      }
    } catch (err) {
      this.notice.error(
        err instanceof Error ? err.message : String(err),
        'เกิดข้อผิดพลาดในการสร้างใบงาน',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
