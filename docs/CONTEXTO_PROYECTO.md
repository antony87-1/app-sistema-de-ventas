# Contexto del proyecto Kankachos Valeriano

## 1. Propósito y control

Este es el archivo permanente de contexto del proyecto. Debe revisarse antes de generar código y actualizarse al terminar cada tarea aprobada.

- Versión del documento: 0.65.0.
- Última actualización: 2026-07-31.
- Fase actual: Fase 11 completada y ajustes de validación en dispositivo incorporados antes de iniciar la Fase 12.
- Estado general: el flujo operativo incluye cambio de usuario, selectores funcionales de mesa/cuenta, administración auditada de mesas y líneas personalizadas en pedidos programados. El diseño contractual de reportes estadísticos está iniciado sin gráficos todavía.

## 2. Descripción del negocio

Kankachos Valeriano es un restaurante de un solo local, con una sola caja física y un dispositivo Android utilizado a la vez. La conexión a internet no es estable y no existirá un servidor local permanentemente encendido.

La aplicación debe funcionar sin internet y registrar ventas rápidas, cuentas de mesa, pedidos programados, cobros, jornadas de caja, gastos, cierres, reportes, auditoría y respaldos.

El dispositivo previsto es provisionalmente una Xiaomi Redmi Pad SE de 11 pulgadas, preferentemente con 8 GB de RAM y 128 GB de almacenamiento. El diseño deberá adaptarse también a celulares Android.

## 3. Objetivo

Reducir errores de cobro, pérdida de información, confusión entre cuentas, diferencias de caja y olvido de pagos mediante una aplicación táctil, rápida y confiable.

## 4. Alcance de la primera versión

- Aplicación Android de uso interno y operación offline.
- Usuarios administrador y cajero.
- Catálogo y disponibilidad simple de productos.
- Jornada de caja, gastos y cierre.
- Ventas rápidas y cuentas de mesa.
- Pagos separados, parciales y combinados.
- Pedidos programados.
- Reportes PDF y CSV o Excel.
- Auditoría, respaldos y restauración controlada.

## 5. Fuera de alcance

- Facturación electrónica.
- Impresión de tickets.
- Cálculo de ganancias.
- Inventario numérico exacto.
- Devoluciones.
- PIN de cambio rápido de cajero.
- Spring Boot, PostgreSQL, microservicios o servidor obligatorio.
- Sincronización entre varios dispositivos o locales.

## 6. Terminología oficial

- **Venta rápida:** venta registrada y cobrada inmediatamente.
- **Cuenta de mesa:** consumo abierto asociado a una o varias mesas vinculadas.
- **Pedido programado:** solicitud para una fecha u hora futura.
- **Abono:** pago parcial, utilizado principalmente en pedidos programados.
- **Pago separado:** pago de productos o cantidades concretas de una cuenta.
- **Jornada de caja:** operaciones económicas del negocio entre apertura y cierre manual.

No se usará el término genérico “pedido” para una cuenta de mesa.

## 7. Arquitectura aprobada

```text
Página o componente Ionic
        ↓
Caso de uso
        ↓
Servicio de dominio
        ↓
Interfaz de repositorio
        ↓
Adaptador SQLite
        ↓
SQLite local
```

- Las páginas muestran información, administran estado visual e invocan casos de uso.
- Las páginas no ejecutan SQL ni deciden reglas de caja.
- Los casos de uso coordinan acciones concretas.
- Los servicios de dominio validan estados, permisos, dinero, pagos y saldos.
- Los repositorios encapsulan persistencia y mapeo.
- SQLite será la fuente principal de datos.
- Cada acción económica importante utilizará una transacción corta con reversión completa si falla.

## 8. Tecnologías y versiones verificadas

| Componente           | Versión fijada | Observación                                                  |
| -------------------- | -------------: | ------------------------------------------------------------ |
| Node.js              |        22.15.0 | Instalado; compatible con Angular 21 y Capacitor 8           |
| npm                  |         10.9.2 | Instalado                                                    |
| Angular              |        21.2.18 | Elegido porque Angular 22 requiere Node 22.22.3 o posterior  |
| Ionic Angular        |         8.8.15 | Acepta Angular 16 o posterior                                |
| Capacitor            |          8.4.2 | Requiere Node 22 o posterior                                 |
| SQLite Capacitor     |          8.1.0 | Plugin instalado y sincronizado; cifrado Android habilitado  |
| Hash Argon2id        |         4.12.0 | `hash-wasm`, dependencia exacta sin credenciales por defecto |
| TypeScript           |          5.9.3 | Compatible con Angular 21                                    |
| Vitest               |         4.1.10 | Entorno de pruebas unitarias                                 |
| Java                 |    21.0.11 LTS | Instalado                                                    |
| Android mínimo       |         API 26 | Android 8.0, decisión aprobada                               |
| compileSdk/targetSdk |         API 36 | Configuración generada por Capacitor 8.4.2                   |

Identificador Android aprobado: `pe.kankachosvaleriano.app`.

Fuentes oficiales consultadas:

- Compatibilidad de Angular: https://angular.dev/reference/versions
- Documentación de Ionic: https://ionicframework.com/docs
- Documentación de Capacitor: https://capacitorjs.com/docs
- Plataformas del SDK Android: https://developer.android.com/tools/releases/platforms

Android Studio y el SDK Android no están instalados o configurados en el entorno actual. Esto no impide crear y sincronizar el proyecto, pero sí impide verificar todavía una compilación APK nativa.

El plugin `@capacitor-community/sqlite` 8.1.0 está instalado y sincronizado con Android. La selección, el cifrado, los respaldos y la restauración están aprobados en [`docs/SQLITE_Y_RESPALDOS.md`](SQLITE_Y_RESPALDOS.md), versión 0.3.0. La compilación nativa permanece pendiente por ausencia de Android SDK 36.

## 9. Convenciones de código

- TypeScript estricto y plantillas Angular estrictas.
- Componentes standalone.
- Nombres descriptivos y funciones pequeñas.
- Inyección de dependencias e interfaces para repositorios.
- No usar `any` sin justificación.
- No guardar dinero como punto flotante.
- No dispersar SQL ni ejecutarlo desde componentes.
- Los comentarios explicarán motivos, no repetirán el código.
- Dependencias directas fijadas a versiones exactas.

## 10. Reglas de usuarios y seguridad

Roles iniciales:

- `ADMINISTRADOR`.
- `CAJERO`.

Ambos podrán cerrar la jornada. El cajero puede registrar la diferencia y su justificación, pero no modificar un cierre confirmado. Solo el administrador puede reabrir, corregir, crear movimientos compensatorios y confirmar un cierre corregido. Cada cierre registra automáticamente usuario, fecha y hora y conserva relación con el cierre anterior cuando corresponda.

Las contraseñas se almacenarán con hash seguro y sal individual. La restauración de respaldos será exclusiva del administrador. Las operaciones sensibles conservarán auditoría y no expondrán datos técnicos al cajero.

La matriz implementada está documentada en [`docs/AUTORIZACION.md`](AUTORIZACION.md), versión 0.7.0. Ambos roles pueden abrir una jornada normal, registrar gastos, realizar las operaciones diarias aprobadas y cerrar jornada. Solo el administrador puede administrar categorías de gasto, además de gestión, reportes, respaldo/restauración, cierre excepcional, reapertura y correcciones económicas. Ningún rol recibe permisos para borrar auditoría o datos históricos.

La política de credenciales está documentada en [`docs/CREDENCIALES.md`](CREDENCIALES.md), versión 0.1.0. La instalación solicitará los datos de un administrador y un cajero, sin valores predeterminados. Las contraseñas admiten de 8 a 64 caracteres y se almacenan mediante Argon2id v19 con sal individual, 19 MiB de memoria, dos iteraciones y paralelismo uno.

## 11. Reglas de jornada y caja

- Existe una sola jornada abierta para el negocio, no una por cajero.
- Se abre manualmente con un monto inicial.
- Administrador y cajero pueden realizar una apertura normal.
- Cada movimiento conserva el usuario que lo realizó.
- El efectivo esperado se calcula desde movimientos confirmados:

```text
monto inicial
+ cobros confirmados en efectivo
- gastos pagados en efectivo
```

- No existirá un saldo de caja editable manualmente.
- Una jornada abierta de un día anterior bloquea la apertura de otra.
- Primero debe cerrarse la jornada pendiente.
- Solo el administrador puede efectuar un cierre excepcional de una jornada anterior y debe justificarlo.
- No se permite cerrar con mesas abiertas, cuentas pendientes de pago o diferencias de caja no justificadas.
- La interfaz debe enumerar claramente cada elemento que bloquea el cierre.
- Efectivo esperado, sobrante y faltante se calculan automáticamente.
- Los cierres confirmados son inmutables.
- Una reapertura conserva el cierre original, exige motivo y genera auditoría.
- Una corrección se realiza con un nuevo cierre o movimiento compensatorio relacionado; nunca sobrescribe montos originales.
- Las categorías de gasto tendrán una lista inicial y solo el administrador podrá crearlas, modificarlas, ordenarlas o desactivarlas.
- El cajero podrá seleccionar categorías activas al registrar un gasto, pero no administrarlas.

## 12. Reglas de operaciones y cobros

