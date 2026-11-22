import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';
import { AccordionModule, ExpandMode } from '@syncfusion/ej2-angular-navigations';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfAccordionItem {
  id: string;
  header: string;
  expanded?: boolean;
}

export interface SfAccordionOptions {
  id?: string;
  expandMode?: ExpandMode;
  cssClass?: string;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, AccordionModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper [config]="options().motion" variant="fade-up">
      <ejs-accordion
        [id]="options().id ?? ''"
        [expandMode]="options().expandMode ?? 'Multiple'"
        [class]="options().cssClass ?? ''"
      >
        <e-accordionitems>
          @for (item of items(); track item.id) {
            <e-accordionitem [expanded]="item.expanded ?? false">
              <ng-template #header>
                <div>{{ item.header }}</div>
              </ng-template>
              <ng-template #content>
                <div class="sf-accordion-body">
                  @if (itemTemplates()[item.id]; as tpl) {
                    <ng-container *ngTemplateOutlet="tpl"></ng-container>
                  }
                </div>
              </ng-template>
            </e-accordionitem>
          }
        </e-accordionitems>
      </ejs-accordion>
    </app-motion-wrapper>
  `,
})
export class SfAccordionComponent {
  readonly items = input<SfAccordionItem[]>([]);
  readonly itemTemplates = input<Record<string, TemplateRef<unknown>>>({});
  readonly options = input<SfAccordionOptions>({});
}
