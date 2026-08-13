# Política de roles y permisos

## 1. Estado y alcance

- Estado: **implementada e integrada con usuarios, sesión, operaciones, reportes y correcciones económicas**.
- Versión: 0.7.0.
- Fecha: 2026-07-29.
- Alcance: roles iniciales, permisos declarados y rechazo uniforme de acciones no autorizadas.
- Fuera de alcance actual: aplicar los permisos declarados a respaldos, restauración y los módulos administrativos que todavía no se han implementado.

La implementación de referencia está en `src/app/domain/auth/authorization-policy.ts`. Es independiente de Angular, Ionic y SQLite para que todos los casos de uso apliquen una sola política.

## 2. Roles iniciales

Solo existen:

- `ADMINISTRADOR`.
- `CAJERO`.

No se define un rol supervisor ni se permite crear roles dinámicos en la primera versión.

## 3. Permisos compartidos

Administrador y cajero pueden:

- Iniciar sesión.
- Abrir una jornada normal.
- Registrar ventas rápidas.
- Abrir y modificar cuentas de mesa.
- Marcar productos servidos.
- Modificar precios dentro de una operación y aplicar descuentos.
- Cobrar y registrar pagos separados o combinados.
- Registrar gastos.
- Cambiar la disponibilidad de productos.
- Consultar operaciones del día.
- Finalizar cuentas.
- Cerrar la jornada.

## 4. Permisos exclusivos del administrador

Solo el administrador puede:

- Administrar cajeros, productos, categorías, mesas y métodos de pago.
- Administrar las categorías de gasto.
- Modificar precios permanentes del catálogo.
- Ver reportes administrativos.
- Crear y restaurar respaldos.
- Modificar configuración.
- Realizar un cierre excepcional.
- Reabrir o corregir un cierre.
- Crear correcciones económicas compensatorias.

## 5. Acciones no concedidas

La política no declara permisos para borrar auditoría, eliminar datos históricos, eliminar operaciones finalizadas, crear administradores desde la gestión ordinaria ni cambiar roles. Por tanto, ningún rol puede autorizar esas acciones mediante esta matriz.

La creación segura del administrador y cajero iniciales está definida en [`docs/CREDENCIALES.md`](CREDENCIALES.md). Es un proceso único de instalación y no debe confundirse con la administración cotidiana de cajeros.

## 6. Aplicación de la política

- `can` permite consultar un permiso sin producir efectos.
- `assertCan` detiene el caso de uso con `PermissionDeniedError` cuando el permiso falta.
- El error muestra un mensaje amigable y no contiene SQL, stack traces ni datos técnicos.
- Las colecciones públicas de roles y permisos están congeladas en tiempo de ejecución.
- Las páginas y guards podrán consultar la política para navegación, pero el caso de uso deberá volver a verificar el permiso antes de modificar datos.

## 7. Verificación

Las pruebas cubren:

- Rechazo de roles no aprobados.
- Apertura normal, operaciones compartidas y cierre de jornada para ambos roles.
- Todos los permisos declarados para el administrador.
- Rechazo de permisos administrativos para el cajero.
- Cierre excepcional, reapertura y correcciones solo para el administrador.
- Administración de categorías de gasto solo para el administrador; ambos roles conservan el permiso de registrar gastos.
- Error de dominio sanitizado.
- Colecciones inmutables.

La integración con usuarios activos, credenciales, sesión y guards está probada. El cambio de disponibilidad y la apertura normal vuelven a comprobar el permiso dentro de sus casos de uso. La apertura guarda jornada y auditoría en una sola transacción; cierre excepcional y reapertura continúan reservados al administrador. Los reportes históricos comprueban `VER_REPORTES` y las correcciones compensatorias comprueban `CREAR_CORRECCION_ECONOMICA` dentro de sus casos de uso, por lo que el cajero también es rechazado aunque intente acceder directamente.
