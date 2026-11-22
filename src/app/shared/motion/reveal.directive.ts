import {
  AfterViewInit,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  Renderer2,
} from '@angular/core';

export type RevealVariant = 'fade-up' | 'fade-in' | 'scale-soft' | 'slide-left' | 'slide-right';

/**
 * GPU-accelerated entrance reveal using IntersectionObserver.
 * Respects `prefers-reduced-motion: reduce` and clears `transform` once settled
 * so it never interferes with Syncfusion popups or drag coordinates.
 */
@Directive({
  selector: '[appReveal]',
  standalone: true,
})
export class RevealDirective implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);

  readonly appReveal = input<RevealVariant | ''>('fade-up');
  readonly revealDelay = input<number>(0);
  readonly revealDuration = input<number>(360);

  ngAfterViewInit(): void {
    const node = this.el.nativeElement;
    if (
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const variant: RevealVariant = this.appReveal() || 'fade-up';
    const delay = Math.max(0, this.revealDelay());
    const duration = Math.max(120, this.revealDuration());

    this.renderer.addClass(node, 'motion-reveal');
    this.renderer.setAttribute(node, 'data-reveal', variant);
    this.renderer.setStyle(node, '--reveal-delay', `${delay}ms`);
    this.renderer.setStyle(node, '--reveal-dur', `${duration}ms`);

    const trigger = () => {
      this.renderer.addClass(node, 'is-revealed');
    };

    if (typeof IntersectionObserver === 'undefined') {
      requestAnimationFrame(trigger);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            trigger();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -20px 0px' },
    );

    observer.observe(node);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
