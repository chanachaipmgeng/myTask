import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShellNotice {
  private handler: ((text: string) => void) | null = null;

  bind(handler: (text: string) => void): void {
    this.handler = handler;
  }

  show(text: string): void {
    this.handler?.(text);
  }
}
