import { AccessRole } from './models';

export type NavLeaf = {
  id: string;
  text: string;
  iconCss: string;
  route: string;
  exact?: boolean;
  roles?: readonly AccessRole[];
  searchHidden?: boolean;
};

export type NavGroup = {
  id: string;
  text: string;
  expanded: boolean;
  roles?: readonly AccessRole[];
  children: NavLeaf[];
};

export type SidebarNavItem = {
  id: string;
  text: string;
  iconCss: string;
  route: string;
  exact?: boolean;
};

export type SidebarSection = {
  id: string;
  label: string;
  items: SidebarNavItem[];
};

export type ContextualTab = {
  text: string;
  route: string;
  icon: string;
  active: boolean;
};

/** Unified Single-Menu System:
 * 1) SHARED_WORKSPACE_SECTION — เมนูหลักชุดเดียวกันสำหรับทุกคน (Member / Lead / Admin ไม่ซ้ำซ้อน)
 * 2) MANAGER_SIDEBAR_SECTION — เมนูบริหารทีม เพิ่มเฉพาะ Lead / Admin
 * 3) ADMIN_SIDEBAR_SECTION — ตั้งค่าระบบ เพิ่มเฉพาะ Admin
 */
export const SHARED_WORKSPACE_SECTION: SidebarSection = {
  id: 'sec-workspace',
  label: 'เมนูหลัก',
  items: [
    { id: 'hub-home', text: 'งานของฉัน', iconCss: 'e-icons e-user', route: '/me', exact: true },
    { id: 'hub-cockpit', text: 'ภาพรวมงาน', iconCss: 'e-icons e-grid-view', route: '/cockpit' },
    { id: 'hub-team', text: 'ทีมของฉัน', iconCss: 'e-icons e-people', route: '/team' },
    { id: 'hub-work', text: 'งานทีม', iconCss: 'e-icons e-timeline-work-week', route: '/work' },
    { id: 'hub-git', text: 'Git & MR', iconCss: 'e-icons e-refresh', route: '/mygit' },
    { id: 'hub-schedule', text: 'ปฏิทิน & วันลา', iconCss: 'e-icons e-timeline-today', route: '/schedule' },
    { id: 'hub-quality', text: 'คะแนน & วิเคราะห์', iconCss: 'e-icons e-chart', route: '/quality' },
  ],
};

export const MANAGER_SIDEBAR_SECTION: SidebarSection = {
  id: 'sec-team',
  label: 'บริหารทีม',
  items: [
    { id: 'hub-people', text: 'คนในทีม', iconCss: 'e-icons e-people', route: '/workspace/people' },
  ],
};

export const ADMIN_SIDEBAR_SECTION: SidebarSection = {
  id: 'sec-admin',
  label: 'ตั้งค่าระบบ',
  items: [
    { id: 'hub-admin', text: 'สิทธิ์ & ตั้งค่า', iconCss: 'e-icons e-lock', route: '/admin', exact: true },
    { id: 'hub-admin-people', text: 'พนักงาน & ทีม', iconCss: 'e-icons e-people', route: '/workspace/people' },
    { id: 'hub-projects', text: 'จัดการโปรเจกต์', iconCss: 'e-icons e-folder', route: '/admin/projects' },
    { id: 'hub-rubrics', text: 'เกณฑ์คะแนน', iconCss: 'e-icons e-bookmark', route: '/admin/rubrics' },
    { id: 'hub-snapshot', text: 'ตรวจก่อนล็อกคะแนน', iconCss: 'e-icons e-check-box', route: '/admin/snapshot-check' },
    { id: 'hub-integrations', text: 'เชื่อมต่อ & Teams', iconCss: 'e-icons e-settings', route: '/integrations' },
  ],
};

