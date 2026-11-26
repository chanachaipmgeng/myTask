import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { actualRole, currentViewer, effectiveRole, setWorkspaceMode } from './admin-settings';
import { AccessRole } from './models';
import { ScorecardService } from './scorecard.service';
import { currentSession } from './session';
import { ShellNotice } from './shell-notice';

export function requireRoles(...allowed: AccessRole[]): CanActivateFn {
  return async (_route, state) => {
    const scorecard = inject(ScorecardService);
    const notice = inject(ShellNotice);
    const router = inject(Router);

    await scorecard.whenReady();

    if (!scorecard.mockMode()) {
      if (scorecard.bootstrapState() === 'error') {
        return false;
      }
      if (!currentSession()) {
        notice.warning('กรุณาเข้าสู่ระบบก่อนเข้าหน้านี้');
        return router.createUrlTree(['/login'], {
          queryParams: state?.url && state.url !== '/login' ? { returnUrl: state.url } : undefined,
        });
      }
    }

    const role = effectiveRole();
    if (allowed.includes(role)) {
      return true;
    }

    const trueRole = actualRole();
    if (allowed.includes(trueRole)) {
      const targetMode: AccessRole = allowed.includes('lead') && trueRole !== 'member' ? 'lead' : trueRole;
      setWorkspaceMode(targetMode);
      return true;
    }

    notice.warning(`สิทธิ์ปัจจุบัน (${trueRole}) ไม่สามารถเข้าหน้านี้ได้ — ต้องใช้สิทธิ์ ${allowed.join(' หรือ ')}`);
    return router.createUrlTree([trueRole === 'member' ? '/me' : '/team']);
  };
}

/** Lead/admin เปิดโปรไฟล์ใครก็ได้ · member เปิดได้เฉพาะของตัวเอง */
export function requireSelfOrManager(): CanActivateFn {
  return async (route, state) => {
    const scorecard = inject(ScorecardService);
    const notice = inject(ShellNotice);
    const router = inject(Router);

    await scorecard.whenReady();

    if (!scorecard.mockMode()) {
      if (scorecard.bootstrapState() === 'error') {
        return false;
      }
      if (!currentSession()) {
        notice.warning('กรุณาเข้าสู่ระบบก่อนเข้าหน้านี้');
        return router.createUrlTree(['/login'], {
          queryParams: state?.url && state.url !== '/login' ? { returnUrl: state.url } : undefined,
        });
      }
    }

    const role = effectiveRole();
    if (role === 'admin' || role === 'lead') {
      return true;
    }

    const personId = route.paramMap.get('personId') ?? '';
    const selfId = currentSession()?.person.id ?? currentViewer().id;
    if (personId && personId === selfId) {
      return true;
    }

    notice.warning('ดูโปรไฟล์ของผู้อื่นได้เฉพาะหัวหน้าหรือผู้ดูแลระบบ');
    return router.createUrlTree(['/me']);
  };
}
