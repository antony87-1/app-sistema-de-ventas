# Reportes estadísticos de ventas

## Estado

- Versión: 0.1.0.
- Fecha: 2026-07-31.
- Alcance aprobado de esta entrega: modelo de datos, ejemplos de agrupación diaria y contrato TDD diario.
- Todavía no se implementan consultas SQLite, agrupadores productivos, tarjetas ni gráficos.

## Regla de reconocimiento

Una operación finalizada aparece una sola vez en ventas mediante `jornada_venta_id` y `finalizada_en_utc`. Sus cobros no generan ventas adicionales. Los movimientos de dinero se consultan separadamente por `movimientos_caja.jornada_id`.

Todos los montos permanecen como enteros en céntimos. `S/` y los decimales se agregan exclusivamente al presentar el dato.

## Modelo

El contrato TypeScript se encuentra en `src/app/domain/report/sales-statistics.models.ts` y separa:

- periodo y rango local seleccionado;
- KPI de ventas y caja;
- operaciones comerciales reconocidas;
- intervalos diarios;
- días semanales;
- semanas parciales mensuales.

Cada punto incluye cantidad de operaciones y monto no acumulativo. El indicador `isBest...` permite destacar el máximo con texto, borde o icono, sin depender solo del color.

## Ejemplo diario

Jornada abierta a las 11:00 y cerrada a las 13:00, hora de Lima:

| Operación | Finalización |     Total |
| --------- | ------------ | --------: |
| VR-1      | 11:12        |  S/ 20.00 |
| CM-1      | 11:29        |  S/ 60.00 |
| VR-2      | 11:30        | S/ 150.00 |
| PP-1      | 12:48        | S/ 220.00 |

Resultado esperado:

| Intervalo   | Operaciones |     Venta |
| ----------- | ----------: | --------: |
| 11:00–11:30 |           2 |  S/ 80.00 |
| 11:30–12:00 |           1 | S/ 150.00 |
| 12:00–12:30 |           0 |   S/ 0.00 |
| 12:30–13:00 |           1 | S/ 220.00 |

Una operación situada exactamente a las 11:30 pertenece al segundo intervalo. Cada intervalo usa inicio inclusivo y fin exclusivo. El último límite de una jornada abierta es la hora actual; el de una jornada cerrada es su hora de cierre.

## Ejemplo semanal futuro

La semana siempre abarcará lunes a domingo, incluso al cruzar un mes. Los siete días existirán en la respuesta; un día sin operaciones tendrá cero ventas y cero operaciones.

## Ejemplo mensual futuro

Julio de 2026 comienza un miércoles. La primera agrupación mensual contendrá solo los días 1–5, las siguientes serán 6–12, 13–19 y 20–26, y la última 27–31. Solo se contabilizan días pertenecientes al mes elegido.

## Contrato TDD diario

La especificación pendiente cubre:

1. intervalos consecutivos desde la apertura hasta el cierre;
2. límite actual para una jornada abierta;
3. asignación única en límites de media hora;
4. valores no acumulativos;
5. exclusión de ventas fuera de la jornada o del intervalo operativo;
6. identificación determinista del intervalo de mayor venta.

Las pruebas están redactadas y temporalmente omitidas hasta que se apruebe implementar el agrupador. Así se conserva verde el conjunto actual de pruebas entre etapas.

## Decisiones económicas pendientes

1. Confirmar si una corrección de ventas debe modificar la barra del intervalo original, mostrarse en un bloque separado o afectar únicamente el KPI total neto.
2. Confirmar qué representa `Efectivo esperado` en semana y mes: suma de resultados diarios o solo efectivo esperado de la jornada seleccionada/actual. Sumar montos iniciales de varias jornadas podría contar repetidamente el fondo de caja.
3. Confirmar si una jornada que cruza medianoche pertenece completa a su fecha de negocio o si sus ventas deben dividirse por fecha y hora de calendario.
4. Confirmar el corte cuando una jornada empieza a una hora no redonda, por ejemplo 11:07: intervalos exactos 11:07–11:37 o primer tramo parcial 11:07–11:30 y luego medias horas de reloj.
