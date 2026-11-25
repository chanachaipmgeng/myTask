import { Routes } from '@angular/router';
import { effectiveRole } from './core/admin-settings';
import { requireRoles, requireSelfOrManager } from './core/role.guard';

const workChildren = [
  { path: '', pathMatch: 'full' as const, redirectTo: 'summary' },
  {
    path: 'summary',
    loadComponent: () => import('./pages/work/work-summary').then((m) => m.WorkSummary),
  },
  {
    path: 'timeline',
    loadComponent: () => import('./pages/work/work-timeline').then((m) => m.WorkTimeline),
  },
  {
    path: 'backlog',
    loadComponent: () => import('./pages/work/work-backlog').then((m) => m.WorkBacklog),
  },
  {
    path: 'board',
    loadComponent: () => import('./pages/work/work-board').then((m) => m.WorkBoard),
  },
  {
    path: 'list',
    loadComponent: () => import('./pages/work/work-list').then((m) => m.WorkList),
  },
  {
    path: 'queue',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/queue/queue').then((m) => m.QueuePage),
  },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },

  // หน้าแรกสรุปงานวันนี้ (ทุกสิทธิ์ใช้ร่วมกัน) + Redirect ลิงก์เดิม /me/* ไปยังวิวรวมชุดเดียว
  {
    path: 'me',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/hub-shells/mine-shell').then((m) => m.MineShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/my-workspace/my-workspace').then((m) => m.MyWorkspacePage),
      },
      { path: 'cockpit', pathMatch: 'full', redirectTo: '/cockpit' },
      { path: 'work', pathMatch: 'full', redirectTo: '/work' },
      { path: 'work/summary', pathMatch: 'full', redirectTo: '/work/summary' },
      { path: 'work/timeline', pathMatch: 'full', redirectTo: '/work/timeline' },
      { path: 'work/backlog', pathMatch: 'full', redirectTo: '/work/backlog' },
      { path: 'work/board', pathMatch: 'full', redirectTo: '/work/board' },
      { path: 'work/list', pathMatch: 'full', redirectTo: '/work/list' },
      { path: 'time-log', pathMatch: 'full', redirectTo: '/work/team-time' },
      { path: 'schedule', pathMatch: 'full', redirectTo: '/schedule' },
      { path: 'tickets', pathMatch: 'full', redirectTo: '/quality/tickets' },
      { path: 'time-audit', pathMatch: 'full', redirectTo: '/quality/time-audit' },
      { path: 'disputes', pathMatch: 'full', redirectTo: '/quality/disputes' },
      { path: 'analytics', pathMatch: 'full', redirectTo: '/quality/ols' },
      { path: 'mygit', pathMatch: 'full', redirectTo: '/mygit' },
      { path: 'ai', pathMatch: 'full', redirectTo: '/quality/ai' },
    ],
  },

  // บริหารทีม: Person master-detail workspace (Lead / Admin)
  {
    path: 'workspace/people',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () =>
      import('./pages/person-workspace/person-workspace').then((m) => m.PersonWorkspacePage),
  },
  {
    path: 'workspace/people/:personId',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () =>
      import('./pages/person-workspace/person-workspace').then((m) => m.PersonWorkspacePage),
  },

  // Unified Quality & Score Hub (ทุกสิทธิ์ใช้ร่วมกัน · QA/DoD เฉพาะ Lead/Admin)
  // Unified Quality, Score & Analytics Hub (ผลงาน & วิเคราะห์)
  {
    path: 'quality',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/hub-shells/quality-shell').then((m) => m.QualityShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'tickets',
      },
      {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
      },
      {
        path: 'ols',
        loadComponent: () =>
          import('./pages/person-dashboard/person-dashboard').then((m) => m.PersonDashboard),
        data: { hubOls: true },
      },
      {
        path: 'time-audit',
        loadComponent: () => import('./pages/analytics/time-audit').then((m) => m.TimeAuditPage),
      },
      {
        path: 'disputes',
        loadComponent: () => import('./pages/tickets/disputes').then((m) => m.DisputesPage),
      },
      {
        path: 'ai',
        loadComponent: () => import('./pages/ai-tracking/ai-tracking').then((m) => m.AiTrackingPage),
      },
      {
        path: 'audit',
        canActivate: [requireRoles('admin', 'lead')],
        loadComponent: () => import('./pages/quality-audit/quality-audit').then((m) => m.QualityAuditPage),
      },
      {
        path: 'report',
        canActivate: [requireRoles('admin', 'lead')],
        loadComponent: () => import('./pages/analytics/analytics').then((m) => m.AnalyticsPage),
      },
      {
        path: 'mockup',
        canActivate: [requireRoles('admin', 'lead')],
        loadComponent: () => import('./pages/mockup/mockup').then((m) => m.MockupPage),
      },
    ],
  },

  // กล่องงาน Git & MR (Git Inbox)
  {
    path: 'mygit',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/mygit/mygit').then((m) => m.MyGitPage),
  },
  { path: 'git-inbox', redirectTo: 'mygit', pathMatch: 'full' },

  // Legacy redirects → hubs
  { path: 'insights', redirectTo: 'quality', pathMatch: 'full' },
  { path: 'insights/ols', redirectTo: 'quality/ols', pathMatch: 'full' },
  { path: 'insights/report', redirectTo: 'quality/report', pathMatch: 'full' },
  { path: 'insights/mygit', redirectTo: 'mygit', pathMatch: 'full' },
  { path: 'insights/ai', redirectTo: 'quality/ai', pathMatch: 'full' },
  { path: 'insights/mockup', redirectTo: 'quality/mockup', pathMatch: 'full' },
  { path: 'analytics/time-audit', redirectTo: 'quality/time-audit', pathMatch: 'full' },
  { path: 'tickets/disputes', redirectTo: 'quality/disputes', pathMatch: 'full' },
  { path: 'analytics', redirectTo: 'quality/report', pathMatch: 'full' },
  { path: 'ai', redirectTo: 'quality/ai', pathMatch: 'full' },
  { path: 'tickets', redirectTo: 'quality/tickets', pathMatch: 'full' },

  {
    path: 'team',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/team-dashboard/team-dashboard').then((m) => m.TeamDashboard),
  },
  {
    path: 'team/time',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/work/team-time').then((m) => m.TeamTimePage),
    data: { scope: 'team' },
  },
  {
    path: 'team/schedule',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
    data: { scope: 'team' },
  },
  {
    path: 'cockpit',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/cockpit/cockpit').then((m) => m.CockpitPage),
  },
  {
    path: 'org/teams',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () =>
      import('./pages/org-teams/redirect-org-teams-hub').then((m) => m.RedirectOrgTeamsHub),
  },
  {
    path: 'org/teams/:teamId',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/org-teams/team-workspace-shell').then((m) => m.TeamWorkspaceShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'people' },
      {
        path: 'people',
        loadComponent: () =>
          import('./pages/org-teams/redirect-to-person-workspace').then(
            (m) => m.RedirectToPersonWorkspace,
          ),
      },
      {
        path: 'work',
        loadComponent: () => import('./pages/work/work-shell').then((m) => m.WorkShell),
        data: { scope: 'team' },
        children: [
          ...workChildren,
          {
            path: 'handoff',
            canActivate: [requireRoles('admin', 'lead')],
            loadComponent: () => import('./pages/work/work-handoff').then((m) => m.WorkHandoffPage),
          },
          {
            path: 'team-time',
            loadComponent: () => import('./pages/work/team-time').then((m) => m.TeamTimePage),
            data: { scope: 'team' },
          },
        ],
      },
      {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
      },
      {
        path: 'cockpit',
        loadComponent: () => import('./pages/cockpit/cockpit').then((m) => m.CockpitPage),
      },
    ],
  },
  {
    path: 'people',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/people-board/people-board').then((m) => m.PeopleBoard),
  },
  {
    path: 'people/:personId',
    canActivate: [requireSelfOrManager()],
    loadComponent: () => import('./pages/person-dashboard/person-dashboard').then((m) => m.PersonDashboard),
  },
  {
    path: 'work',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/work/work-shell').then((m) => m.WorkShell),
    children: [
      ...workChildren,
      {
        path: 'handoff',
        canActivate: [requireRoles('admin', 'lead')],
        loadComponent: () => import('./pages/work/work-handoff').then((m) => m.WorkHandoffPage),
      },
      {
        path: 'team-time',
        loadComponent: () => import('./pages/work/team-time').then((m) => m.TeamTimePage),
      },
    ],
  },
  { path: 'pipeline', redirectTo: 'work/board', pathMatch: 'full' },
  {
    path: 'schedule',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
  },
  { path: 'queue', pathMatch: 'full', redirectTo: 'work/queue' },
  {
    path: 'teams',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/teams/teams').then((m) => m.TeamsPage),
  },
  {
    path: 'integrations',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/integrations/integrations').then((m) => m.IntegrationsPage),
  },
  {
    path: 'admin',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
  },
  {
    path: 'admin/projects',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/admin/projects/admin-projects').then((m) => m.AdminProjectsComponent),
  },
  {
    path: 'org/projects/:id',
    canActivate: [requireRoles('admin', 'lead', 'member')],
    loadComponent: () => import('./pages/project-detail/project-detail').then((m) => m.ProjectDetailPage),
  },
  {
    path: 'projects/:id',
    redirectTo: 'org/projects/:id',
    pathMatch: 'full',
  },
  {
    path: 'admin/rubrics',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/admin/rubrics/admin-rubrics').then((m) => m.AdminRubricsPage),
  },
  {
    path: 'admin/snapshot-check',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/admin/snapshot-check').then((m) => m.SnapshotCheckPage),
  },
  {
    path: 'mockup',
    redirectTo: 'quality/mockup',
    pathMatch: 'full',
  },
];
