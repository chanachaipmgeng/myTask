import { Injectable } from '@angular/core';

/** ประเภท Toast ตาม Syncfusion predefined types */
export type ShellNoticeType = 'info' | 'success' | 'warning' | 'error';

export interface ShellNoticePayload {
  text: string;
  type?: ShellNoticeType;
  title?: string;
}

export type ShellNoticeHandler = (payload: ShellNoticePayload) => void;

@Injectable({ providedIn: 'root' })
export class ShellNotice {
  private handler: ShellNoticeHandler | null = null;

  bind(handler: ShellNoticeHandler): void {
    this.handler = handler;
  }

  /** แสดง toast — ค่าเริ่ม info (เข้ากับข้อความทั่วไป) */
  show(text: string, type: ShellNoticeType = 'info', title?: string): void {
    this.handler?.({ text, type, title });
  }

  info(text: string, title?: string): void {
    this.show(text, 'info', title);
  }

  success(text: string, title?: string): void {
    this.show(text, 'success', title);
  }

  warning(text: string, title?: string): void {
    this.show(text, 'warning', title);
  }

  error(text: string, title?: string): void {
    this.show(text, 'error', title);
  }
}

export function shellNoticeCssClass(type: ShellNoticeType = 'info'): string {
  switch (type) {
    case 'success':
      return 'e-toast-success';
    case 'warning':
      return 'e-toast-warning';
    case 'error':
      return 'e-toast-danger';
    default:
      return 'e-toast-info';
  }
}

export function shellNoticeTitle(type: ShellNoticeType = 'info', custom?: string): string {
  if (custom?.trim()) {
    return custom.trim();
  }
  switch (type) {
    case 'success':
      return 'สำเร็จ';
    case 'warning':
      return 'คำเตือน';
    case 'error':
      return 'ผิดพลาด';
    default:
      return 'ข้อมูล';
  }
}
