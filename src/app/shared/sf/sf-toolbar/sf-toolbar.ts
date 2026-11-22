import { ChangeDetectionStrategy, Component, TemplateRef, computed, input, output } from '@angular/core';
import { ClickEventArgs, DisplayMode, ToolbarModule } from '@syncfusion/ej2-angular-navigations';

export interface SfToolbarItem {
  id?: string;
  text?: string;
  type?: 'Button' | 'Separator' | 'Input';
  prefixIcon?: string;
  tooltipText?: string;
  align?: 'Left' | 'Center' | 'Right';
  template?: TemplateRef<unknown>;
}

export interface SfToolbarOptions {
  id?: string;
  overflowMode?: 'Scrollable' | 'Popup' | 'Extended' | 'MultiRow';
  cssClass?: string;
  width?: string;
}

@Component({
  selector: 'app-sf-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolbarModule],
  template: `
    <ejs-toolbar
      [id]="options().id ?? ''"
      [overflowMode]="resolvedOverflowMode()"
      [cssClass]="options().cssClass ?? 'page-toolbar'"
      [width]="options().width ?? '100%'"
      (clicked)="clicked.emit($event)"
    >
      <e-items>
        @for (item of items(); track $index) {
          <e-item
            [id]="item.id ?? ''"
            [text]="item.text ?? ''"
            [type]="item.type ?? 'Button'"
            [prefixIcon]="item.prefixIcon ?? ''"
            [tooltipText]="item.tooltipText ?? ''"
            [align]="item.align ?? 'Left'"
            [template]="item.template"
          ></e-item>
        }
      </e-items>
    </ejs-toolbar>
  `,
})
export class SfToolbarComponent {
  readonly items = input<SfToolbarItem[]>([]);
  readonly options = input<SfToolbarOptions>({});
  readonly clicked = output<ClickEventArgs>();

  protected readonly resolvedOverflowMode = computed<DisplayMode>(
    () => (this.options().overflowMode ?? 'Scrollable') as DisplayMode,
  );
}
