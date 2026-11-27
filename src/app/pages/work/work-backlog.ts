import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { workBacklogRows } from '../../core/work-views';
import { SectionCardComponent } from '../../shared/ui';
import {
  SfGridAggregate,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-backlog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, RouterLink, SectionCardComponent, SfGridComponent],
  templateUrl: './work-backlog.html',
})
export class WorkBacklog {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly ticketDetail = inject(TicketDetailService);

  protected readonly isMine = computed(() => this.hub.scope() === 'mine');
  protected readonly boardLink = computed(() => '/work/board');
  protected readonly rows = computed(() =>
    workBacklogRows(
      this.scorecard.tickets(),
      this.scorecard.people(),
      this.hub.filterOptions(this.scorecard.people()),
    ),
  );

  protected readonly columns = computed<SfGridColumn[]>(() => [
    { field: 'id', headerText: 'รหัส', width: 120, cellType: 'ticket-link' },
    { field: 'title', headerText: 'ชื่องาน', width: 280 },
    { field: 'trackLabel', headerText: 'สาย', width: 125, cellType: 'badge' },
    { field: 'type', headerText: 'ประเภท', width: 125, cellType: 'badge' },
    { field: 'size', headerText: 'ขนาด', width: 80, cellType: 'badge', textAlign: 'Center' },
    { field: 'estimateMd', headerText: 'Estimate MD', width: 120, textAlign: 'Right', format: 'N2', cellType: 'metric', suffix: ' MD' },
    { field: 'assignee', headerText: 'ผู้รับ', width: 150, visible: !this.isMine(), cellType: 'person', personIdField: 'assigneeId' },
    { field: 'status', headerText: 'สถานะ', width: 125, cellType: 'badge' },
  ]);

  protected readonly aggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'estimateMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
  ];

  protected readonly gridOptions = computed<SfGridOptions>(() =>
    listGridOptions({
      id: this.isMine() ? 'my-work-backlog-grid' : 'work-backlog-grid',
      filtering: 'Excel',
      columnChooser: true,
      excelExport: true,
      csvExport: true,
      exportFileName: this.isMine() ? 'my-backlog' : 'team-backlog',
    }),
  );

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }
}
