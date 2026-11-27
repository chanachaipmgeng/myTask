import { Injectable, computed, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

const SF_THEME_VERSION = '2.3.0';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<AppTheme>('dark');
  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');
  readonly sfTheme = computed(() => (this._theme() === 'dark' ? 'Tailwind3Dark' : 'Tailwind3'));
  /** สี track ของ ProgressBar ให้เข้ากับพื้นการ์ดทั้งโหมดสว่าง/มืด */
  readonly progressTrack = computed(() => (this._theme() === 'dark' ? 'rgba(148, 163, 184, 0.14)' : '#e2e8f0'));
  readonly progressFill = computed(() => (this._theme() === 'dark' ? '#6366f1' : '#2746b3'));

  constructor() {
    this.initTheme();
  }

  private initTheme(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const qTheme = urlParams?.get('theme') as AppTheme | null;
    const saved = (qTheme === 'light' || qTheme === 'dark') ? qTheme : (localStorage.getItem('md-theme') as AppTheme | null);
    if (saved === 'light' || saved === 'dark') {
      this.applyTheme(saved);
    } else {
      // ค่าเริ่มต้น: Obsidian Cosmic Dark Mode
      this.applyTheme('dark');
    }
  }

  toggleTheme(): void {
    const next = this._theme() === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
  }

  applyTheme(mode: AppTheme): void {
    this._theme.set(mode);
    if (typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.setItem('md-theme', mode);
    } catch {}

    const body = document.body;
    const root = document.documentElement;
    const linkEl = document.getElementById('sf-theme-link') as HTMLLinkElement | null;
    const targetHref =
      mode === 'dark'
        ? `assets/themes/tailwind3-dark.css?v=${SF_THEME_VERSION}`
        : `assets/themes/tailwind3.css?v=${SF_THEME_VERSION}`;

    root.classList.add('theme-switching');

    if (mode === 'dark') {
      body.classList.add('e-dark-mode');
      body.classList.remove('e-light-mode');
      root.classList.add('e-dark-mode');
      root.classList.remove('e-light-mode');
    } else {
      body.classList.remove('e-dark-mode');
      body.classList.add('e-light-mode');
      root.classList.remove('e-dark-mode');
      root.classList.add('e-light-mode');
    }

    const finishSwitch = () => {
      void root.offsetHeight;
      requestAnimationFrame(() => root.classList.remove('theme-switching'));
    };

    if (linkEl && !linkEl.getAttribute('href')?.endsWith(targetHref)) {
      linkEl.addEventListener('load', finishSwitch, { once: true });
      linkEl.href = targetHref;
      void root.offsetHeight;
      setTimeout(finishSwitch, 120);
    } else {
      finishSwitch();
    }
  }
}
