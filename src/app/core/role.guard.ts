import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { effectiveRole } from './admin-settings';
import { AccessRole } from './models';
import { ScorecardService } from './scorecard.service';
import { currentSession } from './session';
import { ShellNotice } from './shell-notice';

export function requireRoles(...allowed: AccessRole[]): CanActivateFn {
  return () => {
    const scorecard = inject(ScorecardService);
    const notice = inject(ShellNotice);
    const router = inject(Router);

    if (scorecard.usingApi() && !currentSession()) {
      notice.show('กรุณาเข้าสู่ระบบก่อนเข้าหน้านี้');
      return router.createUrlTree(['/login']);
    }

    const role = effectiveRole();
    if (allowed.includes(role)) {
      return true;
    }
    notice.show(`สิทธิ์ปัจจุบัน (${role}) ไม่สามารถเข้าหน้านี้ได้ — ต้องใช้สิทธิ์ ${allowed.join(' หรือ ')}`);
    return router.createUrlTree([role === 'member' ? '/me' : '/team']);
  };
}
