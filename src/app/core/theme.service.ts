import { Injectable, computed, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<AppTheme>('dark');
  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');
  readonly sfTheme = computed(() => (this._theme() === 'dark' ? 'Tailwind3Dark' : 'Tailwind3'));

  constructor() {
    this.initTheme();
  }

  private initTheme(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const saved = localStorage.getItem('md-theme') as AppTheme | null;
    if (saved === 'light' || saved === 'dark') {
      this.applyTheme(saved);
    } else {
      // Default to dark mode
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
    const linkEl = document.getElementById('sf-theme-link') as HTMLLinkElement | null;

    if (mode === 'dark') {
      body.classList.add('e-dark-mode');
      body.classList.remove('e-light-mode');
      if (linkEl) {
        linkEl.href = 'assets/themes/tailwind3-dark.css';
      }
    } else {
      body.classList.remove('e-dark-mode');
      body.classList.add('e-light-mode');
      if (linkEl) {
        linkEl.href = 'assets/themes/tailwind3.css';
      }
    }
  }
}
