import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

export type MotionVariant = 'fade-up' | 'scale-glass' | 'slide-in' | 'cascade' | 'none';
export type MotionGlowTone = 'none' | 'primary' | 'good' | 'warning' | 'danger' | 'ai';

export interface MotionWrapperOptions {
  variant?: MotionVariant;
  delay?: number;
  duration?: number;
  stagger?: boolean;
  staggerStep?: number;
  glowTone?: MotionGlowTone;
  interactive?: boolean;
  disabled?: boolean;
}

export type MotionInput = MotionWrapperOptions | MotionVariant | boolean | null | undefined;

export function resolveMotionOptions(
  raw: MotionInput,
  defaultVariant: MotionVariant = 'fade-up',
): Required<MotionWrapperOptions> {
  if (raw === false || raw === 'none') {
    return {
      variant: 'none',
      delay: 0,
      duration: 0,
      stagger: false,
      staggerStep: 45,
      glowTone: 'none',
      interactive: false,
      disabled: true,
    };
  }
  if (raw === true || raw == null) {
    return {
      variant: defaultVariant,
      delay: 0,
      duration: 320,
      stagger: defaultVariant === 'cascade',
      staggerStep: 45,
      glowTone: 'none',
      interactive: false,
      disabled: false,
    };
  }
  if (typeof raw === 'string') {
    return {
      variant: raw,
      delay: 0,
      duration: 320,
      stagger: raw === 'cascade',
      staggerStep: 45,
      glowTone: 'none',
      interactive: false,
      disabled: false,
    };
  }
  const variant = raw.disabled ? 'none' : (raw.variant ?? defaultVariant);
  return {
    variant,
    delay: Math.max(0, raw.delay ?? 0),
    duration: Math.max(120, raw.duration ?? 320),
    stagger: raw.stagger ?? variant === 'cascade',
    staggerStep: Math.max(20, raw.staggerStep ?? 45),
    glowTone: raw.glowTone ?? 'none',
    interactive: raw.interactive ?? false,
    disabled: Boolean(raw.disabled || variant === 'none'),
  };
}

/**
 * Central Motion Wrapper for Syncfusion & Shared UI Component Wrappers.
 *
 * Features:
 * 1. Viewport-triggered entrance (`fade-up`, `scale-glass`, `slide-in`, `cascade`)
 * 2. Zero-Transform Settlement (`.is-settled`) immediately after entrance so
 *    Syncfusion Frozen Columns, Kanban Drag-and-Drop, Gantt, and Popups have 0 coordinate offset.
 * 3. Reactive Data-Refresh Shimmer Pulse (`[refreshKey]`) whenever filters, tabs, or metrics update.
 * 4. Optional semantic top-border sheen & ambient glow (`[glowTone]`).
 */
