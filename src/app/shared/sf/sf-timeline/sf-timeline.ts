import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';
import { TimelineAllModule, TimelineItemModel, TimelineModule } from '@syncfusion/ej2-angular-layouts';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfTimelineOptions {
  orientation?: 'Vertical' | 'Horizontal';
  align?: 'Before' | 'After' | 'Alternate' | 'AlternateReverse';
  cssClass?: string;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TimelineModule, TimelineAllModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="fade-up"
      [refreshKey]="items().length"
    >
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
    </app-motion-wrapper>
  `,
})
export class SfTimelineComponent {
  readonly items = input<TimelineItemModel[]>([]);
  readonly itemTemplate = input<TemplateRef<{ $implicit: any }> | null>(null);
  readonly options = input<SfTimelineOptions>({});
}
