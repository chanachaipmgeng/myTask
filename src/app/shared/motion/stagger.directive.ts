import {
  AfterViewInit,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/**
 * Automatically applies cascading `--stagger-delay` to direct children
 * for smooth Nordic Bento & list entrance animations.
 */
@Directive({
  selector: '[appStagger]',
  standalone: true,
})
export class StaggerDirective implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Step delay in ms between consecutive children */
  readonly staggerStep = input<number>(50);
  /** Max delay cap in ms so long lists stay snappy */
  readonly staggerMax = input<number>(350);

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    if (
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    host.classList.add('motion-stagger-host');
    const apply = () => {
      const step = Math.max(20, this.staggerStep());
      const cap = Math.max(step, this.staggerMax());
      const children = Array.from(host.children) as HTMLElement[];
      children.forEach((child, idx) => {
        const delay = Math.min(idx * step, cap);
        child.style.setProperty('--stagger-delay', `${delay}ms`);
        child.classList.add('motion-stagger-item');
      });
    };

    apply();

    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => apply());
      mo.observe(host, { childList: true });
      this.destroyRef.onDestroy(() => mo.disconnect());
    }
  }
}
