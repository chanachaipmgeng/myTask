import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
} from '@angular/core';

export interface AsideNavItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  badge?: string | number | null;
  badgeTone?: 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'secondary';
}

/**
 * Reusable Full-Viewport Workspace Asidebar layout.
 * Uses a single unified `<ng-content />` slot so Angular content projection always renders cleanly
 * in both `mode="right"` (Collapsible Right Context Asidebar) and `mode="left-nav"` (Sticky Left Sub-Nav).
 */
@Component({
  selector: 'app-workspace-asidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ws-aside"
      [class.ws-aside--left-nav]="mode() === 'left-nav'"
      [class.ws-aside--right]="mode() !== 'left-nav'"
      [class.is-locked]="lockViewport()"
      [class.is-collapsed]="mode() !== 'left-nav' && asideCollapsed()"
      [style.--ws-aside-w]="asideWidth()"
      [style.--ws-chrome-offset]="chromeOffset()"
    >
      @if (mode() === 'left-nav') {
        <aside class="ws-subnav" [attr.aria-label]="asideTitle() || 'หมวดย่อย'">
          @if (asideTitle()) {
            <div class="ws-subnav__head">
              <span class="ws-subnav__title">{{ asideTitle() }}</span>
              @if (asideSubtitle()) {
                <span class="ws-subnav__sub">{{ asideSubtitle() }}</span>
              }
            </div>
          }
          <nav class="ws-subnav__list" role="tablist">
            @for (item of navItems(); track item.id) {
              <button
                type="button"
                role="tab"
                class="ws-subnav__item"
                [class.is-active]="activeNavId() === item.id"
                [attr.aria-selected]="activeNavId() === item.id"
                (click)="selectNav(item.id)"
              >
                @if (item.icon) {
                  <span [class]="item.icon + ' ws-subnav__icon'" aria-hidden="true"></span>
                }
                <span class="ws-subnav__body">
                  <span class="ws-subnav__label">{{ item.label }}</span>
                  @if (item.description) {
                    <span class="ws-subnav__desc">{{ item.description }}</span>
                  }
                </span>
                @if (item.badge !== undefined && item.badge !== null && item.badge !== '') {
                  <span class="ws-subnav__badge" [attr.data-tone]="item.badgeTone || 'secondary'">
                    {{ item.badge }}
                  </span>
                }
              </button>
            }
          </nav>
          <div class="ws-subnav__extra">
            <ng-content select="[asideFooter]" />
          </div>
        </aside>
      }

      <div class="ws-aside__main ws-scroll">
        <ng-content select="[main]" />
        <ng-content />
      </div>

      @if (mode() !== 'left-nav') {
        @if (collapsible() && asideCollapsed()) {
          <button
            type="button"
            class="ws-aside__expand-tab"
            (click)="toggleAside()"
            [title]="'เปิดแผงด้านข้าง (' + (asideTitle() || 'ข้อมูลเสริม') + ') · Ctrl+.'"
            [attr.aria-label]="'เปิดแผงด้านข้าง ' + (asideTitle() || '')"
          >
            <span class="e-icons e-chevron-left" aria-hidden="true"></span>
            <span class="ws-aside__expand-label">{{ asideTitle() || 'แผงข้าง' }}</span>
          </button>
        }

        <aside
          class="ws-aside__panel"
          [class.is-collapsed]="asideCollapsed()"
          [attr.aria-label]="asideTitle() || 'แผงข้อมูลเสริม'"
          [attr.aria-hidden]="asideCollapsed()"
        >
          @if (asideTitle() || collapsible()) {
            <header class="ws-aside__panel-head">
              <div class="ws-aside__panel-titles">
                @if (asideTitle()) {
                  <h3 class="ws-aside__panel-title">{{ asideTitle() }}</h3>
                }
                @if (asideSubtitle()) {
                  <p class="ws-aside__panel-sub">{{ asideSubtitle() }}</p>
                }
              </div>
              <div class="ws-aside__panel-actions">
                <ng-content select="[asideActions]" />
                @if (collapsible()) {
                  <button
                    type="button"
                    class="ws-aside__toggle"
                    (click)="toggleAside()"
                    title="พับแผงด้านข้าง (Ctrl+.)"
                    aria-label="พับแผงด้านข้าง"
                  >
                    <span class="e-icons e-chevron-right" aria-hidden="true"></span>
                  </button>
                }
              </div>
            </header>
          }
          <div class="ws-aside__panel-body ws-scroll">
            <ng-content select="[aside]" />
          </div>
        </aside>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .ws-aside {
      position: relative;
      display: grid;
      gap: 14px;
      min-width: 0;
      align-items: stretch;
      transition: grid-template-columns 280ms var(--ease-panel, cubic-bezier(0.32, 0.72, 0, 1));
    }

    .ws-aside--right {
      grid-template-columns: minmax(0, 1fr) var(--ws-aside-w, 340px);

      &.is-collapsed {
        grid-template-columns: minmax(0, 1fr) 0px;
        gap: 0;
      }
    }

    .ws-aside--left-nav {
      grid-template-columns: var(--ws-aside-w, 224px) minmax(0, 1fr);
    }

    @media (min-width: 1200px) and (min-height: 720px) {
      .ws-aside.is-locked {
        height: calc(100vh - var(--ws-chrome-offset, 148px));
        max-height: calc(100vh - var(--ws-chrome-offset, 148px));
        overflow: hidden;
      }

      .ws-aside.is-locked .ws-aside__main,
      .ws-aside.is-locked .ws-aside__panel,
      .ws-aside.is-locked .ws-subnav {
        min-height: 0;
        height: 100%;
      }
    }

    .ws-aside__main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
    }

    .ws-aside__panel {
      min-width: 0;
      display: flex;
      flex-direction: column;
      border-radius: var(--radius-card, 18px);
      border: 1px solid var(--border-glass, var(--line));
      background: var(--surface-glass, var(--card));
      backdrop-filter: var(--blur-glass, blur(14px));
      -webkit-backdrop-filter: var(--blur-glass, blur(14px));
      box-shadow: var(--shadow-card);
      overflow: hidden;
      transition:
        opacity 220ms var(--ease-nordic, cubic-bezier(0.22, 1, 0.36, 1)),
        transform 280ms var(--ease-panel, cubic-bezier(0.32, 0.72, 0, 1));

      &.is-collapsed {
        opacity: 0;
        transform: translateX(16px);
        pointer-events: none;
        border-width: 0;
        box-shadow: none;
      }
    }

    .ws-aside__panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid var(--line);
      flex: none;
    }

    .ws-aside__panel-titles {
      min-width: 0;
    }

    .ws-aside__panel-title {
      margin: 0;
      font-size: 13.5px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ws-aside__panel-sub {
      margin: 2px 0 0;
      font-size: 11.5px;
      color: var(--muted);
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ws-aside__panel-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: none;
    }

    .ws-aside__toggle {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;

      &:hover {
        background: color-mix(in srgb, var(--primary, #2746b3) 12%, transparent);
        border-color: color-mix(in srgb, var(--primary, #2746b3) 35%, transparent);
        color: var(--ink);
      }
    }

    .ws-aside__panel-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 14px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ws-aside__expand-tab {
      position: fixed;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 40;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 11px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--primary, #2746b3) 38%, transparent);
      background: var(--surface-glass-strong, var(--card));
      backdrop-filter: blur(16px);
      color: var(--ink);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      box-shadow: var(--shadow-floating);
      cursor: pointer;
      animation: asideTabIn 220ms var(--ease-nordic, cubic-bezier(0.22, 1, 0.36, 1)) both;

      &:hover {
        border-color: var(--primary, #2746b3);
        color: var(--primary, #2746b3);
      }
    }

    @keyframes asideTabIn {
      from {
        opacity: 0;
        transform: translateY(-50%) translateX(10px);
      }
      to {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }
    }

    .ws-subnav {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 10px;
      border-radius: var(--radius-card, 18px);
      border: 1px solid var(--border-glass, var(--line));
      background: var(--surface-glass, var(--card));
      backdrop-filter: var(--blur-glass, blur(14px));
      box-shadow: var(--shadow-card);
      overflow-y: auto;
    }

    .ws-subnav__head {
      padding: 2px 10px 8px;
      border-bottom: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ws-subnav__title {
      font-size: 13px;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: -0.01em;
    }

    .ws-subnav__sub {
      font-size: 11px;
      color: var(--muted);
    }

    .ws-subnav__list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .ws-subnav__item {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 11px;
      border-radius: 12px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition:
        background-color 160ms ease,
        color 160ms ease,
        border-color 160ms ease;

      &:hover:not(.is-active) {
        background: color-mix(in srgb, var(--primary, #2746b3) 8%, transparent);
        color: var(--ink);
      }

      &.is-active {
        background: color-mix(in srgb, var(--primary, #2746b3) 14%, transparent);
        border-color: color-mix(in srgb, var(--primary, #2746b3) 34%, transparent);
        color: var(--ink);

        &::before {
          content: '';
          position: absolute;
          left: 3px;
          top: 22%;
          bottom: 22%;
          width: 3px;
          border-radius: 999px;
          background: var(--primary, #2746b3);
        }

        .ws-subnav__icon {
          color: var(--primary-bright, #3b60dc);
          opacity: 1;
        }

        .ws-subnav__label {
          font-weight: 700;
        }
      }
    }

    .ws-subnav__icon {
      width: 16px;
      font-size: 14px;
      opacity: 0.78;
      text-align: center;
      flex: none;
    }

    .ws-subnav__body {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .ws-subnav__label {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ws-subnav__desc {
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ws-subnav__badge {
      flex: none;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--muted, #94a3b8) 18%, transparent);
      color: var(--ink);
      font-variant-numeric: tabular-nums;

      &[data-tone='primary'] {
        background: color-mix(in srgb, #2746b3 18%, transparent);
        color: #60a5fa;
      }
      &[data-tone='warning'] {
        background: color-mix(in srgb, #f59e0b 18%, transparent);
        color: #f59e0b;
      }
      &[data-tone='success'] {
        background: color-mix(in srgb, #10b981 18%, transparent);
        color: #10b981;
      }
      &[data-tone='danger'] {
        background: color-mix(in srgb, #f43f5e 18%, transparent);
        color: #fb7185;
      }
    }

    :host-context(.e-light-mode) .ws-subnav__item.is-active {
      color: #2746b3;
      .ws-subnav__icon {
        color: #2746b3;
      }
      .ws-subnav__badge[data-tone='primary'] {
        color: #2746b3;
      }
    }

    .ws-scroll {
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--muted, #94a3b8) 35%, transparent) transparent;

      &::-webkit-scrollbar {
        width: 5px;
        height: 5px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--muted, #94a3b8) 35%, transparent);
        border-radius: 999px;
      }
    }

    @media (max-width: 1199px) {
      .ws-aside--right,
      .ws-aside--left-nav {
        grid-template-columns: minmax(0, 1fr) !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      .ws-aside__main,
      .ws-aside__panel,
      .ws-aside__panel-body {
        overflow: visible !important;
        height: auto !important;
      }

      .ws-aside__panel.is-collapsed {
        display: none;
      }

      .ws-aside__expand-tab {
        position: static;
        transform: none;
        align-self: flex-end;
      }

      .ws-subnav__list {
        flex-direction: row;
        overflow-x: auto;
        padding-bottom: 2px;
      }

      .ws-subnav__item {
        width: auto;
        flex: none;
      }

      .ws-subnav__desc {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ws-aside,
      .ws-aside__panel,
      .ws-aside__expand-tab {
        transition: none !important;
        animation: none !important;
      }
    }
  `,
})
export class WorkspaceAsidebarComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input<'right' | 'left-nav'>('right');
  readonly asideTitle = input<string>('');
  readonly asideSubtitle = input<string>('');
  readonly asideWidth = input<string>('340px');
  readonly chromeOffset = input<string>('148px');
  readonly lockViewport = input<boolean>(true);
  readonly collapsible = input<boolean>(true);
  readonly shortcut = input<boolean>(true);

  readonly asideCollapsed = model<boolean>(false);

  readonly navItems = input<AsideNavItem[]>([]);
  readonly activeNavId = input<string>('');
  readonly activeNavChange = output<string>();

  constructor() {
    effect(() => {
      if (this.mode() !== 'right' || !this.collapsible() || !this.shortcut()) {
        return;
      }
      if (typeof window === 'undefined') return;
      const onKey = (ev: KeyboardEvent) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === '.') {
          const tag = (ev.target as HTMLElement | null)?.tagName?.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || (ev.target as HTMLElement | null)?.isContentEditable) {
            return;
          }
          ev.preventDefault();
          this.toggleAside();
        }
      };
      window.addEventListener('keydown', onKey);
      this.destroyRef.onDestroy(() => window.removeEventListener('keydown', onKey));
    });
  }

  protected toggleAside(): void {
    this.asideCollapsed.update((v) => !v);
  }

  protected selectNav(id: string): void {
    this.activeNavChange.emit(id);
  }
}
