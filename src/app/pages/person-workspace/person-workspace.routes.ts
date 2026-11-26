import { Routes } from '@angular/router';

/** Lazy children under `/workspace/people` (guard อยู่ที่ parent ใน app.routes). */
export const PERSON_WORKSPACE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./person-workspace-shell').then((m) => m.PersonWorkspaceShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./person-directory').then((m) => m.PersonDirectoryPage),
      },
      {
        path: ':personId',
        loadComponent: () =>
          import('./person-workspace-detail').then((m) => m.PersonWorkspaceDetailPage),
      },
    ],
  },
];
