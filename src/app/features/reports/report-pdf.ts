import type { JourneyReport } from '../../domain/report/get-journey-report.use-case';

export function buildJourneyReportPdf(report: JourneyReport): Uint8Array {
  const lines = reportLines(report)
    .map(ascii)
    .flatMap((line) => wrap(line, 95));
  const pages = chunk(lines, 48);
  const fontId = 3 + pages.length * 2;
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] >>`,
  );
  pages.forEach((page, index) => {
    const contentId = 4 + index * 2;
    const stream = `BT /F1 9 Tf 42 800 Td 14 TL ${page.map((line) => `(${pdfText(line)}) Tj T*`).join(' ')} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function reportLines(report: JourneyReport): readonly string[] {
  return [
    'KANKACHOS VALERIANO - REPORTE DE JORNADA',
    `Fecha: ${report.journey.businessDate}    Estado: ${report.journey.state}`,
    '',
    'CAJA POR METODO',
    `Efectivo inicial: ${money(report.initialCashCents)}    Efectivo esperado: ${money(report.expectedCashCents)}`,
    ...report.cashMethods.map(
      (item) =>
        `${item.name}: ingresos ${money(item.inflowCents)} | salidas ${money(item.outflowCents)} | neto ${money(item.netCents)}`,
    ),
    '',
    'VENTAS RECONOCIDAS',
    ...report.salesByType.map(
      (item) => `${item.type}: ${item.operationCount} operaciones | ${money(item.totalCents)}`,
    ),
    `Originales: ${money(report.grossSalesCents)}`,
    `Correcciones que suman: ${money(report.salesCorrectionAddsCents)}`,
    `Correcciones que restan: ${money(report.salesCorrectionSubtractsCents)}`,
    `VENTAS NETAS: ${money(report.netSalesCents)}`,
    '',
    'DETALLE DE VENTAS',
    ...report.salesOperations.map(
      (item) => `${item.code} | ${item.type} | ${item.finalizedAtUtc} | ${money(item.totalCents)}`,
    ),
    '',
    'Caja: jornada del cobro o gasto. Ventas: jornada de finalizacion o entrega.',
  ];
}
function money(cents: number): string {
  return `S/${(cents / 100).toFixed(2)}`;
}
function ascii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '-');
}
function wrap(value: string, width: number): readonly string[] {
  if (value.length <= width) return [value];
  const result: string[] = [];
  let remaining = value;
  while (remaining.length > width) {
    const found = remaining.lastIndexOf(' ', width);
    const split = found > 0 ? found : width;
    result.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  result.push(remaining);
  return result;
}
function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result.length ? result : [[]];
}
function pdfText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}
