import { Component, inject, OnInit, signal } from '@angular/core';

import type { ExpensePaymentMethodOption } from '../../domain/expense/list-expense-form-options.use-case';
import type { ReportJourney } from '../../domain/report/get-journey-report.use-case';
import type {
  CorrectableEconomicRecord,
  CorrectionImpact,
  EconomicCorrectionSummary,
} from '../../domain/correction/manage-economic-corrections.use-case';
import { EXPENSE_FACADE } from '../service-workspace/expense.facade';
import { REPORTS_FACADE } from '../reports/reports.facade';
import { ECONOMIC_CORRECTIONS_FACADE } from './economic-corrections.facade';

@Component({
  selector: 'app-economic-corrections',
  standalone: true,
  templateUrl: './economic-corrections.component.html',
  styleUrl: './economic-corrections.component.scss',
})
export class EconomicCorrectionsComponent implements OnInit {
  private readonly facade = inject(ECONOMIC_CORRECTIONS_FACADE);
  private readonly expense = inject(EXPENSE_FACADE);
  private readonly reports = inject(REPORTS_FACADE);
  private requestKey = this.facade.newRequestKey();
  readonly records = signal<readonly CorrectableEconomicRecord[]>([]);
  readonly corrections = signal<readonly EconomicCorrectionSummary[]>([]);
  readonly methods = signal<readonly ExpensePaymentMethodOption[]>([]);
  readonly journeys = signal<readonly ReportJourney[]>([]);
  readonly status = signal<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly originalId = signal('');
  readonly reason = signal('');
  readonly cashImpact = signal<CorrectionImpact>('SIN_EFECTO');
  readonly cashAmount = signal('');
  readonly paymentMethodId = signal('');
  readonly saleImpact = signal<CorrectionImpact>('SIN_EFECTO');
  readonly saleAmount = signal('');
  readonly saleJourneyId = signal('');
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.status.set('LOADING');
    try {
      const [records, corrections, options, journeys] = await Promise.all([
        this.facade.listCorrectable(),
        this.facade.listCorrections(),
        this.expense.loadOptions(),
        this.reports.listJourneys(),
      ]);
      this.records.set(records);
      this.corrections.set(corrections);
      this.methods.set(options.paymentMethods);
      this.journeys.set(journeys);
      if (!records.some((r) => r.id === this.originalId()))
        this.selectOriginal(records[0]?.id ?? '');
      if (!this.paymentMethodId()) this.paymentMethodId.set(options.paymentMethods[0]?.id ?? '');
      this.status.set('READY');
    } catch {
      this.status.set('ERROR');
    }
  }
  selectOriginal(id: string) {
    this.originalId.set(id);
    const record = this.records().find((item) => item.id === id);
    this.saleJourneyId.set(record?.saleJourneyId ?? record?.journeyId ?? '');
  }
  setCashImpact(value: string) {
    this.cashImpact.set(asImpact(value));
    if (value === 'SIN_EFECTO') this.cashAmount.set('');
  }
  setSaleImpact(value: string) {
    this.saleImpact.set(asImpact(value));
    if (value === 'SIN_EFECTO') this.saleAmount.set('');
  }
  async create() {
    const record = this.records().find((item) => item.id === this.originalId());
    const cash = amount(this.cashAmount(), this.cashImpact()),
      sale = amount(this.saleAmount(), this.saleImpact());
    if (!record || !this.reason().trim() || cash === null || sale === null) {
      this.error.set(
        'Selecciona el registro, escribe el motivo y completa los importes requeridos.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const correction = await this.facade.create(
        {
          originalId: record.id,
          originalType: record.type,
          reason: this.reason(),
          cashImpact: this.cashImpact(),
          cashAmountCents: cash,
          paymentMethodId: this.cashImpact() === 'SIN_EFECTO' ? null : this.paymentMethodId(),
          saleImpact: this.saleImpact(),
          saleAmountCents: sale,
          saleJourneyId: this.saleImpact() === 'SIN_EFECTO' ? null : this.saleJourneyId(),
        },
        this.requestKey,
      );
      this.requestKey = this.facade.newRequestKey();
      this.reason.set('');
      this.cashImpact.set('SIN_EFECTO');
      this.cashAmount.set('');
      this.saleImpact.set('SIN_EFECTO');
      this.saleAmount.set('');
      this.feedback.set(
        `Corrección ${correction.id.slice(0, 8)} registrada sin modificar el original.`,
      );
      await this.load();
    } catch {
      this.error.set(
        'No se pudo registrar la corrección. Comprueba que exista una jornada abierta.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  formatSoles(cents: number) {
    return `S/${(cents / 100).toFixed(2)}`;
  }
}
function asImpact(value: string): CorrectionImpact {
  return value === 'SUMA' || value === 'RESTA' ? value : 'SIN_EFECTO';
}
function amount(value: string, impact: CorrectionImpact): number | null {
  if (impact === 'SIN_EFECTO') return 0;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value.replace(',', '.')) * 100);
  return cents > 0 ? cents : null;
}
