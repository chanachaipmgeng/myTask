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
    path: 'tickets',
    loadComponent: () => import('./pages/tickets/tickets').then((m) => m.TicketsPage),
  },
  {
    path: 'pipeline',
    loadComponent: () => import('./pages/pipeline/pipeline').then((m) => m.PipelinePage),
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
];
