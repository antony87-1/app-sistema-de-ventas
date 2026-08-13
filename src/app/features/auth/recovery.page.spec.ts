import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AUTH_FACADE, type AuthenticationFacadePort } from './authentication.facade';
import { RecoveryPage } from './recovery.page';

describe('RecoveryPage', () => {
  it('shows the rotated code only after a valid recovery', async () => {
    const facade: AuthenticationFacadePort = {
      hasUsers: vi.fn(),
      provisionInitialUsers: vi.fn(),
      login: vi.fn(),
      recoverAdministrator: vi.fn(async () => ({
        newRecoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ',
      })),
      logout: vi.fn(),
      currentIdentity: vi.fn(() => null),
    };
    TestBed.configureTestingModule({
      imports: [RecoveryPage],
      providers: [
        { provide: AUTH_FACADE, useValue: facade },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    const component = TestBed.createComponent(RecoveryPage).componentInstance;
    component.form.setValue({
      recoveryCode: 'codigo-anterior',
      newPassword: 'nueva-clave',
      confirmation: 'nueva-clave',
    });

    await component.submit();

    expect(component.newRecoveryCode()).toBe('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    expect(component.form.disabled).toBe(true);
  });
});