- Tipos conceptuales: venta rápida, cuenta de mesa y pedido programado.
- Una cuenta puede recibir varios cobros y continuar abierta con saldo cero.
- Puede recibir productos después de un cobro.
- Los pagos separados se asocian a productos o cantidades concretas; no habrá abonos libres en cuentas de mesa.
- El adelanto libre se utiliza exclusivamente en pedidos programados.
- Se permiten efectivo, Yape y pagos combinados.
- Yape es confirmado manualmente por el cajero.
- El vuelto se calcula solo sobre la parte pagada en efectivo.
- Un cobro confirmado no puede editarse.
- Una operación finalizada queda bloqueada y en modo de consulta.
- Las correcciones posteriores a la finalización se realizan mediante movimientos compensatorios administrativos relacionados con el registro original.
- No habrá devoluciones en la primera versión.
- Todo importe persistido se expresará en céntimos enteros.
- Un pedido programado mantiene por separado estado de preparación y estado de pago.
- Un adelanto registra jornada, método, usuario, fecha, hora y saldo resultante.

## 13. Reglas de mesas unidas

- Las mesas unidas se manejan como una sola cuenta.
- Se elige una mesa principal.
- Las demás mesas permanecen vinculadas visualmente, por ejemplo, “Mesa 4 + Mesa 5”.
- Todos los productos y pagos pertenecen a la misma cuenta mientras continúe la unión.
- Separar mesas no divide productos, consumos ni pagos existentes.
- La cuenta continúa en la mesa principal y la mesa liberada queda disponible para una cuenta nueva.
- Las asociaciones conservan fecha de vinculación y liberación para mantener el historial.
- Una mesa puede mantener como máximo dos cuentas abiertas independientes, identificadas visualmente como Cuenta A y Cuenta B.

## 14. Persistencia, migraciones y respaldos

El modelo conceptual aprobado está documentado en [`docs/MODELO_DATOS.md`](MODELO_DATOS.md), versión 0.3.0. El contrato lógico aprobado y su referencia de implementación están en [`docs/ESQUEMA_LOGICO_SQLITE.md`](ESQUEMA_LOGICO_SQLITE.md), versión 0.5.0. La decisión técnica aprobada de conexión, cifrado y copias está en [`docs/SQLITE_Y_RESPALDOS.md`](SQLITE_Y_RESPALDOS.md), versión 0.3.0. Las migraciones ejecutables versiones 1 a 7 están registradas antes de crear o abrir la conexión. La v3 incorpora el catálogo inicial, historial local de imágenes y un límite transaccional de dos cuentas activas por mesa; la v4 incorpora las siete categorías iniciales de gasto; la v5 fija su orden; la v6 conserva la jornada comercial de entrega; y la v7 incorpora el producto interno reservado para líneas personalizadas de pedidos programados sin mostrarlo en el catálogo.

Decisiones conceptuales aprobadas:

- `Operacion` como raíz común de venta rápida, cuenta de mesa y pedido programado.
- Detalles con cantidades total, servida y pagada.
- Cobros relacionados con cantidades concretas y distribuidos entre métodos.
- Cada cobro pertenece a la jornada en que se recibe, permitiendo pedidos programados que abarcan varios días.
- Asociación histórica entre una cuenta, su mesa principal y mesas vinculadas.
- Estados de operación, servicio, preparación y pago separados.
- Historial inmutable de cierres y movimientos.
- Instantáneas de producto, precio y contacto para preservar datos históricos.
- Correcciones mediante movimientos o cierres compensatorios relacionados con el original.
- Jornada de caja determinada por el momento del cobro o gasto.
- Jornada de venta determinada por la finalización de la atención o entrega.
- Adicionales representados como detalles hijos con importe propio.
- Anulación bloqueada para pedidos programados con adelanto mientras no exista política de devolución o retención.
- Descuentos asignados a detalles y cantidades concretas mediante su precio unitario aplicado; no existe descuento global sin asignación.
- Estados de pago programado definidos según pago realizado y exigibilidad del saldo.
- Correcciones con impacto independiente sobre caja y venta, expresado como `SUMA`, `RESTA` o `SIN_EFECTO` y un monto positivo.

Reglas confirmadas para persistencia:

- SQLite activará claves foráneas en cada conexión.
- Se usarán restricciones, índices y claves para impedir datos huérfanos.
- El dinero se guardará como enteros en céntimos.
- Las migraciones conservarán datos y mantendrán `schema_version`.
- Nunca se borrará la base para resolver una migración.
- Los respaldos deberán ser consistentes y no copiarán el archivo durante escrituras activas.

## 15. Estrategia de pruebas

Se aplicará TDD a reglas de dinero, pagos, saldos, estados, permisos, transacciones, migraciones y respaldos.

Tipos previstos:

- Pruebas unitarias y de servicios de dominio.
- Pruebas de casos de uso.
- Pruebas de repositorios e integración SQLite.
- Pruebas de componentes.
- Pruebas E2E para flujos críticos.
- Pruebas manuales en dispositivo Android.

Se diferenciará entre prueba escrita, ejecutada, aprobada y pendiente.

Pruebas de Fase 1:

- Creación del componente raíz: ejecutada y aprobada.
- Existencia del contenedor Ionic y del enrutador raíz: ejecutada y aprobada.
- Resultado unitario: 2 pruebas aprobadas el 2026-07-28.
- Compilación TypeScript y Angular de producción: ejecutada y aprobada.
- Sincronización de recursos web con Android: ejecutada y aprobada.
- Compilación APK: pendiente por ausencia de Android Studio y Android SDK 36.

Pruebas de Fase 2.6:

- Servicio de conexión y diagnóstico: 7 pruebas aprobadas.
- Adaptador Capacitor SQLite, cifrado y secreto: 8 pruebas aprobadas.
- Resultado total del proyecto: 17 pruebas aprobadas el 2026-07-29.
- Compilación web de producción: ejecutada y aprobada.
- Sincronización del plugin SQLite con Android: ejecutada y aprobada.
- Auditoría de dependencias de producción: cero vulnerabilidades.
- Compilación y ejecución nativa SQLite: pendientes por ausencia de Android SDK 36.

Vitest requiere una configuración de resolución para procesar correctamente los módulos ESM de Ionic Angular en Windows. La configuración está centralizada en `vitest-base.config.ts`; las pruebas ejercitan los componentes Ionic reales y no los sustituyen por mocks.

Pruebas de Fase 2.7:

- Migración versión 1 sobre SQLite real en memoria: 11 pruebas aprobadas.
- Registro de la migración antes de crear la conexión: 1 prueba nueva aprobada.
- Estructura verificada: 25 tablas, claves foráneas, restricciones, índices y datos mínimos idempotentes.
- Productos sembrados: cero; sus nombres, tamaños y precios siguen pendientes.
- Las reglas que requieren sumas entre tablas, permisos o estados de varias entidades permanecen para los casos de uso transaccionales de fases posteriores.
- Compilación y ejecución nativa de la migración: pendientes por ausencia de Android SDK 36.

Pruebas de Fase 3.1:

- Política de roles y permisos: 7 pruebas aprobadas mediante TDD.
- Se verifican los dos roles permitidos, permisos compartidos, permisos administrativos, correcciones exclusivas y error de dominio sanitizado.
- Las listas públicas de roles y permisos son inmutables en tiempo de ejecución.
- Resultado total: 25 pruebas Angular y 11 pruebas SQLite aprobadas; 36 en conjunto.
- Usuarios, contraseñas, login, sesión, guards y auditoría todavía no están implementados.

Pruebas de Fase 3.2:

- Política de contraseña, Argon2id y aprovisionamiento de dominio: 10 pruebas aprobadas.
- Repositorio SQLite de usuarios iniciales: 4 pruebas aprobadas con motor real.
- Acceso del repositorio a la conexión administrada: 2 pruebas nuevas aprobadas.
- Se verificaron sal individual, ausencia de texto plano, creación de ambos roles, auditoría sin credenciales, bloqueo permanente y reversión transaccional.
- Resultado total: 37 pruebas Angular y 15 pruebas SQLite; 52 en conjunto.
- Rendimiento y compatibilidad WebAssembly en Android API 26: pendientes de prueba nativa.

Pruebas de Fase 3.3:

- Login, bloqueo temporal, sesión, guards y recuperación local: 16 pruebas Angular nuevas mediante TDD.
- Migración SQLite v2, login y recuperación transaccional: 8 pruebas SQLite nuevas.
- Resultado total: 53 pruebas Angular y 23 pruebas SQLite; 76 en conjunto.
- Compilación web, formato y sincronización Android aprobados.
- Prueba nativa Android API 26: pendiente.

Pruebas de Fase 3.4:

- Configuración inicial, login y recuperación: 3 pruebas de componentes nuevas mediante TDD.
- Resultado total: 56 pruebas Angular y 23 pruebas SQLite; 79 en conjunto.
- Compilación de producción sin advertencias y sincronización Android aprobadas.
- La actividad de teclado o toque renueva la sesión; una hora sin actividad la invalida.
- Ejecución real en Android API 26: pendiente por ausencia del SDK.

## 16. Estructura inicial

```text
src/app/core       Infraestructura transversal
src/app/domain     Dominio y contratos
src/app/features   Interfaz por funcionalidad
src/app/shared     Elementos reutilizables
src/theme          Variables visuales globales
android            Proyecto nativo Capacitor
docs               Documentación permanente
```

