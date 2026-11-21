import { Injectable, computed, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<AppTheme>('light');
  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');
  readonly sfTheme = computed(() => (this._theme() === 'dark' ? 'Tailwind3Dark' : 'Tailwind3'));
  /** สี track ของ ProgressBar ให้เข้ากับพื้นการ์ดทั้งโหมดสว่าง/มืด */
  readonly progressTrack = computed(() => (this._theme() === 'dark' ? '#1e293b' : '#e2e8f0'));
  readonly progressFill = computed(() => (this._theme() === 'dark' ? '#5f7ce3' : '#2e4fc8'));

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
      // ค่าเริ่มต้น: โหมดสว่าง
      this.applyTheme('light');
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

    if (mode === 'dark') {
      body.classList.add('e-dark-mode');
      body.classList.remove('e-light-mode');
      root.classList.add('e-dark-mode');
      root.classList.remove('e-light-mode');
      if (linkEl) {
        linkEl.href = 'assets/themes/tailwind3-dark.css';
      }
    } else {
      body.classList.remove('e-dark-mode');
      body.classList.add('e-light-mode');
      root.classList.remove('e-dark-mode');
      root.classList.add('e-light-mode');
      if (linkEl) {
        linkEl.href = 'assets/themes/tailwind3.css';
      }
    }
  }
}
