/**
 * แคปหน้าจอโหมดสว่างสำหรับคู่มือ
 * ต้องมีเว็บ + API และ AUTH_DEV_LOGIN เปิด
 * - Docker stack (แนะนำ): web :8080 · api :3000
 * - หรือ ng serve :4200 + API :3000
 *
 *   node scripts/capture_all_screens.mjs
 *   node scripts/capture_all_screens.mjs --from=22-admin.png
 *   node scripts/capture_all_screens.mjs --person=chanachai
 *   CAPTURE_BASE=http://127.0.0.1:8080 CAPTURE_API=http://127.0.0.1:3000 node scripts/capture_all_screens.mjs --person=chanachai
 *
 * ต้องมี playwright (ติดตั้งชั่วคราวได้: npm i -D --no-save playwright)
 *
 * หมายเหตุ: หลังล็อกอินใช้ SPA navigate (Angular Router) แทน page.goto
 * เพื่อคง session ในหน่วยความจำ — หลีกเลี่ยงเด้ง /login ตอนโหลดซ้ำ
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:8080';
const API = process.env.CAPTURE_API || 'http://127.0.0.1:3000';
/** โปรเจกต์ตัวอย่างสำหรับแคปศูนย์โปรเจกต์ — R&D Internal (ผูก mylive) */
const CAPTURE_PROJECT_ID = process.env.CAPTURE_PROJECT_ID || '171';
const CAPTURE_THEME = 'light';
const PERSON = (process.argv.find((a) => a.startsWith('--person=')) || '--person=chanachai').slice(
  '--person='.length,
);

const PERSON_LABEL = {
  paweena: 'ปวีณา',
  chanachai: 'ชนะชัย',
  nakarin: 'นครินทร์',
  watchara: 'วัชระ',
  itsara: 'อิสรภาพ',
};

const outputDir = resolve('docs/manual-screenshots');
const legacyDir = resolve('docs/manual_assets');

