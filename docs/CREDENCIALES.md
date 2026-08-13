# Credenciales y aprovisionamiento inicial

## 1. Estado y alcance

- Estado: **autenticación local implementada de extremo a extremo; validación nativa pendiente**.
- Versión: 0.3.0.
- Fecha: 2026-07-29.
- Alcance: contraseña, Argon2id, creación inicial, login, bloqueo temporal, recuperación local, sesión y guards.
- Fuera de alcance: administración posterior de cajeros y módulos operativos.

## 2. Decisiones aprobadas

- Una instalación nueva debe crear una cuenta `ADMINISTRADOR` y una cuenta `CAJERO` para probar y utilizar posteriormente el login.
- Sus nombres de usuario, nombres visibles y contraseñas serán elegidos durante la configuración inicial.
- No existirán credenciales predeterminadas, contraseñas incluidas en el código ni usuarios de demostración en producción.
- Cada contraseña admite de 8 a 64 caracteres Unicode, decisión aprobada por el negocio.
- Las contraseñas no se normalizan, recortan ni almacenan en texto plano.
- Los nombres de usuario se recortan, normalizan con Unicode NFKC y comparan sin distinguir mayúsculas.

## 3. Almacenamiento de contraseñas

Se fijó `hash-wasm` 4.12.0 y Argon2id versión 19 con estos parámetros mínimos:

```text
memoria:      19 456 KiB (19 MiB)
iteraciones:  2
paralelismo:  1
sal:          16 bytes aleatorios por contraseña
hash:         32 bytes
```

La base conserva por separado el hash hexadecimal, la sal hexadecimal y el identificador versionado con todos los parámetros. La comparación del hash calculado evita una salida anticipada dependiente del contenido.

Estos valores corresponden al mínimo recomendado actualmente para Argon2id por [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Deben medirse en la tablet definitiva antes de aumentar el costo; nunca se reducirán automáticamente por debajo de esta base.

## 4. Aprovisionamiento inicial

El caso de uso recibe los datos de ambas cuentas y realiza:

1. Comprobación temprana de que no exista ningún usuario.
2. Validación de identidades, nombres diferentes y ambas contraseñas.
3. Cálculo independiente de los dos hashes y del hash del código local de recuperación.
4. Creación de un administrador y un cajero activos.
5. Creación de un código de recuperación del administrador, mostrado una sola vez.
6. Creación de auditoría sin datos de credenciales.
7. Persistencia de usuarios, credencial de recuperación y auditoría en una sola transacción SQLite.

El repositorio vuelve a comprobar la ausencia de usuarios dentro de `BEGIN IMMEDIATE`. Si falla una inserción, un rol requerido o la auditoría, revierte toda la operación. El aprovisionamiento permanece bloqueado aunque los usuarios existentes estén desactivados.

## 5. Integración

- `Argon2idPasswordHasher` implementa creación y verificación de credenciales.
- `ProvisionInitialUsersUseCase` coordina las reglas sin depender de Angular o SQLite.
- `SqliteInitialUsersRepository` encapsula SQL parametrizado y la transacción.
- `CapacitorSqliteAdapter` expone la conexión cifrada ya administrada al repositorio; no se abre una segunda conexión.
- El repositorio está registrado en la configuración de dependencias de Angular.

La interfaz detecta si existen usuarios: una instalación nueva abre la configuración inicial y una instalación configurada abre el login. El procedimiento operativo está en `docs/GUIA_RECUPERACION_CONTRASENA.md`.

## 6. Login, bloqueo y sesión

- El nombre de usuario se normaliza antes de consultar SQLite.
- Cinco fallos consecutivos bloquean la cuenta durante cinco minutos y reinician el contador.
- El mensaje de error es genérico para usuario desconocido, contraseña incorrecta, cuenta inactiva o bloqueo vigente.
- Un login correcto limpia intentos y bloqueo, y crea auditoría en una transacción.
- La sesión permanece solo en memoria y vence tras una hora sin actividad.
- Los guards separan autenticación de autorización por permiso.

## 7. Recuperación local

- El código contiene 24 caracteres de un alfabeto sin símbolos ambiguos, agrupados de cuatro en cuatro.
- Solo el hash Argon2id y su sal se guardan en SQLite.
- Una recuperación cambia la contraseña, consume el código anterior, crea uno nuevo, limpia el bloqueo y registra auditoría atómicamente.
- Los códigos anteriores permanecen en el historial como usados; nunca se reactivan.

## 8. Verificación automatizada

- Longitudes mínima y máxima, incluyendo Unicode.
- Errores sin retener la contraseña rechazada.
- Sales y hashes distintos para una misma contraseña.
- Verificación correcta, incorrecta y algoritmo desconocido.
- Creación exacta de administrador y cajero.
- Bloqueo de repetición y de nombres duplicados.
- Ausencia de credenciales en auditoría.
- Persistencia SQLite y reversión completa ante fallos.
- Acceso del repositorio únicamente después de abrir la conexión.
- Bloqueo en el quinto fallo y liberación después de cinco minutos.
- Limpieza y auditoría de un login correcto.
- Expiración de sesión tras una hora exacta sin actividad.
- Autorización de guards para administrador y cajero.
- Generación, normalización, uso único y rotación del código local.
- Recuperación transaccional de la contraseña del administrador.

La prueba real de rendimiento y compatibilidad WebAssembly en Android API 26 sigue pendiente hasta disponer del SDK y del dispositivo o emulador.
