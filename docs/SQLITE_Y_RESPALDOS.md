# Decisión técnica de SQLite, respaldos y restauración

## 1. Estado y alcance

- Estado: **aprobado; conexión y migración inicial implementadas**.
- Versión: 0.3.0.
- Fecha de verificación: 2026-07-29.
- Alcance: elección del plugin, compatibilidad, conexión, cifrado, copias, retención, restauración y pruebas requeridas.
- Fuera de alcance: implementación de respaldos portables, repositorios de negocio y pantallas.

Esta decisión complementa el [esquema lógico SQLite](ESQUEMA_LOGICO_SQLITE.md) aprobado. La base se crea mediante la migración versión 1, mantenida como código independiente.

## 2. Plugin seleccionado

Se propone fijar la dependencia directa:

```text
@capacitor-community/sqlite 8.1.0
```

Motivos:

- La versión 8.1.0 declara compatibilidad con `@capacitor/core >= 8.0.0`.
- El proyecto usa Capacitor 8.4.2.
- El plugin documenta Android mínimo API 23; el proyecto exige API 26.
- Admite conexiones, transacciones explícitas, consultas parametrizadas, migraciones incrementales, cifrado nativo, exportación e importación completa en JSON y validación del JSON.
- Su API está disponible en Android, que es la plataforma objetivo de la primera versión.

La dependencia se fijará a `8.1.0`, sin `^` ni `~`, igual que las demás dependencias directas del proyecto.

### 2.1 Compatibilidad verificada

| Elemento       | Proyecto | Plugin 8.1.0                               | Resultado                                                 |
| -------------- | -------- | ------------------------------------------ | --------------------------------------------------------- |
| Capacitor Core | 8.4.2    | 8.0.0 o posterior                          | Compatible                                                |
| Android mínimo | API 26   | API 23                                     | Compatible                                                |
| Java           | 21.0.11  | JDK 21 recomendado                         | Compatible                                                |
| compileSdk     | 36       | Ejemplo oficial 35                         | Compatible hacia adelante; requiere prueba nativa         |
| targetSdk      | 36       | Ejemplo oficial 35                         | Requiere prueba nativa con configuración actual           |
| Angular        | 21.2.18  | API TypeScript independiente del framework | Compatible en compilación; requiere prueba de integración |

La compilación APK todavía no puede verificarse porque Android Studio y el SDK 36 no están instalados. La selección es técnicamente compatible, pero quedará **verificada en dispositivo** únicamente después de compilar y ejecutar las pruebas Android.

### 2.2 Capacidades que se utilizarán

- `SQLiteConnection` como único administrador de conexiones.
- Una conexión de lectura/escritura para la base principal.
- Transacciones explícitas para operaciones económicas.
- Consultas con parámetros; nunca concatenación de datos del usuario.
- Actualizaciones incrementales registradas antes de abrir una versión nueva.
- Exportación completa a JSON para respaldos lógicos.
- Validación de JSON antes de guardar y antes de restaurar.
- Importación completa para restauración controlada.
- Comprobaciones de conexión y existencia de base durante el arranque.

No se utilizarán en la primera versión:

- Persistencia web mediante `jeep-sqlite` como fuente de producción.
- Sincronización parcial por `last_modified`.
- Descarga de bases mediante HTTP.
- TypeORM u otro ORM.
- Acceso directo al archivo SQLite desde componentes.

Las pruebas unitarias en navegador usarán repositorios falsos. Las pruebas reales de persistencia se ejecutarán en Android y, si resulta útil para integración automatizada, en un adaptador de pruebas separado.

## 3. Configuración propuesta de la base

- Nombre lógico: `kankachos_valeriano`.
- Versión inicial futura: `1`.
- Una sola conexión de escritura administrada por el adaptador SQLite.
- Claves foráneas activadas y comprobadas al abrir cada conexión.
- Escrituras serializadas por la capa de persistencia.
- Transacciones cortas; ninguna interacción de usuario permanece dentro de una transacción.
- Tiempo de espera ocupado limitado y errores traducidos a mensajes de dominio.
- Durabilidad conservadora: no se usará `synchronous=OFF`.
- No se alternará dinámicamente entre modos de diario.

