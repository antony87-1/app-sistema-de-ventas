import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

import { AuthorizationPolicy, type UserPermission } from '../../domain/auth/authorization-policy';
import { SessionService } from './session.service';

export const authGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.current() === null ? router.createUrlTree(['/login']) : true;
};

export function permissionGuard(permission: UserPermission): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    const identity = session.current();

    if (identity === null) return router.createUrlTree(['/login']);
    return inject(AuthorizationPolicy).can(identity.role, permission)
      ? true
      : router.createUrlTree(['/sin-permiso']);
  };
}