export function isManagerOrAdminOnlyPath(path: string): boolean {
  return (
    path.startsWith('/org/teams') ||
    path.startsWith('/workspace') ||
    path === '/people' ||
    path.startsWith('/queue') ||
    path.startsWith('/work/queue') ||
    path.startsWith('/work/handoff') ||
    path.startsWith('/quality/audit') ||
    path.startsWith('/quality/report') ||
    path.startsWith('/quality/mockup') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path.startsWith('/integrations') ||
    path === '/teams'
  );
}

export function memberFallbackPathFor(path: string): string | null {
  if (path.startsWith('/work/handoff') || path.startsWith('/work/queue')) return '/work/board';
  if (path.startsWith('/quality/audit') || path.startsWith('/quality/report') || path.startsWith('/quality/mockup')) {
    return '/quality/tickets';
  }
  if (isManagerOrAdminOnlyPath(path)) return '/cockpit';
  return null;
}

export function buildContextualTabs(url: string, role: AccessRole): ContextualTab[] {
  const [rawPath, rawQuery] = url.split('?');
  const path = (rawPath || '/').replace(/\/$/, '') || '/';
  const queryParams = new URLSearchParams(rawQuery || '');
  const scope = queryParams.get('scope');

  // 1. Team Space tabs ("ทีมของฉัน")
  // Shows when viewing /team, /team/time, /team/schedule, /work/team-time, or /schedule?scope=team
  if (
    path === '/team' ||
    path.startsWith('/team/') ||
    path === '/work/team-time' ||
    (path === '/schedule' && scope === 'team')
  ) {
    return [
      {
        text: 'แดชบอร์ดภาพรวมทีม',
        route: '/team',
        icon: 'e-icons e-home',
        active: path === '/team',
      },
      {
        text: 'เวลาทีม',
        route: '/team/time',
        icon: 'e-icons e-day',
        active: path === '/team/time' || path === '/work/team-time',
      },
      {
        text: 'ปฏิทินทีม & วันลา',
        route: '/team/schedule',
        icon: 'e-icons e-timeline-today',
        active: path === '/team/schedule' || (path === '/schedule' && scope === 'team'),
      },
    ];
  }

  // 2. Personal Schedule (/schedule) -> Calendar is strictly ours! No extra tabs.
  if (path === '/schedule' && scope !== 'team') {
    return [];
  }

  // 3. Admin & Organization Zone
  if (
    role === 'admin' &&
    (path === '/admin' ||
      path === '/org/teams' ||
      path.startsWith('/org/teams/') ||
      path === '/workspace/people' ||
      path.startsWith('/workspace/people/') ||
      path === '/people')
  ) {
    return [
      { text: 'สิทธิ์ & ตั้งค่า', route: '/admin', icon: 'e-icons e-lock', active: path === '/admin' },
      {
        text: 'พนักงาน & ทีม',
        route: '/workspace/people',
        icon: 'e-icons e-people',
        active:
          path === '/workspace/people' ||
          path.startsWith('/workspace/people/') ||
          path === '/org/teams' ||
          path.startsWith('/org/teams/'),
      },
      { text: 'ตารางพนักงาน', route: '/people', icon: 'e-icons e-table', active: path === '/people' },
    ];
  }

  // Lead viewing team people
  if (
    role === 'lead' &&
    (path === '/workspace/people' || path.startsWith('/workspace/people/') || path === '/people')
  ) {
    return [
      {
        text: 'คนในทีม',
        route: '/workspace/people',
        icon: 'e-icons e-people',
        active: path === '/workspace/people' || path.startsWith('/workspace/people/'),
      },
      { text: 'ตารางพนักงาน', route: '/people', icon: 'e-icons e-table', active: path === '/people' },
    ];
  }

  // 4. Admin Projects
  if (role === 'admin' && (path === '/admin/projects' || path.startsWith('/org/projects'))) {
    return [
      { text: 'จัดการโปรเจกต์', route: '/admin/projects', icon: 'e-icons e-folder', active: path === '/admin/projects' },
      { text: 'รายละเอียด & CI/CD', route: '/org/projects/331', icon: 'e-icons e-chart', active: path.startsWith('/org/projects') },
    ];
  }

  // 5. Admin Rubrics & Snapshot check
  if (role === 'admin' && (path.startsWith('/admin/rubrics') || path.startsWith('/admin/snapshot-check'))) {
    return [
      { text: 'เกณฑ์คะแนน', route: '/admin/rubrics', icon: 'e-icons e-bookmark', active: path.startsWith('/admin/rubrics') },
      { text: 'ตรวจก่อนล็อกคะแนน', route: '/admin/snapshot-check', icon: 'e-icons e-check-box', active: path.startsWith('/admin/snapshot-check') },
    ];
  }

  // 6. Integrations & Teams
  if (role === 'admin' && (path === '/integrations' || path === '/teams')) {
    return [
      { text: 'เชื่อมต่อระบบ & Auto-SLA', route: '/integrations', icon: 'e-icons e-settings', active: path === '/integrations' },
      { text: 'แจ้งเตือน Teams', route: '/teams', icon: 'e-icons e-comment-show', active: path === '/teams' },
    ];
  }

  return [];
}

