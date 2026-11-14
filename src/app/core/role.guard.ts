import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { effectiveRole } from './admin-settings';
import { AccessRole } from './models';
import { ShellNotice } from './shell-notice';

export function requireRoles(...allowed: AccessRole[]): CanActivateFn {
  return () => {
    const role = effectiveRole();
    if (allowed.includes(role)) {
      return true;
    }
    const notice = inject(ShellNotice);
    const router = inject(Router);
    notice.show(`สิทธิ์ปัจจุบัน (${role}) ไม่สามารถเข้าหน้านี้ได้ — ต้องใช้สิทธิ์ ${allowed.join(' หรือ ')}`);
    return router.createUrlTree([role === 'member' ? '/me' : '/team']);
  };
}
