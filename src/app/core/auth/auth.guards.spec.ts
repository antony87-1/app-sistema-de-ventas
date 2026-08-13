import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import { authGuard, permissionGuard } from './auth.guards';
import { SessionService } from './session.service';

describe('authentication guards', () => {
  const router = { createUrlTree: vi.fn((commands: string[]) => `redirect:${commands.join('')}`) };
  const session = new SessionService();

  beforeEach(() => {
    session.clear();
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: session },
        { provide: Router, useValue: router },
        AuthorizationPolicy,
      ],
    });
  });

  it('redirects unauthenticated navigation to login', () => {
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(
      'redirect:/login',
    );
  });

  it('allows an administrator permission and rejects it for a cashier', () => {
    const guard = permissionGuard('VER_REPORTES');
    session.start({ userId: 'admin', role: 'ADMINISTRADOR', displayName: 'Admin' });
    expect(TestBed.runInInjectionContext(() => guard({} as never, {} as never))).toBe(true);

    session.start({ userId: 'cashier', role: 'CAJERO', displayName: 'Caja' });
    expect(TestBed.runInInjectionContext(() => guard({} as never, {} as never))).toBe(
      'redirect:/sin-permiso',
    );
  });
});
