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
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },

  // P20: ของฉัน — MineShell + tabs
  {
    path: 'me',
    loadComponent: () => import('./pages/hub-shells/mine-shell').then((m) => m.MineShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/my-workspace/my-workspace').then((m) => m.MyWorkspacePage),
      },
      {
        path: 'cockpit',
        loadComponent: () => import('./pages/cockpit/cockpit').then((m) => m.CockpitPage),
        data: { scope: 'mine' },
      },
      {
        path: 'work',
        loadComponent: () => import('./pages/work/work-shell').then((m) => m.WorkShell),
        data: { scope: 'mine' },
        children: workChildren,
      },
      {
        path: 'time-log',
        loadComponent: () => import('./pages/work/team-time').then((m) => m.TeamTimePage),
        data: { scope: 'mine' },
      },
      {
        path: 'schedule',
        loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
        data: { scope: 'mine' },
      },
      {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
        data: { scope: 'mine' },
      },
      {
        path: 'time-audit',
        loadComponent: () => import('./pages/analytics/time-audit').then((m) => m.TimeAuditPage),
        data: { scope: 'mine' },
      },
      {
        path: 'disputes',
        loadComponent: () => import('./pages/tickets/disputes').then((m) => m.DisputesPage),
        data: { scope: 'mine' },
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./pages/person-dashboard/person-dashboard').then((m) => m.PersonDashboard),
        data: { scope: 'mine' },
      },
      {
        path: 'mygit',
        loadComponent: () => import('./pages/mygit/mygit').then((m) => m.MyGitPage),
        data: { scope: 'mine' },
      },
      {
        path: 'ai',
        loadComponent: () => import('./pages/ai-tracking/ai-tracking').then((m) => m.AiTrackingPage),
        data: { scope: 'mine' },
      },
    ],
  },

  // P20: Person master-detail workspace
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

  // P20: Quality hub
  {
    path: 'quality',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/hub-shells/quality-shell').then((m) => m.QualityShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'audit' },
      {
        path: 'audit',
        loadComponent: () => import('./pages/quality-audit/quality-audit').then((m) => m.QualityAuditPage),
      },
      {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
      },
      {
        path: 'time-audit',
        loadComponent: () => import('./pages/analytics/time-audit').then((m) => m.TimeAuditPage),
        data: { scope: 'team' },
      },
      {
        path: 'disputes',
        loadComponent: () => import('./pages/tickets/disputes').then((m) => m.DisputesPage),
        data: { scope: 'team' },
      },
    ],
  },

  // P20: Insights hub
  {
    path: 'insights',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/hub-shells/insights-shell').then((m) => m.InsightsShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'report' },
      {
        path: 'report',
        loadComponent: () => import('./pages/analytics/analytics').then((m) => m.AnalyticsPage),
      },
      {
        path: 'mygit',
        loadComponent: () => import('./pages/mygit/mygit').then((m) => m.MyGitPage),
      },
      {
        path: 'ai',
        loadComponent: () => import('./pages/ai-tracking/ai-tracking').then((m) => m.AiTrackingPage),
      },
      {
        path: 'mockup',
        loadComponent: () => import('./pages/mockup/mockup').then((m) => m.MockupPage),
      },
    ],
  },

  // Legacy redirects → hubs
  { path: 'analytics/time-audit', redirectTo: 'quality/time-audit', pathMatch: 'full' },
  { path: 'tickets/disputes', redirectTo: 'quality/disputes', pathMatch: 'full' },
  { path: 'analytics', redirectTo: 'insights/report', pathMatch: 'full' },
  { path: 'mygit', redirectTo: 'insights/mygit', pathMatch: 'full' },
  { path: 'ai', redirectTo: 'insights/ai', pathMatch: 'full' },
  { path: 'tickets', redirectTo: 'quality/tickets', pathMatch: 'full' },

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
    path: 'org/teams',
    canActivate: [requireRoles('admin', 'lead')],
    loadComponent: () => import('./pages/org-teams/org-teams-hub').then((m) => m.OrgTeamsHubPage),
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
    redirectTo: 'insights/mockup',
    pathMatch: 'full',
  },
];
