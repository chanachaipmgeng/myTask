import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { actualRole, currentViewer, effectiveRole, setWorkspaceMode } from './admin-settings';
import { AccessRole } from './models';
import { ScorecardService } from './scorecard.service';
import { currentSession } from './session';
import { ShellNotice } from './shell-notice';

/**
 * รอ bootstrap ให้จบก่อนเช็ก session
 * หมายเหตุ: อย่าใช้ usingApi()/apiOnline เป็นเงื่อนไขรอ — ค่าเริ่มเป็น false จนกว่า bootstrap จะสำเร็จ
 * ทำให้เการถูกข้ามแล้วเด้ง /login หลังโหลดซ้ำทั้งที่มี cookie
 */
async function waitForApiReady(scorecard: ScorecardService, timeoutMs = 20000): Promise<void> {
  if (scorecard.apiReady()) {
    return;
  }
  const start = Date.now();
  while (!scorecard.apiReady() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 40));
  }
}

export function requireRoles(...allowed: AccessRole[]): CanActivateFn {
  return async () => {
    const scorecard = inject(ScorecardService);
    const notice = inject(ShellNotice);
    const router = inject(Router);

    await waitForApiReady(scorecard);

    // API ออนไลน์แล้วต้องมี session — โหมดออฟไลน์/ม็อกใช้ sample viewer ได้
    if (scorecard.usingApi() && !currentSession()) {
      notice.warning('กรุณาเข้าสู่ระบบก่อนเข้าหน้านี้');
      return router.createUrlTree(['/login']);
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
  return async (route) => {
    const scorecard = inject(ScorecardService);
    const notice = inject(ShellNotice);
    const router = inject(Router);

    await waitForApiReady(scorecard);

    if (scorecard.usingApi() && !currentSession()) {
      notice.warning('กรุณาเข้าสู่ระบบก่อนเข้าหน้านี้');
      return router.createUrlTree(['/login']);
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