El modo de diario definitivo se medirá en el dispositivo API 26. WAL se considera candidato por su comportamiento de lectura/escritura, pero no se aprobará sin probar cierre inesperado, recuperación y respaldo.

## 4. Cifrado de la base

Se propone habilitar el soporte de cifrado nativo del plugin y abrir la base principal cifrada.

- La clave de la base será aleatoria, no una contraseña humana.
- La clave se almacenará mediante el mecanismo seguro nativo utilizado por el plugin; nunca en `localStorage`, preferencias ordinarias, código fuente, logs ni respaldo sin protección.
- La clave local de la base y la contraseña de un respaldo portable serán secretos diferentes.
- Cambiar la clave será una acción administrativa, transaccional y auditada.
- La aplicación no mostrará ni registrará la clave local.

Riesgo administrativo: el plugin incluye SQLCipher incluso cuando una base se abre sin cifrado y advierte sobre posibles obligaciones de clasificación de exportación de software criptográfico. Esto debe revisarse antes de publicar la aplicación en una tienda; no bloquea las pruebas locales ni la distribución interna, pero no debe ignorarse.

## 5. Estrategia de respaldo

### 5.1 Formato canónico

El respaldo funcional será una **exportación lógica completa**, no una copia improvisada del archivo SQLite abierto.

Contenido del paquete:

```text
encabezado de formato
versión del formato de respaldo
versión del esquema
identificador de instalación y base
fecha y hora UTC
tipo de respaldo
JSON completo exportado por SQLite
resumen SHA-256
metadatos de cifrado y autenticación
```

El archivo portable utilizará una extensión propia, por ejemplo `.kvbackup`. El contenido sensible se cifrará con AES-256-GCM. La clave portable se derivará de una contraseña de respaldo conocida por el administrador mediante PBKDF2-HMAC-SHA-256, con sal y nonce aleatorios y parámetros guardados en el encabezado. El número de iteraciones se calibrará en la tablet para que sea costoso frente a ataques y aceptable para el usuario.

La contraseña portable:

- No se guarda en la base ni en el archivo.
- No se confunde con la contraseña de inicio de sesión.
- Se solicita al crear un respaldo exportable y al restaurarlo.
- Debe conservarse fuera de la tablet; perderla hace irrecuperable ese respaldo.

### 5.2 Consistencia de la copia

Todas las escrituras y respaldos pasarán por una cola única del adaptador:

1. Bloquear temporalmente nuevas escrituras.
2. Esperar que termine la transacción activa.
3. Ejecutar la exportación completa desde la conexión válida.
4. Validar el JSON mediante la API del plugin.
5. Añadir metadatos y cifrar el paquete.
6. Escribir primero a un archivo temporal privado.
7. Sincronizar, verificar tamaño y resumen.
8. Renombrar el temporal al nombre definitivo.
9. Registrar el resultado en `copias_seguridad`.
10. Liberar la cola de escritura.

Si cualquier paso falla, el archivo incompleto se descarta y se conserva el último respaldo válido. No se marcará como exitosa una copia que no haya superado validación, cifrado y verificación final.

No se copiará únicamente el archivo principal mientras una conexión esté activa. SQLite advierte que una copia durante una transacción puede mezclar estados y que, con diario o WAL, los archivos auxiliares forman parte del estado recuperable.

### 5.3 Tipos y momentos

| Tipo               | Momento                                           | Obligatorio                                 |
| ------------------ | ------------------------------------------------- | ------------------------------------------- |
| `AUTOMATICA`       | Después de cada cierre confirmado                 | Sí, si existe destino local disponible      |
| `MANUAL`           | Cuando lo solicita un administrador               | Sí, bajo demanda                            |
| `EXPORTADA`        | Copia portable elegida por el administrador       | Sí, antes de retirar o reemplazar la tablet |
| `PRE_MIGRACION`    | Antes de abrir una versión de esquema mayor       | Sí                                          |
| `PRE_RESTAURACION` | Antes de sustituir datos durante una restauración | Sí                                          |

Un cierre puede confirmarse aunque falle el respaldo posterior: el cierre económico no se revierte. La aplicación debe advertir el fallo de copia, conservar el cierre y solicitar crear una copia manual.