for (const dir of [outputDir, legacyDir]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function withTheme(url) {
  const u = new URL(url);
  u.searchParams.set('theme', CAPTURE_THEME);
  return u.toString();
}

/** route มาตรฐานปัจจุบัน — ชื่อไฟล์แนวคู่มือ (มุม admin · ชนะชัย) */
const screens = [
  { name: '01-login.png', url: `${BASE}/login`, wait: 1500, skipAuth: true },
  { name: '02-me.png', url: `${BASE}/me`, wait: 3500 },
  { name: '03-me-cockpit.png', url: `${BASE}/cockpit`, wait: 4500 },
  { name: '04-cockpit.png', url: `${BASE}/cockpit`, wait: 4500 },
  { name: '05-team.png', url: `${BASE}/team`, wait: 4500 },
  { name: '06-workspace-people.png', url: `${BASE}/workspace/people`, wait: 3500 },
  { name: '07-people.png', url: `${BASE}/people`, wait: 3500 },
  { name: '08-org-teams.png', url: `${BASE}/org/teams`, wait: 3500 },
  { name: '09-work-summary.png', url: `${BASE}/work/summary`, wait: 3500 },
  { name: '09b-work-backlog.png', url: `${BASE}/work/backlog`, wait: 3500 },
  { name: '10-work-board.png', url: `${BASE}/work/board`, wait: 4500 },
  { name: '11-work-timeline.png', url: `${BASE}/work/timeline`, wait: 4500 },
  {
    name: '11-person-detail.png',
    url: `${BASE}/workspace/people/${PERSON}`,
    wait: 4500,
  },
  { name: '12-work-list.png', url: `${BASE}/work/list`, wait: 3500 },
  {
    name: '12b-ticket-drawer.png',
    url: `${BASE}/work/list`,
    wait: 2500,
    action: 'open-ticket-drawer',
  },
  { name: '13-queue.png', url: `${BASE}/work/queue`, wait: 3500 },
  { name: '13b-work-handoff.png', url: `${BASE}/work/handoff`, wait: 4500 },
  { name: '13c-work-team-time.png', url: `${BASE}/work/team-time`, wait: 3500 },
  { name: '14-schedule.png', url: `${BASE}/schedule`, wait: 4500 },
  { name: '15-quality-audit.png', url: `${BASE}/quality/audit`, wait: 4500 },
  { name: '16-quality-tickets.png', url: `${BASE}/quality/tickets`, wait: 4500 },
  { name: '16b-quality-ols.png', url: `${BASE}/quality/ols`, wait: 3500 },
  { name: '17-quality-time-audit.png', url: `${BASE}/quality/time-audit`, wait: 3500 },
  { name: '18-quality-disputes.png', url: `${BASE}/quality/disputes`, wait: 3500 },
  { name: '19-insights-report.png', url: `${BASE}/quality/report`, wait: 4500 },
  { name: '20-insights-mygit.png', url: `${BASE}/mygit`, wait: 3500 },
  { name: '21-insights-ai.png', url: `${BASE}/quality/ai`, wait: 3500 },
  { name: '22-admin.png', url: `${BASE}/admin`, wait: 3500 },
  { name: '23-admin-rubrics.png', url: `${BASE}/admin/rubrics`, wait: 3500 },
  { name: '24-admin-snapshot-check.png', url: `${BASE}/admin/snapshot-check`, wait: 3500 },
  { name: '25-integrations.png', url: `${BASE}/integrations`, wait: 3500 },
  {
    name: '25b-integrations-sync-audit.png',
    url: `${BASE}/integrations`,
    wait: 2500,
    action: 'integrations-sync-audit',
  },
  { name: '26-teams.png', url: `${BASE}/teams`, wait: 3500 },
  { name: '27-admin-projects.png', url: `${BASE}/admin/projects`, wait: 4500 },
  { name: '28-project-detail-health.png', url: `${BASE}/org/projects/${CAPTURE_PROJECT_ID}`, wait: 4500 },
  { name: '28-project-detail-tickets.png', url: `${BASE}/org/projects/${CAPTURE_PROJECT_ID}?tab=tickets`, wait: 3500 },
  { name: '28-project-detail-git.png', url: `${BASE}/org/projects/${CAPTURE_PROJECT_ID}?tab=git`, wait: 3500 },
  { name: '29-quality-mockup.png', url: `${BASE}/quality/mockup`, wait: 3500 },
].map((s) => ({ ...s, url: withTheme(s.url) }));

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.log('Installing playwright (temporary, --no-save)...');
    const r = spawnSync('npm', ['i', '-D', '--no-save', 'playwright'], {
      cwd: resolve('.'),
      stdio: 'inherit',
      shell: true,
    });
    if (r.status !== 0) {
      throw new Error('ติดตั้ง playwright ไม่สำเร็จ — รัน: npm i -D playwright');
    }
    return require('playwright');
  }
}

function mirrorLegacy(name) {
  const src = join(outputDir, name);
  if (!existsSync(src)) return;
  const legacyName = name.replace(/-/g, '_');
  try {
    copyFileSync(src, join(legacyDir, legacyName));
  } catch {
    /* ignore */
  }
}

async function ensureLoggedIn(page) {
  const label = PERSON_LABEL[PERSON] || PERSON;
  await page.goto(withTheme(`${BASE}/login`), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);

  if (!page.url().includes('/login')) {
    console.log('✅ already authenticated →', page.url());
    return;
  }

  const chip = page.locator('button.login-chip', { hasText: label }).first();
  await chip.waitFor({ state: 'visible', timeout: 20000 });
  await chip.click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 });
  await page.waitForTimeout(2500);
  console.log('✅ Dev Quick Login as', PERSON, '→', page.url());
}

/**
 * Navigate หลังล็อกอิน — ลอง Angular Router (dev มี window.ng)
 * ถ้าเป็น production Docker (ไม่มี ng) ใช้ page.goto แทน (พึ่ง cookie session)
 */
