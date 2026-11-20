import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);

  readonly isMobile = signal(false);
  readonly isTablet = signal(false);
  readonly isDesktop = signal(true);
  readonly isNarrow = signal(false);
  readonly isSmallHeight = signal(false);

  readonly frozenColumns = computed(() => {
    if (this.isMobile()) return 0;
    if (this.isTablet()) return 1;
    return 2;
  });

  constructor() {
    if (typeof window === 'undefined') return;

    const mobileQuery = window.matchMedia('(max-width: 640px)');
    const tabletQuery = window.matchMedia('(min-width: 641px) and (max-width: 1024px)');
    const narrowQuery = window.matchMedia('(max-width: 800px)');
    const heightQuery = window.matchMedia('(max-height: 849px)');

    const update = () => {
      this.isMobile.set(mobileQuery.matches);
      this.isTablet.set(tabletQuery.matches);
      this.isDesktop.set(!mobileQuery.matches && !tabletQuery.matches);
      this.isNarrow.set(narrowQuery.matches);
      this.isSmallHeight.set(heightQuery.matches);
    };

    update();

    const handler = () => update();
    mobileQuery.addEventListener('change', handler);
    tabletQuery.addEventListener('change', handler);
    narrowQuery.addEventListener('change', handler);
    heightQuery.addEventListener('change', handler);

    this.destroyRef.onDestroy(() => {
      mobileQuery.removeEventListener('change', handler);
      tabletQuery.removeEventListener('change', handler);
      narrowQuery.removeEventListener('change', handler);
      heightQuery.removeEventListener('change', handler);
    });
  }
}