### 5.4 Retención propuesta

- Últimos 7 respaldos automáticos exitosos.
- Últimos 4 respaldos semanales exitosos.
- Últimos 3 respaldos previos a migración.
- El respaldo previo a restauración más reciente.
- Los respaldos exportados por el administrador no se eliminan automáticamente desde la aplicación.

La limpieza ocurre solo después de confirmar una copia nueva válida. Nunca elimina la única copia exitosa conocida.

### 5.5 Ubicación y copia automática de Android

Los respaldos de trabajo se guardarán primero en almacenamiento privado de la aplicación. Las copias portables se exportarán mediante un selector o mecanismo explícito de Android; la aplicación no asumirá una tarjeta SD ni una carpeta pública fija.

Se propone desactivar la copia automática indiscriminada de Android para la base, claves, preferencias y respaldos internos:

- `android:allowBackup="false"`.
- `android:fullBackupContent="false"` para Android 11 y anteriores.
- Reglas `dataExtractionRules` que excluyan base, preferencias, archivos privados y externos para Android 12 y posteriores.

La restauración debe pasar por el flujo validado de la aplicación y no por una reposición silenciosa del sistema que pueda mezclar versión de esquema, base y secretos de otro dispositivo.

## 6. Estrategia de restauración

La restauración es exclusiva del administrador y exige contraseña de respaldo.

### 6.1 Validación previa sin tocar la base activa

1. Leer encabezado y rechazar formatos desconocidos.
2. Derivar la clave y autenticar/descifrar el paquete.
3. Verificar SHA-256, tamaño y metadatos.
4. Rechazar un respaldo creado por una versión de esquema posterior a la soportada.
5. Validar el JSON con el plugin.
6. Importar en una base candidata temporal, nunca directamente sobre la base activa.
7. Abrir la candidata y ejecutar comprobación de integridad, claves foráneas, versión y tablas obligatorias.
8. Comparar conteos y totales de control incluidos en el respaldo.

Si la base candidata falla, se elimina únicamente la candidata y la base activa permanece intacta.

### 6.2 Sustitución controlada

1. Bloquear el uso de la aplicación.
2. Crear y verificar un respaldo `PRE_RESTAURACION` de la base activa.
3. Cerrar todas las conexiones.
4. Importar el JSON ya validado sobre la base principal con sustitución explícita.
5. Abrir la base y repetir integridad, claves foráneas, esquema y totales.
6. Aplicar migraciones incrementales si el respaldo es de una versión anterior.
7. Registrar la restauración en auditoría y reiniciar la sesión.

Si falla la sustitución, se intenta restaurar inmediatamente el respaldo previo. Si también falla, la aplicación queda bloqueada en modo de recuperación y no permite registrar operaciones sobre una base dudosa.

La importación completa del plugin puede reconstruir esquema, datos y vistas en transacciones separadas. Por eso la base candidata y el respaldo previo son obligatorios; la aplicación no asumirá que una importación completa fallida dejó intacta la base destino.

## 7. Reglas de migración relacionadas

- Registrar todas las actualizaciones incrementales antes de abrir una versión nueva.
- Crear un respaldo `PRE_MIGRACION` válido antes de iniciar.
- Ejecutar cada salto de versión dentro del mecanismo transaccional del plugin.
- Mantener además la tabla de historial `schema_version` con nombre y checksum propios del proyecto.
- No bajar de versión ni borrar la base para resolver un error.
- Si la actualización falla, conservar el respaldo y bloquear operaciones hasta recuperar la versión anterior o completar la migración.

El plugin documenta que crea una copia interna antes de sus actualizaciones y restaura ante fallos. El respaldo propio sigue siendo obligatorio porque debe ser verificable, portable y visible en la auditoría del negocio.

## 8. Pruebas de aceptación antes de producción

### Plugin y conexión

- Instalar exactamente 8.1.0 y sincronizar Android sin errores.
- Compilar con JDK 21, compileSdk/targetSdk 36 y minSdk 26.
- Abrir, cerrar y recuperar una conexión después de suspender o cerrar la aplicación.
- Confirmar la versión real de SQLite/SQLCipher en API 26 y en la tablet definitiva.
- Confirmar claves foráneas y transacciones con reversión.
- Probar doble apertura y consistencia de conexiones.