async function spaNavigate(page, absoluteUrl) {
  const u = new URL(absoluteUrl);
  const segments = u.pathname.split('/').filter(Boolean);
  const queryParams = Object.fromEntries(u.searchParams.entries());
  const ok = await page.evaluate(
    async ({ segments: segs, queryParams: qp }) => {
      const ng = window.ng;
      const root = document.querySelector('app-root');
      if (!ng?.getComponent || !root) return { ok: false, reason: 'no ng' };
      const comp = ng.getComponent(root);
      if (!comp?.router?.navigate) return { ok: false, reason: 'no router' };
      try {
        const commands = ['/', ...segs];
        const nav = await comp.router.navigate(commands, { queryParams: qp });
        return { ok: true, nav, url: location.pathname };
      } catch (e) {
        return { ok: false, reason: String(e?.message || e) };
      }
    },
    { segments, queryParams },
  );
  if (ok?.ok) {
    await page.waitForTimeout(400);
    return;
  }
  await page.goto(absoluteUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(600);
}

async function runScreenAction(page, action) {
  if (!action) return;
  if (action === 'open-ticket-drawer') {
    const link = page.locator('button.e-link, a.e-link, .e-rowcell button').first();
    const gridLink = page.getByRole('button', { name: /OP-|ดู|รายละเอียด|#/ }).first();
    try {
      if (await gridLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await gridLink.click({ timeout: 5000 });
      } else if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await link.click({ timeout: 5000 });
      } else {
        // fallback: click first data row cell that looks like ticket id
        await page.locator('.e-row .e-rowcell').first().click({ timeout: 5000 });
      }
      await page.waitForTimeout(2500);
      await page.locator('#ticket-detail-drawer, .ticket-drawer').first().waitFor({
        state: 'visible',
        timeout: 8000,
      }).catch(() => null);
      await page.waitForTimeout(1500);
    } catch {
      console.log('(drawer open skipped)');
    }
    return;
  }
  if (action === 'integrations-sync-audit') {
    try {
      const btn = page.getByRole('button', { name: /ตรวจซิงก์|sync-audit|ตรวจซิงก์สด/i }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(4000);
      }
      const auditCard = page.locator('text=รายงานเทียบซิงก์').first();
      if (await auditCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        await auditCard.scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(1000);
    } catch {
      console.log('(sync-audit click skipped)');
    }
  }
}

async function run() {
  const fromArg = process.argv.find((a) => a.startsWith('--from='));
  const fromName = fromArg ? fromArg.slice('--from='.length) : '';
  let list = screens;
  if (fromName) {
    const idx = screens.findIndex((s) => s.name === fromName || s.name.startsWith(fromName));
    if (idx >= 0) list = screens.slice(idx);
    else console.warn(`--from=${fromName} not found; capturing all`);
  }

  console.log(`Capturing ${list.length}/${screens.length} → ${outputDir}`);
  console.log(`Theme=${CAPTURE_THEME} · person=${PERSON} · base=${BASE}`);

  const health = await fetch(`${API}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error('❌ API ไม่พร้อมที่', API);
    process.exit(1);
  }
  const web = await fetch(`${BASE}/`).catch(() => null);
  if (!web?.ok) {
    console.error('❌ เว็บไม่พร้อมที่', BASE);
    process.exit(1);
  }

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await ensureLoggedIn(page);

  for (const screen of list) {
    const dest = join(outputDir, screen.name);
    process.stdout.write(`Capturing ${screen.name} ... `);
    try {
      if (screen.skipAuth) {
        const bare = await browser.newContext({
          viewport: { width: 1600, height: 1050 },
        });
        const loginPage = await bare.newPage();
        await loginPage.goto(screen.url, { waitUntil: 'networkidle', timeout: 60000 });
        await loginPage.waitForTimeout(screen.wait);
        await loginPage.screenshot({ path: dest, fullPage: false });
        await bare.close();
      } else {
        await spaNavigate(page, screen.url);
        if (page.url().includes('/login')) {
          await ensureLoggedIn(page);
          await spaNavigate(page, screen.url);
        }
        await page.waitForTimeout(screen.wait);
        if (screen.action) {
          await runScreenAction(page, screen.action);
        }
        await page.screenshot({
          path: dest,
          fullPage: false,
          timeout: 120000,
          animations: 'disabled',
        });
      }
      const kb = (statSync(dest).size / 1024).toFixed(1);
      console.log(`✅ ${kb} KB · ${page.url().replace(BASE, '')}`);
      mirrorLegacy(screen.name);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
    }
  }

  await browser.close();
  console.log('🎉 All screen captures completed!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
