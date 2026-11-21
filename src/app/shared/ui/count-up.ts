import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  inject,
} from '@angular/core';

export type CountUpParts = {
  prefix: string;
  value: number;
  decimals: number;
  suffix: string;
  useGrouping: boolean;
};

const NUM_RE = /^-?\d[\d,]*(?:\.\d+)?/;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Parse display strings like 88.7, 92.8%, 1,319, 8 MD into countable parts. */
export function parseCountUpTarget(raw: string | number): CountUpParts | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const decimals = Number.isInteger(raw) ? 0 : Math.min(2, `${raw}`.split('.')[1]?.length ?? 0);
    return { prefix: '', value: raw, decimals, suffix: '', useGrouping: false };
  }

  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }

  const match = text.match(NUM_RE);
  if (!match) {
    return null;
  }

  const token = match[0];
  const prefix = text.slice(0, match.index ?? 0);
  const suffix = text.slice((match.index ?? 0) + token.length);
  const useGrouping = token.includes(',');
  const decimals = token.includes('.') ? (token.split('.')[1]?.length ?? 0) : 0;
  const value = Number(token.replace(/,/g, ''));
  if (!Number.isFinite(value)) {
    return null;
  }

  return { prefix, value, decimals, suffix, useGrouping };
}

export function formatCountUpValue(parts: CountUpParts, current: number): string {
  const abs = Math.abs(current);
  let body: string;
  if (parts.useGrouping) {
    body = abs.toLocaleString('en-US', {
      minimumFractionDigits: parts.decimals,
      maximumFractionDigits: parts.decimals,
    });
  } else {
    body = abs.toFixed(parts.decimals);
  }
  const signed = current < 0 ? `-${body}` : body;
  return `${parts.prefix}${signed}${parts.suffix}`;
}

export type CountUpOptions = {
  durationMs?: number;
  delayMs?: number;
  onFrame: (text: string) => void;
};

/** Ease-out cubic over duration; returns a cancel function. */
export function runCountUp(
  target: string | number,
  options: CountUpOptions,
): () => void {
  const parts = parseCountUpTarget(target);
  const finalText = String(target ?? '');
  if (!parts || prefersReducedMotion()) {
    options.onFrame(finalText);
    return () => undefined;
  }

  const duration = Math.max(200, options.durationMs ?? 720);
  const delay = Math.max(0, options.delayMs ?? 0);
  let raf = 0;
  let timer = 0;
  let start = 0;

  const tick = (now: number) => {
    if (!start) {
      start = now;
    }
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = parts.value * eased;
    options.onFrame(formatCountUpValue(parts, current));
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      options.onFrame(finalText);
    }
  };

  options.onFrame(formatCountUpValue(parts, 0));
  timer = window.setTimeout(() => {
    raf = requestAnimationFrame(tick);
  }, delay);

  return () => {
    window.clearTimeout(timer);
    if (raf) {
      cancelAnimationFrame(raf);
    }
  };
}

@Directive({
  selector: '[appCountUp]',
  standalone: true,
})
export class CountUpDirective implements OnInit, OnChanges, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private cancel: (() => void) | null = null;
  private started = false;

  @Input('appCountUp') value: string | number = '';
  @Input() countUpDelay = 0;
  @Input() countUpDuration = 720;

  ngOnInit(): void {
    this.restart();
    this.started = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.started) {
      return;
    }
    if (changes['value'] || changes['countUpDelay'] || changes['countUpDuration']) {
      this.restart();
    }
  }

  ngOnDestroy(): void {
    this.cancel?.();
  }

  private restart(): void {
    this.cancel?.();
    const el = this.host.nativeElement;
    this.cancel = runCountUp(this.value, {
      delayMs: this.countUpDelay,
      durationMs: this.countUpDuration,
      onFrame: (text) => {
        el.textContent = text;
      },
    });
  }
}
