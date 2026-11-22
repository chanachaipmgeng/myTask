import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';
import { TimelineAllModule, TimelineItemModel, TimelineModule } from '@syncfusion/ej2-angular-layouts';

export interface SfTimelineOptions {
  orientation?: 'Vertical' | 'Horizontal';
  align?: 'Before' | 'After' | 'Alternate' | 'AlternateReverse';
  cssClass?: string;
}

@Component({
  selector: 'app-sf-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TimelineModule, TimelineAllModule],
  template: `
    <ejs-timeline
      [items]="items()"
      [orientation]="options().orientation ?? 'Vertical'"
      [align]="options().align ?? 'Before'"
      [cssClass]="options().cssClass ?? ''"
    >
      @if (itemTemplate(); as tpl) {
        <ng-template #template let-data>
          <ng-container *ngTemplateOutlet="tpl; context: { $implicit: data }"></ng-container>
        </ng-template>
      }
    </ejs-timeline>
  `,
})
export class SfTimelineComponent {
  readonly items = input<TimelineItemModel[]>([]);
  readonly itemTemplate = input<TemplateRef<{ $implicit: any }> | null>(null);
  readonly options = input<SfTimelineOptions>({});
}
