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
import { openprojectProjectCatalog } from '../../../core/admin-settings';
import { ApiClient } from '../../../core/api-client';
import { ScorecardService } from '../../../core/scorecard.service';
import { ShellNotice } from '../../../core/shell-notice';
import {
  SfDialogComponent,
  SfDropdownComponent,
  SfNumberComponent,
  SfTextBoxComponent,
} from '../../sf';
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

  protected readonly typeOptions = [
    { text: 'Task (งานย่อย/พัฒนาระบบ)', value: 1 },
    { text: 'Feature (ฟีเจอร์ใหม่)', value: 2 },
    { text: 'Bugfix (แก้ไขบัก)', value: 3 },
  ];

  open(branch: GitBranchItem): void {
    this.branch.set(branch);
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
    this.selectedType.set(1);

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