export const allNavGroups: NavGroup[] = [
  {
    id: 'shared-workspace',
    text: 'เมนูหลัก',
    expanded: true,
    roles: ['member', 'lead', 'admin'],
    children: [
      { id: 'hub-home', text: 'งานของฉัน', iconCss: 'e-icons e-user', route: '/me', exact: true },
      { id: 'hub-cockpit', text: 'ภาพรวมงาน', iconCss: 'e-icons e-grid-view', route: '/cockpit' },
      { id: 'hub-team', text: 'ทีมของฉัน', iconCss: 'e-icons e-people', route: '/team' },
      { id: 'hub-work', text: 'งานทีม', iconCss: 'e-icons e-timeline-work-week', route: '/work' },
      { id: 'work-board', text: 'บอร์ดงาน', iconCss: 'e-icons e-columns', route: '/work/board' },
      { id: 'work-timeline', text: 'ไทม์ไลน์', iconCss: 'e-icons e-timeline-work-week', route: '/work/timeline' },
      { id: 'work-time', text: 'ลงเวลารายวัน', iconCss: 'e-icons e-day', route: '/work/team-time' },
      { id: 'hub-schedule', text: 'ปฏิทิน & วันลา', iconCss: 'e-icons e-timeline-today', route: '/schedule' },
      { id: 'quality-tickets', text: 'ตารางคะแนนใบงาน', iconCss: 'e-icons e-table', route: '/quality/tickets' },
      { id: 'quality-ols', text: 'วิเคราะห์รายคน', iconCss: 'e-icons e-chart', route: '/quality/ols' },
      { id: 'quality-time-audit', text: 'เช็กเวลา 3 ทาง', iconCss: 'e-icons e-clock', route: '/quality/time-audit' },
      { id: 'quality-disputes', text: 'ขอทบทวนคะแนน', iconCss: 'e-icons e-edit', route: '/quality/disputes' },
      { id: 'quality-ai', text: 'งาน AI & Spike', iconCss: 'e-icons e-chart', route: '/quality/ai' },
      { id: 'hub-git', text: 'Git & MR', iconCss: 'e-icons e-refresh', route: '/mygit' },
    ],
  },
  {
    id: 'team-management',
    text: 'บริหารทีม (Lead)',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'hub-people', text: 'คนในทีม', iconCss: 'e-icons e-people', route: '/workspace/people' },
      { id: 'people', text: 'ตารางพนักงาน', iconCss: 'e-icons e-table', route: '/people', exact: true },
      { id: 'team-dash', text: 'แดชบอร์ดทีม', iconCss: 'e-icons e-home', route: '/team' },
      { id: 'hub-queue', text: 'คิวจ่ายงาน', iconCss: 'e-icons e-list-unordered', route: '/work/queue' },
      { id: 'work-handoff', text: 'งานค้าง & SLA', iconCss: 'e-icons e-clock', route: '/work/handoff' },
      { id: 'quality-audit', text: 'ตรวจคุณภาพ QA', iconCss: 'e-icons e-check-box', route: '/quality/audit' },
      { id: 'insights-report', text: 'วิเคราะห์ทีม', iconCss: 'e-icons e-chart', route: '/quality/report' },
      { id: 'insights-mockup', text: 'โหมดจำลอง', iconCss: 'e-icons e-play', route: '/quality/mockup' },
    ],
  },
  {
    id: 'admin-ops',
    text: 'งานทีมขั้นสูง (Admin)',
    expanded: true,
    roles: ['admin'],
    children: [
      { id: 'people', text: 'ตารางพนักงาน', iconCss: 'e-icons e-table', route: '/people', exact: true },
      { id: 'hub-queue', text: 'คิวจ่ายงาน', iconCss: 'e-icons e-list-unordered', route: '/work/queue' },
      { id: 'work-handoff', text: 'งานค้าง & SLA', iconCss: 'e-icons e-clock', route: '/work/handoff' },
      { id: 'quality-audit', text: 'ตรวจคุณภาพ QA', iconCss: 'e-icons e-check-box', route: '/quality/audit' },
      { id: 'insights-report', text: 'วิเคราะห์ทีม', iconCss: 'e-icons e-chart', route: '/quality/report' },
      { id: 'insights-mockup', text: 'โหมดจำลอง', iconCss: 'e-icons e-play', route: '/quality/mockup' },
    ],
  },
  {
    id: 'admin-zone',
    text: 'ตั้งค่าระบบ (Admin)',
    expanded: true,
    roles: ['admin'],
    children: [
      { id: 'hub-admin', text: 'สิทธิ์ & ตั้งค่า', iconCss: 'e-icons e-lock', route: '/admin', exact: true },
      { id: 'hub-admin-people', text: 'พนักงาน & ทีม', iconCss: 'e-icons e-people', route: '/workspace/people' },
      { id: 'hub-projects', text: 'จัดการโปรเจกต์', iconCss: 'e-icons e-folder', route: '/admin/projects' },
      { id: 'hub-rubrics', text: 'เกณฑ์คะแนน', iconCss: 'e-icons e-bookmark', route: '/admin/rubrics' },
      { id: 'hub-snapshot', text: 'ตรวจก่อนล็อกคะแนน', iconCss: 'e-icons e-check-box', route: '/admin/snapshot-check' },
      { id: 'hub-integrations', text: 'เชื่อมต่อระบบ & Auto-SLA', iconCss: 'e-icons e-settings', route: '/integrations' },
      { id: 'teams', text: 'แจ้งเตือน Teams', iconCss: 'e-icons e-comment-show', route: '/teams' },
    ],
  },
];

