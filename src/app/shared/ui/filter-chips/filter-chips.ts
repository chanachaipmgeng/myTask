import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';

export interface FilterChipOption {
  id: string;
  label: string;
  count?: number | null;
}

@Component({
  selector: 'app-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule],
  templateUrl: './filter-chips.html',
  styleUrl: './filter-chips.scss',
})
export class FilterChipsComponent {
  @Input() options: FilterChipOption[] = [];
  @Input() value = '';
  @Output() readonly valueChange = new EventEmitter<string>();

  protected select(id: string): void {
    if (id === this.value) {
      return;
    }
    this.valueChange.emit(id);
  }

  protected chipLabel(opt: FilterChipOption): string {
    if (opt.count == null) {
      return opt.label;
    }
    return `${opt.label} (${opt.count})`;
  }
}