Las carpetas específicas de cada módulo se crearán cuando exista una tarea aprobada que justifique su uso.

## 17. Estado de módulos

| Módulo                      | Estado                                   |
| --------------------------- | ---------------------------------------- |
| Proyecto base Angular/Ionic | Implementado y verificado                |
| Capacitor Android           | Creado y sincronizado con API mínima 26  |
| Modelo conceptual de datos  | Aprobado                                 |
| Esquema lógico SQLite       | Aprobado e implementado hasta versión 5  |
| Plugin y conexión SQLite    | Implementados y verificados en web       |
| Estrategia de copia         | Aprobada; implementación pendiente       |
| Migraciones SQLite          | Versiones 1 a 5 implementadas y probadas |
| Autenticación               | Implementada; prueba nativa pendiente    |
| Catálogo                    | Lectura y disponibilidad operativas      |
| Jornada y caja              | Fase 5 completada y verificada           |
| Venta rápida                | Fase 6 completada y verificada           |
| Cuentas de mesa             | Fases 7.1 a 7.7 implementadas            |
| Pagos separados             | Fase 8 completada y verificada           |
| Pedidos programados         | No iniciado                              |
| Reportes                    | Fase 10 completada y verificada          |
| Correcciones y auditoría    | Fase 11 completada y verificada          |
| Respaldos y restauración    | No iniciado                              |

## 18. Decisiones pendientes para fases posteriores

Estas decisiones deben resolverse antes de implementar el módulo relacionado:

- Política económica para anular un pedido programado con adelanto: devolución total, parcial, retención, transferencia o saldo a favor. Hasta decidirla, la anulación permanece bloqueada.
- Confirmaciones físicas pendientes de bebidas, envases y nombres provisionales antes del uso productivo.
- Mecanismo Android/Capacitor para seleccionar y exportar archivos portables.
- Parámetros PBKDF2 medidos en la tablet definitiva.
- Rendimiento de Argon2id en la tablet definitiva; los parámetros no bajarán del mínimo aprobado.

## 19. Riesgos conocidos

- No es posible compilar el APK hasta instalar Android Studio y Android SDK 36.
- El dispositivo definitivo aún no ha sido comprado; la interfaz deberá probarse en varios tamaños.
- `npm audit` conserva tres avisos moderados en una dependencia de desarrollo incluida por Angular CLI 21.2.18. No afectan dependencias de producción ni justifican degradar Angular; deben revisarse cuando Angular publique una actualización compatible.
- La auditoría de dependencias de producción (`npm audit --omit=dev`) terminó con cero vulnerabilidades el 2026-07-28.
- Android 8 utiliza WebView del sistema; las pruebas reales deberán incluir una WebView actualizada y una prueba específica con API 26.

## 20. Backlog aprobado

0. Definición y decisiones críticas.
1. Proyecto base Angular, Ionic, Capacitor y pruebas.
2. Modelo de datos, SQLite, conexión y migración inicial.
3. Autenticación, roles, permisos y auditoría.
4. Catálogo, precios, adicionales y disponibilidad.
5. Jornada, caja, movimientos, gastos y cierre.
6. Venta rápida.
7. Cuentas y servicio de mesas.
8. Pagos separados, parciales y combinados.
9. Pedidos programados.
10. Reportes y exportación.
11. Respaldos y restauración.
12. Pruebas finales, dispositivo y APK.

No se avanzará de fase sin verificar y aprobar la anterior.

## 21. Próxima tarea sugerida

Implementar la Fase 7.1 mediante TDD: consulta real de mesas y sus cuentas activas desde SQLite, sustituyendo los fixtures visuales sin modificar todavía las operaciones.

## 22. Historial de tareas

### Fase 1 — Proyecto base — 2026-07-28

- Proyecto Angular standalone creado con TypeScript estricto.
- Ionic Angular integrado en el contenedor raíz.
- Capacitor configurado con `pe.kankachosvaleriano.app`.
- Plataforma Android creada con `minSdkVersion = 26` y SDK de compilación/objetivo 36.
- Vitest configurado y vulnerabilidad crítica de su versión inicial corregida al actualizar a 4.1.10.
- Dos pruebas unitarias ejecutadas y aprobadas.
- Compilación web de producción y sincronización Android aprobadas.
- No se instalaron SQLite ni módulos de negocio.

### Fase 2.1 — Modelo conceptual — 2026-07-28

- Se propuso una raíz común `Operacion` para los tres tipos de operación.
- Se diseñaron relaciones conceptuales para detalles, mesas vinculadas, cobros, métodos, caja, cierres, auditoría y respaldos.
- Se separaron los estados financieros, de servicio, de preparación y disponibilidad.
- Se contemplaron pedidos programados y cobros que abarcan varias jornadas.
- Se documentaron invariantes económicas y prevención de duplicados.
- El modelo quedó inicialmente pendiente de aprobación.
- No se creó SQL, esquema físico ni migración.

### Fase 2.2 — Decisiones conceptuales definitivas — 2026-07-29

- Se aprobó la corrección económica mediante movimientos compensatorios relacionados con el original.
- Se definieron permisos de cajero y administrador para cierre, reapertura y corrección.
- Se confirmó que separar mesas no divide productos ni pagos.
- Se reafirmó que los pagos parciales de mesa seleccionan cantidades concretas.
- Se aprobaron adicionales como detalles hijos con importe propio.
- Se separaron los estados de preparación y pago del pedido programado.
- Se separó la jornada de caja de la jornada de reconocimiento de venta.
- Se aprobó bloquear la anulación de pedidos con adelanto hasta definir su política económica.
- El modelo conceptual 0.2.0 quedó aprobado.
- No se creó SQL, esquema lógico ni migración.

### Fase 2.3 — Revisión previa del esquema lógico — 2026-07-29

- Se revisaron las reglas aprobadas antes de definir columnas y restricciones.
- Se detectaron tres decisiones económicas que afectan pagos separados, estados y reportes.
- El diseño lógico se detuvo antes de inventar reglas sensibles.
- No se creó esquema lógico, SQL ni migración.

### Fase 2.4 — Esquema lógico SQLite propuesto — 2026-07-29

- Se aprobaron descuentos completamente asignados a detalles y cantidades mediante precio unitario aplicado.
- Se definió la semántica exacta de los seis estados de pago de pedidos programados.
- Se separó el impacto correctivo de caja del impacto correctivo de venta.
- Se documentaron tablas, columnas, tipos, claves, restricciones, índices y reglas transaccionales en `docs/ESQUEMA_LOGICO_SQLITE.md` 0.1.0.
- Se documentaron políticas de inmutabilidad, eliminación, idempotencia, auditoría y pruebas del futuro esquema.
- El esquema lógico quedó propuesto para revisión y aprobación.
- No se escribió SQL, no se instaló SQLite y no se creó ninguna migración.

### Fase 2.5 — Selección de SQLite y estrategia de respaldo — 2026-07-29

- El esquema lógico 0.1.0 fue aprobado para continuar.
- Se verificó `@capacitor-community/sqlite` 8.1.0 contra Capacitor 8.4.2, API mínima 26 y JDK 21.
- Se propuso una conexión única de escritura, transacciones cortas, consultas parametrizadas y cifrado nativo.
- Se definió respaldo lógico completo, validado, cifrado y escrito de forma atómica, sin copiar una base SQLite activa.
- Se definieron retención, respaldo previo a migración/restauración y restauración mediante una base candidata.
- Se propuso excluir base, claves y respaldos internos de Auto Backup y transferencia automática de Android.
- La decisión técnica quedó documentada en `docs/SQLITE_Y_RESPALDOS.md` 0.1.0 y pendiente de aprobación.
- No se instaló el plugin, no se escribió SQL y no se creó ninguna migración.

### Fase 2.6 — Plugin y conexión SQLite mínima — 2026-07-29

- Se aprobó la decisión técnica de SQLite y respaldos 0.2.0.
- Se instaló exactamente `@capacitor-community/sqlite` 8.1.0.
- Se habilitó el cifrado SQLite para Android y se configuró un secreto aleatorio de 256 bits en el almacenamiento seguro del plugin.
- Se implementó una conexión única reutilizable, inicialización concurrente deduplicada, cierre controlado y diagnóstico sanitizado.
- Se bloquea la creación automática de un secreto nuevo si ya existe una base cifrada sin su secreto local.
- Se desactivó Auto Backup y se excluyeron base, preferencias y archivos de las transferencias automáticas de Android.
- Quince pruebas nuevas se escribieron mediante TDD; las 17 pruebas totales quedaron aprobadas.
- La compilación web, sincronización Android, formato y auditoría de producción quedaron aprobados.
- La compilación nativa sigue pendiente por ausencia de Android SDK 36.
- No se escribió SQL, no se crearon tablas y no existe migración inicial.

### Fase 2.7 — Migración inicial SQLite versión 1 — 2026-07-29

- Se escribió primero una batería de pruebas de integración contra el motor `node:sqlite`.
- Se implementó una migración idempotente con 25 tablas, claves foráneas, restricciones e índices parciales aprobados.
- Se registraron únicamente los roles administrador y cajero, y los métodos de pago efectivo y Yape.
- Se agregó una fila de control en `schema_version` con checksum SHA-256 del esquema.
- No se insertaron productos, tamaños ni precios.
- La conexión registra la migración antes de comprobar, crear o abrir la base de datos.
- Once pruebas SQLite y una prueba nueva del adaptador verifican estructura, restricciones, idempotencia y orden de arranque.
- La validación nativa en Android API 26 continúa pendiente hasta disponer del SDK.

