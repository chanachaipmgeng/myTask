import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, ViewChild, computed, input, output } from '@angular/core';
import { OverflowMode, SelectEventArgs, TabComponent, TabModule } from '@syncfusion/ej2-angular-navigations';

export interface SfTabItem {
  id: string;
  header: string;
  iconCss?: string;
  disabled?: boolean;
}

export interface SfTabsOptions {
  overflowMode?: OverflowMode;
  allowDragAndDrop?: boolean;
  headerPlacement?: 'Top' | 'Bottom' | 'Left' | 'Right';
  cssClass?: string;
}

@Component({
  selector: 'app-sf-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TabModule],
  template: `
    <ejs-tab
      #tabRef
      [id]="id()"
      [selectedItem]="selectedItem()"
      [overflowMode]="options().overflowMode ?? 'Scrollable'"
      [allowDragAndDrop]="options().allowDragAndDrop ?? false"
      [headerPlacement]="options().headerPlacement ?? 'Top'"
      [cssClass]="resolvedCssClass()"
      (selected)="selected.emit($event)"
    >
      <e-tabitems>
        @for (tab of tabs(); track tab.id) {
          <e-tabitem [header]="{ text: tab.header, iconCss: tab.iconCss }" [disabled]="tab.disabled ?? false">
            <ng-template #content>
              @if (tabTemplates()[tab.id]; as tpl) {
                <ng-container *ngTemplateOutlet="tpl"></ng-container>
              }
            </ng-template>
          </e-tabitem>
        }
      </e-tabitems>
    </ejs-tab>
  `,
})
export class SfTabsComponent {
  @ViewChild('tabRef') private tabRef?: TabComponent;

  readonly id = input<string>('');
  readonly tabs = input<SfTabItem[]>([]);
  readonly tabTemplates = input<Record<string, TemplateRef<unknown>>>({});
  readonly selectedItem = input<number>(0);
  readonly cssClass = input<string>('');
  readonly options = input<SfTabsOptions>({});

  readonly selected = output<SelectEventArgs>();

  protected readonly resolvedCssClass = computed(() => {
    const extra = this.options().cssClass ?? this.cssClass();
    return extra ? `sf-tabs ${extra}` : 'sf-tabs';
  });

  select(index: number): void {
    this.tabRef?.select(index);
  }

  instance(): TabComponent | undefined {
    return this.tabRef;
  }
}
