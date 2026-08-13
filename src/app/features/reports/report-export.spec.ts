import { buildJourneyReportCsv } from './report-export';

describe('buildJourneyReportCsv', () => {
  it('exports cash and sales as separate sections with CSV escaping', () => {
    const csv = buildJourneyReportCsv({
      journey: { id: 'j1', businessDate: '2026-07-30', state: 'CERRADA', openedAtUtc: 'now' },
      initialCashCents: 10000,
      expectedCashCents: 12000,
      cashMethods: [
        {
          code: 'EFECTIVO',
          name: 'Efectivo, caja',
          inflowCents: 3000,
          outflowCents: 1000,
          netCents: 2000,
        },
      ],
      cashMovements: [
        {
          id: 'm1',
          methodName: 'Efectivo',
          type: 'INGRESO_COBRO',
          amountCents: 3000,
          occurredAtUtc: 'now',
        },
      ],
      salesByType: [{ type: 'PEDIDO_PROGRAMADO', operationCount: 1, totalCents: 8000 }],
      salesOperations: [
        { code: 'PP-1', type: 'PEDIDO_PROGRAMADO', totalCents: 8000, finalizedAtUtc: 'later' },
      ],
      grossSalesCents: 8000,
      salesCorrectionAddsCents: 0,
      salesCorrectionSubtractsCents: 500,
      netSalesCents: 7500,
    });

    expect(csv).toContain('CAJA POR MÉTODO');
    expect(csv).toContain('VENTAS RECONOCIDAS');
    expect(csv).toContain('"Efectivo, caja",30.00,10.00,20.00');
    expect(csv).toContain('Ventas netas,75.00');
  });
});