### Fase 3.1 — Roles y política de permisos — 2026-07-29

- El usuario aprobó continuar después de la migración inicial y se inició la Fase 3.
- Se declararon únicamente los roles `ADMINISTRADOR` y `CAJERO`.
- Se centralizaron los permisos operativos compartidos y los permisos exclusivos del administrador.
- Ambos roles pueden cerrar jornada; cierre excepcional, reapertura y correcciones permanecen reservados al administrador.
- Se creó `PermissionDeniedError` con un mensaje seguro para la interfaz.
- Las colecciones públicas de roles y permisos se congelaron para impedir mutaciones accidentales.
- Siete pruebas fueron escritas primero, se observaron fallar y finalmente quedaron aprobadas.
- No se implementaron todavía usuarios, credenciales, sesión, guards, pantallas ni persistencia de auditoría.

### Fase 3.2 — Credenciales y aprovisionamiento inicial — 2026-07-29

- El negocio aprobó crear un administrador y un cajero configurables para probar el futuro login.
- Se prohibieron credenciales predeterminadas; las pruebas usan únicamente fixtures conocidos.
- Se aprobó una longitud de contraseña entre 8 y 64 caracteres.
- Se instaló exactamente `hash-wasm` 4.12.0 y se implementó Argon2id v19 con los parámetros mínimos aprobados.
- Cada contraseña usa una sal aleatoria individual y los parámetros quedan versionados junto al hash.
- Se implementó el caso de uso que valida y prepara exactamente las dos cuentas iniciales.
- El repositorio SQLite guarda usuarios y auditoría en una única transacción y revierte completamente ante cualquier fallo.
- El repositorio reutiliza la conexión cifrada administrada por Capacitor.
- Dieciséis pruebas nuevas fueron escritas mediante TDD; las 52 pruebas totales quedaron aprobadas.
- No se implementaron todavía el formulario inicial, login, sesión, recuperación de acceso ni guards.

### Fase 3.3 — Login, sesión y recuperación local — 2026-07-29

- El negocio aprobó cinco intentos fallidos, bloqueo de cinco minutos y sesión de una hora sin actividad.
- Se implementó la migración v2 conservando usuarios y credenciales existentes.
- Se añadieron estado de intentos, bloqueo temporal e historial de códigos de recuperación de un solo uso.
- El login normaliza el usuario, usa un error genérico, limpia el bloqueo al acceder y registra auditoría.
- La sesión se conserva solo en memoria, vence tras una hora sin actividad y se protege mediante guards de autenticación y permiso.
- El aprovisionamiento genera un código local de 24 caracteres para el administrador y solo persiste su hash Argon2id.
- La recuperación cambia la contraseña, consume el código anterior, crea uno nuevo, limpia el bloqueo y audita todo en una transacción.
- Se documentó el procedimiento en `docs/GUIA_RECUPERACION_CONTRASENA.md`.
- Se aprobaron 76 pruebas totales, formato y compilación web.
- No se implementaron todavía las pantallas de configuración inicial, login ni recuperación.

### Fase 3.4 — Interfaces de autenticación — 2026-07-29

- Se implementaron pantallas adaptables de configuración inicial, login y recuperación para tablet y celular.
- Una instalación sin usuarios dirige a la creación del administrador y cajero; una instalación configurada dirige al login.
- El código de recuperación inicial y el renovado se muestran una sola vez antes de continuar.
- El acceso correcto abre una página protegida y cerrar sesión elimina la identidad local.
- La actividad de teclado o toque renueva el tiempo de sesión.
- Las rutas operativas quedan protegidas por guard y las pantallas cargan de forma diferida.
- Tres pruebas de componentes nuevas validan los flujos principales.
- Se aprobaron 79 pruebas totales, formato, compilación de producción y sincronización Android.

### Fase 4.1 — Base visual de atención — 2026-07-29

- Se aprobó una distribución de productos a la izquierda, cuenta actual al centro y mesas a la derecha.
- Se aprobó un máximo de dos cuentas abiertas e independientes por mesa.
- Se añadió una barra fija que muestra con claridad la mesa y cuenta que reciben los productos.
- El panel de mesas puede contraerse sin perder la selección.
- En celulares se muestran pestañas separadas de mesas, productos y cuenta.
- Se implementaron tarjetas reutilizables para productos, mesas, estados y guardado local.
- Los productos agotados permanecen visibles y bloqueados.
- Los adicionales se reservan para el panel contextual de una línea de kankacho.
- El workspace utiliza fixtures; todavía no escribe operaciones ni cuentas en SQLite.
- Tres pruebas nuevas validan selección, máximo de dos cuentas y contracción del panel.
- Resultado total: 59 pruebas Angular y 23 pruebas SQLite; 82 en conjunto.
- Compilación de producción y formato aprobados.

### Fase 4.2 — Catálogo inicial y máximo de cuentas en SQLite — 2026-07-29

- Se implementó la migración v3 y se elevó la versión objetivo de la base de datos a 3.
- Se registraron las categorías Kankacho, Bebidas y Adicionales, y exactamente 23 productos con precios confirmados en céntimos.
- No se crearon bebidas de 2 L ni productos mencionados sin presentación y precio confirmados.
- Solo las tres presentaciones de kankacho permiten adicionales y precio personalizado; este último continúa siendo una acción sobre una línea, no un producto.
- Se añadieron presentación, marca, contenido, unidad, orden, permisos de producto y usuario de última modificación.
- Las imágenes opcionales se guardarán localmente mediante un historial que permite una sola imagen vigente por producto.
- Se retiró la restricción antigua de una cuenta por mesa y se añadieron triggers que aceptan dos asociaciones activas, rechazan una tercera y vuelven a habilitar capacidad al liberar una cuenta.
- La implementación se realizó con TDD: la prueba de la tercera cuenta se observó fallar antes de incorporar la restricción.
- Resultado total: 59 pruebas Angular y 29 pruebas SQLite; 88 en conjunto.
- Formato, compilación web de producción y sincronización del proyecto Android aprobados.
- El frontend de atención continúa usando fixtures; el CRUD administrativo y las escrituras de cuentas siguen pendientes.

### Fase 4.3 — Lectura del catálogo en el frontend — 2026-07-29

- Se creó el contrato de catálogo de venta y el caso de uso de consulta sin acoplar el dominio a SQLite.
- El repositorio SQLite devuelve categorías y productos activos en el orden configurado.
- Los cinco adicionales quedan excluidos de la cuadrícula de venta y se reservan para el futuro panel contextual del kankacho.
- Los productos agotados continúan en el resultado y la tarjeta los muestra bloqueados; los productos inactivos no aparecen.
- La consulta conserva la ruta de la única imagen local vigente para la futura integración del cargador de imágenes.
- El workspace reemplazó únicamente sus fixtures de productos; mesas, cuenta actual, totales y líneas continúan simulados.
- Las pestañas de categorías se generan desde SQLite y el buscador filtra el texto sin depender de mayúsculas ni tildes.
- Se añadió un estado de carga y un mensaje seguro con reintento cuando no puede leerse el catálogo local.
- Las pruebas principales se observaron fallar antes de crear el caso de uso, el repositorio y la fachada.
- Resultado total: 64 pruebas Angular y 32 pruebas SQLite; 96 en conjunto.
- Formato, compilación web de producción y sincronización Android aprobados.

### Fase 4.4 — Cambio rápido de disponibilidad — 2026-07-29

- Administrador y cajero pueden cambiar un producto entre `DISPONIBLE` y `AGOTADO` usando el permiso compartido ya aprobado.
- La tarjeta separa la acción de venta de la acción explícita `Marcar agotado` o `Marcar disponible`.
- Un producto agotado continúa bloqueado para venta, pero conserva habilitada la acción para volver a marcarlo disponible.
- El caso de uso valida permiso, producto e identidad de la sesión activa antes de persistir.
- El repositorio actualiza disponibilidad, usuario y fecha junto con una fila de auditoría dentro de la misma transacción.
- Si falla la auditoría, el cambio del producto se revierte completamente.
- Solicitar el estado que ya estaba vigente no modifica fechas ni genera auditorías duplicadas.
- La interfaz espera la confirmación de SQLite antes de cambiar la tarjeta, bloquea dobles toques durante el guardado y oculta errores técnicos.
- Las pruebas principales se observaron fallar antes de crear el caso de uso, repositorio y acción visual.
- Resultado total: 71 pruebas Angular y 36 pruebas SQLite; 107 en conjunto.
- Formato, compilación web de producción y sincronización Android aprobados.

### Fase 5.1 — Consulta y clasificación de jornada abierta — 2026-07-29

- Se creó un caso de uso de solo lectura; no se abren ni modifican jornadas en esta etapa.
- El repositorio SQLite devuelve la única jornada abierta con fecha de negocio, monto inicial, usuario e instante de apertura.
- El resultado distingue `NONE`, `OPEN_TODAY`, `OPEN_PREVIOUS_DAY` y `OPEN_FUTURE_DAY`.
- Cualquier jornada abierta distinta de `NONE` bloqueará una futura apertura; una fecha futura se considera inconsistencia del reloj y no se corrige automáticamente.
- La fecha de negocio se calcula explícitamente en `America/Lima`, sin depender de la zona configurada en el dispositivo.
- Se validan formato y existencia real de la fecha antes de compararla.
- Las pruebas principales se observaron fallar antes de crear el reloj, caso de uso y repositorio.
- Resultado total: 78 pruebas Angular y 39 pruebas SQLite; 117 en conjunto.
- Formato, compilación web de producción y sincronización Android aprobados.

