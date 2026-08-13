# Frontend de atención

## Estado

- Versión: 0.41.0.
- Fecha: 2026-07-31.
- Estado: venta rápida, cuentas de mesa, pedidos programados, reportes, correcciones y administración de mesas implementados.
- Alcance actual: atención, pagos, programados, reportes históricos, correcciones compensatorias y gestión auditada de mesas.
- Fuera de alcance actual: política de anulación de programados con adelanto.

## Experiencia aprobada

En tablet horizontal la atención mantiene tres zonas simultáneas:

1. Productos a la izquierda, aproximadamente 43 %.
2. Cuenta actual al centro, aproximadamente 37 %.
3. Mesas a la derecha, aproximadamente 20 % y con opción de contraer.

Una barra fija superior muestra siempre el destino de las acciones, por ejemplo `AGREGANDO A MESA 4 · CUENTA A`. Incluye acciones visibles para cambiar mesa o cuenta.

`Cambiar mesa` devuelve al selector de mesas. `Cambiar cuenta` alterna entre las cuentas abiertas de la mesa seleccionada. La barra principal incluye `Cerrar sesión`, que permite entregar el dispositivo al siguiente trabajador sin cerrar la jornada ni perder las operaciones abiertas.

En celular se usan las vistas `Mesas`, `Productos` y `Cuenta`; no se comprimen las tres columnas en una sola pantalla.

## Decisiones de mesas

- Una mesa puede tener como máximo dos cuentas abiertas simultáneamente.
- Las cuentas se presentan como `Cuenta A` y `Cuenta B`.
- Con una cuenta se permite abrirla o crear la segunda de manera explícita.
- Con dos cuentas se bloquea una tercera.
- Las cuentas conservan productos, pagos, saldo e historial independientes.
- Las mesas unidas continúan representando una sola cuenta; separar una mesa no divide consumos ni pagos.

La migración v3 retiró el índice antiguo y SQLite admite hasta dos asociaciones activas por mesa. El panel consulta mesas y cuentas reales; cuando el catálogo de mesas está vacío muestra un aviso y no inventa distribución física del local.

## Productos y adicionales

- Los productos agotados siguen visibles, etiquetados y bloqueados.
- Administrador y cajero pueden usar una acción secundaria explícita para marcar cada producto disponible o agotado.
- La tarjeta cambia visualmente solo después de que SQLite confirma la transacción y muestra un error seguro si no pudo guardarse.
- Los adicionales existen en administración, pero en atención se agregan únicamente desde una línea de kankacho.
- El selector de adicionales será un panel de botones grandes en la parte superior del modal o panel contextual.
- Editar precio parte de una línea concreta de kankacho y exige mostrar precio original, precio aplicado y motivo.
- Las bebidas de 2 L sin precio confirmado no se crean inicialmente; se añadirán posteriormente desde administración.

## Componentes base implementados

- `ServiceWorkspacePage`.
- `ProductCardComponent`.
- `TableCardComponent`.
- `StatusBadgeComponent`.
- `LocalSaveIndicatorComponent`.
- `ScheduledOrdersComponent`.

Los productos, categorías, mesas y cuentas activas se consultan desde SQLite. Al seleccionar un producto se agrega a la cuenta elegida; los adicionales se ofrecen como botones hijos únicamente en productos compatibles. El panel central recupera cantidades, servicio y totales reales. Las líneas pendientes se pueden ajustar o marcar servidas. En la parte superior se puede agregar la cuenta a una mesa libre o separar una mesa vinculada sin dividir consumos.

El bloque `Seleccionar productos para cobrar` presenta cada principal y adicional con su cantidad pendiente. El cajero elige unidades exactas, revisa el total calculado y cobra mediante Efectivo, Yape o ambos. Alcanzar saldo cero muestra `Finalizar atención`; solo esa confirmación libera las mesas y cierra la operación comercial.

El núcleo SQLite de venta rápida ya puede crear atómicamente una operación con detalles y adicionales. Su conexión visual queda reservada para un borrador editable, evitando que cada toque aislado cree una operación incompleta.

