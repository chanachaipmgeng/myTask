import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';
import { AccordionModule, ExpandMode } from '@syncfusion/ej2-angular-navigations';

export interface SfAccordionItem {
  id: string;
  header: string;
  expanded?: boolean;
}

export interface SfAccordionOptions {
  id?: string;
  expandMode?: ExpandMode;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, AccordionModule],
  template: `
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
  `,
})
export class SfAccordionComponent {
  readonly items = input<SfAccordionItem[]>([]);
  readonly itemTemplates = input<Record<string, TemplateRef<unknown>>>({});
  readonly options = input<SfAccordionOptions>({});
}