### Fase 5.2 — Apertura transaccional de jornada — 2026-07-29

- Se confirmó que administrador y cajero pueden abrir una jornada normal mediante el permiso compartido `ABRIR_JORNADA`.
- El caso de uso valida un monto inicial entero en céntimos igual o mayor que cero, fecha de negocio Lima, observación opcional e identidad de solicitud.
- La apertura usa `BEGIN IMMEDIATE` para impedir carreras y bloquea cualquier jornada abierta, incluso si pertenece a un día anterior o futuro.
- Una fecha de negocio ya registrada no puede recibir una segunda jornada aunque la anterior esté cerrada.
- El mismo identificador y los mismos datos devuelven el resultado original sin duplicar filas; reutilizarlo con datos diferentes genera un conflicto seguro.
- Jornada y auditoría se guardan en una sola transacción y se revierten juntas ante cualquier fallo.
- Se escribieron primero siete pruebas Angular de dominio y seis pruebas SQLite de repositorio.
- Resultado intermedio: 85 pruebas Angular y 45 pruebas SQLite; 130 en conjunto.

### Fase 5.3 — Apertura integrada en la interfaz — 2026-07-29

- La aplicación revisa la jornada al ingresar a la pantalla protegida de atención.
- Sin jornada, muestra un panel adaptable para efectivo inicial y observación opcional; acepta cero y convierte soles a céntimos sin persistir punto flotante.
- La interfaz reutiliza la misma clave de idempotencia durante un reintento incierto y genera otra solamente después de una apertura confirmada.
- Una jornada anterior bloquea toda la atención, muestra su fecha y responsable y no ofrece el botón de nueva apertura.
- Una fecha futura muestra una inconsistencia de reloj y no corrige datos automáticamente.
- Los errores técnicos se ocultan y la atención permanece inactiva hasta confirmar una jornada del día.
- Dos pruebas de componente nuevas se observaron fallar antes de integrar la fachada y el panel.
- Resultado total: 87 pruebas Angular y 45 pruebas SQLite; 132 en conjunto.
- Formato, compilación web de producción y sincronización Android aprobados.

### Fase 5.4 — Categorías y registro transaccional de gastos — 2026-07-29

- Se aprobaron siete categorías iniciales: Compra de insumos, Compra de bebidas, Servicios, Transporte, Mantenimiento, Pérdida o consumo no cobrado y Otros.
- La migración v4 siembra las categorías de forma idempotente y eleva la versión objetivo de SQLite a 4.
- Solo el administrador recibe `ADMINISTRAR_CATEGORIAS_GASTO`; administrador y cajero mantienen `REGISTRAR_GASTO`.
- El caso de uso valida categoría, método, descripción, monto positivo en céntimos, campos opcionales e identidad de solicitud.
- El repositorio exige una jornada abierta y categorías y métodos de pago activos.
- `PÉRDIDA O CONSUMO NO COBRADO` exige una nota explicativa.
- Cada gasto genera exactamente un movimiento `SALIDA_GASTO` con el mismo método de pago y una auditoría relacionada.
- Gasto, movimiento y auditoría se escriben en una sola transacción; cualquier fallo revierte las tres filas.
- Un reintento idéntico devuelve el gasto original y una clave reutilizada con datos diferentes se rechaza.
- Las pruebas principales se observaron fallar antes de implementar la migración, el permiso, el caso de uso y el repositorio.
- Resultado total: 99 pruebas Angular y 54 pruebas SQLite; 153 en conjunto.

### Fase 5.5 — Formulario de gastos en Caja — 2026-07-29

- Se habilitó la pestaña Caja para administrador y cajero con un formulario adaptable a tablet y celular.
- La migración v5 añade el orden explícito de categorías, conserva las siete filas existentes y eleva la versión objetivo de SQLite a 5.
- El formulario carga únicamente categorías y métodos de pago activos en su orden aprobado.
- El monto se transforma a céntimos antes de llegar al dominio y no se usa aritmética decimal para persistir dinero.
- `PÉRDIDA O CONSUMO NO COBRADO` exige una nota visible antes del envío.
- Mientras un registro está en curso se bloquea un segundo toque; un reintento incierto reutiliza la misma clave y un éxito confirmado prepara una clave nueva.
- Tras confirmar se limpian los campos descriptivos, se conservan opciones útiles y se muestra un mensaje seguro sin datos técnicos.
- Las pruebas de migración, consulta de opciones y componente se observaron fallar antes de implementar sus comportamientos.
- Resultado total: 102 pruebas Angular y 58 pruebas SQLite; 160 en conjunto.
- Formato y compilación web de producción aprobados. La navegación web llega al login, pero el almacenamiento SQLite nativo no se inicializa en el navegador de escritorio; la revisión integral de Caja queda pendiente del entorno Android, sin introducir un bypass de autenticación.

### Fase 5.6 — Resumen de caja de la jornada abierta — 2026-07-29

- El resumen calcula `efectivo esperado = fondo inicial + entradas de efectivo - salidas de efectivo` usando únicamente movimientos de la jornada abierta.
- `INGRESO_COBRO` y `CORRECCION_ENTRADA` suman; `SALIDA_GASTO` y `CORRECCION_SALIDA` restan sin alterar los registros originales.
- Yape y los demás métodos se presentan por separado y no se mezclan con el efectivo físico esperado.
- Los métodos activos sin movimientos permanecen visibles; un método desactivado que ya tenga movimientos en la jornada también conserva visibilidad histórica.
- El resumen se actualiza al abrir Caja, al reintentar manualmente y después de confirmar un gasto.
- Los errores de lectura se muestran de forma segura y no modifican la jornada ni sus movimientos.
- Las pruebas de dominio, repositorio SQLite y componente se observaron fallar antes de implementar el cálculo y la interfaz.
- Resultado total: 104 pruebas Angular y 60 pruebas SQLite; 164 en conjunto.

### Fase 5.7 — Evaluación de bloqueos del cierre — 2026-07-29

- Caja solicita el efectivo real contado y calcula automáticamente `CUADRA`, `SOBRANTE` o `FALTANTE` frente al efectivo esperado.
- Una diferencia mayor que cero permanece bloqueada hasta que el usuario escriba una justificación.
- Se listan individualmente las mesas abiertas con su cuenta y las cuentas con saldo pendiente.
- Una cuenta pagada pero no finalizada continúa bloqueando como mesa abierta, aunque ya no tenga saldo pendiente.
- Las ventas rápidas incompletas también bloquean por saldo; los pedidos programados futuros no bloquean el cierre diario porque pueden abarcar varias jornadas.
- El conteo faltante aparece como un bloqueo explícito y los errores técnicos se ocultan tras un mensaje seguro.
- La evaluación exige sesión activa y permiso `CERRAR_JORNADA`, compartido por administrador y cajero.
- Esta fase es de solo lectura: todavía no inserta un cierre ni cambia el estado de la jornada.
- Las pruebas de dominio, repositorio SQLite y componente se observaron fallar antes de implementar las reglas y la interfaz.
- Resultado total: 108 pruebas Angular y 62 pruebas SQLite; 170 en conjunto.

### Fase 5.8 — Cierre normal transaccional — 2026-07-29

- Administrador y cajero pueden confirmar el cierre normal cuando la evaluación no presenta bloqueos.
- El repositorio inicia una transacción y vuelve a calcular el efectivo esperado y a consultar mesas y cuentas antes de insertar el cierre.
- Si aparece una mesa, saldo, diferencia sin justificar o inconsistencia de efectivo durante la confirmación, toda la operación se revierte.
- El cierre guarda instantáneas de efectivo esperado y real, tipo y monto de diferencia, justificación, usuario, fecha y hora.
- Cierre, cambio de jornada a `CERRADA` y auditoría se escriben atómicamente.
- La clave de idempotencia permite reintentar la misma solicitud sin duplicar cierres; reutilizarla con datos distintos se rechaza.
- La interfaz conserva la clave ante un resultado incierto y genera otra únicamente después de una confirmación exitosa.
- Las pruebas se escribieron antes de la implementación y se ejecutaron agrupadas al terminar la fase, conforme a la indicación del usuario.
- Resultado total: 110 pruebas Angular y 64 pruebas SQLite; 174 en conjunto.

### Fase 5.9 — Cierre excepcional de jornada anterior — 2026-07-29

- Solo el administrador puede ejecutar el cierre excepcional; el cajero recibe la indicación de solicitarlo.
- El formulario excepcional aparece en el bloqueo de jornada anterior y exige efectivo real y justificación administrativa.
- El sistema evalúa y muestra los mismos bloqueos de mesas, cuentas y diferencias del cierre normal.
- El repositorio rechaza usar el cierre normal sobre una fecha distinta al día actual y rechaza el cierre excepcional si la jornada no pertenece a un día anterior.
- El cierre se registra con tipo `EXCEPCIONAL`, usuario, fecha, hora, valores de efectivo, diferencia, justificación, auditoría e idempotencia.
- Cierre, auditoría y cambio de jornada a `CERRADA` se mantienen en una sola transacción.
- Las pruebas se escribieron antes de implementar y se ejecutaron agrupadas al terminar la fase.
- Resultado total: 111 pruebas Angular y 65 pruebas SQLite; 176 en conjunto.

