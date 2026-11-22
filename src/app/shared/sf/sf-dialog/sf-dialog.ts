import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, input, output } from '@angular/core';
import { AnimationSettingsModel, DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { ViewportService } from '../../../core/viewport.service';

export interface SfDialogOptions {
  width?: string;
  height?: string;
  minHeight?: string;
  isModal?: boolean;
  showCloseIcon?: boolean;
  allowDragging?: boolean;
  enableResize?: boolean;
  closeOnEscape?: boolean;
  animationEffect?: 'Fade' | 'Zoom' | 'None';
  cssClass?: string;
}

@Component({
  selector: 'app-sf-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule],
  template: `
    <ejs-dialog
      #dlg
      [id]="id()"
      [header]="header()"
      [width]="resolvedWidth()"
      [height]="options().height ?? 'auto'"
      [minHeight]="options().minHeight ?? ''"
      [visible]="visible()"
      [isModal]="options().isModal ?? isModal()"
      [showCloseIcon]="options().showCloseIcon ?? showCloseIcon()"
      [allowDragging]="options().allowDragging ?? allowDragging()"
      [enableResize]="options().enableResize ?? enableResize()"
      [closeOnEscape]="options().closeOnEscape ?? true"
      [animationSettings]="animationSettings()"
      [cssClass]="resolvedCssClass()"
      (open)="opened.emit()"
      (close)="closed.emit()"
    >
      <ng-template #content>
        <ng-content />
      </ng-template>
      @if (hasFooter()) {
        <ng-template #footerTemplate>
          <div class="app-modal__footer">
            <ng-content select="[sf-dialog-footer]" />
          </div>
        </ng-template>
      }
    </ejs-dialog>
  `,
})
export class SfDialogComponent {
  private readonly viewport = inject(ViewportService);
  @ViewChild('dlg') private dlg?: DialogComponent;

  readonly id = input<string>('');
  readonly header = input<string>('');
  readonly width = input<string>('560px');
  readonly visible = input<boolean>(false);
  readonly isModal = input<boolean>(true);
  readonly showCloseIcon = input<boolean>(true);
  readonly allowDragging = input<boolean>(false);
  readonly enableResize = input<boolean>(false);
  readonly hasFooter = input<boolean>(true);
  readonly cssClass = input<string>('');
  readonly options = input<SfDialogOptions>({});

  readonly opened = output<void>();
  readonly closed = output<void>();

  protected readonly resolvedWidth = computed(() => {
    if (this.viewport.isMobile()) {
      return 'calc(100vw - 16px)';
    }
    return this.options().width ?? this.width();
  });

  protected readonly resolvedCssClass = computed(() => {
    const extra = this.options().cssClass ?? this.cssClass();
    return extra ? `app-modal ${extra}` : 'app-modal';
  });

  protected readonly animationSettings = computed<AnimationSettingsModel>(() => ({
    effect: this.options().animationEffect ?? 'Fade',
    duration: 200,
  }));

  open(): void {
    this.dlg?.show();
  }

  close(): void {
    this.dlg?.hide();
  }

  instance(): DialogComponent | undefined {
    return this.dlg;
  }
}
