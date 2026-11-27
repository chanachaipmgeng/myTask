import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  OnInit,
  inject,
  input,
} from '@angular/core';

/**
 * Lightweight Framer/Linear-style mouse-follow radial spotlight for Bento cards.
 * Updates `--mx` and `--my` CSS custom properties outside Angular's zone via rAF
 * so there is zero Change Detection overhead and zero `:hover transform` (Syncfusion-safe).
 */
@Directive({
  selector: '[appBentoSpotlight]',
  standalone: true,
  host: {
    class: 'bento-spotlight-host',
  },
})
export class BentoSpotlightDirective implements OnInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional glow color override (CSS rgba/hex/var), e.g. 'rgba(139, 92, 246, 0.22)' */
  readonly spotlightColor = input<string | null>(null, { alias: 'appBentoSpotlight' });

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    const el = this.host.nativeElement;

    const color = this.spotlightColor();
    if (color && color.trim().length > 0) {
      el.style.setProperty('--spotlight-color', color.trim());
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let rafId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const flush = () => {
      rafId = null;
      el.style.setProperty('--mx', `${lastX}px`);
      el.style.setProperty('--my', `${lastY}px`);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const rect = el.getBoundingClientRect();
      lastX = Math.round(e.clientX - rect.left);
      lastY = Math.round(e.clientY - rect.top);
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    };

    const onEnter = () => {
      el.classList.add('is-spotlight-active');
    };

    const onLeave = () => {
      el.classList.remove('is-spotlight-active');
    };

    this.zone.runOutsideAngular(() => {
      el.addEventListener('pointermove', onMove, { passive: true });
      el.addEventListener('pointerenter', onEnter, { passive: true });
      el.addEventListener('pointerleave', onLeave, { passive: true });
    });

    this.destroyRef.onDestroy(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    });
  }
}
