import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface ReportJourney {
  readonly id: string;
  readonly businessDate: string;
  readonly state: 'ABIERTA' | 'CERRADA';
  readonly openedAtUtc: string;
}

export interface CashReportMethod {
  readonly code: string;
  readonly name: string;
  readonly inflowCents: number;
  readonly outflowCents: number;
  readonly netCents: number;
}

export interface CashReportMovement {
  readonly id: string;
  readonly methodName: string;
  readonly type: 'INGRESO_COBRO' | 'SALIDA_GASTO' | 'CORRECCION_ENTRADA' | 'CORRECCION_SALIDA';
  readonly amountCents: number;
  readonly occurredAtUtc: string;
}

export interface SalesReportType {
  readonly type: 'VENTA_RAPIDA' | 'CUENTA_MESA' | 'PEDIDO_PROGRAMADO';
  readonly operationCount: number;
  readonly totalCents: number;
}

export interface SalesReportOperation {
  readonly code: string;
  readonly type: SalesReportType['type'];
  readonly totalCents: number;
  readonly finalizedAtUtc: string;
}

export interface JourneyReport {
  readonly journey: ReportJourney;
  readonly initialCashCents: number;
  readonly expectedCashCents: number;
  readonly cashMethods: readonly CashReportMethod[];
  readonly cashMovements: readonly CashReportMovement[];
  readonly salesByType: readonly SalesReportType[];
  readonly salesOperations: readonly SalesReportOperation[];
  readonly grossSalesCents: number;
  readonly salesCorrectionAddsCents: number;
  readonly salesCorrectionSubtractsCents: number;
  readonly netSalesCents: number;
}

export interface JourneyReportRepository {
  listJourneys(): Promise<readonly ReportJourney[]>;
  get(journeyId: string): Promise<JourneyReport | null>;
}

export class InvalidJourneyReportRequestError extends Error {
  readonly code = 'INVALID_JOURNEY_REPORT_REQUEST';
}

export class GetJourneyReportUseCase {
  constructor(
    private readonly repository: JourneyReportRepository,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  list(actor: AuthenticatedIdentity): Promise<readonly ReportJourney[]> {
    this.authorization.assertCan(actor.role, 'VER_REPORTES');
    return this.repository.listJourneys();
  }

  get(journeyId: string, actor: AuthenticatedIdentity): Promise<JourneyReport | null> {
    this.authorization.assertCan(actor.role, 'VER_REPORTES');
    const normalized = journeyId.trim();
    if (!normalized) throw new InvalidJourneyReportRequestError();
    return this.repository.get(normalized);
  }
}