export function leavesFor(role: AccessRole): NavLeaf[] {
  const allowed: readonly AccessRole[] =
    role === 'admin' ? ['member', 'lead', 'admin'] : role === 'lead' ? ['member', 'lead'] : ['member'];
  const seen = new Set<string>();
  const out: NavLeaf[] = [];
  for (const group of allNavGroups) {
    if (group.roles && !group.roles.some((r) => allowed.includes(r))) continue;
    for (const leaf of group.children) {
      if (leaf.roles && !leaf.roles.some((r) => allowed.includes(r))) continue;
      if (seen.has(leaf.route)) continue;
      seen.add(leaf.route);
      out.push(leaf);
    }
  }
  return out;
}

export function matchNavId(url: string, role: AccessRole = 'member'): string {
  const [rawPath, rawQuery] = url.split('?');
  const path = (rawPath || '/').replace(/\/$/, '') || '/';
  const queryParams = new URLSearchParams(rawQuery || '');
  const scope = queryParams.get('scope');

  if (path === '/me') return 'hub-home';
  if (
    path === '/team' ||
    path.startsWith('/team/') ||
    (path === '/schedule' && scope === 'team')
  ) {
    return 'hub-team';
  }
  if (path === '/cockpit' || path.startsWith('/cockpit/')) return 'hub-cockpit';
  // /work/team-time อยู่ใต้ hub งานทีม ไม่ดึงไป hub-team
  if (path === '/work' || path.startsWith('/work/')) return 'hub-work';
  if (path === '/schedule') return 'hub-schedule';
  if (path === '/mygit' || path.startsWith('/mygit/')) return 'hub-git';
  if (
    path === '/quality' ||
    path.startsWith('/quality/') ||
    path === '/tickets' ||
    path.startsWith('/analytics') ||
    path === '/mockup' ||
    (role === 'member' && path.startsWith('/people/'))
  ) {
    return 'hub-quality';
  }

  if (path === '/org/teams' || path.startsWith('/org/teams/')) {
    if (role === 'admin') return 'hub-admin-people';
    if (role === 'lead') return 'hub-people';
    return 'hub-team';
  }
  if (path.startsWith('/org/projects') || path.startsWith('/projects/') || path.startsWith('/admin/projects')) {
    return role === 'admin' ? 'hub-projects' : 'hub-work';
  }
  if (
    path.startsWith('/workspace/people') ||
    path === '/people' ||
    path.startsWith('/people/')
  ) {
    if (role === 'admin') return 'hub-admin-people';
    if (role === 'lead') return 'hub-people';
    return 'hub-team';
  }
  if (path === '/queue' || path.startsWith('/queue/')) return 'hub-work';

  if (role === 'admin') {
    if (path === '/admin') return 'hub-admin';
    if (path.startsWith('/admin/rubrics')) return 'hub-rubrics';
    if (path.startsWith('/admin/snapshot-check')) return 'hub-snapshot';
    if (path.startsWith('/integrations') || path === '/teams') return 'hub-integrations';
  }

  return role === 'member' ? 'hub-home' : 'hub-cockpit';
}