### Durabilidad

- Interrumpir la aplicación antes, durante y después de una transacción.
- Verificar que no quede una operación económica parcial.
- Medir WAL frente al modo de diario predeterminado y aprobar uno.
- Verificar recuperación tras apagado o cierre forzado.

### Respaldo

- Crear respaldo con base vacía y con datos representativos.
- Simular falta de espacio y escritura interrumpida.
- Detectar archivo truncado, checksum incorrecto, contraseña incorrecta y etiqueta AES-GCM inválida.
- Confirmar que la rotación nunca elimina la última copia válida.
- Confirmar que no se filtran claves ni contenido JSON en logs.

### Restauración

- Restaurar en la misma instalación y en una instalación nueva.
- Restaurar una versión anterior y migrarla.
- Rechazar una versión futura.
- Corromper la base candidata y comprobar que la activa permanece intacta.
- Fallar la sustitución y recuperar desde `PRE_RESTAURACION`.
- Comparar operaciones, cobros, caja, cierres y auditoría antes y después.

### Android

- Probar API 26 y una versión Android actual.
- Confirmar que Auto Backup y transferencia de dispositivo no copian datos internos.
- Probar exportación e importación mediante el selector de archivos.
- Verificar comportamiento sin internet y con poco almacenamiento.

## 9. Riesgos y pendientes de implementación

- Falta Android Studio/SDK 36 para verificar el binario nativo.
- Debe probarse el cifrado y recuperación de secreto en un dispositivo real.
- Debe elegirse el mecanismo Capacitor/Android para guardar y seleccionar archivos portables.
- Los parámetros PBKDF2 se fijarán después de medirlos en la tablet.
- Debe revisarse la obligación administrativa asociada a distribuir SQLCipher.
- La política económica de anulación de pedidos con adelanto continúa pendiente y es independiente de esta decisión.

## 10. Fuentes técnicas verificadas

- [Repositorio y matriz de métodos del plugin](https://github.com/capacitor-community/sqlite)
- [Paquete 8.1.0 y dependencia par de Capacitor](https://github.com/capacitor-community/sqlite/blob/master/package.json)
- [Importación, exportación y validación JSON](https://github.com/capacitor-community/sqlite/blob/master/docs/ImportExportJson.md)
- [Actualizaciones incrementales de base](https://github.com/capacitor-community/sqlite/blob/master/docs/UpgradeDatabaseVersion.md)
- [Riesgos al copiar una base SQLite activa](https://www.sqlite.org/howtocorrupt.html#_backup_or_restore_while_a_transaction_is_active)
- [API oficial de copias consistentes de SQLite](https://www.sqlite.org/backup.html)
- [Reglas de Auto Backup de Android](https://developer.android.com/identity/data/autobackup)

## 11. Estado de implementación

- `@capacitor-community/sqlite` 8.1.0 instalado como dependencia exacta.
- Plugin sincronizado correctamente con el proyecto Android.
- Cifrado Android habilitado en la configuración de Capacitor.
- Auto Backup y transferencia automática excluidos mediante manifiesto y reglas de extracción.
- Adaptador de conexión, secreto aleatorio de 256 bits y diagnóstico implementados.
- Inicialización concurrente deduplicada y errores nativos encapsulados.
- Migración versión 1 registrada antes de crear o abrir la conexión.
- 25 tablas, restricciones, claves e índices implementados; no se sembraron productos.
- 27 pruebas específicas de base aprobadas; 29 pruebas totales del proyecto aprobadas.
- Compilación web de producción y sincronización Android aprobadas.
- Auditoría de dependencias de producción: cero vulnerabilidades.
- Compilación y ejecución nativas pendientes por ausencia de Android SDK 36.
- Migración probada sobre SQLite real de Node; validación nativa todavía pendiente.

## 12. Siguiente tarea

Revisar y aprobar la migración inicial versión 1. La prueba nativa definitiva seguirá pendiente hasta disponer del SDK Android; después de la aprobación funcional, la siguiente fase es autenticación, roles y permisos.