@Component({
  selector: 'app-motion-wrapper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #wrapEl
      class="motion-wrap"
      [attr.data-motion-variant]="resolved().variant"
      [attr.data-motion-glow]="resolvedGlow()"
      [class.is-revealed]="revealed()"
      [class.is-settled]="settled()"
      [class.is-refreshing]="refreshing()"
      [class.is-interactive]="resolved().interactive"
      [class.is-loading]="loading()"
      [style.--mw-delay.ms]="resolved().delay"
      [style.--mw-dur.ms]="resolved().duration"
      (animationend)="onAnimationEnd($event)"
    >
      @if (loading()) {
        <div class="motion-wrap__shimmer-bar" aria-hidden="true"></div>
      }
      <ng-content></ng-content>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `,
})
export class MotionWrapperComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('wrapEl') private wrapEl?: ElementRef<HTMLElement>;

  /** Unified motion options object, variant string, or boolean */
  readonly config = input<MotionInput>(undefined);
  /** Explicit default variant when config is not provided */
  readonly variant = input<MotionVariant>('fade-up');
  readonly delay = input<number | undefined>(undefined);
  readonly duration = input<number | undefined>(undefined);
  readonly stagger = input<boolean | undefined>(undefined);
  readonly staggerStep = input<number | undefined>(undefined);
  readonly glowTone = input<MotionGlowTone | undefined>(undefined);
  readonly interactive = input<boolean | undefined>(undefined);
  readonly disabled = input<boolean | undefined>(undefined);
  /** Reactive key (e.g. filter hash, row count, KPI value, active step) that triggers a crisp shimmer pulse on change */
  readonly refreshKey = input<unknown>(undefined);
  /** Shows a subtle top shimmer bar when async data is refreshing */
  readonly loading = input<boolean>(false);

  protected readonly revealed = signal(false);
  protected readonly settled = signal(false);
  protected readonly refreshing = signal(false);

  private initialized = false;
  private lastRefreshKey: unknown = undefined;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private settleTimer?: ReturnType<typeof setTimeout>;

  protected readonly resolved = computed<Required<MotionWrapperOptions>>(() => {
    const base = resolveMotionOptions(this.config(), this.variant());
    return {
      variant: this.disabled() ? 'none' : base.variant,
      delay: this.delay() ?? base.delay,
      duration: this.duration() ?? base.duration,
      stagger: this.stagger() ?? base.stagger,
      staggerStep: this.staggerStep() ?? base.staggerStep,
      glowTone: this.glowTone() ?? base.glowTone,
      interactive: this.interactive() ?? base.interactive,
      disabled: this.disabled() ?? base.disabled,
    };
  });

  protected readonly resolvedGlow = computed<MotionGlowTone>(() => this.resolved().glowTone);

  constructor() {
    effect(() => {
      const key = this.refreshKey();
      if (!this.initialized) {
        this.lastRefreshKey = key;
        return;
      }
      if (key !== undefined && key !== this.lastRefreshKey) {
        this.lastRefreshKey = key;
        this.triggerRefreshPulse();
      }
    });
  }

  ngAfterViewInit(): void {
    this.initialized = true;
    const cfg = this.resolved();
    const reducedMotion =
      typeof window === 'undefined' ||
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    if (cfg.disabled || reducedMotion || cfg.variant === 'none') {
      this.revealed.set(true);
      this.settled.set(true);
      return;
    }

    const node = this.wrapEl?.nativeElement;
    if (!node) {
      this.revealed.set(true);
      this.settled.set(true);
      return;
    }

    if (cfg.stagger) {
      this.applyStagger(node, cfg.staggerStep);
    }

    const startReveal = () => {
      if (this.revealed()) return;
      this.revealed.set(true);
      const totalMs = cfg.delay + cfg.duration + 60;
      this.settleTimer = setTimeout(() => {
        this.settled.set(true);
      }, totalMs);
    };

    if (typeof IntersectionObserver === 'undefined') {
      requestAnimationFrame(startReveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            startReveal();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.01, rootMargin: '120px 0px 120px 0px' },
    );

    observer.observe(node);

    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      if (this.settleTimer) clearTimeout(this.settleTimer);
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
    });
  }

  protected onAnimationEnd(event: AnimationEvent): void {
    if (event.target === this.wrapEl?.nativeElement && this.revealed() && !this.settled()) {
      this.settled.set(true);
      if (this.settleTimer) clearTimeout(this.settleTimer);
    }
  }

  private triggerRefreshPulse(): void {
    if (this.resolved().disabled) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshing.set(false);
    requestAnimationFrame(() => {
      this.refreshing.set(true);
      this.refreshTimer = setTimeout(() => {
        this.refreshing.set(false);
      }, 280);
    });
  }

  private applyStagger(host: HTMLElement, step: number): void {
    const decorate = () => {
      const children = Array.from(host.children).filter(
        (el) => !el.classList.contains('motion-wrap__shimmer-bar'),
      ) as HTMLElement[];
      children.forEach((child, idx) => {
        const delay = Math.min(idx * step, 320);
        child.style.setProperty('--stagger-delay', `${delay}ms`);
        child.classList.add('motion-stagger-item');
      });
    };
    decorate();
    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => decorate());
      mo.observe(host, { childList: true });
      this.destroyRef.onDestroy(() => mo.disconnect());
    }
  }
}
