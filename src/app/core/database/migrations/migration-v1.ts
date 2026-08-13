import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const MIGRATION_V1_CHECKSUM =
  '6dcbbff5091351fc96d5754b63929c0e69303f30d2b43fdb9dee53c6e6aafd10';

export const MIGRATION_V1_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    codigo TEXT NOT NULL UNIQUE CHECK (codigo IN ('ADMINISTRADOR', 'CAJERO')),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0)
  );`,
  `CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    rol_id TEXT NOT NULL,
    nombre_usuario TEXT NOT NULL CHECK (length(trim(nombre_usuario)) > 0),
    nombre_usuario_normalizado TEXT NOT NULL UNIQUE CHECK (length(trim(nombre_usuario_normalizado)) > 0),
    nombre_mostrar TEXT NOT NULL CHECK (length(trim(nombre_mostrar)) > 0),
    contrasena_hash TEXT NOT NULL CHECK (length(trim(contrasena_hash)) > 0),
    contrasena_sal TEXT NOT NULL CHECK (length(trim(contrasena_sal)) > 0),
    contrasena_algoritmo TEXT NOT NULL CHECK (length(trim(contrasena_algoritmo)) > 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0),
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY NOT NULL CHECK (length(trim(clave)) > 0),
    valor TEXT NOT NULL,
    tipo_valor TEXT NOT NULL CHECK (tipo_valor IN ('TEXTO', 'ENTERO', 'BOOLEANO', 'JSON')),
    descripcion TEXT CHECK (descripcion IS NULL OR length(trim(descripcion)) > 0),
    actualizado_por_usuario_id TEXT NOT NULL,
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0),
    FOREIGN KEY (actualizado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY NOT NULL CHECK (version > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    checksum TEXT NOT NULL CHECK (length(checksum) = 64),
    aplicada_en_utc TEXT NOT NULL CHECK (length(trim(aplicada_en_utc)) > 0),
    duracion_ms INTEGER NOT NULL CHECK (duracion_ms >= 0)
  );`,
  `CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    nombre_normalizado TEXT NOT NULL UNIQUE CHECK (length(trim(nombre_normalizado)) > 0),
    orden INTEGER NOT NULL CHECK (orden >= 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0)
  );`,
  `CREATE TABLE IF NOT EXISTS productos (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    categoria_id TEXT NOT NULL,
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    nombre_normalizado TEXT NOT NULL CHECK (length(trim(nombre_normalizado)) > 0),
    precio_centimos INTEGER NOT NULL CHECK (precio_centimos >= 0),
    es_adicional INTEGER NOT NULL CHECK (es_adicional IN (0, 1)),
    disponibilidad TEXT NOT NULL CHECK (disponibilidad IN ('DISPONIBLE', 'AGOTADO')),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS mesas (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    orden INTEGER NOT NULL CHECK (orden >= 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0)
  );`,
  `CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    telefono TEXT CHECK (telefono IS NULL OR length(trim(telefono)) > 0),
    telefono_normalizado TEXT CHECK (telefono_normalizado IS NULL OR length(trim(telefono_normalizado)) > 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0)
  );`,
  `CREATE TABLE IF NOT EXISTS metodos_pago (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    permite_vuelto INTEGER NOT NULL CHECK (permite_vuelto IN (0, 1)),
    orden INTEGER NOT NULL CHECK (orden >= 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1))
  );`,
  `CREATE TABLE IF NOT EXISTS categorias_gasto (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    nombre_normalizado TEXT NOT NULL UNIQUE CHECK (length(trim(nombre_normalizado)) > 0),
    activo INTEGER NOT NULL CHECK (activo IN (0, 1)),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    actualizado_en_utc TEXT NOT NULL CHECK (length(trim(actualizado_en_utc)) > 0)
  );`,
  `CREATE TABLE IF NOT EXISTS jornadas_caja (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    fecha_negocio TEXT NOT NULL UNIQUE CHECK (length(fecha_negocio) = 10),
    estado TEXT NOT NULL CHECK (estado IN ('ABIERTA', 'CERRADA')),
    monto_inicial_centimos INTEGER NOT NULL CHECK (monto_inicial_centimos >= 0),
    abierta_por_usuario_id TEXT NOT NULL,
    abierta_en_utc TEXT NOT NULL CHECK (length(trim(abierta_en_utc)) > 0),
    observacion_apertura TEXT CHECK (observacion_apertura IS NULL OR length(trim(observacion_apertura)) > 0),
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    version INTEGER NOT NULL CHECK (version >= 1),
    FOREIGN KEY (abierta_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS cierres_jornada (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    jornada_id TEXT NOT NULL,
    cierre_anterior_id TEXT,
    reapertura_id TEXT UNIQUE,
    secuencia INTEGER NOT NULL CHECK (secuencia > 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('NORMAL', 'EXCEPCIONAL', 'CORREGIDO')),
    realizado_por_usuario_id TEXT NOT NULL,
    cerrado_en_utc TEXT NOT NULL CHECK (length(trim(cerrado_en_utc)) > 0),
    efectivo_esperado_centimos INTEGER NOT NULL CHECK (efectivo_esperado_centimos >= 0),
    efectivo_real_centimos INTEGER NOT NULL CHECK (efectivo_real_centimos >= 0),
    tipo_diferencia TEXT NOT NULL CHECK (tipo_diferencia IN ('CUADRA', 'SOBRANTE', 'FALTANTE')),
    diferencia_centimos INTEGER NOT NULL CHECK (diferencia_centimos >= 0),
    justificacion TEXT CHECK (justificacion IS NULL OR length(trim(justificacion)) > 0),
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    UNIQUE (jornada_id, secuencia),
    CHECK (
      (tipo_diferencia = 'CUADRA' AND diferencia_centimos = 0) OR
      (tipo_diferencia IN ('SOBRANTE', 'FALTANTE') AND diferencia_centimos > 0)
    ),
    CHECK (
      (diferencia_centimos = 0 AND tipo = 'NORMAL') OR
      (justificacion IS NOT NULL AND length(trim(justificacion)) > 0)
    ),
    CHECK (
      (secuencia = 1 AND cierre_anterior_id IS NULL AND reapertura_id IS NULL AND tipo IN ('NORMAL', 'EXCEPCIONAL')) OR
      (secuencia > 1 AND cierre_anterior_id IS NOT NULL AND reapertura_id IS NOT NULL AND tipo = 'CORREGIDO')
    ),
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cierre_anterior_id) REFERENCES cierres_jornada(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (reapertura_id) REFERENCES reaperturas_jornada(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (realizado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS reaperturas_jornada (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    jornada_id TEXT NOT NULL,
    cierre_reabierto_id TEXT NOT NULL UNIQUE,
    reabierta_por_usuario_id TEXT NOT NULL,
    motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
    reabierta_en_utc TEXT NOT NULL CHECK (length(trim(reabierta_en_utc)) > 0),
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cierre_reabierto_id) REFERENCES cierres_jornada(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (reabierta_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS operaciones (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('VENTA_RAPIDA', 'CUENTA_MESA', 'PEDIDO_PROGRAMADO')),
    estado TEXT NOT NULL CHECK (estado IN ('ABIERTA', 'PAGADA_PARCIALMENTE', 'PAGADA', 'FINALIZADA', 'ANULADA')),
    jornada_creacion_id TEXT NOT NULL,
    jornada_venta_id TEXT,
    creada_por_usuario_id TEXT NOT NULL,
    creada_en_utc TEXT NOT NULL CHECK (length(trim(creada_en_utc)) > 0),
    finalizada_por_usuario_id TEXT,
    finalizada_en_utc TEXT,
    subtotal_catalogo_centimos INTEGER NOT NULL CHECK (subtotal_catalogo_centimos >= 0),
    descuento_total_centimos INTEGER NOT NULL CHECK (descuento_total_centimos >= 0 AND descuento_total_centimos <= subtotal_catalogo_centimos),
    total_centimos INTEGER NOT NULL CHECK (total_centimos >= 0),
    pagado_centimos INTEGER NOT NULL CHECK (pagado_centimos >= 0),
    saldo_centimos INTEGER NOT NULL CHECK (saldo_centimos >= 0),
    nota TEXT CHECK (nota IS NULL OR length(trim(nota)) > 0),
    anulada_por_usuario_id TEXT,
    anulada_en_utc TEXT,
    motivo_anulacion TEXT,
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    version INTEGER NOT NULL CHECK (version >= 1),
    CHECK (pagado_centimos <= total_centimos AND saldo_centimos = total_centimos - pagado_centimos),
    CHECK (estado NOT IN ('PAGADA', 'FINALIZADA') OR saldo_centimos = 0),
    CHECK (estado <> 'PAGADA_PARCIALMENTE' OR (pagado_centimos > 0 AND saldo_centimos > 0)),
    CHECK (
      (estado = 'FINALIZADA' AND jornada_venta_id IS NOT NULL AND finalizada_por_usuario_id IS NOT NULL AND finalizada_en_utc IS NOT NULL) OR
      (estado <> 'FINALIZADA' AND jornada_venta_id IS NULL AND finalizada_por_usuario_id IS NULL AND finalizada_en_utc IS NULL)
    ),
    CHECK (
      (estado = 'ANULADA' AND anulada_por_usuario_id IS NOT NULL AND anulada_en_utc IS NOT NULL AND motivo_anulacion IS NOT NULL AND length(trim(motivo_anulacion)) > 0) OR
      (estado <> 'ANULADA' AND anulada_por_usuario_id IS NULL AND anulada_en_utc IS NULL AND motivo_anulacion IS NULL)
    ),
    FOREIGN KEY (jornada_creacion_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (jornada_venta_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (finalizada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (anulada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS operacion_detalles (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    operacion_id TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    detalle_principal_id TEXT,
    producto_nombre_snapshot TEXT NOT NULL CHECK (length(trim(producto_nombre_snapshot)) > 0),
    categoria_nombre_snapshot TEXT NOT NULL CHECK (length(trim(categoria_nombre_snapshot)) > 0),
    cantidad_total INTEGER NOT NULL CHECK (cantidad_total > 0),
    cantidad_servida INTEGER NOT NULL CHECK (cantidad_servida >= 0 AND cantidad_servida <= cantidad_total),
    cantidad_pagada INTEGER NOT NULL CHECK (cantidad_pagada >= 0 AND cantidad_pagada <= cantidad_total),
    precio_catalogo_unitario_centimos INTEGER NOT NULL CHECK (precio_catalogo_unitario_centimos >= 0),
    precio_aplicado_unitario_centimos INTEGER NOT NULL CHECK (precio_aplicado_unitario_centimos >= 0),
    tipo_ajuste_precio TEXT NOT NULL CHECK (tipo_ajuste_precio IN ('NINGUNO', 'DESCUENTO', 'PRECIO_PERSONALIZADO')),
    motivo_ajuste_precio TEXT,
    ajustado_por_usuario_id TEXT,
    subtotal_centimos INTEGER NOT NULL CHECK (subtotal_centimos >= 0),
    estado_servicio TEXT NOT NULL CHECK (estado_servicio IN ('PENDIENTE', 'SERVIDO')),
    nota TEXT CHECK (nota IS NULL OR length(trim(nota)) > 0),
    agregado_por_usuario_id TEXT NOT NULL,
    agregado_en_utc TEXT NOT NULL CHECK (length(trim(agregado_en_utc)) > 0),
    UNIQUE (id, operacion_id),
    CHECK (detalle_principal_id IS NULL OR detalle_principal_id <> id),
    CHECK (subtotal_centimos = cantidad_total * precio_aplicado_unitario_centimos),
    CHECK (
      (estado_servicio = 'SERVIDO' AND cantidad_servida = cantidad_total) OR
      (estado_servicio = 'PENDIENTE' AND cantidad_servida < cantidad_total)
    ),
    CHECK (
      (tipo_ajuste_precio = 'NINGUNO' AND precio_aplicado_unitario_centimos = precio_catalogo_unitario_centimos AND motivo_ajuste_precio IS NULL AND ajustado_por_usuario_id IS NULL) OR
      (tipo_ajuste_precio = 'DESCUENTO' AND precio_aplicado_unitario_centimos < precio_catalogo_unitario_centimos AND motivo_ajuste_precio IS NOT NULL AND length(trim(motivo_ajuste_precio)) > 0 AND ajustado_por_usuario_id IS NOT NULL) OR
      (tipo_ajuste_precio = 'PRECIO_PERSONALIZADO' AND precio_aplicado_unitario_centimos <> precio_catalogo_unitario_centimos AND motivo_ajuste_precio IS NOT NULL AND length(trim(motivo_ajuste_precio)) > 0 AND ajustado_por_usuario_id IS NOT NULL)
    ),
    FOREIGN KEY (operacion_id) REFERENCES operaciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (detalle_principal_id, operacion_id) REFERENCES operacion_detalles(id, operacion_id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (ajustado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (agregado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS operacion_mesas (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    operacion_id TEXT NOT NULL,
    mesa_id TEXT NOT NULL,
    rol_mesa TEXT NOT NULL CHECK (rol_mesa IN ('PRINCIPAL', 'VINCULADA')),
    vinculada_por_usuario_id TEXT NOT NULL,
    vinculada_en_utc TEXT NOT NULL CHECK (length(trim(vinculada_en_utc)) > 0),
    liberada_por_usuario_id TEXT,
    liberada_en_utc TEXT,
    CHECK (
      (liberada_por_usuario_id IS NULL AND liberada_en_utc IS NULL) OR
      (liberada_por_usuario_id IS NOT NULL AND liberada_en_utc IS NOT NULL)
    ),
    FOREIGN KEY (operacion_id) REFERENCES operaciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (vinculada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (liberada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS pedido_programado_datos (
    operacion_id TEXT PRIMARY KEY NOT NULL,
    cliente_id TEXT,
    cliente_nombre_snapshot TEXT NOT NULL CHECK (length(trim(cliente_nombre_snapshot)) > 0),
    cliente_telefono_snapshot TEXT NOT NULL CHECK (length(trim(cliente_telefono_snapshot)) > 0),
    entrega_programada_local TEXT NOT NULL CHECK (length(trim(entrega_programada_local)) > 0),
    zona_horaria TEXT NOT NULL CHECK (length(trim(zona_horaria)) > 0),
    tipo_entrega TEXT NOT NULL CHECK (tipo_entrega IN ('RECOJO', 'DOMICILIO')),
    direccion_snapshot TEXT,
    referencia_snapshot TEXT CHECK (referencia_snapshot IS NULL OR length(trim(referencia_snapshot)) > 0),
    estado_preparacion TEXT NOT NULL CHECK (estado_preparacion IN ('REGISTRADO', 'PENDIENTE_DE_PREPARACION', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'ANULADO')),
    estado_pago TEXT NOT NULL CHECK (estado_pago IN ('SIN_ADELANTO', 'CON_ADELANTO', 'PAGADO_PARCIALMENTE', 'PAGADO', 'PENDIENTE_DE_PAGO', 'PAGO_BLOQUEADO_REVISION')),
    motivo_bloqueo_pago TEXT,
    entregado_por_usuario_id TEXT,
    entregado_en_utc TEXT,
    nota_entrega TEXT CHECK (nota_entrega IS NULL OR length(trim(nota_entrega)) > 0),
    CHECK (tipo_entrega <> 'DOMICILIO' OR (direccion_snapshot IS NOT NULL AND length(trim(direccion_snapshot)) > 0)),
    CHECK (
      (estado_pago = 'PAGO_BLOQUEADO_REVISION' AND motivo_bloqueo_pago IS NOT NULL AND length(trim(motivo_bloqueo_pago)) > 0) OR
      (estado_pago <> 'PAGO_BLOQUEADO_REVISION' AND motivo_bloqueo_pago IS NULL)
    ),
    CHECK (
      (estado_preparacion = 'ENTREGADO' AND entregado_por_usuario_id IS NOT NULL AND entregado_en_utc IS NOT NULL) OR
      (estado_preparacion <> 'ENTREGADO' AND entregado_por_usuario_id IS NULL AND entregado_en_utc IS NULL)
    ),
    FOREIGN KEY (operacion_id) REFERENCES operaciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (entregado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS cobros (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    operacion_id TEXT NOT NULL,
    jornada_id TEXT NOT NULL,
    confirmado_por_usuario_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('PAGO_DETALLES', 'ADELANTO_PEDIDO', 'PAGO_GENERAL_PEDIDO')),
    importe_centimos INTEGER NOT NULL CHECK (importe_centimos > 0),
    saldo_resultante_centimos INTEGER NOT NULL CHECK (saldo_resultante_centimos >= 0),
    confirmado_en_utc TEXT NOT NULL CHECK (length(trim(confirmado_en_utc)) > 0),
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    FOREIGN KEY (operacion_id) REFERENCES operaciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (confirmado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS cobro_detalles (
    cobro_id TEXT NOT NULL,
    detalle_id TEXT NOT NULL,
    cantidad_pagada INTEGER NOT NULL CHECK (cantidad_pagada > 0),
    importe_asignado_centimos INTEGER NOT NULL CHECK (importe_asignado_centimos >= 0),
    PRIMARY KEY (cobro_id, detalle_id),
    FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (detalle_id) REFERENCES operacion_detalles(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS cobro_metodos (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    cobro_id TEXT NOT NULL,
    metodo_pago_id TEXT NOT NULL,
    monto_aplicado_centimos INTEGER NOT NULL CHECK (monto_aplicado_centimos > 0),
    monto_recibido_centimos INTEGER NOT NULL CHECK (monto_recibido_centimos >= monto_aplicado_centimos),
    vuelto_centimos INTEGER NOT NULL CHECK (vuelto_centimos >= 0 AND vuelto_centimos = monto_recibido_centimos - monto_aplicado_centimos),
    UNIQUE (cobro_id, metodo_pago_id),
    FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS gastos (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    jornada_id TEXT NOT NULL,
    categoria_gasto_id TEXT NOT NULL,
    metodo_pago_id TEXT NOT NULL,
    registrado_por_usuario_id TEXT NOT NULL,
    descripcion TEXT NOT NULL CHECK (length(trim(descripcion)) > 0),
    monto_centimos INTEGER NOT NULL CHECK (monto_centimos > 0),
    proveedor TEXT CHECK (proveedor IS NULL OR length(trim(proveedor)) > 0),
    nota TEXT CHECK (nota IS NULL OR length(trim(nota)) > 0),
    registrado_en_utc TEXT NOT NULL CHECK (length(trim(registrado_en_utc)) > 0),
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (categoria_gasto_id) REFERENCES categorias_gasto(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (registrado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS correcciones_economicas (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    jornada_id TEXT NOT NULL,
    creada_por_usuario_id TEXT NOT NULL,
    operacion_original_id TEXT,
    cobro_original_id TEXT,
    gasto_original_id TEXT,
    cierre_original_id TEXT,
    movimiento_original_id TEXT,
    correccion_original_id TEXT,
    motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
    impacto_caja TEXT NOT NULL CHECK (impacto_caja IN ('SUMA', 'RESTA', 'SIN_EFECTO')),
    monto_caja_centimos INTEGER NOT NULL CHECK (monto_caja_centimos >= 0),
    impacto_venta TEXT NOT NULL CHECK (impacto_venta IN ('SUMA', 'RESTA', 'SIN_EFECTO')),
    monto_venta_centimos INTEGER NOT NULL CHECK (monto_venta_centimos >= 0),
    jornada_venta_impactada_id TEXT,
    creada_en_utc TEXT NOT NULL CHECK (length(trim(creada_en_utc)) > 0),
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    CHECK (
      (operacion_original_id IS NOT NULL) +
      (cobro_original_id IS NOT NULL) +
      (gasto_original_id IS NOT NULL) +
      (cierre_original_id IS NOT NULL) +
      (movimiento_original_id IS NOT NULL) +
      (correccion_original_id IS NOT NULL) = 1
    ),
    CHECK (
      (impacto_caja = 'SIN_EFECTO' AND monto_caja_centimos = 0) OR
      (impacto_caja IN ('SUMA', 'RESTA') AND monto_caja_centimos > 0)
    ),
    CHECK (
      (impacto_venta = 'SIN_EFECTO' AND monto_venta_centimos = 0 AND jornada_venta_impactada_id IS NULL) OR
      (impacto_venta IN ('SUMA', 'RESTA') AND monto_venta_centimos > 0 AND jornada_venta_impactada_id IS NOT NULL)
    ),
    CHECK (correccion_original_id IS NULL OR correccion_original_id <> id),
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (operacion_original_id) REFERENCES operaciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cobro_original_id) REFERENCES cobros(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (gasto_original_id) REFERENCES gastos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cierre_original_id) REFERENCES cierres_jornada(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (movimiento_original_id) REFERENCES movimientos_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (correccion_original_id) REFERENCES correcciones_economicas(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (jornada_venta_impactada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS movimientos_caja (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    jornada_id TEXT NOT NULL,
    metodo_pago_id TEXT NOT NULL,
    registrado_por_usuario_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO_COBRO', 'SALIDA_GASTO', 'CORRECCION_ENTRADA', 'CORRECCION_SALIDA')),
    monto_centimos INTEGER NOT NULL CHECK (monto_centimos > 0),
    cobro_metodo_id TEXT,
    gasto_id TEXT,
    correccion_id TEXT,
    ocurrido_en_utc TEXT NOT NULL CHECK (length(trim(ocurrido_en_utc)) > 0),
    CHECK ((cobro_metodo_id IS NOT NULL) + (gasto_id IS NOT NULL) + (correccion_id IS NOT NULL) = 1),
    CHECK (
      (tipo = 'INGRESO_COBRO' AND cobro_metodo_id IS NOT NULL) OR
      (tipo = 'SALIDA_GASTO' AND gasto_id IS NOT NULL) OR
      (tipo IN ('CORRECCION_ENTRADA', 'CORRECCION_SALIDA') AND correccion_id IS NOT NULL)
    ),
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (registrado_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cobro_metodo_id) REFERENCES cobro_metodos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (gasto_id) REFERENCES gastos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (correccion_id) REFERENCES correcciones_economicas(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS auditoria (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    usuario_id TEXT NOT NULL,
    jornada_id TEXT,
    accion TEXT NOT NULL CHECK (length(trim(accion)) > 0),
    entidad_tipo TEXT NOT NULL CHECK (length(trim(entidad_tipo)) > 0),
    entidad_id TEXT NOT NULL CHECK (length(trim(entidad_id)) > 0),
    valores_anteriores_json TEXT,
    valores_nuevos_json TEXT,
    motivo TEXT CHECK (motivo IS NULL OR length(trim(motivo)) > 0),
    ocurrido_en_utc TEXT NOT NULL CHECK (length(trim(ocurrido_en_utc)) > 0),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE TABLE IF NOT EXISTS copias_seguridad (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('AUTOMATICA', 'MANUAL', 'EXPORTADA', 'PRE_MIGRACION', 'PRE_RESTAURACION')),
    jornada_id TEXT,
    cierre_id TEXT,
    creada_por_usuario_id TEXT NOT NULL,
    ruta TEXT NOT NULL CHECK (length(trim(ruta)) > 0),
    tamano_bytes INTEGER NOT NULL CHECK (tamano_bytes >= 0),
    checksum_sha256 TEXT CHECK (checksum_sha256 IS NULL OR length(checksum_sha256) = 64),
    version_esquema INTEGER NOT NULL CHECK (version_esquema >= 0),
    resultado TEXT NOT NULL CHECK (resultado IN ('EXITOSA', 'FALLIDA')),
    iniciada_en_utc TEXT NOT NULL CHECK (length(trim(iniciada_en_utc)) > 0),
    finalizada_en_utc TEXT NOT NULL CHECK (length(trim(finalizada_en_utc)) > 0),
    detalle_error TEXT,
    clave_idempotencia TEXT NOT NULL UNIQUE CHECK (length(trim(clave_idempotencia)) > 0),
    CHECK (
      (resultado = 'EXITOSA' AND checksum_sha256 IS NOT NULL AND detalle_error IS NULL) OR
      (resultado = 'FALLIDA' AND detalle_error IS NOT NULL AND length(trim(detalle_error)) > 0)
    ),
    FOREIGN KEY (jornada_id) REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (cierre_id) REFERENCES cierres_jornada(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_usuarios_rol_activo ON usuarios (rol_id, activo);`,
  `CREATE INDEX IF NOT EXISTS idx_categorias_listado ON categorias (activo, orden, nombre_normalizado);`,
  `CREATE INDEX IF NOT EXISTS idx_productos_catalogo ON productos (categoria_id, activo, disponibilidad, nombre_normalizado);`,
  `CREATE INDEX IF NOT EXISTS idx_productos_adicionales ON productos (es_adicional, activo);`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes (telefono_normalizado);`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_nombre_activo ON clientes (nombre, activo);`,
  `CREATE INDEX IF NOT EXISTS idx_metodos_pago_listado ON metodos_pago (activo, orden);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_jornadas_caja_abierta ON jornadas_caja (estado) WHERE estado = 'ABIERTA';`,
  `CREATE INDEX IF NOT EXISTS idx_jornadas_caja_estado_fecha ON jornadas_caja (estado, fecha_negocio);`,
  `CREATE INDEX IF NOT EXISTS idx_cierres_jornada_fecha ON cierres_jornada (jornada_id, cerrado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_cierres_jornada_anterior ON cierres_jornada (cierre_anterior_id);`,
  `CREATE INDEX IF NOT EXISTS idx_reaperturas_jornada_fecha ON reaperturas_jornada (jornada_id, reabierta_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_operaciones_tipo_estado_fecha ON operaciones (tipo, estado, creada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_operaciones_jornada_creacion ON operaciones (jornada_creacion_id);`,
  `CREATE INDEX IF NOT EXISTS idx_operaciones_jornada_venta ON operaciones (jornada_venta_id, finalizada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_operaciones_estado_saldo ON operaciones (estado, saldo_centimos);`,
  `CREATE INDEX IF NOT EXISTS idx_operacion_detalles_operacion_fecha ON operacion_detalles (operacion_id, agregado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_operacion_detalles_principal ON operacion_detalles (detalle_principal_id);`,
  `CREATE INDEX IF NOT EXISTS idx_operacion_detalles_producto ON operacion_detalles (producto_id);`,
  `CREATE INDEX IF NOT EXISTS idx_operacion_detalles_pago ON operacion_detalles (operacion_id, cantidad_pagada, cantidad_total);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_operacion_mesas_principal_activa ON operacion_mesas (operacion_id) WHERE rol_mesa = 'PRINCIPAL' AND liberada_en_utc IS NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_operacion_mesas_mesa_activa ON operacion_mesas (mesa_id) WHERE liberada_en_utc IS NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_operacion_mesas_operacion_historial ON operacion_mesas (operacion_id, vinculada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_operacion_mesas_mesa_historial ON operacion_mesas (mesa_id, vinculada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_pedido_programado_entrega ON pedido_programado_datos (entrega_programada_local, estado_preparacion);`,
  `CREATE INDEX IF NOT EXISTS idx_pedido_programado_pago ON pedido_programado_datos (estado_pago);`,
  `CREATE INDEX IF NOT EXISTS idx_pedido_programado_cliente ON pedido_programado_datos (cliente_id);`,
  `CREATE INDEX IF NOT EXISTS idx_cobros_operacion_fecha ON cobros (operacion_id, confirmado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_cobros_jornada_fecha ON cobros (jornada_id, confirmado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_cobros_usuario_fecha ON cobros (confirmado_por_usuario_id, confirmado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_cobro_detalles_detalle ON cobro_detalles (detalle_id, cobro_id);`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_jornada_fecha ON gastos (jornada_id, registrado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_categoria_fecha ON gastos (categoria_gasto_id, registrado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_metodo_fecha ON gastos (metodo_pago_id, registrado_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_operacion ON correcciones_economicas (operacion_original_id);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_cobro ON correcciones_economicas (cobro_original_id);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_gasto ON correcciones_economicas (gasto_original_id);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_cierre ON correcciones_economicas (cierre_original_id);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_movimiento ON correcciones_economicas (movimiento_original_id);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_anterior ON correcciones_economicas (correccion_original_id);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_jornada_fecha ON correcciones_economicas (jornada_id, creada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_jornada_venta ON correcciones_economicas (jornada_venta_impactada_id, creada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_correcciones_usuario_fecha ON correcciones_economicas (creada_por_usuario_id, creada_en_utc);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_cobro_metodo ON movimientos_caja (cobro_metodo_id) WHERE cobro_metodo_id IS NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_gasto ON movimientos_caja (gasto_id) WHERE gasto_id IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_movimientos_correccion ON movimientos_caja (correccion_id);`,
  `CREATE INDEX IF NOT EXISTS idx_movimientos_reporte ON movimientos_caja (jornada_id, metodo_pago_id, ocurrido_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_movimientos_tipo_fecha ON movimientos_caja (tipo, ocurrido_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_auditoria_entidad_fecha ON auditoria (entidad_tipo, entidad_id, ocurrido_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_fecha ON auditoria (usuario_id, ocurrido_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_auditoria_jornada_fecha ON auditoria (jornada_id, ocurrido_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_auditoria_accion_fecha ON auditoria (accion, ocurrido_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_copias_resultado_fecha ON copias_seguridad (resultado, finalizada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_copias_jornada_fecha ON copias_seguridad (jornada_id, finalizada_en_utc);`,
];

const MIGRATION_V1_SEED_STATEMENTS: readonly string[] = [
  `INSERT OR IGNORE INTO roles (id, codigo, nombre, activo, creado_en_utc)
   VALUES ('00000000-0000-7000-8000-000000000001', 'ADMINISTRADOR', 'Administrador', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
  `INSERT OR IGNORE INTO roles (id, codigo, nombre, activo, creado_en_utc)
   VALUES ('00000000-0000-7000-8000-000000000002', 'CAJERO', 'Cajero', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
  `INSERT OR IGNORE INTO metodos_pago (id, codigo, nombre, permite_vuelto, orden, activo)
   VALUES ('00000000-0000-7000-8000-000000000010', 'EFECTIVO', 'Efectivo', 1, 1, 1);`,
  `INSERT OR IGNORE INTO metodos_pago (id, codigo, nombre, permite_vuelto, orden, activo)
   VALUES ('00000000-0000-7000-8000-000000000011', 'YAPE', 'Yape', 0, 2, 1);`,
  `INSERT OR IGNORE INTO schema_version (version, nombre, checksum, aplicada_en_utc, duracion_ms)
   VALUES (1, 'initial_schema', '${MIGRATION_V1_CHECKSUM}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0);`,
];

export const MIGRATION_V1 = {
  toVersion: 1,
  statements: [...MIGRATION_V1_SCHEMA_STATEMENTS, ...MIGRATION_V1_SEED_STATEMENTS],
} as const satisfies capSQLiteVersionUpgrade;

export const DATABASE_MIGRATIONS: readonly capSQLiteVersionUpgrade[] = [MIGRATION_V1];