La venta rápida ya dispone de ese borrador editable: el destino se muestra en la barra superior, los productos y cantidades se preparan localmente, los adicionales se eligen desde la línea principal y SQLite recibe una sola confirmación.

Después de guardar, el cajero cobra con Efectivo o Yape. El efectivo calcula vuelto y Yape exige confirmar visualmente el pago; la operación, el cobro, el movimiento de caja y la auditoría se confirman juntos. Las ventas guardadas que quedaron pendientes se consultan al volver a la vista, conservan sus datos históricos y pueden reanudarse directamente en modo de cobro.

Antes de guardar, los productos que lo permiten muestran `Editar precio`. El cajero elige descuento o precio personalizado, indica el nuevo precio y justifica el cambio; la línea mantiene visibles el precio original y el aplicado. Una venta guardada y todavía no cobrada puede anularse con motivo, sin producir movimientos de caja.

El cobro ofrece Efectivo, Yape o ambos. En modo combinado se ingresa la parte de Yape y el efectivo recibido; la aplicación deriva el saldo en efectivo y calcula vuelto únicamente sobre esa parte. `Historial de la jornada` permite consultar ventas finalizadas o anuladas con sus productos, ajustes, pagos y motivos en modo de solo lectura.

## Pedidos programados

La barra principal incluye la pestaña `Programados`. En tablet, el panel izquierdo permite registrar cliente, fecha, entrega, productos y adicionales; el derecho muestra los pedidos existentes y su seguimiento. En celular ambos paneles se apilan para conservar controles táctiles amplios.

El formulario también permite agregar una línea escrita cuando el pedido no corresponde a un producto estándar. El cajero registra descripción, tamaño o presentación, cantidad y precio unitario; la línea aparece en el borrador y en la consulta del pedido con subtotal propio.

El detalle seleccionado mantiene separados `Preparación` y `Pago`, presenta total, pagado y saldo, permite registrar cobros por Efectivo o Yape y ofrece únicamente el siguiente avance válido de preparación. La entrega no exige que el saldo esté pagado: si queda deuda se muestra pendiente y puede cobrarse posteriormente.

No existe botón de anulación para pedidos con adelanto. La interfaz explica que la operación permanece bloqueada hasta definir la política económica correspondiente.

## Administración de mesas

Solo el administrador puede abrir este panel. Puede crear mesas, cambiar nombre y orden, desactivarlas o reactivarlas. Una mesa con cuentas abiertas no puede desactivarse. Los cambios se guardan localmente, quedan auditados y el panel de atención refleja el catálogo actualizado.

## Reportes administrativos

El administrador ve la acción `Reportes` en la navegación principal. La pantalla es independiente de la jornada abierta para poder consultar días cerrados y ofrece un selector ordenado desde la jornada más reciente.

El primer bloque resume caja por método de pago, ingresos, salidas, neto, efectivo inicial y esperado. El segundo bloque resume las ventas reconocidas por tipo, correcciones que suman o restan y venta neta. Cada operación finalizada aparece una sola vez.

`Exportar CSV` genera un archivo compatible con Excel. `Descargar PDF` produce localmente un documento multipágina. Ambos funcionan sin conexión y no modifican información guardada.

## Correcciones económicas administrativas

Desde la pantalla de reportes, el administrador puede alternar a `Correcciones`. Allí elige el registro original, escribe el motivo y define por separado el efecto sobre caja y ventas.

- El registro original permanece visible e inmutable.
- Caja admite `SUMA`, `RESTA` o `SIN_EFECTO`; cuando se afecta, el método de pago y el monto se eligen explícitamente.
- Ventas admite los mismos efectos; cuando se afecta, se eligen explícitamente la jornada comercial y el monto.
- El movimiento de caja compensatorio pertenece a la jornada abierta actual.
- Cada corrección conserva responsable, fecha, hora, relación con el original y auditoría.
- El historial de correcciones puede consultarse en la misma vista y no permite edición destructiva.
