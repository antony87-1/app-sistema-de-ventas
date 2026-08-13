export type ReportPeriod = 'DAY' | 'WEEK' | 'MONTH';

export interface ReportDateRange {
  readonly period: ReportPeriod;
  readonly startLocalDate: string;
  readonly endLocalDate: string;
  readonly label: string;
}

export interface ReportKpis {
  readonly totalSalesCents: number;
  readonly expectedCashCents: number;
  readonly cashPaymentsCents: number;
  readonly yapePaymentsCents: number;
  readonly expensesCents: number;
  readonly salesCount: number;
}

export interface ReportRecognizedSale {
  readonly operationId: string;
  readonly operationCode: string;
  readonly operationType: 'VENTA_RAPIDA' | 'CUENTA_MESA' | 'PEDIDO_PROGRAMADO';
  readonly saleJourneyId: string;
  readonly recognizedAtUtc: string;
  readonly totalSalesCents: number;
}

export interface DailySalesGroupingInput {
  readonly journeyId: string;
  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;
  readonly nowUtc: string;
  readonly sales: readonly ReportRecognizedSale[];
}

export interface DailySalesInterval {
  readonly startUtc: string;
  readonly endUtc: string;
  readonly localLabel: string;
  readonly totalSalesCents: number;
  readonly salesCount: number;
  readonly isBestInterval: boolean;
}

export interface WeeklySalesDay {
  readonly localDate: string;
  readonly dayLabel: string;
  readonly totalSalesCents: number;
  readonly salesCount: number;
  readonly cashPaymentsCents: number;
  readonly yapePaymentsCents: number;
  readonly expensesCents: number;
  readonly isBestDay: boolean;
}

export interface MonthlySalesWeek {
  readonly weekNumber: number;
  readonly startLocalDate: string;
  readonly endLocalDate: string;
  readonly label: string;
  readonly totalSalesCents: number;
  readonly salesCount: number;
  readonly isBestWeek: boolean;
}

export interface SalesStatisticsReport<TPoint> {
  readonly range: ReportDateRange;
  readonly kpis: ReportKpis;
  readonly points: readonly TPoint[];
  readonly generatedAtUtc: string;
}

export type DailySalesGroupingFunction = (
  input: DailySalesGroupingInput,
) => readonly DailySalesInterval[];
