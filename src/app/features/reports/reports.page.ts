import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import type {
  JourneyReport,
  ReportJourney,
  SalesReportType,
} from '../../domain/report/get-journey-report.use-case';
import { buildJourneyReportCsv } from './report-export';
import { buildJourneyReportPdf } from './report-pdf';
import { REPORTS_FACADE } from './reports.facade';
import { EconomicCorrectionsComponent } from '../corrections/economic-corrections.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [IonContent, EconomicCorrectionsComponent],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage implements OnInit {
  private readonly facade = inject(REPORTS_FACADE);
  private readonly router = inject(Router);
  readonly journeys = signal<readonly ReportJourney[]>([]);
  readonly selectedJourneyId = signal('');
  readonly report = signal<JourneyReport | null>(null);
  readonly status = signal<'LOADING' | 'READY' | 'ERROR' | 'FORBIDDEN'>('LOADING');
  readonly mode = signal<'REPORTS' | 'CORRECTIONS'>('REPORTS');

  ngOnInit(): void {
    void this.initialize();
  }

  async initialize(): Promise<void> {
    this.status.set('LOADING');
    try {
      const journeys = await this.facade.listJourneys();
      this.journeys.set(journeys);
      this.selectedJourneyId.set(journeys[0]?.id ?? '');
      if (journeys.length) await this.load(journeys[0].id);
      else this.status.set('READY');
    } catch (error: unknown) {
      this.status.set(errorCode(error) === 'PERMISSION_DENIED' ? 'FORBIDDEN' : 'ERROR');
    }
  }

  async load(id: string): Promise<void> {
    this.selectedJourneyId.set(id);
    this.status.set('LOADING');
    try {
      this.report.set(await this.facade.load(id));
      this.status.set('READY');
    } catch (error: unknown) {
      this.status.set(errorCode(error) === 'PERMISSION_DENIED' ? 'FORBIDDEN' : 'ERROR');
    }
  }

  exportCsv(): void {
    const report = this.report();
    if (!report) return;
    const blob = new Blob([buildJourneyReportCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kankachos-reporte-${report.journey.businessDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  downloadPdf(): void {
    const report = this.report();
    if (!report) return;
    this.download(
      new Blob([buildJourneyReportPdf(report) as BlobPart], { type: 'application/pdf' }),
      `kankachos-reporte-${report.journey.businessDate}.pdf`,
    );
  }

  back(): Promise<boolean> {
    return this.router.navigateByUrl('/inicio');
  }

  typeLabel(type: SalesReportType['type']): string {
    return {
      VENTA_RAPIDA: 'Venta rápida',
      CUENTA_MESA: 'Cuenta de mesa',
      PEDIDO_PROGRAMADO: 'Pedido programado',
    }[type];
  }

  formatSoles(cents: number): string {
    return `S/${(cents / 100).toFixed(2)}`;
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}
