import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
  signal,
} from '@angular/core';

export interface FilterChipOption {
  id: string;
  label: string;
  count?: number | null;
}

@Component({
  selector: 'app-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-chips.html',
  styleUrl: './filter-chips.scss',
})
export class FilterChipsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() options: FilterChipOption[] = [];
  @Input() value = '';
  @Output() readonly valueChange = new EventEmitter<string>();

  @ViewChild('track') private trackRef?: ElementRef<HTMLElement>;

  protected readonly pill = signal({ x: 0, y: 0, width: 0, height: 0, visible: false, ready: false });
  private resizeObserver?: ResizeObserver;

  protected select(id: string): void {
    if (id === this.value) {
      return;
    }
    this.valueChange.emit(id);
  }

  ngAfterViewInit(): void {
    this.scheduleSync(false);
    if (typeof ResizeObserver !== 'undefined' && this.trackRef?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleSync(true));
      this.resizeObserver.observe(this.trackRef.nativeElement);
    }
  }

  ngOnChanges(): void {
    this.scheduleSync(this.pill().ready);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private scheduleSync(animate: boolean): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => {
      const track = this.trackRef?.nativeElement;
      if (!track) return;
      const active = track.querySelector<HTMLElement>('.chip-pill-btn.is-active');
      if (!active) {
        this.pill.update((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const trackRect = track.getBoundingClientRect();
      const btnRect = active.getBoundingClientRect();
      const x = Math.round(btnRect.left - trackRect.left + track.scrollLeft);
      const y = Math.round(btnRect.top - trackRect.top + track.scrollTop);
      const width = Math.round(btnRect.width);
      const height = Math.round(btnRect.height);
      this.pill.set({ x, y, width, height, visible: width > 0, ready: animate });
      if (!animate) {
        requestAnimationFrame(() => {
          this.pill.update((prev) => ({ ...prev, ready: true }));
        });
      }
    });
  }
}
