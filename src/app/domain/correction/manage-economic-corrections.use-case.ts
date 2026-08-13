import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export type CorrectionOriginalType =
  | 'OPERACION'
  | 'COBRO'
  | 'GASTO'
  | 'CIERRE_JORNADA'
  | 'MOVIMIENTO_CAJA'
  | 'CORRECCION_ECONOMICA';
export type CorrectionImpact = 'SUMA' | 'RESTA' | 'SIN_EFECTO';

export interface CorrectableEconomicRecord {
  readonly id: string;
  readonly type: CorrectionOriginalType;
  readonly label: string;
  readonly amountCents: number;
  readonly occurredAtUtc: string;
  readonly journeyId: string;
  readonly saleJourneyId: string | null;
}

export interface EconomicCorrectionSummary {
  readonly id: string;
  readonly originalId: string;
  readonly originalType: CorrectionOriginalType;
  readonly reason: string;
  readonly cashImpact: CorrectionImpact;
  readonly cashAmountCents: number;
  readonly saleImpact: CorrectionImpact;
  readonly saleAmountCents: number;
  readonly saleJourneyId: string | null;
  readonly createdBy: string;
  readonly createdAtUtc: string;
}

export interface CreateEconomicCorrectionInput {
  readonly originalId: string;
  readonly originalType: CorrectionOriginalType;
  readonly reason: string;
  readonly cashImpact: CorrectionImpact;
  readonly cashAmountCents: number;
  readonly paymentMethodId: string | null;
  readonly saleImpact: CorrectionImpact;
  readonly saleAmountCents: number;
  readonly saleJourneyId: string | null;
  readonly idempotencyKey: string;
  readonly actor: AuthenticatedIdentity;
}

export interface EconomicCorrectionCommand extends Omit<CreateEconomicCorrectionInput, 'actor'> {
  readonly correctionId: string;
  readonly movementId: string;
  readonly auditId: string;
  readonly actorUserId: string;
  readonly occurredAtUtc: string;
}

export interface EconomicCorrectionsRepository {
  listCorrectable(): Promise<readonly CorrectableEconomicRecord[]>;
  listCorrections(): Promise<readonly EconomicCorrectionSummary[]>;
  create(command: EconomicCorrectionCommand): Promise<EconomicCorrectionSummary>;
}

export class InvalidEconomicCorrectionError extends Error {
  readonly code = 'INVALID_ECONOMIC_CORRECTION';
}

export class ManageEconomicCorrectionsUseCase {
  constructor(
    private readonly repository: EconomicCorrectionsRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}

  listCorrectable(actor: AuthenticatedIdentity) {
    this.authorization.assertCan(actor.role, 'CREAR_CORRECCION_ECONOMICA');
    return this.repository.listCorrectable();
  }

  listCorrections(actor: AuthenticatedIdentity) {
    this.authorization.assertCan(actor.role, 'CREAR_CORRECCION_ECONOMICA');
    return this.repository.listCorrections();
  }

  create(input: CreateEconomicCorrectionInput) {
    this.authorization.assertCan(input.actor.role, 'CREAR_CORRECCION_ECONOMICA');
    if (!valid(input)) throw new InvalidEconomicCorrectionError();
    return this.repository.create({
      ...input,
      originalId: input.originalId.trim(),
      reason: input.reason.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
      correctionId: this.generateId(),
      movementId: this.generateId(),
      auditId: this.generateId(),
      actorUserId: input.actor.userId,
      occurredAtUtc: this.nowUtc(),
    });
  }
}

function valid(input: CreateEconomicCorrectionInput): boolean {
  return (
    input.originalId.trim().length > 0 &&
    input.reason.trim().length > 0 &&
    input.idempotencyKey.trim().length > 0 &&
    validImpact(input.cashImpact, input.cashAmountCents) &&
    validImpact(input.saleImpact, input.saleAmountCents) &&
    (input.cashImpact === 'SIN_EFECTO'
      ? input.paymentMethodId === null
      : !!input.paymentMethodId) &&
    (input.saleImpact === 'SIN_EFECTO' ? input.saleJourneyId === null : !!input.saleJourneyId)
  );
}

function validImpact(impact: CorrectionImpact, amount: number): boolean {
  return Number.isSafeInteger(amount) && (impact === 'SIN_EFECTO' ? amount === 0 : amount > 0);
}
