import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  ViewChild,
  input,
  output,
} from '@angular/core';
import {
  CardClickEventArgs,
  CardSettingsModel,
  ColumnsModel,
  DialogEventArgs,
  DragEventArgs,
  KanbanComponent,
  KanbanModule,
  SwimlaneSettingsModel,
} from '@syncfusion/ej2-angular-kanban';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfKanbanOptions {
  id?: string;
  keyField?: string;
  height?: string;
  allowDragAndDrop?: boolean;
  showColumnCount?: boolean;
  enableTooltip?: boolean;
  cssClass?: string;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-kanban',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, KanbanModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="fade-up"
      [refreshKey]="data().length"
    >
      <ejs-kanban
        #kanbanRef
        [id]="options().id ?? 'sf-kanban'"
        [cssClass]="resolvedCssClass()"
        [keyField]="options().keyField ?? 'status'"
        [height]="options().height ?? 'auto'"
        width="100%"
        [columns]="columns()"
        [dataSource]="data()"
        [cardSettings]="cardSettings()"
        [swimlaneSettings]="swimlaneSettings()"
        [allowDragAndDrop]="options().allowDragAndDrop ?? true"
        [enableTooltip]="options().enableTooltip ?? false"
        (dragStop)="dragStop.emit($event)"
        (cardClick)="cardClick.emit($event)"
        (dialogOpen)="dialogOpen.emit($event)"
      >
        @if (cardTemplate(); as tpl) {
          <ng-template #cardSettingsTemplate let-cardData>
            <ng-container *ngTemplateOutlet="tpl; context: { $implicit: cardData }"></ng-container>
          </ng-template>
        }
      </ejs-kanban>
    </app-motion-wrapper>
  `,
})
export class SfKanbanComponent {
  @ViewChild('kanbanRef') private kanbanRef?: KanbanComponent;

  readonly data = input<object[]>([]);
  readonly columns = input<ColumnsModel[]>([]);
  readonly cardSettings = input<CardSettingsModel>({ headerField: 'id', contentField: 'title' });
  readonly swimlaneSettings = input<SwimlaneSettingsModel>({});
  readonly cardTemplate = input<TemplateRef<{ $implicit: any }> | null>(null);
  readonly options = input<SfKanbanOptions>({});

  readonly dragStop = output<DragEventArgs>();
  readonly cardClick = output<CardClickEventArgs>();
  readonly dialogOpen = output<DialogEventArgs>();

  protected resolvedCssClass(): string {
    const extra = this.options().cssClass;
    return extra ? `pipeline-board ${extra}` : 'pipeline-board';
  }

  refresh(): void {
    this.kanbanRef?.refresh();
  }

  instance(): KanbanComponent | undefined {
    return this.kanbanRef;
  }
}
