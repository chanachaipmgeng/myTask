import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';
import { Orientation, SplitterModule } from '@syncfusion/ej2-angular-layouts';

export interface SfSplitterPane {
  id: string;
  size?: string;
  min?: string;
  max?: string;
  collapsible?: boolean;
  resizable?: boolean;
}

export interface SfSplitterOptions {
  height?: string;
  orientation?: Orientation;
  separatorSize?: number;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-splitter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, SplitterModule],
  template: `
    <ejs-splitter
      [height]="options().height ?? '580px'"
      [orientation]="options().orientation ?? 'Horizontal'"
      [separatorSize]="options().separatorSize ?? 4"
      [cssClass]="options().cssClass ?? ''"
    >
      <e-panes>
        @for (pane of panes(); track pane.id) {
          <e-pane
            [size]="pane.size ?? ''"
            [min]="pane.min ?? ''"
            [max]="pane.max ?? ''"
            [collapsible]="pane.collapsible ?? false"
            [resizable]="pane.resizable ?? true"
          >
            <ng-template #content>
              @if (paneTemplates()[pane.id]; as tpl) {
                <ng-container *ngTemplateOutlet="tpl"></ng-container>
              }
            </ng-template>
          </e-pane>
        }
      </e-panes>
    </ejs-splitter>
  `,
})
export class SfSplitterComponent {
  readonly panes = input<SfSplitterPane[]>([]);
  readonly paneTemplates = input<Record<string, TemplateRef<unknown>>>({});
  readonly options = input<SfSplitterOptions>({});
}
