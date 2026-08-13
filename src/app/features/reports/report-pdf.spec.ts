import { buildJourneyReportPdf } from './report-pdf';

describe('buildJourneyReportPdf', () => {
  it('creates a complete PDF document locally', () => {
    const bytes = buildJourneyReportPdf({
      journey: { id: 'j1', businessDate: '2026-07-30', state: 'CERRADA', openedAtUtc: 'now' },
      initialCashCents: 10000,
      expectedCashCents: 12000,
      cashMethods: [
        {
          code: 'EFECTIVO',
          name: 'Efectivo',
          inflowCents: 3000,
          outflowCents: 1000,
          netCents: 2000,
        },
      ],
      cashMovements: [],
      salesByType: [{ type: 'VENTA_RAPIDA', operationCount: 1, totalCents: 3000 }],
      salesOperations: [
        { code: 'VR-1', type: 'VENTA_RAPIDA', totalCents: 3000, finalizedAtUtc: 'now' },
      ],
      grossSalesCents: 3000,
      salesCorrectionAddsCents: 0,
      salesCorrectionSubtractsCents: 500,
      netSalesCents: 2500,
    });
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('VENTAS NETAS: S/25.00');
    expect(text.endsWith('%%EOF')).toBe(true);
  });
});
