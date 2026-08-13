import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AUTH_FACADE, type AuthenticationFacadePort } from './authentication.facade';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  it('authenticates and navigates to the protected start page', async () => {
    const navigateByUrl = vi.fn(async () => true);
    const facade: AuthenticationFacadePort = {
      hasUsers: vi.fn(async () => true),
      provisionInitialUsers: vi.fn(),
      login: vi.fn(async () => ({
        userId: 'admin',
        role: 'ADMINISTRADOR' as const,
        displayName: 'Dueño',
      })),
      recoverAdministrator: vi.fn(),
      logout: vi.fn(),
      currentIdentity: vi.fn(() => null),
    };
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AUTH_FACADE, useValue: facade },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    const component = TestBed.createComponent(LoginPage).componentInstance;
    component.form.setValue({ username: 'Administrador', password: 'admin-123' });

    await component.submit();

    expect(facade.login).toHaveBeenCalledWith('Administrador', 'admin-123');
    expect(navigateByUrl).toHaveBeenCalledWith('/inicio', { replaceUrl: true });
  });
});
