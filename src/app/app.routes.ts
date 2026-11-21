import { Routes } from '@angular/router';
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
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'me/work',
    loadComponent: () => import('./pages/work/work-shell').then((m) => m.WorkShell),
    data: { scope: 'mine' },
    children: workChildren,
  },
  {
    path: 'me/time-log',
    loadComponent: () => import('./pages/work/team-time').then((m) => m.TeamTimePage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/cockpit',
    loadComponent: () => import('./pages/cockpit/cockpit').then((m) => m.CockpitPage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/analytics',
    loadComponent: () => import('./pages/person-dashboard/person-dashboard').then((m) => m.PersonDashboard),
    data: { scope: 'mine' },
  },
  {
    path: 'me/tickets',
    loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/schedule',
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/time-audit',
    loadComponent: () => import('./pages/analytics/time-audit').then((m) => m.TimeAuditPage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/mygit',
    loadComponent: () => import('./pages/mygit/mygit').then((m) => m.MyGitPage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/ai',
    loadComponent: () => import('./pages/ai-tracking/ai-tracking').then((m) => m.AiTrackingPage),
    data: { scope: 'mine' },
  },
  {
    path: 'me/disputes',
    loadComponent: () => import('./pages/tickets/disputes').then((m) => m.DisputesPage),
    data: { scope: 'mine' },
  },
  {
    path: 'me',
    loadComponent: () => import('./pages/my-workspace/my-workspace').then((m) => m.MyWorkspacePage),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'analytics',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/analytics/analytics').then((m) => m.AnalyticsPage),
  },
  {
    path: 'team',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/team-dashboard/team-dashboard').then((m) => m.TeamDashboard),
  },
  {
    path: 'cockpit',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/cockpit/cockpit').then((m) => m.CockpitPage),
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
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/work/work-shell').then((m) => m.WorkShell),
    data: { scope: 'team' },
    children: [
      ...workChildren,
      {
        path: 'handoff',
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
    path: 'quality/audit',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/quality-audit/quality-audit').then((m) => m.QualityAuditPage),
  },
  {
    path: 'analytics/time-audit',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/analytics/time-audit').then((m) => m.TimeAuditPage),
    data: { scope: 'team' },
  },
  {
    path: 'tickets/disputes',
    loadComponent: () => import('./pages/tickets/disputes').then((m) => m.DisputesPage),
    data: { scope: 'team' },
  },
  {
    path: 'admin/snapshot-check',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/admin/snapshot-check').then((m) => m.SnapshotCheckPage),
  },
  {
    path: 'tickets',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
  },
  { path: 'pipeline', redirectTo: 'work/board', pathMatch: 'full' },
  {
    path: 'schedule',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
  },
  {
    path: 'queue',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/queue/queue').then((m) => m.QueuePage),
  },
  {
    path: 'mygit',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/mygit/mygit').then((m) => m.MyGitPage),
  },
  {
    path: 'teams',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/teams/teams').then((m) => m.TeamsPage),
  },
  {
    path: 'ai',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/ai-tracking/ai-tracking').then((m) => m.AiTrackingPage),
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
    path: 'admin/rubrics',
    canActivate: [requireRoles('admin')],
    loadComponent: () => import('./pages/admin/rubrics/admin-rubrics').then((m) => m.AdminRubricsPage),
  },
  {
    path: 'mockup',
    loadComponent: () => import('./pages/mockup/mockup').then((m) => m.MockupPage),
  },
];
