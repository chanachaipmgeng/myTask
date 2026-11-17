import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-field.html',
  styleUrl: './form-field.scss',
})
export class FormFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  /** class บน wrapper — ค่าเริ่มเป็น field (ใช้ filter ได้เมื่อเป็นแถวกรอง) */
  @Input() variant: 'field' | 'filter' = 'field';
}