### Fase 5.10 — Reapertura administrativa de jornada — 2026-07-29

- Solo el administrador puede reabrir una jornada cerrada mediante el permiso `REABRIR_JORNADA`.
- La pantalla distingue una jornada del día ya cerrada de un día todavía no abierto y no permite crear una segunda jornada para la misma fecha.
- La reapertura exige una razón administrativa y registra usuario, fecha, hora, cierre de origen e identidad idempotente de la solicitud.
- El repositorio comprueba dentro de una transacción que no exista otra jornada abierta y que el cierre indicado sea el último cierre vigente de la jornada.
- La jornada vuelve a `ABIERTA`, pero el cierre original permanece intacto; se agrega una fila en `reaperturas_jornada` y una auditoría `REABRIR_JORNADA`.
- Un reintento idéntico devuelve la reapertura original y una clave reutilizada con cierre, motivo o usuario diferentes se rechaza sin duplicar datos.
- El cajero puede consultar el estado cerrado, pero la interfaz le indica que la reapertura requiere un administrador.
- Las pruebas se escribieron antes de completar la implementación y se ejecutaron agrupadas al terminar la fase.
- Resultado total: 112 pruebas Angular y 67 pruebas SQLite; 179 en conjunto.
- Próxima fase: cierre corregido exclusivo del administrador, relacionado con el cierre original y la reapertura, sin sobrescribir registros históricos.

### Fase 5.11 — Cierre corregido administrativo — 2026-07-29

- Solo el administrador puede confirmar un cierre `CORREGIDO` mediante el permiso `CORREGIR_CIERRE`; el cajero puede consultar las condiciones, pero no ejecutar la confirmación.
- El sistema detecta una reapertura pendiente tanto en la jornada actual como en una jornada anterior y reemplaza explícitamente el cierre normal o excepcional por el flujo corregido.
- El cierre corregido exige efectivo real, razón administrativa y la misma evaluación de mesas, cuentas, saldos y diferencias usada por los demás cierres.
- El repositorio vuelve a comprobar todo dentro de una transacción y rechaza un cierre normal o excepcional si la jornada proviene de una reapertura sin corregir.
- La nueva fila conserva `tipo = CORREGIDO`, incrementa `secuencia` y relaciona `cierre_anterior_id` y `reapertura_id`; el cierre original y la reapertura permanecen intactos.
- La jornada vuelve a `CERRADA` y la auditoría registra `CERRAR_JORNADA_CORREGIDO` con los valores de caja y los enlaces históricos.
- La idempotencia devuelve el mismo cierre ante un reintento idéntico y evita crear secuencias duplicadas.
- Las pruebas se escribieron antes de completar la implementación y se ejecutaron agrupadas al terminar la fase.
- Resultado total: 114 pruebas Angular y 68 pruebas SQLite; 182 en conjunto.
- Con esta entrega queda completada la Fase 5. La próxima etapa aprobada es la Fase 6, venta rápida.

### Fase 6.1 — Creación transaccional de venta rápida — 2026-07-29

- Administrador y cajero pueden crear ventas rápidas mediante el permiso compartido `REGISTRAR_VENTA_RAPIDA`.
- El caso de uso exige al menos un producto, cantidades enteras positivas, sesión autorizada y clave de idempotencia.
- Cada venta se relaciona con la única jornada abierta y nace en estado `ABIERTA`, sin reconocer todavía la venta ni generar movimientos de caja.
- Los productos principales deben estar activos, disponibles, pertenecer a una categoría activa y no ser adicionales.
- Los adicionales se guardan como detalles hijos y solo se aceptan si el producto principal permite adicionales y el producto hijo está activo, disponible y marcado como adicional.
- Nombre, categoría, precio de catálogo, precio aplicado, cantidad y subtotal quedan congelados en cada detalle; cambiar posteriormente el catálogo no altera la venta.
- El total se calcula exclusivamente con enteros en céntimos y la operación nace con pagado cero y saldo igual al total.
- Operación, detalles principales, adicionales y auditoría `CREAR_VENTA_RAPIDA` se escriben en una sola transacción.
- Un reintento idéntico devuelve la operación original; reutilizar la clave con productos, cantidades, nota o usuario diferentes se rechaza sin duplicar datos.
- La interfaz aún conserva sus fixtures de cuenta: la persistencia se conectará cuando exista un borrador editable para evitar crear ventas incompletas con cada toque.
- Las pruebas se escribieron antes de completar la implementación y se ejecutaron agrupadas al terminar la fase.
- Resultado total: 116 pruebas Angular y 72 pruebas SQLite; 188 en conjunto.
- Próxima fase: Fase 6.2, borrador visual editable de venta rápida y conexión segura del selector de productos.

### Fase 6.2 — Borrador visual editable de venta rápida — 2026-07-29

- La barra superior habilita `Venta rápida` y mantiene visible el destino actual para evitar agregar productos a una mesa por error.
- El cajero puede volver a mesas y regresar al borrador sin que el cambio de vista persista operaciones o elimine lo preparado.
- Tocar un producto disponible lo agrega al borrador local; toques posteriores incrementan su cantidad y los controles permiten incrementarla, reducirla o retirar la línea.
- El catálogo devuelve también los cinco adicionales activos, pero no los mezcla con la cuadrícula principal.
- `Agregar adicional` aparece únicamente en líneas compatibles; el panel contextual usa botones grandes y los adicionales empiezan sin seleccionar.
- Las cantidades de adicionales pueden incrementarse, reducirse o retirarse antes de guardar.
- El total se recalcula en memoria usando céntimos enteros y suma productos principales y detalles hijos.
- Ningún toque escribe en SQLite; la fachada invoca el caso de uso de la Fase 6.1 una sola vez al confirmar.
- Mientras se guarda se bloquea una segunda confirmación; ante un fallo se conservan la clave idempotente y el borrador.
- Tras confirmar se muestra el código de operación, el borrador queda bloqueado y puede iniciarse una venta nueva.
- La interfaz de cuentas de mesa continúa separada y conserva sus fixtures hasta la Fase 7.
- Resultado total: 117 pruebas Angular y 72 pruebas SQLite; 189 en conjunto.
- Próxima fase: Fase 6.3, cobro y finalización atómicos de venta rápida.

### Fase 6.3 — Cobro y finalización atómicos de venta rápida — 2026-07-29

- Administrador y cajero pueden cobrar mediante el permiso compartido `COBRAR`.
- La interfaz ofrece Efectivo y Yape; el efectivo exige un monto recibido igual o mayor al total y calcula vuelto, mientras Yape exige el total exacto y una confirmación visual del cajero.
- El cobro asigna el importe a todos los detalles principales y adicionales de la venta rápida.
- En una sola transacción se crean el cobro, sus asignaciones, el método de pago, el movimiento `INGRESO_COBRO`, la auditoría y la finalización de la operación.
- La operación queda `FINALIZADA`, con pagado igual al total, saldo cero y `jornada_venta_id` correspondiente a la jornada abierta donde ingresó el dinero.
- La clave de idempotencia permite repetir exactamente la misma solicitud sin duplicar ingresos y rechaza reutilizaciones con datos diferentes.
- Una venta inexistente, ya finalizada, parcialmente pagada o asociada a una jornada no abierta no puede cobrarse por este flujo.
- Resultado al cerrar la fase: 120 pruebas Angular y 74 pruebas SQLite; 194 en conjunto.

### Fase 6.4 — Recuperación de ventas rápidas pendientes — 2026-07-29

- Al entrar a `Venta rápida`, el sistema consulta en SQLite las operaciones abiertas y con saldo de la jornada actualmente abierta.
- La lista muestra código y total, ordenados por fecha de creación, y permite reanudar una venta después de reiniciar o abandonar la vista.
- Se recupera la jerarquía completa de detalles principales y adicionales usando nombres, precios y cantidades congelados en la operación.
- La venta recuperada se presenta en modo de solo lectura y vuelve directamente al flujo de cobro, sin modificar el registro original.
- Una venta finalizada desaparece de la lista de pendientes al actualizarse la consulta.
- Los errores de consulta se muestran de forma segura y ofrecen reintento sin perder datos locales.
- Resultado total: 122 pruebas Angular y 75 pruebas SQLite; 197 en conjunto.
- Próxima fase: Fase 6.5, ajustes de precio y descuentos auditados antes del cobro.

### Fase 6.5 — Persistencia de ajustes de precio por detalle — 2026-07-30

- Los ajustes se asignan a una línea concreta; no existe descuento global sin distribución.
- Cada detalle conserva precio de catálogo, precio aplicado, tipo `DESCUENTO` o `PRECIO_PERSONALIZADO`, motivo y usuario responsable.
- Solo los productos marcados en catálogo como modificables aceptan un precio distinto.
- Un descuento debe reducir el precio; un precio personalizado debe ser diferente al precio de catálogo.
- Subtotal de catálogo, descuento total, total y saldo se derivan nuevamente dentro de la transacción antes de guardar.
- Los adicionales conservan su precio propio y no heredan automáticamente el ajuste del producto principal.
- Resultado total: 123 pruebas Angular y 76 pruebas SQLite; 199 en conjunto.

