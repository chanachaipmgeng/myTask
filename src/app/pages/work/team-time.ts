import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { map } from 'rxjs';
import { ApiClient, TeamTimeResponse } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { currentSession } from '../../core/session';
import { PageHeadComponent, SectionCardComponent } from '../../shared/ui';

@Component({
  selector: 'app-team-time',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, MessageModule, PageHeadComponent, SectionCardComponent],
  templateUrl: './team-time.html',
  styleUrl: './team-time.scss',
})
export class TeamTimePage {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly route = inject(ActivatedRoute);

  private readonly scope = toSignal(
    this.route.data.pipe(map((d) => (d['scope'] === 'mine' ? 'mine' : 'team'))),
    { initialValue: 'team' as 'mine' | 'team' },
  );

  protected readonly loading = signal(false);
  protected readonly data = signal<TeamTimeResponse | null>(null);
  protected readonly selectedCell = signal<{
    personId: string;
    nickname: string;
    date: string;
    hours: number;
    ticketIds: string[];
  } | null>(null);

  protected readonly title = computed(() =>
    this.scope() === 'mine' ? 'ลงเวลางานของฉัน' : 'เวลาทีมรายวัน',
  );
  protected readonly description = computed(() =>
    this.scope() === 'mine'
      ? 'ดูชั่วโมงที่ลงใน myProject รายวัน และเปิดใบงานเพื่อ Log Time'
      : 'ตารางชั่วโมงลงงานจันทร์–ศุกร์ของทีม เทียบเกณฑ์ 6 ชม./วัน',
  );

  /** สัปดาห์นี้ยังไม่มีชั่วโมงลงเลย (ว่างจริง ไม่ใช่โหลดค้าง) */
  protected readonly isEmptyWeek = computed(() => {
    const matrix = this.data();
    if (!matrix || this.loading()) return false;
    if (!matrix.rows.length) return true;
    return matrix.rows.every((row) => row.totalHours <= 0);
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    try {
      if (this.scorecard.usingApi()) {
        const res = await this.api.getTeamTime();
        this.data.set(this.scope() === 'mine' ? this.filterSelf(res) : res);
      } else {
        this.data.set(this.offlineMatrix());
      }
    } catch (err) {
      this.notice.warning(err instanceof Error ? err.message : String(err), 'โหลดเวลาทีมไม่สำเร็จ');
      this.data.set(this.offlineMatrix());
    } finally {
      this.loading.set(false);
    }
  }

  protected cellClass(hours: number, target: number): string {
    if (hours <= 0) return 'cell cell--empty';
    if (hours + 0.01 < target) return 'cell cell--warn';
    return 'cell cell--ok';
  }

  protected openCell(row: TeamTimeResponse['rows'][number], day: TeamTimeResponse['rows'][number]['days'][number]): void {
    this.selectedCell.set({
      personId: row.personId,
      nickname: row.nickname,
      date: day.date,
      hours: day.hours,
      ticketIds: day.ticketIds,
    });
  }

  protected openTicket(id: string): void {
    this.ticketDetail.open(id);
  }

  protected weekdayLabel(date: string): string {
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  private filterSelf(res: TeamTimeResponse): TeamTimeResponse {
    const selfId = currentSession()?.person.id;
    return {
      ...res,
      rows: res.rows.filter((r) => r.personId === selfId),
    };
  }

  private offlineMatrix(): TeamTimeResponse {
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const days: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    const from = days[0]!;
    const to = days[days.length - 1]!;
    const selfId = currentSession()?.person.id;
    const people =
      this.scope() === 'mine'
        ? this.scorecard.roster().filter((p) => p.id === selfId)
        : this.scorecard.roster();
    const tickets = this.scorecard.tickets();
    const rows = people.map((person) => {
      const dayCells = days.map((date) => {
        const related = tickets.filter(
          (t) =>
            t.assigneeId === person.id &&
            String(t.closedOn || t.dueOn || '').slice(0, 10) === date &&
            t.actualMd > 0,
        );
        const hours = Math.round(related.reduce((sum, t) => sum + t.actualMd * 6, 0) * 100) / 100;
        return {
          date,
          hours,
          ticketIds: related.map((t) => t.id),
          hasGitlabActivity: false,
        };
      });
      return {
        personId: person.id,
        nickname: person.nickname,
        openprojectUserId: person.openprojectUserId ?? null,
        gitlabUsername: person.gitlabUsername ?? null,
        days: dayCells,
        totalHours: Math.round(dayCells.reduce((s, c) => s + c.hours, 0) * 100) / 100,
      };
    });
    return {
      source: 'offline',
      from,
      to,
      days,
      hoursPerDayTarget: 6,
      writeback: false,
      rows,
      errors: [],
    };
  }
}
