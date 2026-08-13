export const USER_ROLES = Object.freeze(['ADMINISTRADOR', 'CAJERO'] as const);

export type UserRole = (typeof USER_ROLES)[number];

export const SHARED_OPERATIONAL_PERMISSIONS = Object.freeze([
  'INICIAR_SESION',
  'ABRIR_JORNADA',
  'REGISTRAR_VENTA_RAPIDA',
  'ABRIR_CUENTA_MESA',
  'MODIFICAR_CUENTA_MESA',
  'MARCAR_PRODUCTO_SERVIDO',
  'MODIFICAR_PRECIO_OPERACION',
  'APLICAR_DESCUENTO',
  'COBRAR',
  'REGISTRAR_PAGO_SEPARADO',
  'REGISTRAR_PAGO_COMBINADO',
  'REGISTRAR_GASTO',
  'CAMBIAR_DISPONIBILIDAD_PRODUCTO',
  'CONSULTAR_OPERACIONES_DIA',
  'FINALIZAR_CUENTA',
  'CERRAR_JORNADA',
  'REGISTRAR_PEDIDO_PROGRAMADO',
  'MODIFICAR_PEDIDO_PROGRAMADO',
  'REGISTRAR_ADELANTO_PEDIDO',
] as const);

export const ADMINISTRATOR_ONLY_PERMISSIONS = Object.freeze([
  'ADMINISTRAR_CAJEROS',
  'ADMINISTRAR_PRODUCTOS',
  'ADMINISTRAR_CATEGORIAS',
  'ADMINISTRAR_CATEGORIAS_GASTO',
  'MODIFICAR_PRECIOS_CATALOGO',
  'ADMINISTRAR_MESAS',
  'ADMINISTRAR_METODOS_PAGO',
  'VER_REPORTES',
  'CREAR_RESPALDO',
  'RESTAURAR_RESPALDO',
  'MODIFICAR_CONFIGURACION',
  'REALIZAR_CIERRE_EXCEPCIONAL',
  'REABRIR_JORNADA',
  'CORREGIR_CIERRE',
  'CREAR_CORRECCION_ECONOMICA',
] as const);

export const ALL_USER_PERMISSIONS = Object.freeze([
  ...SHARED_OPERATIONAL_PERMISSIONS,
  ...ADMINISTRATOR_ONLY_PERMISSIONS,
] as const);

export type UserPermission = (typeof ALL_USER_PERMISSIONS)[number];

const PERMISSIONS_BY_ROLE: Readonly<Record<UserRole, ReadonlySet<UserPermission>>> = {
  ADMINISTRADOR: new Set(ALL_USER_PERMISSIONS),
  CAJERO: new Set(SHARED_OPERATIONAL_PERMISSIONS),
};

export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';

  constructor(
    readonly role: UserRole,
    readonly permission: UserPermission,
  ) {
    super('No tienes permiso para realizar esta acción.');
    this.name = 'PermissionDeniedError';
  }
}

export class AuthorizationPolicy {
  isUserRole(value: string): value is UserRole {
    return USER_ROLES.some((role) => role === value);
  }

  can(role: UserRole, permission: UserPermission): boolean {
    return PERMISSIONS_BY_ROLE[role].has(permission);
  }

  assertCan(role: UserRole, permission: UserPermission): void {
    if (!this.can(role, permission)) {
      throw new PermissionDeniedError(role, permission);
    }
  }

  permissionsFor(role: UserRole): readonly UserPermission[] {
    return Object.freeze([...PERMISSIONS_BY_ROLE[role]]);
  }
}
