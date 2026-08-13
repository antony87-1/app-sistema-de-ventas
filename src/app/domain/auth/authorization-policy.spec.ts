import {
  ADMINISTRATOR_ONLY_PERMISSIONS,
  ALL_USER_PERMISSIONS,
  AuthorizationPolicy,
  PermissionDeniedError,
  USER_ROLES,
} from './authorization-policy';

describe('AuthorizationPolicy', () => {
  let policy: AuthorizationPolicy;

  beforeEach(() => {
    policy = new AuthorizationPolicy();
  });

  it('recognizes only the two approved initial roles', () => {
    expect(USER_ROLES).toEqual(['ADMINISTRADOR', 'CAJERO']);
    expect(policy.isUserRole('ADMINISTRADOR')).toBe(true);
    expect(policy.isUserRole('CAJERO')).toBe(true);
    expect(policy.isUserRole('SUPERVISOR')).toBe(false);
  });

  it('allows both roles to perform approved daily operations and close the journey', () => {
    const sharedPermissions = [
      'INICIAR_SESION',
      'ABRIR_JORNADA',
      'REGISTRAR_VENTA_RAPIDA',
      'ABRIR_CUENTA_MESA',
      'COBRAR',
      'REGISTRAR_GASTO',
      'FINALIZAR_CUENTA',
      'CERRAR_JORNADA',
    ] as const;

    for (const role of USER_ROLES) {
      for (const permission of sharedPermissions) {
        expect(policy.can(role, permission)).toBe(true);
      }
    }
  });

  it('allows the administrator every declared permission', () => {
    expect(policy.permissionsFor('ADMINISTRADOR')).toEqual(ALL_USER_PERMISSIONS);

    for (const permission of ALL_USER_PERMISSIONS) {
      expect(policy.can('ADMINISTRADOR', permission)).toBe(true);
    }
  });

  it('denies every administrative permission to the cashier', () => {
    for (const permission of ADMINISTRATOR_ONLY_PERMISSIONS) {
      expect(policy.can('CAJERO', permission)).toBe(false);
    }
  });

  it('allows only the administrator to manage expense categories', () => {
    expect(policy.can('ADMINISTRADOR', 'ADMINISTRAR_CATEGORIAS_GASTO')).toBe(true);
    expect(policy.can('CAJERO', 'ADMINISTRAR_CATEGORIAS_GASTO')).toBe(false);
  });

  it('reserves exceptional closure, reopening and economic corrections for the administrator', () => {
    const correctionPermissions = [
      'REALIZAR_CIERRE_EXCEPCIONAL',
      'REABRIR_JORNADA',
      'CORREGIR_CIERRE',
      'CREAR_CORRECCION_ECONOMICA',
    ] as const;

    for (const permission of correctionPermissions) {
      expect(policy.can('ADMINISTRADOR', permission)).toBe(true);
      expect(policy.can('CAJERO', permission)).toBe(false);
    }
  });

  it('throws a domain error without exposing technical details when access is denied', () => {
    expect(() => policy.assertCan('CAJERO', 'RESTAURAR_RESPALDO')).toThrow(PermissionDeniedError);

    try {
      policy.assertCan('CAJERO', 'RESTAURAR_RESPALDO');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 'PERMISSION_DENIED',
        role: 'CAJERO',
        permission: 'RESTAURAR_RESPALDO',
        message: 'No tienes permiso para realizar esta acción.',
      });
    }
  });

  it('does not expose a mutable permission collection', () => {
    const permissions = policy.permissionsFor('CAJERO');

    expect(Object.isFrozen(USER_ROLES)).toBe(true);
    expect(Object.isFrozen(ALL_USER_PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(ADMINISTRATOR_ONLY_PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(permissions)).toBe(true);
    expect(policy.permissionsFor('CAJERO')).not.toBe(permissions);
  });
});