export function screenTitle(url: string, role: AccessRole = 'member'): string {
  const isMember = role === 'member';
  const [rawPath, rawQuery] = url.split('?');
  const queryParams = new URLSearchParams(rawQuery || '');
  const scope = queryParams.get('scope');

  if (rawPath === '/team/time' || rawPath === '/work/team-time') return isMember ? 'เวลาทีมของฉัน' : 'ลงเวลาทีม';
  if (rawPath === '/team/schedule' || (rawPath === '/schedule' && scope === 'team')) return 'ปฏิทินทีม & วันลา';
  if (rawPath === '/schedule') return 'ปฏิทิน & วันลาของฉัน';
  if (rawPath === '/team' || rawPath.startsWith('/team')) return isMember ? 'ทีมของฉัน' : 'แดชบอร์ดทีม';
  if (url.startsWith('/workspace/people')) {
    return role === 'admin' ? 'พนักงาน & ทีม' : 'คนในทีม';
  }
  if (url.startsWith('/quality/audit')) return 'ตรวจคุณภาพ QA';
  if (url.startsWith('/quality/time-audit') || url.startsWith('/analytics/time-audit')) {
    return isMember ? 'เช็กเวลา 3 ทางของฉัน' : 'เช็กเวลา 3 ทาง';
  }
  if (url.startsWith('/quality/disputes') || url.startsWith('/tickets/disputes')) {
    return isMember ? 'ขอทบทวนคะแนนของฉัน' : 'ขอทบทวนคะแนน';
  }
  if (url.startsWith('/quality/tickets') || url.startsWith('/tickets')) {
    return isMember ? 'คะแนนใบงานของฉัน' : 'ตารางคะแนนใบงาน';
  }
  if (url.startsWith('/quality/ols') || url.startsWith('/insights/ols')) {
    return isMember ? 'วิเคราะห์รายคนของฉัน' : 'วิเคราะห์รายคน';
  }
  if (url.startsWith('/quality/ai') || url.startsWith('/insights/ai') || url.startsWith('/ai')) {
    return isMember ? 'งาน AI & Spike ของฉัน' : 'งาน AI & Spike';
  }
  if (url.startsWith('/quality/report')) return 'วิเคราะห์ทีม';
  if (url.startsWith('/quality/mockup') || url.startsWith('/mockup')) return 'โหมดจำลอง';
  if (url.startsWith('/mygit') || url.startsWith('/insights/mygit')) {
    return isMember ? 'Git & MR ของฉัน' : 'Git & MR';
  }
  if (url.startsWith('/quality')) return isMember ? 'คะแนน & วิเคราะห์ของฉัน' : 'คะแนน & วิเคราะห์';
  if (url.startsWith('/insights/ols')) return isMember ? 'วิเคราะห์รายคนของฉัน' : 'วิเคราะห์รายคน';
  if (url.startsWith('/insights/mygit') || url.startsWith('/mygit')) {
    return isMember ? 'Git & MR ของฉัน' : 'Git & MR';
  }
  if (url.startsWith('/insights/ai') || url.startsWith('/ai')) {
    return isMember ? 'งาน AI & Spike ของฉัน' : 'งาน AI & Spike';
  }
  if (url.startsWith('/insights/mockup') || url.startsWith('/mockup')) return 'โหมดจำลอง';
  if (url.startsWith('/insights')) return isMember ? 'วิเคราะห์ & Git MR' : 'วิเคราะห์ & ซิงก์';
  if (url.startsWith('/org/teams/') && url.includes('/people')) return 'ทีม · คน';
  if (url.startsWith('/org/teams/') && url.includes('/work')) return 'ทีม · งาน';
  if (url.startsWith('/org/teams/') && url.includes('/tickets')) return 'ทีม · คะแนน';
  if (url.startsWith('/org/teams/') && url.includes('/cockpit')) return 'ทีม · ภาพรวม';
  if (url.startsWith('/org/teams')) {
    return role === 'admin' ? 'พนักงาน & ทีม' : 'คนในทีม';
  }
  if (url.startsWith('/org/projects') || url.startsWith('/projects/')) return 'รายละเอียดโปรเจกต์';
  if (url.startsWith('/cockpit')) return isMember ? 'ภาพรวมของฉัน' : 'ภาพรวมงาน';
  if (url.startsWith('/admin/projects')) return 'จัดการโปรเจกต์';
  if (url.startsWith('/admin/rubrics')) return 'เกณฑ์คะแนน';
  if (url.startsWith('/admin/snapshot-check')) return 'ตรวจก่อนล็อกคะแนน';
  if (url.startsWith('/work/team-time')) return isMember ? 'ลงเวลางานของฉัน' : 'ลงเวลาทีม';
  if (url.startsWith('/work/handoff')) return 'งานค้าง & SLA';
  if (url.startsWith('/work/queue') || url.startsWith('/queue')) return 'คิวจ่ายงาน';
  if (url.startsWith('/work/board')) return isMember ? 'บอร์ดงานของฉัน' : 'บอร์ดงาน';
  if (url.startsWith('/work/timeline')) return isMember ? 'ไทม์ไลน์ของฉัน' : 'ไทม์ไลน์งาน';
  if (url.startsWith('/work')) return isMember ? 'งานของฉัน' : 'งานทีม';
  if (url.startsWith('/schedule')) return isMember ? 'ปฏิทินงานของฉัน' : 'ปฏิทิน & วันลา';
  if (url.startsWith('/me')) return 'งานของฉัน';
  if (url.startsWith('/login')) return 'เข้าสู่ระบบ';
  if (url.startsWith('/analytics')) return 'วิเคราะห์ข้อมูล';
  if (url.startsWith('/people/')) return 'โปรไฟล์พนักงาน';
  if (url.startsWith('/people')) return 'ตารางพนักงาน';
  if (url.startsWith('/teams')) return 'แจ้งเตือน Teams';
  if (url.startsWith('/integrations')) return 'เชื่อมต่อระบบ';
  if (url.startsWith('/admin')) return 'สิทธิ์ & ตั้งค่า';
  return 'แดชบอร์ดทีม';
}

export const titleForUrl = screenTitle;