### Fase 6.6 — Edición visual de precio y descuento — 2026-07-30

- La acción `Editar precio` aparece únicamente en líneas de productos compatibles y antes de guardar la venta.
- El cajero elige descuento o precio personalizado, ingresa el nuevo precio unitario y escribe un motivo obligatorio.
- La línea muestra el precio original, el precio aplicado y el motivo; el total se recalcula inmediatamente en céntimos.
- El ajuste puede retirarse antes de confirmar, restaurando el precio de catálogo.
- El comando persistido incluye el ajuste completo y la venta recuperada conserva sus datos históricos.
- Resultado total: 124 pruebas Angular y 76 pruebas SQLite; 200 en conjunto.

### Fase 6.7 — Anulación auditada de venta rápida pendiente — 2026-07-30

- Administrador y cajero pueden anular una venta rápida abierta que todavía no tenga cobros.
- La anulación exige un motivo explícito y conserva operación, productos, adicionales y ajustes originales.
- Una venta pagada, finalizada, parcialmente pagada o asociada a una jornada que ya no esté abierta se rechaza.
- La operación cambia a `ANULADA` con usuario, fecha, hora, motivo, incremento de versión y auditoría `ANULAR_VENTA_RAPIDA`.
- No se generan cobros, devoluciones ni movimientos de caja.
- La auditoría usa la identidad de solicitud para hacer idempotente un reintento idéntico y rechazar datos diferentes.
- La venta anulada desaparece de pendientes sin borrar su historial.
- Resultado total: 127 pruebas Angular y 77 pruebas SQLite; 204 en conjunto.
- Próxima fase: Fase 6.8, pago combinado con Efectivo y Yape para completar venta rápida.

### Fase 6.8 — Pago combinado transaccional — 2026-07-30

- Un cobro de venta rápida puede contener uno o dos métodos distintos: Efectivo, Yape o ambos.
- Los importes aplicados deben ser enteros positivos y sumar exactamente el total de la operación.
- Yape exige importe recibido igual al aplicado; solo Efectivo puede recibir un importe mayor y producir vuelto.
- Cada método genera su propio `cobro_metodos` y movimiento `INGRESO_COBRO`, relacionados con el mismo cobro.
- La idempotencia compara operación, usuario y la distribución completa de métodos, importes aplicados y recibidos.
- Cobro, asignación de detalles, métodos, movimientos, finalización y auditoría permanecen en una sola transacción.
- Resultado total: 127 pruebas Angular y 78 pruebas SQLite; 205 en conjunto.

### Fase 6.9 — Interfaz táctil de pago combinado — 2026-07-30

- El panel de cobro ofrece Efectivo, Yape y `Efectivo + Yape` como alternativas explícitas.
- En pago combinado el cajero ingresa la parte confirmada por Yape y el efectivo recibido para cubrir el resto.
- La aplicación calcula automáticamente el importe aplicado a efectivo y exige una participación positiva de ambos métodos.
- El vuelto se presenta únicamente a partir del efectivo recibido sobre su parte aplicada.
- Resultado total: 128 pruebas Angular y 78 pruebas SQLite; 206 en conjunto.

### Fase 6.10 — Historial de venta rápida en solo lectura — 2026-07-30

- La vista consulta operaciones `FINALIZADA` y `ANULADA` de la jornada abierta.
- El historial muestra código, estado y total, ordenado desde la operación cerrada más reciente.
- Cada registro conserva líneas, adicionales, precios históricos, ajustes y motivos.
- Las ventas finalizadas muestran sus métodos de pago y las anuladas muestran el motivo de anulación.
- Abrir una operación histórica bloquea edición, cobro y anulación.
- Administrador y cajero acceden mediante `CONSULTAR_OPERACIONES_DIA`.
- Resultado total: 130 pruebas Angular y 79 pruebas SQLite; 209 en conjunto.
- Con esta entrega queda completada la Fase 6. La próxima etapa es Fase 7, cuentas y servicio de mesas.

### Fase 7.1 — Mesas y cuentas activas desde SQLite — 2026-07-30

- El panel dejó de usar mesas ficticias y consulta únicamente mesas activas configuradas en SQLite.
- Cada mesa resume sus cuentas activas, saldo conjunto y estado: disponible, ocupada, pendiente de servir o pagada.
- `Cuenta A` y `Cuenta B` se derivan establemente por fecha de creación y no se almacenan como información duplicada.
- Las mesas vinculadas se agrupan bajo la principal y no aparecen dos veces en el panel.
- Si aún no se configuraron mesas, la interfaz lo informa sin crear mesas ni nombres inventados.

### Fase 7.2 — Apertura transaccional de cuenta de mesa — 2026-07-30

- Administrador y cajero pueden abrir la primera o segunda cuenta de una mesa activa mediante `ABRIR_CUENTA_MESA`.
- La operación exige una jornada abierta y crea operación `CUENTA_MESA`, asociación principal y auditoría en una sola transacción.
- El repositorio valida el máximo de dos cuentas antes de insertar y conserva el trigger SQLite como defensa ante concurrencia.
- La solicitud es idempotente: un reintento idéntico devuelve la misma cuenta y un contenido distinto bajo la misma clave se rechaza.
- La cuenta nueva queda seleccionada y se presenta vacía, preparada para agregar productos en la fase siguiente.
- Resultado total: 132 pruebas Angular y 82 pruebas SQLite; 214 en conjunto.
- Próxima fase: Fase 7.3, borrador y persistencia de productos/adicionales dentro de una cuenta de mesa.

### Fase 7.3 — Productos y adicionales de cuenta — 2026-07-30

- Seleccionar un producto con una cuenta activa lo registra en SQLite con nombre, categoría y precios congelados.
- Los adicionales se insertan como detalles hijos del producto principal y tienen cantidad, precio y subtotal propios.
- Cada confirmación recalcula los totales de la operación dentro de la misma transacción y deja auditoría.

### Fase 7.4 — Recuperación de cuenta completa — 2026-07-30

- Al elegir Cuenta A o Cuenta B se recuperan sus líneas, adicionales, cantidades servidas/pagadas y totales reales.
- El panel permite cambiar explícitamente entre dos cuentas independientes de la misma mesa.
- La cuenta muestra total consumido, total pagado y saldo pendiente derivados de SQLite.

### Fase 7.5 — Modificación segura de cantidades pendientes — 2026-07-30

- Una línea pendiente y no pagada puede aumentar, disminuir o retirarse.
- Retirar el principal elimina sus adicionales hijos en la misma transacción.
- Una línea servida o con cantidades pagadas queda bloqueada; tampoco se permite reducir el total por debajo de lo ya cobrado.

### Fase 7.6 — Confirmación de servicio — 2026-07-30

- El cajero puede marcar como servido un producto principal pendiente.
- La confirmación marca también sus adicionales y registra usuario, jornada, fecha y hora en auditoría.
- Después de servir se bloquean la reducción y eliminación silenciosa del conjunto.

### Fase 7.7 — Unión y separación física de mesas — 2026-07-30

- Una cuenta puede vincularse a otra mesa libre desde un panel de botones.
- La mesa vinculada se muestra junto a la principal y deja de aparecer duplicada en la lista.
- Separarla solo libera físicamente esa mesa: productos, pagos, saldo y mesa principal permanecen intactos.
- Toda unión o separación exige jornada abierta, permisos, transacción, idempotencia y auditoría.
- Resultado total: 134 pruebas Angular y 88 pruebas SQLite; 222 en conjunto.
- Próxima etapa: Fase 8, pagos separados, parciales y combinados por productos concretos.

### Fase 8.1 — Selección de productos y cantidades para cobrar — 2026-07-30

- El panel muestra únicamente cantidades todavía no pagadas de principales y adicionales.
- El cajero selecciona unidades concretas y la interfaz impide superar la cantidad pendiente.
- No existe entrada de abono libre para cuentas de mesa.

### Fase 8.2 — Cálculo exacto del cobro seleccionado — 2026-07-30

- El total se deriva como suma de cantidad seleccionada por precio unitario histórico de cada detalle.
- SQLite vuelve a verificar cantidades, precios, saldo y suma aplicada antes de confirmar.
- Una selección vacía, duplicada, excedida o de importe incoherente se revierte completamente.

### Fase 8.3 — Pago separado y parcial transaccional — 2026-07-30

- Cada cobro crea asignaciones `cobro_detalles` a productos y cantidades específicas.
- Efectivo calcula vuelto; Yape exige importe recibido igual al aplicado.
- Cobro, asignaciones, método, movimiento de caja, cantidades pagadas, saldo y auditoría se guardan juntos.
- Si queda saldo, la operación pasa a `PAGADA_PARCIALMENTE` y continúa abierta.

### Fase 8.4 — Pago combinado de selección concreta — 2026-07-30

- Una misma selección puede pagarse con Efectivo y Yape, ambos con importes positivos.
- La suma aplicada por métodos debe coincidir exactamente con el total seleccionado.
- Cada método genera su propio movimiento de caja y solo Efectivo puede producir vuelto.
- Los reintentos idénticos son idempotentes y los datos diferentes bajo la misma clave se rechazan.

### Fase 8.5 — Finalización explícita de la atención — 2026-07-30

