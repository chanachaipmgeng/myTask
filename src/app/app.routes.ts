import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'team' },
  {
    path: 'team',
    loadComponent: () => import('./pages/team-dashboard/team-dashboard').then((m) => m.TeamDashboard),
  },
  {
    path: 'people',
    loadComponent: () => import('./pages/people-board/people-board').then((m) => m.PeopleBoard),
  },
  {
    path: 'people/:personId',
    loadComponent: () => import('./pages/person-dashboard/person-dashboard').then((m) => m.PersonDashboard),
  },
  {
    path: 'work',
    loadComponent: () => import('./pages/work/work-shell').then((m) => m.WorkShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'summary' },
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
    ],
  },
  {
    path: 'tickets',
    loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
  },
  { path: 'pipeline', redirectTo: 'work/board', pathMatch: 'full' },
  {
    path: 'schedule',
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
  },
  {
    path: 'queue',
    loadComponent: () => import('./pages/queue/queue').then((m) => m.QueuePage),
  },
  {
    path: 'mygit',
    loadComponent: () => import('./pages/mygit/mygit').then((m) => m.MyGitPage),
  },
  {
    path: 'teams',
    loadComponent: () => import('./pages/teams/teams').then((m) => m.TeamsPage),
  },
  {
    path: 'ai',
    loadComponent: () => import('./pages/ai-tracking/ai-tracking').then((m) => m.AiTrackingPage),
  },
  {
    path: 'integrations',
    loadComponent: () => import('./pages/integrations/integrations').then((m) => m.IntegrationsPage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
  },
  {
    path: 'mockup',
    loadComponent: () => import('./pages/mockup/mockup').then((m) => m.MockupPage),
  },
];
