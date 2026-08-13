import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { ECONOMIC_CORRECTIONS_REPOSITORY } from '../../core/correction/sqlite-economic-corrections.repository';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  ManageEconomicCorrectionsUseCase,
  type CorrectableEconomicRecord,
  type CreateEconomicCorrectionInput,
  type EconomicCorrectionSummary,
  type EconomicCorrectionsRepository,
} from '../../domain/correction/manage-economic-corrections.use-case';

export interface EconomicCorrectionsFacadePort {
  listCorrectable(): Promise<readonly CorrectableEconomicRecord[]>;
  listCorrections(): Promise<readonly EconomicCorrectionSummary[]>;
  create(
    input: Omit<CreateEconomicCorrectionInput, 'actor' | 'idempotencyKey'>,
    key: string,
  ): Promise<EconomicCorrectionSummary>;
  newRequestKey(): string;
}
export const ECONOMIC_CORRECTIONS_FACADE = new InjectionToken<EconomicCorrectionsFacadePort>(
  'ECONOMIC_CORRECTIONS_FACADE',
);

@Injectable()
export class EconomicCorrectionsFacade implements EconomicCorrectionsFacadePort {
  constructor(
    private readonly connection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(ECONOMIC_CORRECTIONS_REPOSITORY)
    private readonly repository: EconomicCorrectionsRepository,
  ) {}
  async listCorrectable() {
    await this.connection.initialize();
    return this.useCase().listCorrectable(this.actor());
  }
  async listCorrections() {
    await this.connection.initialize();
    return this.useCase().listCorrections(this.actor());
  }
  async create(
    input: Omit<CreateEconomicCorrectionInput, 'actor' | 'idempotencyKey'>,
    key: string,
  ) {
    await this.connection.initialize();
    return this.useCase().create({ ...input, idempotencyKey: key, actor: this.actor() });
  }
  newRequestKey() {
    return generateId();
  }
  private useCase() {
    return new ManageEconomicCorrectionsUseCase(
      this.repository,
      this.authorization,
      generateId,
      () => new Date().toISOString(),
    );
  }
  private actor() {
    const actor = this.session.current();
    if (!actor) throw new Error('ACTIVE_CORRECTION_SESSION_REQUIRED');
    return actor;
  }
}
function generateId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
