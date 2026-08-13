import type {
  DailySalesGroupingFunction,
  DailySalesGroupingInput,
  ReportRecognizedSale,
} from './sales-statistics.models';

/**
 * Contrato TDD de la siguiente etapa. Se mantiene omitido hasta implementar
 * el agrupador, para no dejar rota la aplicación entre aprobaciones.
 */
describe.skip('groupDailySalesByHalfHour — contrato TDD pendiente de aprobación', () => {
  const group: DailySalesGroupingFunction = () => {
    throw new Error('DAILY_SALES_GROUPING_NOT_IMPLEMENTED');
  };

  it('genera intervalos consecutivos de 30 minutos desde la apertura hasta el cierre', () => {
    const result = group(input([], '2026-07-31T16:00:00Z', '2026-07-31T18:00:00Z'));

    expect(result.map((item) => [item.startUtc, item.endUtc])).toEqual([
      ['2026-07-31T16:00:00.000Z', '2026-07-31T16:30:00.000Z'],
      ['2026-07-31T16:30:00.000Z', '2026-07-31T17:00:00.000Z'],
      ['2026-07-31T17:00:00.000Z', '2026-07-31T17:30:00.000Z'],
      ['2026-07-31T17:30:00.000Z', '2026-07-31T18:00:00.000Z'],
    ]);
  });

  it('usa la hora actual como límite de una jornada abierta y no crea intervalos posteriores', () => {
    const result = group(input([], '2026-07-31T16:00:00Z', null, '2026-07-31T17:10:00Z'));

    expect(result.at(-1)).toMatchObject({
      startUtc: '2026-07-31T17:00:00.000Z',
      endUtc: '2026-07-31T17:10:00.000Z',
    });
    expect(
      result.every((item) => Date.parse(item.endUtc) <= Date.parse('2026-07-31T17:10:00Z')),
    ).toBe(true);
  });

  it('asigna cada venta a un único intervalo usando inicio inclusivo y fin exclusivo', () => {
    const result = group(
      input(
        [
          sale('sale-1', '2026-07-31T16:29:59Z', 2000),
          sale('sale-2', '2026-07-31T16:30:00Z', 3500),
        ],
        '2026-07-31T16:00:00Z',
        '2026-07-31T17:00:00Z',
      ),
    );

    expect(result.map((item) => [item.totalSalesCents, item.salesCount])).toEqual([
      [2000, 1],
      [3500, 1],
    ]);
  });

  it('no convierte los importes en valores acumulativos para intervalos posteriores', () => {
    const result = group(
      input(
        [sale('sale-1', '2026-07-31T16:10:00Z', 8000)],
        '2026-07-31T16:00:00Z',
        '2026-07-31T17:30:00Z',
      ),
    );

    expect(result.map((item) => item.totalSalesCents)).toEqual([8000, 0, 0]);
    expect(result.map((item) => item.salesCount)).toEqual([1, 0, 0]);
  });

  it('ignora operaciones ajenas a la jornada o fuera de sus límites', () => {
    const outsideJourney = {
      ...sale('sale-2', '2026-07-31T16:15:00Z', 9000),
      saleJourneyId: 'journey-2',
    };
    const result = group(
      input(
        [
          sale('before', '2026-07-31T15:59:59Z', 1000),
          outsideJourney,
          sale('after', '2026-07-31T17:00:01Z', 2000),
        ],
        '2026-07-31T16:00:00Z',
        '2026-07-31T17:00:00Z',
      ),
    );

    expect(result.reduce((total, item) => total + item.totalSalesCents, 0)).toBe(0);
    expect(result.reduce((total, item) => total + item.salesCount, 0)).toBe(0);
  });

  it('identifica un único mejor intervalo y resuelve empates usando el primero', () => {
    const result = group(
      input(
        [
          sale('sale-1', '2026-07-31T16:10:00Z', 5000),
          sale('sale-2', '2026-07-31T16:40:00Z', 5000),
        ],
        '2026-07-31T16:00:00Z',
        '2026-07-31T17:00:00Z',
      ),
    );

    expect(result.map((item) => item.isBestInterval)).toEqual([true, false]);
  });
});

function input(
  sales: readonly ReportRecognizedSale[],
  openedAtUtc: string,
  closedAtUtc: string | null,
  nowUtc = '2026-07-31T20:00:00Z',
): DailySalesGroupingInput {
  return { journeyId: 'journey-1', openedAtUtc, closedAtUtc, nowUtc, sales };
}

function sale(
  operationId: string,
  recognizedAtUtc: string,
  totalSalesCents: number,
): ReportRecognizedSale {
  return {
    operationId,
    operationCode: operationId.toUpperCase(),
    operationType: 'VENTA_RAPIDA',
    saleJourneyId: 'journey-1',
    recognizedAtUtc,
    totalSalesCents,
  };
}
