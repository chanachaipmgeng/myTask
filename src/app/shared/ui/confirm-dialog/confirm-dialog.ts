import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SfDialogComponent } from '../../sf/sf-dialog/sf-dialog';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SfDialogComponent, ButtonModule],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialogComponent {
  @ViewChild('dialog') dialog?: SfDialogComponent;

  @Input() header = 'ยืนยัน';
  @Input() message = '';
  @Input() confirmLabel = 'ยืนยัน';
  @Input() cancelLabel = 'ยกเลิก';
  @Input() confirmCssClass = 'e-primary';
  @Input() width = '420px';
  @Input() dialogId = 'confirmDialog';
  @Input() showCancel = true;
  @Input() confirmDisabled = false;

  @Output() readonly confirmed = new EventEmitter<void>();
  @Output() readonly cancelled = new EventEmitter<void>();

  private closingByConfirm = false;

  open(): void {
    this.closingByConfirm = false;
    this.dialog?.open();
  }

  close(): void {
    this.dialog?.close();
  }

  protected onConfirm(): void {
    if (this.confirmDisabled) {
      return;
    }
    this.closingByConfirm = true;
    this.confirmed.emit();
    this.close();
  }

  protected onCancel(): void {
    this.closingByConfirm = false;
    this.close();
  }

  protected onDialogClose(): void {
    if (!this.closingByConfirm) {
      this.cancelled.emit();
    }
    this.closingByConfirm = false;
  }
}
