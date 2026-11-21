import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { NumericTextBoxModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { TabModule } from '@syncfusion/ej2-angular-navigations';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { ApiClient, TicketDetailResponse } from '../../../core/api-client';
import { ScorecardService } from '../../../core/scorecard.service';
import { ShellNotice } from '../../../core/shell-notice';
import { TicketDetailService } from '../../../core/ticket-detail.service';
import { scoreTicket } from '../../../../../shared/domain/scoring';
import { workflowStatusOf } from '../../../../../shared/domain/workflow';
import { BadgeTone, workflowStatusToneMap } from '../badge';
import { FormFieldComponent } from '../form-field/form-field';
import { PersonAvatarComponent } from '../person-avatar/person-avatar';
import { StatusBadgeComponent } from '../status-badge/status-badge';

@Component({
  selector: 'app-ticket-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogModule,
    TabModule,
    ButtonModule,
    TextBoxModule,
    NumericTextBoxModule,
    FormFieldComponent,
    PersonAvatarComponent,
    StatusBadgeComponent,
    SlicePipe,
  ],
  templateUrl: './ticket-detail-dialog.html',
  styleUrl: './ticket-detail-dialog.scss',
})
export class TicketDetailDialogComponent {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly detail = inject(TicketDetailService);

  @ViewChild('dialog') private dialog?: DialogComponent;

  protected readonly loading = signal(false);
  protected readonly data = signal<TicketDetailResponse | null>(null);
  protected readonly logHours = signal(1);
  protected readonly logDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly logComment = signal('');
  protected readonly replyComment = signal('');
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly animationSettings = { effect: 'Fade' as const, duration: 280, delay: 0 };

  constructor() {
    effect(() => {
      const id = this.detail.ticketId();
      if (id) {
        void this.load(id);
        queueMicrotask(() => this.dialog?.show());
      } else {
        queueMicrotask(() => this.dialog?.hide());
      }
    });
  }

  protected onClose(): void {
    this.detail.close();
    this.data.set(null);
  }

  protected onDialogClose(): void {
    if (this.detail.ticketId()) {
      this.detail.close();
    }
  }

  protected async refresh(): Promise<void> {
    const id = this.detail.ticketId();
    if (id) {
      await this.load(id);
    }
  }

  protected async submitTime(): Promise<void> {
    const id = this.detail.ticketId();
    if (!id) return;
    if (!this.data()?.writeback) {
      this.notice.warning('เปิด OPENPROJECT_WRITEBACK เมื่อตรวจข้อมูลจริงแล้ว', 'Writeback ปิดอยู่');
      return;
    }
    try {
      const res = await this.api.createTimeEntry(id, {
        hours: this.logHours(),
        spentOn: this.logDate(),
        comment: this.logComment().trim() || undefined,
      });
      if (!res.ok) {
        this.notice.error(res.message ?? 'เกิดข้อผิดพลาด', 'ลงเวลาไม่สำเร็จ');
        return;
      }
      this.notice.success(`บันทึก ${this.logHours()} ชม.`, 'ลงเวลาแล้ว');
      this.logComment.set('');
      await this.load(id);
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'ลงเวลาไม่สำเร็จ');
    }
  }

  protected async submitComment(): Promise<void> {
    const id = this.detail.ticketId();
    const comment = this.replyComment().trim();
    if (!id || !comment) return;
    if (!this.data()?.writeback) {
      this.notice.warning('เปิด OPENPROJECT_WRITEBACK เมื่อตรวจข้อมูลจริงแล้ว', 'Writeback ปิดอยู่');
      return;
    }
    try {
      const res = await this.api.postWorkItemComment(id, comment);
      if (!res.ok) {
        this.notice.error(res.message ?? 'เกิดข้อผิดพลาด', 'ส่งคอมเมนต์ไม่สำเร็จ');
        return;
      }
      this.notice.success('โพสต์กลับ myProject สำเร็จ', 'ส่งคอมเมนต์แล้ว');
      this.replyComment.set('');
      await this.load(id);
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'ส่งคอมเมนต์ไม่สำเร็จ');
    }
  }

  protected ciTone(status: string): BadgeTone {
    switch (status) {
      case 'passed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'warning';
      default:
        return 'secondary';
    }
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      if (this.scorecard.usingApi()) {
        const res = await this.api.getWorkItemDetail(id);
        this.data.set(res);
        if (!res.ok) {
          const local = this.offlineDetail(id);
          if (local) {
            this.data.set(local);
          } else {
            this.notice.warning(res.message ?? id, 'ไม่พบใบงาน');
          }
        }
      } else {
        const local = this.offlineDetail(id);
        this.data.set(
          local ?? {
            ok: false,
            source: 'offline',
            writeback: false,
            message: `ไม่พบใบงาน ${id}`,
          },
        );
      }
    } catch {
      const local = this.offlineDetail(id);
      this.data.set(
        local ?? {
          ok: false,
          source: 'offline',
          writeback: false,
          message: `ไม่พบใบงาน ${id}`,
        },
      );
    } finally {
      this.loading.set(false);
    }
  }

  private offlineDetail(id: string): TicketDetailResponse | null {
    const ticket = this.scorecard.tickets().find((t) => t.id.toUpperCase() === id.toUpperCase());
    if (!ticket) return null;
    const scores = scoreTicket(ticket);
    return {
      ok: true,
      source: 'offline',
      writeback: false,
      ticket: { ...ticket, workflowStatus: workflowStatusOf(ticket) },
      scores: {
        week: scores.week,
        accuracy: scores.accuracy,
        review: scores.review,
        reopen: scores.reopen,
        total: scores.total,
      },
      description: '',
      relations: [],
      attachments: [],
      timeEntries: ticket.actualMd
        ? [
            {
              id: 0,
              spentOn: String(ticket.closedOn || ticket.dueOn || '').slice(0, 10),
              hours: Math.round(ticket.actualMd * 6 * 100) / 100,
              userTitle: ticket.assigneeId,
              comment: 'จากข้อมูลในสกอร์การ์ด (โหมดออฟไลน์)',
            },
          ]
        : [],
      activities: [],
      mrs: ticket.mrLink
        ? [
            {
              iid: 0,
              projectId: '',
              title: ticket.mrLink,
              webUrl: ticket.mrLink,
              state: 'linked',
              ciStatus: 'unknown',
              commitSpan: { firstCommitOn: null, lastCommitOn: null, commitCount: 0 },
              unresolvedThreads: 0,
              reviewRounds: ticket.reviewRounds ?? 1,
              reviewers: ticket.reviewers ?? [],
            },
          ]
        : [],
      opUrl: null,
      errors: [],
    };
  }
}
