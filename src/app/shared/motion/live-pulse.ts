import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LivePulseTone = 'success' | 'primary' | 'warning' | 'danger' | 'info';

/**
 * Smooth pulsing live-status indicator dot with optional label.
 */
@Component({
  selector: 'app-live-pulse',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="live-pulse" [attr.data-tone]="tone()" [attr.data-size]="size()">
      <span class="live-pulse__dot" aria-hidden="true"></span>
      @if (label()) {
        <span class="live-pulse__label">{{ label() }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    .live-pulse {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
    }
    .live-pulse__dot {
      position: relative;
      width: 8px;
      height: 8px;
      border-radius: 9999px;
      background: var(--pulse-color, #10b981);
      flex: 0 0 auto;
    }
    .live-pulse[data-size='md'] .live-pulse__dot {
      width: 10px;
      height: 10px;
    }
    .live-pulse__dot::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 9999px;
      background: var(--pulse-color, #10b981);
      opacity: 0.45;
      animation: liveSonar 2.1s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .live-pulse[data-tone='primary'] { --pulse-color: var(--primary-bright, #3b60dc); }
    .live-pulse[data-tone='success'] { --pulse-color: #10b981; }
    .live-pulse[data-tone='warning'] { --pulse-color: #f59e0b; }
    .live-pulse[data-tone='danger']  { --pulse-color: #f43f5e; }
    .live-pulse[data-tone='info']    { --pulse-color: #38bdf8; }

    @keyframes liveSonar {
      0% { transform: scale(0.8); opacity: 0.55; }
      70% { transform: scale(2.1); opacity: 0; }
      100% { transform: scale(2.1); opacity: 0; }
    }
  `,
})
export class LivePulseComponent {
  readonly tone = input<LivePulseTone>('success');
  readonly size = input<'sm' | 'md'>('sm');
  readonly label = input<string>('');
}