- Llegar a saldo cero cambia la cuenta a `PAGADA`, pero no la finaliza ni libera mesas automáticamente.
- `Finalizar atención` exige que todos los detalles estén completamente pagados.
- La confirmación reconoce la venta en la jornada vigente, cambia a `FINALIZADA` y libera la mesa principal y las vinculadas.
- El cierre conserva todos los cobros previos y registra usuario, jornada, fecha, hora y mesas liberadas.
- Resultado total: 137 pruebas Angular y 93 pruebas SQLite; 230 en conjunto.
- Próxima etapa: Fase 9, pedidos programados y adelantos.

### Fase 9.1 — Registro de pedidos programados — 2026-07-30

- Administrador y cajero pueden registrar cliente, teléfono, fecha/hora local, recojo o domicilio, dirección y referencia.
- El pedido exige jornada abierta y se crea como operación `PEDIDO_PROGRAMADO` con estado de preparación `REGISTRADO` y pago `SIN_ADELANTO`.
- La creación es transaccional, usa clave de idempotencia y registra usuario, jornada, fecha, hora y auditoría.

### Fase 9.2 — Productos y adicionales programados — 2026-07-30

- El cajero selecciona productos y cantidades concretas del catálogo disponible.
- Los adicionales se guardan como detalles hijos con cantidad, precio y subtotal propios.
- Nombres, categorías y precios quedan congelados dentro de la operación; el total se calcula nuevamente en SQLite.

### Fase 9.3 — Consulta y seguimiento — 2026-07-30

- La pestaña `Programados` lista pedidos por fecha de entrega y muestra cliente, preparación, pago, total, pagado y saldo.
- El diseño usa dos paneles en tablet y una sola columna en celular.
- Los estados de preparación y pago se presentan por separado y nunca se sintetizan en un único estado.

### Fase 9.4 — Adelantos y cobros posteriores — 2026-07-30

- Antes de entregar, un cobro se registra como `ADELANTO_PEDIDO`; después de entregar, como `PAGO_GENERAL_PEDIDO`.
- Cada ingreso pertenece a la jornada abierta en la que se recibió el dinero y genera su método y movimiento de caja.
- El saldo y estado de pago se actualizan sin adelantar automáticamente el estado de preparación.

### Fase 9.5 — Preparación, entrega y reconocimiento de venta — 2026-07-30

- La secuencia permitida es `REGISTRADO`, `PENDIENTE_DE_PREPARACION`, `EN_PREPARACION`, `LISTO` y `ENTREGADO`.
- Entregar registra usuario, fecha, hora y jornada de entrega. Esa jornada reconoce la venta cuando el pedido queda totalmente pagado.
- Si el saldo se cobra después, el dinero pertenece a la jornada del cobro, pero la venta sigue perteneciendo a la jornada de entrega; no se suma dos veces.
- La migración v6 agrega `jornada_entrega_id` para conservar esta separación explícitamente.
- La anulación de un pedido con adelanto permanece sin implementar y bloqueada hasta que el negocio defina devolución o retención.
- Resultado total: 140 pruebas Angular y 100 pruebas SQLite; 240 en conjunto.
- Próxima etapa: Fase 10, reportes de caja y ventas sin doble contabilización.

### Fase 10.1 — Selección de jornada histórica — 2026-07-30

- El administrador puede abrir una pantalla independiente de reportes y seleccionar jornadas abiertas o cerradas.
- Las jornadas se ordenan desde la fecha de negocio más reciente.
- El caso de uso vuelve a exigir `VER_REPORTES`; el cajero recibe un rechazo aunque intente abrir directamente la ruta.

### Fase 10.2 — Reporte de caja por movimientos — 2026-07-30

- Los ingresos, gastos y correcciones se agrupan por método de pago usando exclusivamente `movimientos_caja.jornada_id`.
- Se muestran ingresos, salidas y neto por método, además del efectivo inicial y efectivo esperado.
- Los cobros de adelantos aparecen en la jornada donde se recibió el dinero, independientemente de cuándo se entregue el pedido.

### Fase 10.3 — Reporte de ventas sin duplicación — 2026-07-30

- Solo se reconocen operaciones `FINALIZADA` asociadas mediante `jornada_venta_id`.
- Se presentan cantidades y totales separados para venta rápida, cuenta de mesa y pedido programado.
- Las correcciones `SUMA` o `RESTA` se aplican una sola vez sobre la jornada comercial indicada, conservando visible el total original y el neto.

### Fase 10.4 — Exportación CSV — 2026-07-30

- El reporte completo se genera localmente como CSV UTF-8 compatible con Excel.
- Caja, movimientos, ventas y correcciones ocupan secciones separadas y los campos se escapan correctamente.
- La exportación no necesita internet ni modifica registros económicos.

### Fase 10.5 — Exportación PDF local — 2026-07-30

- El sistema genera un archivo PDF multipágina directamente en el dispositivo, sin servidor ni librerías remotas.
- El PDF contiene resumen de caja, ventas por tipo, correcciones, ventas netas y detalle de operaciones.
- La pantalla y ambos formatos explican que caja usa la jornada del movimiento y ventas la jornada de finalización o entrega.
- Resultado total: 145 pruebas Angular y 103 pruebas SQLite; 248 en conjunto.
- Próxima etapa: Fase 11, correcciones económicas compensatorias y auditoría administrativa.

### Fase 11.1 — Selección del registro original — 2026-07-30

- La pantalla administrativa permite seleccionar explícitamente una operación, cobro, gasto, cierre, movimiento de caja o corrección previa.
- El caso de uso exige `CREAR_CORRECCION_ECONOMICA`; el cajero no puede crear correcciones.
- Toda corrección exige un motivo y conserva la relación tipada con el registro original.

### Fase 11.2 — Efectos independientes sobre caja y ventas — 2026-07-30

- Caja y ventas se corrigen por separado mediante `SUMA`, `RESTA` o `SIN_EFECTO`.
- Cuando existe efecto de caja, el administrador elige explícitamente el método de pago y un monto positivo.
- Cuando existe efecto de venta, el administrador elige explícitamente la jornada comercial y un monto positivo; ningún destino se infiere silenciosamente.

### Fase 11.3 — Movimiento compensatorio transaccional — 2026-07-30

- Un efecto de caja crea `CORRECCION_ENTRADA` o `CORRECCION_SALIDA` dentro de la jornada abierta actual.
- Corrección, movimiento de caja y auditoría se confirman en una sola transacción o se revierten juntos.
- Una corrección sin efecto de caja no crea movimientos artificiales.

### Fase 11.4 — Inmutabilidad e idempotencia — 2026-07-30

- El registro económico original no se actualiza ni elimina.
- Cada corrección conserva usuario, fecha, hora, motivo y referencia al original.
- La clave de idempotencia evita duplicar una misma corrección ante reintentos de la interfaz.

### Fase 11.5 — Historial administrativo — 2026-07-30

- La pantalla de reportes permite alternar a un panel de correcciones con historial en modo de consulta.
- Los reportes ya existentes aplican una sola vez los efectos compensatorios a la jornada correspondiente.
- Resultado total: 149 pruebas Angular y 107 pruebas SQLite; 256 en conjunto.
- Próxima etapa: Fase 12, respaldos locales y restauración administrativa controlada.

### Ajustes posteriores a pruebas en tablet — 2026-07-31

- `Cambiar mesa` lleva al selector de mesas y `Cambiar cuenta` alterna entre Cuenta A y Cuenta B cuando ambas existen.
- La barra principal permite cerrar sesión para cambiar entre administrador y cajero sin cerrar ni modificar la jornada abierta.
- El administrador dispone de un panel para crear, editar, ordenar, desactivar y reactivar mesas. La desactivación queda bloqueada si existen cuentas abiertas y cada cambio conserva usuario, fecha, hora y jornada abierta, cuando corresponda, en auditoría.
- Los pedidos programados admiten una línea escrita con descripción, tamaño o presentación, cantidad y precio unitario. El texto y el precio quedan congelados en el detalle y se muestran en la consulta posterior.
- La migración v7 preserva instalaciones existentes y crea exclusivamente el producto técnico oculto usado como referencia íntegra de esas líneas personalizadas.
- Resultado total: 151 pruebas Angular y 111 pruebas SQLite; 262 en conjunto.
- Próxima etapa: Fase 12, respaldos locales y restauración administrativa controlada.

### Primera tarea de reportes estadísticos — 2026-07-31

- Se definieron contratos en céntimos para periodo, KPI, ventas reconocidas, intervalos diarios, días semanales y semanas parciales mensuales.
- Se documentaron ejemplos de reconocimiento único por `jornada_venta_id`, agrupación diaria no acumulativa y futuros periodos semanal y mensual.
- Se redactaron seis pruebas TDD para intervalos diarios de treinta minutos. Permanecen omitidas hasta aprobar la implementación del agrupador, sin crear todavía consultas ni gráficos.
- La administración de mesas ahora notifica al panel operativo después de cada guardado y el panel vuelve a consultar las mesas al regresar a la sección `Mesas`.
- Documento específico: [`docs/REPORTES_ESTADISTICOS.md`](REPORTES_ESTADISTICOS.md).
- Se requiere decisión del negocio sobre correcciones estadísticas, efectivo esperado de periodos múltiples, jornadas que cruzan medianoche y cortes de intervalos no redondos.
