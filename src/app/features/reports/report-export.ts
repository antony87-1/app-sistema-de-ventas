import type { JourneyReport } from '../../domain/report/get-journey-report.use-case';

export function buildJourneyReportCsv(report: JourneyReport): string {
  const rows: readonly (readonly (string | number)[])[] = [
    ['REPORTE DE JORNADA', report.journey.businessDate],
    [],
    ['CAJA POR MÉTODO'],
    ['Método', 'Ingresos', 'Salidas', 'Neto'],
    ...report.cashMethods.map((item) => [
      item.name,
      money(item.inflowCents),
      money(item.outflowCents),
      money(item.netCents),
    ]),
    ['Efectivo inicial', money(report.initialCashCents)],
    ['Efectivo esperado', money(report.expectedCashCents)],
    [],
    ['MOVIMIENTOS DE CAJA'],
    ['Fecha UTC', 'Método', 'Tipo', 'Monto'],
    ...report.cashMovements.map((item) => [
      item.occurredAtUtc,
      item.methodName,
      item.type,
      money(item.amountCents),
    ]),
    [],
    ['VENTAS RECONOCIDAS'],
    ['Código', 'Tipo', 'Fecha UTC', 'Total'],
    ...report.salesOperations.map((item) => [
      item.code,
      item.type,
      item.finalizedAtUtc,
      money(item.totalCents),
    ]),
    ['Ventas originales', money(report.grossSalesCents)],
    ['Correcciones que suman', money(report.salesCorrectionAddsCents)],
    ['Correcciones que restan', money(report.salesCorrectionSubtractsCents)],
    ['Ventas netas', money(report.netSalesCents)],
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
