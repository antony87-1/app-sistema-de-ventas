# Kankachos Valeriano

Aplicación Android interna para registrar las operaciones del restaurante Kankachos Valeriano. La primera versión funcionará completamente sin internet, con Angular, Ionic, Capacitor y SQLite local.

## Estado
Aplicativo en desarrollo
Venta rápida ya permite preparar un borrador con productos, cantidades y adicionales y guardarlo transaccionalmente con precios congelados, auditoría e idempotencia. Todavía falta implementar su cobro y finalización; no existen credenciales predeterminadas.

El contexto permanente está en [`docs/CONTEXTO_PROYECTO.md`](docs/CONTEXTO_PROYECTO.md), la matriz de permisos en [`docs/AUTORIZACION.md`](docs/AUTORIZACION.md), las credenciales en [`docs/CREDENCIALES.md`](docs/CREDENCIALES.md), el contrato lógico aprobado en [`docs/ESQUEMA_LOGICO_SQLITE.md`](docs/ESQUEMA_LOGICO_SQLITE.md) y la decisión técnica aprobada en [`docs/SQLITE_Y_RESPALDOS.md`](docs/SQLITE_Y_RESPALDOS.md).

## Requisitos de desarrollo

- Node.js 22.15.0 (rango admitido: 22.12 o posterior, menor que 23).
- npm 10.9.x.
- Java 21.
- Android Studio y Android SDK Platform 36 para compilar el proyecto nativo.
- Android mínimo soportado: 8.0, API 26.

## Comandos

```powershell
npm.cmd install
npm.cmd start
npm.cmd run test:all
npm.cmd run build
npm.cmd run android:sync
```

`test:all` ejecuta tanto las pruebas Angular como las pruebas de integración de la migración sobre una base SQLite real en memoria.

Cuando Android Studio y el SDK estén instalados:

```powershell
npm.cmd run android:build:debug
```

En PowerShell se utiliza `npm.cmd` porque la política local bloquea el script `npm.ps1`.

## Organización inicial

```text
src/app/core       Infraestructura transversal
src/app/domain     Reglas, modelos, contratos y casos de uso
src/app/features   Pantallas organizadas por funcionalidad
src/app/shared     Elementos reutilizables
android            Proyecto nativo generado por Capacitor
docs               Contexto y documentación permanente
```

Las subcarpetas de negocio se crearán únicamente cuando se apruebe la tarea que las necesite.
