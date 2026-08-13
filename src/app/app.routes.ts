import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'configuracion-inicial',
    loadComponent: () =>
      import('./features/auth/initial-setup.page').then((m) => m.InitialSetupPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'recuperar-acceso',
    loadComponent: () => import('./features/auth/recovery.page').then((m) => m.RecoveryPage),
  },
  {
    path: 'inicio',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/service-workspace/service-workspace.page').then(
        (m) => m.ServiceWorkspacePage,
      ),
  },
  {
    path: 'reportes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
  },
  { path: '**', redirectTo: 'login' },
];
