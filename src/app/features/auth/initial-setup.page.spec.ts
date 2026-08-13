import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AUTH_FACADE, type AuthenticationFacadePort } from './authentication.facade';
import { InitialSetupPage } from './initial-setup.page';

describe('InitialSetupPage', () => {
  const facade: AuthenticationFacadePort = {
    hasUsers: vi.fn(async () => false),
    provisionInitialUsers: vi.fn(async () => ({
      administratorId: 'admin',
      cashierId: 'cashier',
      recoveryCode: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF',
    })),
    login: vi.fn(),
    recoverAdministrator: vi.fn(),
    logout: vi.fn(),
    currentIdentity: vi.fn(() => null),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [InitialSetupPage],
      providers: [
        { provide: AUTH_FACADE, useValue: facade },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
  });

  it('shows the one-time recovery code after creating both users', async () => {
    const fixture = TestBed.createComponent(InitialSetupPage);
    const component = fixture.componentInstance;
    component.form.setValue({
      administratorUsername: 'Administrador',
      administratorDisplayName: 'Dueño',
      administratorPassword: 'admin-123',
      administratorPasswordConfirmation: 'admin-123',
      cashierUsername: 'Caja',
      cashierDisplayName: 'Caja principal',
      cashierPassword: 'cajero-123',
      cashierPasswordConfirmation: 'cajero-123',
    });

    await component.submit();

    expect(component.recoveryCode()).toBe('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF');
    expect(component.form.disabled).toBe(true);
  });
});
