# Core

Infraestructura transversal de la aplicación. Contiene el contrato, el adaptador de conexión SQLite, el registro de migraciones y el repositorio transaccional de usuarios iniciales. En fases posteriores incorporará seguridad de sesión, respaldos y manejo común de errores.

No debe contener componentes de interfaz ni reglas específicas de una pantalla.

`database/` administra una única conexión, el secreto cifrado inicial, el diagnóstico sanitizado y la migración versión 1 con 25 tablas.

`auth/` persiste el administrador, el cajero y sus registros de auditoría dentro de una sola transacción, reutilizando la conexión administrada.
