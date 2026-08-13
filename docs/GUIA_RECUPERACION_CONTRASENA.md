# Guía de recuperación local de contraseña

## Alcance

Esta guía corresponde a la cuenta `ADMINISTRADOR`. La recuperación funciona completamente sin internet y no usa correo, SMS ni servicios externos. Las pantallas de configuración inicial, login y recuperación ya están conectadas al almacenamiento local cifrado.

## Guardar el código por primera vez

1. Durante la configuración inicial se crea el administrador y el cajero.
2. El sistema muestra una sola vez el código de recuperación del administrador, con este formato: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
3. Copie el código en papel y guárdelo en un lugar seguro fuera de la tablet.
4. No tome una captura de pantalla ni guarde el código en notas dentro del mismo dispositivo.
5. Confirme que el código fue copiado antes de cerrar la pantalla.

La base de datos no conserva el código legible: almacena únicamente una sal y un hash Argon2id.

## Recuperar el acceso

1. En la pantalla de login, seleccione **Recuperar acceso de administrador**.
2. Ingrese el código local. Se aceptan mayúsculas o minúsculas, con espacios o guiones.
3. Ingrese y confirme una contraseña nueva de 8 a 64 caracteres.
4. Confirme la recuperación.
5. El sistema cambia la contraseña, elimina cualquier bloqueo temporal de login y marca el código anterior como usado.
6. Se muestra un código de recuperación nuevo una sola vez. Cópielo y reemplace el código anterior guardado en papel.
7. Inicie sesión con el nombre de usuario del administrador y la contraseña nueva.

La operación es transaccional: si alguna escritura o la auditoría falla, no se cambia la contraseña ni se consume el código anterior.

## Cuenta del cajero

El código local recupera exclusivamente al administrador. Cuando exista la pantalla de administración de usuarios, un administrador autenticado podrá asignar una contraseña nueva al cajero. El cajero no puede recuperar ni cambiar la contraseña del administrador.

## Si se perdió la contraseña y también el código

No existe una contraseña maestra ni un método para saltar la protección. No desinstale la aplicación, no borre sus datos y no manipule el archivo SQLite. Conserve la tablet y solicite el procedimiento técnico controlado de restauración o recuperación de la instalación; eliminar datos puede destruir ventas, caja y auditoría.

## Controles de seguridad relacionados

- Cinco intentos fallidos consecutivos bloquean la cuenta durante cinco minutos.
- Los mensajes no revelan si falló el usuario, la contraseña o el código.
- El código es de un solo uso y se rota después de cada recuperación.
- Cada recuperación queda registrada en auditoría sin contraseña, código, hash ni sal.
- La sesión finaliza después de una hora completa sin actividad.
