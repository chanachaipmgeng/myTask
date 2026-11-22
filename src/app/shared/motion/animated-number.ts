import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * Smooth easeOutExpo animated numeric readout with `tabular-nums`
 * and subtle value-update highlight.
 */
@Component({
  selector: 'app-animated-number',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="anim-num" [class.is-updating]="updating()">
      {{ prefix() }}{{ formatted() }}{{ suffix() }}
    </span>
  `,
  styles: `
    .anim-num {
      font-variant-numeric: tabular-nums;
      transition: color 220ms var(--ease-nordic, cubic-bezier(0.22, 1, 0.36, 1));
    }
    .anim-num.is-updating {
      color: var(--primary-bright, #3b60dc);
    }
  `,
})
export class AnimatedNumberComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly value = input<number>(0);
  readonly decimals = input<number>(0);
  readonly duration = input<number>(480);
  readonly prefix = input<string>('');
  readonly suffix = input<string>('');

  protected readonly displayed = signal(0);
  protected readonly updating = signal(false);

  private rafId = 0;
  private currentVal = 0;
  private initialized = false;

  constructor() {
    effect(() => {
      const target = Number.isFinite(this.value()) ? this.value() : 0;
      const dur = Math.max(80, this.duration());
      this.animateTo(target, dur);
    });
    this.destroyRef.onDestroy(() => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
    });
  }

  protected formatted(): string {
    const dec = Math.max(0, Math.min(4, this.decimals()));
    return this.displayed().toLocaleString('en-US', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }

  private animateTo(target: number, duration: number): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      this.currentVal = target;
      this.displayed.set(target);
      this.initialized = true;
      return;
    }

    const from = this.initialized ? this.currentVal : 0;
    const isUpdate = this.initialized && from !== target;
    this.initialized = true;

    if (from === target) {
      this.displayed.set(target);
      return;
    }

    if (isUpdate) this.updating.set(true);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const next = from + (target - from) * eased;
      this.currentVal = next;
      this.displayed.set(next);
      if (t < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.currentVal = target;
        this.displayed.set(target);
        this.updating.set(false);
        this.rafId = 0;
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }
}
