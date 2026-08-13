import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSearchbar } from '@ionic/angular/standalone';
import { LocalSaveIndicatorComponent } from './local-save-indicator.component';
import { ProductCardComponent } from './product-card.component';
import type { ProductAvailabilityChangeRequest } from './product-card.component';
import { StatusBadgeComponent } from './status-badge.component';
import { TableCardComponent } from './table-card.component';
import { ProductPreview, TablePreview } from './workspace.models';
import { SALE_CATALOG_FACADE } from './catalog.facade';
import { JOURNEY_FACADE } from './journey.facade';
import { EXPENSE_FACADE } from './expense.facade';
import { QUICK_SALE_FACADE } from './quick-sale.facade';
import { TABLE_SERVICE_FACADE } from './table-service.facade';
import { ScheduledOrdersComponent } from './scheduled-orders.component';
import type {
  ExpenseCategoryOption,
  ExpensePaymentMethodOption,
} from '../../domain/expense/list-expense-form-options.use-case';
import type { OpenCashSummary } from '../../domain/cash/get-open-cash-summary.use-case';
import type { PendingJourneyCorrection } from '../../domain/cash/close-journey.use-case';
import type {
  JourneyCloseBlocker,
  JourneyCloseReadiness,
} from '../../domain/cash/evaluate-journey-close-readiness.use-case';
import type { ReopenCandidate } from '../../domain/journey/reopen-journey.use-case';
import type { SaleCatalogAddon } from '../../domain/catalog/list-sale-catalog.use-case';
import type { PendingQuickSale } from '../../domain/sale/list-pending-quick-sales.use-case';
import type { QuickSaleHistoryItem } from '../../domain/sale/list-quick-sale-history.use-case';
import type { TableAccountSnapshot } from '../../domain/table/manage-table-account.use-case';
import { SessionService } from '../../core/auth/session.service';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import { TableAdministrationComponent } from '../table-administration/table-administration.component';

interface QuickSaleDraftAddon extends SaleCatalogAddon {
  readonly quantity: number;
}

interface QuickSaleDraftLine {
  readonly draftId: string;
  readonly productId: string;
  readonly name: string;
  readonly priceCents: number;
  readonly catalogPriceCents: number;
  readonly allowsAddons: boolean;
  readonly allowsPriceChange: boolean;
  readonly quantity: number;
  readonly addons: readonly QuickSaleDraftAddon[];
  readonly priceAdjustment: {
    readonly type: 'DESCUENTO' | 'PRECIO_PERSONALIZADO';
    readonly reason: string;
  } | null;
}

type JourneyViewStatus =
  | 'LOADING'
  | 'NONE'
  | 'OPEN_TODAY'
  | 'OPEN_PREVIOUS_DAY'
  | 'OPEN_FUTURE_DAY'
  | 'ERROR';

@Component({
  selector: 'app-service-workspace',
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    IonSearchbar,
    LocalSaveIndicatorComponent,
    ProductCardComponent,
    StatusBadgeComponent,
    TableCardComponent,
    ScheduledOrdersComponent,
    TableAdministrationComponent,
  ],
  templateUrl: './service-workspace.page.html',
  styleUrl: './service-workspace.page.scss',
})
export class ServiceWorkspacePage implements OnInit {
  private readonly catalogFacade = inject(SALE_CATALOG_FACADE);
  private readonly journeyFacade = inject(JOURNEY_FACADE);
  private readonly expenseFacade = inject(EXPENSE_FACADE);
  private readonly quickSaleFacade = inject(QUICK_SALE_FACADE);
  private readonly tableServiceFacade = inject(TABLE_SERVICE_FACADE);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly authorization = inject(AuthorizationPolicy);
  private tableAccountRequestKey = this.tableServiceFacade.newRequestKey();
  private tableMutationRequestKey = this.tableServiceFacade.newRequestKey();
  private tablePaymentRequestKey = this.tableServiceFacade.newRequestKey();
  private tableFinalizationRequestKey = this.tableServiceFacade.newRequestKey();
  private openingRequestKey = this.journeyFacade.newOpeningRequestKey();
  private expenseRequestKey = this.expenseFacade.newRegistrationRequestKey();
  private closingRequestKey = this.expenseFacade.newClosingRequestKey();
  private reopeningRequestKey = this.journeyFacade.newOpeningRequestKey();
  private quickSaleRequestKey = this.quickSaleFacade.newRequestKey();
  private quickSalePaymentKey = this.quickSaleFacade.newRequestKey();
  private quickSaleCancellationKey = this.quickSaleFacade.newRequestKey();
  private quickSaleDraftSequence = 0;
  readonly activeSection = signal<'MESAS' | 'PROGRAMADOS' | 'CAJA' | 'ADMIN_MESAS'>('MESAS');
  readonly canViewReports = this.session.current()
    ? this.authorization.can(this.session.current()!.role, 'VER_REPORTES')
    : false;
  readonly canManageTables = this.session.current()
    ? this.authorization.can(this.session.current()!.role, 'ADMINISTRAR_MESAS')
    : false;
  readonly journeyStatus = signal<JourneyViewStatus>('LOADING');
  readonly journeyBusinessDate = signal('');
  readonly journeyOpenedBy = signal('');
  readonly initialAmountSoles = signal('');
  readonly openingObservation = signal('');
  readonly openingBusy = signal(false);
  readonly openingError = signal('');
  readonly formatBusinessDate = formatBusinessDate;
  readonly expenseOptionsStatus = signal<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  readonly expenseCategories = signal<readonly ExpenseCategoryOption[]>([]);
  readonly expensePaymentMethods = signal<readonly ExpensePaymentMethodOption[]>([]);
  readonly expenseCategoryId = signal('');
  readonly expensePaymentMethodId = signal('');
  readonly expenseDescription = signal('');
  readonly expenseAmountSoles = signal('');
  readonly expenseSupplier = signal('');
  readonly expenseNote = signal('');
  readonly expenseBusy = signal(false);
  readonly expenseError = signal('');
  readonly expenseFeedback = signal('');
  readonly cashSummaryStatus = signal<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  readonly cashSummary = signal<OpenCashSummary | null>(null);
  readonly closeReadinessStatus = signal<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  readonly closeReadiness = signal<JourneyCloseReadiness | null>(null);
  readonly actualCashSoles = signal('');
  readonly closeJustification = signal('');
  readonly closeInputError = signal('');
  readonly closingBusy = signal(false);
  readonly closingFeedback = signal('');
  readonly canExceptionalClose = this.expenseFacade.canPerformExceptionalClose();
  readonly canCorrectClose = this.expenseFacade.canCorrectClose();
  readonly pendingCorrection = signal<PendingJourneyCorrection | null>(null);
  readonly canReopenJourney = this.journeyFacade.canReopenJourney();
  readonly reopenCandidate = signal<ReopenCandidate | null>(null);
  readonly reopenReason = signal('');
  readonly reopeningBusy = signal(false);
  readonly reopeningError = signal('');
  readonly formatSoles = formatSoles;
  readonly selectedExpenseCategory = computed(
    () =>
      this.expenseCategories().find((category) => category.id === this.expenseCategoryId()) ?? null,
  );
  readonly expenseNoteRequired = computed(
    () => this.selectedExpenseCategory()?.code === 'PERDIDA_CONSUMO_NO_COBRADO',
  );
  readonly tablePanelCollapsed = signal(false);
  readonly mobileView = signal<'MESAS' | 'PRODUCTOS' | 'CUENTA'>('PRODUCTOS');
  readonly selectedTableId = signal('');
  readonly selectedAccountLabel = signal('');
  readonly selectedTableAccountId = signal('');
  readonly tablesStatus = signal<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  readonly tableAccountBusy = signal(false);
  readonly tableAccountError = signal('');
  readonly tableAccount = signal<TableAccountSnapshot | null>(null);
  readonly tableMutationBusy = signal(false);
  readonly tablePaymentSelection = signal<Readonly<Record<string, number>>>({});
  readonly tablePaymentMethod = signal<'EFECTIVO' | 'YAPE' | 'COMBINADO'>('EFECTIVO');
  readonly tableCashReceivedSoles = signal('');
  readonly tableYapeSoles = signal('');
  readonly tablePaymentBusy = signal(false);
  readonly tablePaymentFeedback = signal('');
  readonly availableTablesToLink = computed(() =>
    this.tables().filter(
      (table) => table.id !== this.selectedTableId() && table.openAccounts === 0,
    ),
  );
  readonly catalogStatus = signal<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  readonly categories = signal<readonly { code: string; name: string }[]>([]);
  readonly selectedCategoryCode = signal('');
  readonly searchTerm = signal('');
  readonly products = signal<readonly ProductPreview[]>([]);
  readonly catalogAddons = signal<readonly SaleCatalogAddon[]>([]);
  readonly serviceDestination = signal<'TABLE' | 'QUICK_SALE'>('TABLE');
  readonly quickSaleLines = signal<readonly QuickSaleDraftLine[]>([]);
  readonly quickSaleAddonTarget = signal<string | null>(null);
  readonly quickSalePriceTarget = signal<string | null>(null);
  readonly quickSalePriceType = signal<'DESCUENTO' | 'PRECIO_PERSONALIZADO'>('DESCUENTO');
  readonly quickSaleAppliedPriceSoles = signal('');
  readonly quickSalePriceReason = signal('');
  readonly quickSaleBusy = signal(false);
  readonly quickSaleError = signal('');
  readonly quickSaleFeedback = signal('');
  readonly persistedQuickSaleCode = signal<string | null>(null);
  readonly persistedQuickSaleId = signal<string | null>(null);
  readonly quickSalePaymentMethod = signal<'EFECTIVO' | 'YAPE' | 'COMBINADO'>('EFECTIVO');
  readonly quickSaleReceivedSoles = signal('');
  readonly quickSaleYapeSoles = signal('');
  readonly quickSaleFinalized = signal(false);
  readonly quickSaleCancellationReason = signal('');
  readonly pendingQuickSales = signal<readonly PendingQuickSale[]>([]);
  readonly pendingQuickSalesStatus = signal<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  readonly quickSaleHistory = signal<readonly QuickSaleHistoryItem[]>([]);
  readonly quickSaleHistoryStatus = signal<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  readonly quickSaleReadOnlyState = signal<'FINALIZADA' | 'ANULADA' | null>(null);
  readonly quickSaleTotalCents = computed(() =>
    this.quickSaleLines().reduce(
      (total, line) =>
        total +
        line.quantity * line.priceCents +
        line.addons.reduce(
          (addonTotal, addon) => addonTotal + addon.quantity * addon.priceCents,
          0,
        ),
      0,
    ),
  );
  readonly availabilityBusyProductIds = signal<ReadonlySet<string>>(new Set());
  readonly availabilityFeedback = signal('');
  readonly availabilityFeedbackError = signal(false);
  readonly visibleProducts = computed(() => {
    const categoryCode = this.selectedCategoryCode();
    const search = normalizeSearch(this.searchTerm());
    return this.products().filter(
      (product) =>
        product.categoryCode === categoryCode &&
        (search.length === 0 ||
          normalizeSearch(`${product.name} ${product.description}`).includes(search)),
    );
  });
  readonly tables = signal<readonly TablePreview[]>([]);
  readonly selectedTable = computed(
    () => this.tables().find((table) => table.id === this.selectedTableId()) ?? null,
  );
  readonly canCreateAccount = computed(() => (this.selectedTable()?.openAccounts ?? 0) < 2);
  readonly tablePayableItems = computed(() => {
    const account = this.tableAccount();
    if (!account) return [];
    return account.lines
      .flatMap((line) => [line, ...line.addons])
      .map((line) => ({
        detailId: line.detailId,
        name: line.name,
        unitPriceCents: line.unitPriceCents,
        pendingQuantity: line.quantity - line.paidQuantity,
      }))
      .filter((line) => line.pendingQuantity > 0);
  });
  readonly tablePaymentTotalCents = computed(() =>
    this.tablePayableItems().reduce(
      (sum, item) => sum + (this.tablePaymentSelection()[item.detailId] ?? 0) * item.unitPriceCents,
      0,
    ),
  );

  ngOnInit(): void {
    void this.loadCatalog();
    void this.loadJourneyStatus();
    void this.loadTables();
  }

  async loadTables(preferredOperationId = ''): Promise<void> {
    this.tablesStatus.set('LOADING');
    this.tableAccountError.set('');
    try {
      const tables = (await this.tableServiceFacade.list()).map((table) => ({
        id: table.id,
        label: table.name,
        joinedLabel: table.joinedName ?? undefined,
        state: table.state,
        openAccounts: table.accounts.length as 0 | 1 | 2,
        balance: table.accounts.length ? formatSoles(table.balanceCents) : undefined,
        accounts: table.accounts.map(({ operationId, operationCode, label }) => ({
          operationId,
          operationCode,
          label,
        })),
      }));
      this.tables.set(tables);
      const selected =
        tables.find((table) => table.id === this.selectedTableId()) ?? tables[0] ?? null;
      this.selectedTableId.set(selected?.id ?? '');
      const account =
        selected?.accounts.find((item) => item.operationId === preferredOperationId) ??
        selected?.accounts[0] ??
        null;
      this.selectedTableAccountId.set(account?.operationId ?? '');
      this.selectedAccountLabel.set(account?.label ?? '');
      if (account) await this.loadTableAccount(account.operationId);
      else this.tableAccount.set(null);
      this.tablesStatus.set('READY');
    } catch {
      this.tablesStatus.set('ERROR');
    }
  }

  async loadTableAccount(operationId = this.selectedTableAccountId()): Promise<void> {
    if (!operationId) {
      this.tableAccount.set(null);
      return;
    }
    try {
      this.tableAccount.set(await this.tableServiceFacade.loadAccount(operationId));
    } catch {
      this.tableAccount.set(null);
      this.tableAccountError.set('No se pudo cargar la cuenta.');
    }
  }

  changeTablePaymentSelection(detailId: string, change: number): void {
    const item = this.tablePayableItems().find((entry) => entry.detailId === detailId);
    if (!item) return;
    this.tablePaymentSelection.update((current) => {
      const next = Math.max(0, Math.min(item.pendingQuantity, (current[detailId] ?? 0) + change));
      const result = { ...current };
      if (next) result[detailId] = next;
      else delete result[detailId];
      return result;
    });
    this.tablePaymentFeedback.set('');
  }
  setTablePaymentMethod(method: 'EFECTIVO' | 'YAPE' | 'COMBINADO'): void {
    this.tablePaymentMethod.set(method);
    this.tableCashReceivedSoles.set('');
    this.tableYapeSoles.set('');
    this.tablePaymentFeedback.set('');
  }
  async confirmTablePayment(): Promise<void> {
    const operationId = this.selectedTableAccountId();
    const total = this.tablePaymentTotalCents();
    if (!operationId || total <= 0 || this.tablePaymentBusy()) return;
    const method = this.tablePaymentMethod();
    const cash = parseSolesToCents(this.tableCashReceivedSoles());
    const yape = parseSolesToCents(this.tableYapeSoles());
    const payments =
      method === 'YAPE'
        ? [{ methodCode: 'YAPE' as const, appliedCents: total, receivedCents: total }]
        : method === 'EFECTIVO'
          ? [{ methodCode: 'EFECTIVO' as const, appliedCents: total, receivedCents: cash ?? -1 }]
          : [
              {
                methodCode: 'EFECTIVO' as const,
                appliedCents: total - (yape ?? 0),
                receivedCents: cash ?? -1,
              },
              {
                methodCode: 'YAPE' as const,
                appliedCents: yape ?? -1,
                receivedCents: yape ?? -1,
              },
            ];
    if (payments.some((item) => item.appliedCents <= 0 || item.receivedCents < item.appliedCents)) {
      this.tablePaymentFeedback.set('Revisa los importes de efectivo y Yape.');
      return;
    }
    this.tablePaymentBusy.set(true);
    this.tablePaymentFeedback.set('');
    try {
      const result = await this.tableServiceFacade.payAccount(
        operationId,
        Object.entries(this.tablePaymentSelection()).map(([detailId, quantity]) => ({
          detailId,
          quantity,
        })),
        payments,
        this.tablePaymentRequestKey,
      );
      this.tablePaymentRequestKey = this.tableServiceFacade.newRequestKey();
      this.tablePaymentSelection.set({});
      this.tableCashReceivedSoles.set('');
      this.tableYapeSoles.set('');
      await this.loadTableAccount(operationId);
      await this.loadTables(operationId);
      this.tablePaymentFeedback.set(
        `Cobro registrado.${result.changeCents ? ` Vuelto: ${formatSoles(result.changeCents)}.` : ''}`,
      );
    } catch {
      this.tablePaymentFeedback.set(
        'No se pudo registrar el cobro. Actualiza la cuenta e inténtalo nuevamente.',
      );
    } finally {
      this.tablePaymentBusy.set(false);
    }
  }
  async finalizeTableAttention(): Promise<void> {
    const operationId = this.selectedTableAccountId();
    if (!operationId || this.tableAccount()?.balanceCents !== 0 || this.tablePaymentBusy()) return;
    this.tablePaymentBusy.set(true);
    this.tablePaymentFeedback.set('');
    try {
      await this.tableServiceFacade.finalizeAttention(
        operationId,
        this.tableFinalizationRequestKey,
      );
      this.tableFinalizationRequestKey = this.tableServiceFacade.newRequestKey();
      this.tablePaymentSelection.set({});
      this.tableAccount.set(null);
      await this.loadTables();
      this.tablePaymentFeedback.set('Atención finalizada y mesas liberadas.');
    } catch {
      this.tablePaymentFeedback.set(
        'No se pudo finalizar. Todos los productos deben estar pagados.',
      );
    } finally {
      this.tablePaymentBusy.set(false);
    }
  }

  async addProductToTableAccount(productId: string): Promise<void> {
    const operationId = this.selectedTableAccountId();
    const product = this.products().find(
      (item) => item.id === productId && item.availability === 'DISPONIBLE',
    );
    if (!operationId || !product || this.tableMutationBusy()) return;
    await this.runTableMutation(() =>
      this.tableServiceFacade.addToAccount(
        operationId,
        [{ productId, quantity: 1 }],
        this.tableMutationRequestKey,
      ),
    );
  }
  addProductToDestination(productId: string): void {
    if (this.serviceDestination() === 'QUICK_SALE') this.addProductToQuickSale(productId);
    else void this.addProductToTableAccount(productId);
  }
  async addAddonToTableLine(detailId: string, addon: SaleCatalogAddon): Promise<void> {
    const operationId = this.selectedTableAccountId();
    if (!operationId || addon.availability !== 'DISPONIBLE') return;
    await this.runTableMutation(() =>
      this.tableServiceFacade.addAddonToAccount(
        operationId,
        detailId,
        addon.id,
        this.tableMutationRequestKey,
      ),
    );
  }
  async changeTableLineQuantity(detailId: string, target: number): Promise<void> {
    const operationId = this.selectedTableAccountId();
    if (!operationId) return;
    await this.runTableMutation(() =>
      this.tableServiceFacade.changeAccountQuantity(
        operationId,
        detailId,
        target,
        this.tableMutationRequestKey,
      ),
    );
  }
  async markTableLineServed(detailId: string): Promise<void> {
    const operationId = this.selectedTableAccountId();
    if (!operationId) return;
    await this.runTableMutation(() =>
      this.tableServiceFacade.markAccountLineServed(
        operationId,
        detailId,
        this.tableMutationRequestKey,
      ),
    );
  }
  async linkSelectedAccountToTable(tableId: string): Promise<void> {
    const operationId = this.selectedTableAccountId();
    if (!operationId) return;
    await this.runTableMutation(
      () => this.tableServiceFacade.linkTable(operationId, tableId, this.tableMutationRequestKey),
      true,
    );
  }
  async unlinkSelectedAccountTable(tableId: string): Promise<void> {
    const operationId = this.selectedTableAccountId();
    if (!operationId) return;
    await this.runTableMutation(
      () => this.tableServiceFacade.unlinkTable(operationId, tableId, this.tableMutationRequestKey),
      true,
    );
  }
  selectTableAccount(operationId: string, label: 'Cuenta A' | 'Cuenta B'): void {
    this.selectedTableAccountId.set(operationId);
    this.selectedAccountLabel.set(label);
    this.tablePaymentSelection.set({});
    this.tablePaymentFeedback.set('');
    void this.loadTableAccount(operationId);
  }
  private async runTableMutation(
    action: () => Promise<TableAccountSnapshot>,
    refreshTables = false,
  ): Promise<void> {
    if (this.tableMutationBusy()) return;
    this.tableMutationBusy.set(true);
    this.tableAccountError.set('');
    try {
      const snapshot = await action();
      this.tableAccount.set(snapshot);
      this.tableMutationRequestKey = this.tableServiceFacade.newRequestKey();
      if (refreshTables) await this.loadTables(snapshot.operationId);
    } catch {
      this.tableAccountError.set(
        'No se pudo completar la acción. Revisa que la cuenta siga abierta y el producto no esté servido o pagado.',
      );
    } finally {
      this.tableMutationBusy.set(false);
    }
  }

  async loadJourneyStatus(): Promise<void> {
    this.journeyStatus.set('LOADING');
    this.openingError.set('');
    try {
      const status = await this.journeyFacade.getStatus();
      this.journeyStatus.set(status.kind);
      this.journeyBusinessDate.set(
        status.kind === 'NONE' ? status.currentBusinessDate : status.journey.businessDate,
      );
      this.journeyOpenedBy.set(status.kind === 'NONE' ? '' : status.journey.openedByDisplayName);
      if (status.kind === 'NONE')
        this.reopenCandidate.set(await this.journeyFacade.getReopenCandidate());
      else this.reopenCandidate.set(null);
      this.pendingCorrection.set(
        status.kind === 'OPEN_TODAY' || status.kind === 'OPEN_PREVIOUS_DAY'
          ? await this.expenseFacade.loadPendingCorrection()
          : null,
      );
      if (
        status.kind === 'OPEN_PREVIOUS_DAY' &&
        (this.canExceptionalClose || (this.pendingCorrection() !== null && this.canCorrectClose))
      ) {
        await this.loadCashSummary();
        await this.loadCloseReadiness();
      }
    } catch {
      this.journeyStatus.set('ERROR');
    }
  }

  setReopenReason(value: string): void {
    this.reopenReason.set(value);
    this.reopeningError.set('');
  }
  async reopenJourney(): Promise<void> {
    const candidate = this.reopenCandidate();
    const reason = this.reopenReason().trim();
    if (!candidate || !this.canReopenJourney || !reason) {
      this.reopeningError.set('Escribe el motivo administrativo de la reapertura.');
      return;
    }
    this.reopeningBusy.set(true);
    try {
      await this.journeyFacade.reopen(candidate, reason, this.reopeningRequestKey);
      this.reopeningRequestKey = this.journeyFacade.newOpeningRequestKey();
      await this.loadJourneyStatus();
    } catch {
      this.reopeningError.set('No se pudo reabrir la jornada. Actualiza e inténtalo nuevamente.');
    } finally {
      this.reopeningBusy.set(false);
    }
  }

  async selectSection(section: 'MESAS' | 'PROGRAMADOS' | 'CAJA' | 'ADMIN_MESAS'): Promise<void> {
    this.activeSection.set(section);
    if (section === 'MESAS') {
      this.serviceDestination.set('TABLE');
      await this.loadTables();
    }
    if (section === 'CAJA') {
      await Promise.all([
        this.expenseOptionsStatus() === 'READY' ? Promise.resolve() : this.loadExpenseOptions(),
        this.loadCashSummary(),
      ]);
      await this.loadCloseReadiness();
    }
  }

  openReports(): Promise<boolean> {
    return this.router.navigateByUrl('/reportes');
  }

  async logout(): Promise<void> {
    this.session.clear();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  changeTableSelection(): void {
    this.tablePanelCollapsed.set(false);
    this.mobileView.set('MESAS');
  }

  changeAccountSelection(): void {
    const accounts = this.selectedTable()?.accounts ?? [];
    if (accounts.length > 1) {
      const currentIndex = accounts.findIndex(
        (account) => account.operationId === this.selectedTableAccountId(),
      );
      const next = accounts[(currentIndex + 1 + accounts.length) % accounts.length];
      this.selectTableAccount(next.operationId, next.label);
    }
    this.mobileView.set('CUENTA');
  }

  async loadCashSummary(): Promise<void> {
    this.cashSummaryStatus.set('LOADING');
    try {
      this.cashSummary.set(await this.expenseFacade.loadCashSummary());
      this.cashSummaryStatus.set('READY');
    } catch {
      this.cashSummaryStatus.set('ERROR');
    }
  }

  setActualCash(value: string): void {
    this.actualCashSoles.set(value);
    this.closeInputError.set('');
  }

  setCloseJustification(value: string): void {
    this.closeJustification.set(value);
  }

  async loadCloseReadiness(): Promise<void> {
    const rawActualCash = this.actualCashSoles().trim();
    const actualCashCents = rawActualCash.length === 0 ? null : parseSolesToCents(rawActualCash);
    if (rawActualCash.length > 0 && (actualCashCents === null || actualCashCents < 0)) {
      this.closeInputError.set('Ingresa un monto de efectivo válido, igual o mayor que cero.');
      return;
    }
    this.closeReadinessStatus.set('LOADING');
    this.closeInputError.set('');
    try {
      this.closeReadiness.set(
        await this.expenseFacade.loadCloseReadiness(
          actualCashCents,
          this.closeJustification().trim(),
        ),
      );
      this.closeReadinessStatus.set('READY');
    } catch {
      this.closeReadinessStatus.set('ERROR');
    }
  }

  closeBlockerMessage(blocker: JourneyCloseBlocker): string {
    switch (blocker.kind) {
      case 'OPEN_TABLE':
        return `${blocker.tableName} sigue abierta (${blocker.operationCode}).`;
      case 'PENDING_ACCOUNT':
        return `${blocker.operationCode} tiene ${formatSoles(blocker.balanceCents)} pendiente de pago.`;
      case 'CASH_COUNT_REQUIRED':
        return 'Ingresa el efectivo real contado.';
      case 'UNJUSTIFIED_CASH_DIFFERENCE':
        return `Justifica el ${blocker.differenceType.toLowerCase()} de ${formatSoles(blocker.differenceCents)}.`;
    }
  }

  async confirmJourneyClose(): Promise<void> {
    if (this.closingBusy() || !this.closeReadiness()?.canClose) return;
    const actualCashCents = parseSolesToCents(this.actualCashSoles().trim());
    if (actualCashCents === null || actualCashCents < 0) return;
    this.closingBusy.set(true);
    this.closeInputError.set('');
    try {
      const closed = await this.expenseFacade.closeJourney(
        actualCashCents,
        this.closeJustification().trim() || null,
        this.closingRequestKey,
      );
      this.closingFeedback.set(`Jornada ${closed.businessDate} cerrada correctamente.`);
      this.closingRequestKey = this.expenseFacade.newClosingRequestKey();
      await this.loadJourneyStatus();
    } catch (error: unknown) {
      const code = errorCode(error);
      this.closeInputError.set(
        code === 'JOURNEY_CLOSE_BLOCKED'
          ? 'Las condiciones cambiaron. Evalúa nuevamente antes de cerrar.'
          : code === 'JOURNEY_CLOSE_JUSTIFICATION_REQUIRED'
            ? 'La diferencia requiere una justificación.'
            : 'No se pudo cerrar la jornada. Inténtalo nuevamente.',
      );
      await this.loadCloseReadiness();
    } finally {
      this.closingBusy.set(false);
    }
  }

  async confirmExceptionalJourneyClose(): Promise<void> {
    if (this.closingBusy() || !this.canExceptionalClose || !this.closeReadiness()?.canClose) return;
    const actualCashCents = parseSolesToCents(this.actualCashSoles().trim());
    const justification = this.closeJustification().trim();
    if (actualCashCents === null || actualCashCents < 0 || justification.length === 0) {
      this.closeInputError.set('Ingresa el efectivo contado y una justificación administrativa.');
      return;
    }
    this.closingBusy.set(true);
    try {
      const closed = await this.expenseFacade.closeExceptionalJourney(
        actualCashCents,
        justification,
        this.closingRequestKey,
      );
      this.closingFeedback.set(`Jornada anterior ${closed.businessDate} cerrada excepcionalmente.`);
      this.closingRequestKey = this.expenseFacade.newClosingRequestKey();
      await this.loadJourneyStatus();
    } catch {
      this.closeInputError.set('No se pudo realizar el cierre excepcional. Evalúa nuevamente.');
      await this.loadCloseReadiness();
    } finally {
      this.closingBusy.set(false);
    }
  }

  async confirmCorrectedJourneyClose(): Promise<void> {
    if (this.closingBusy() || !this.canCorrectClose || !this.closeReadiness()?.canClose) return;
    const actualCashCents = parseSolesToCents(this.actualCashSoles().trim());
    const justification = this.closeJustification().trim();
    if (actualCashCents === null || actualCashCents < 0 || justification.length === 0) {
      this.closeInputError.set('Ingresa el efectivo contado y la razón del cierre corregido.');
      return;
    }
    this.closingBusy.set(true);
    try {
      const closed = await this.expenseFacade.closeCorrectedJourney(
        actualCashCents,
        justification,
        this.closingRequestKey,
      );
      this.closingFeedback.set(`Jornada ${closed.businessDate} cerrada con corrección histórica.`);
      this.closingRequestKey = this.expenseFacade.newClosingRequestKey();
      await this.loadJourneyStatus();
    } catch {
      this.closeInputError.set('No se pudo confirmar el cierre corregido. Evalúa nuevamente.');
      await this.loadCloseReadiness();
    } finally {
      this.closingBusy.set(false);
    }
  }

  async loadExpenseOptions(): Promise<void> {
    this.expenseOptionsStatus.set('LOADING');
    this.expenseError.set('');
    try {
      const options = await this.expenseFacade.loadOptions();
      this.expenseCategories.set(options.categories);
      this.expensePaymentMethods.set(options.paymentMethods);
      if (!options.categories.some(({ id }) => id === this.expenseCategoryId())) {
        this.expenseCategoryId.set(options.categories[0]?.id ?? '');
      }
      if (!options.paymentMethods.some(({ id }) => id === this.expensePaymentMethodId())) {
        this.expensePaymentMethodId.set(options.paymentMethods[0]?.id ?? '');
      }
      this.expenseOptionsStatus.set('READY');
    } catch {
      this.expenseOptionsStatus.set('ERROR');
    }
  }

  setExpenseCategory(value: string): void {
    this.expenseCategoryId.set(value);
    this.expenseError.set('');
  }

  setExpensePaymentMethod(value: string): void {
    this.expensePaymentMethodId.set(value);
    this.expenseError.set('');
  }

  setExpenseDescription(value: string): void {
    this.expenseDescription.set(value);
    this.expenseError.set('');
  }

  setExpenseAmount(value: string): void {
    this.expenseAmountSoles.set(value);
    this.expenseError.set('');
  }

  setExpenseSupplier(value: string): void {
    this.expenseSupplier.set(value);
  }

  setExpenseNote(value: string): void {
    this.expenseNote.set(value);
    this.expenseError.set('');
  }

  async registerExpense(): Promise<void> {
    if (this.expenseBusy() || this.expenseOptionsStatus() !== 'READY') return;
    const description = this.expenseDescription().trim();
    const amountCents = parseSolesToCents(this.expenseAmountSoles());
    if (
      this.expenseCategoryId().length === 0 ||
      this.expensePaymentMethodId().length === 0 ||
      description.length === 0 ||
      amountCents === null ||
      amountCents <= 0
    ) {
      this.expenseError.set('Completa categoría, descripción, monto y método de pago.');
      return;
    }
    if (this.expenseNoteRequired() && this.expenseNote().trim().length === 0) {
      this.expenseError.set('Escribe una nota que explique la pérdida o el consumo no cobrado.');
      return;
    }

    this.expenseBusy.set(true);
    this.expenseError.set('');
    this.expenseFeedback.set('');
    try {
      const expense = await this.expenseFacade.register(
        {
          categoryId: this.expenseCategoryId(),
          paymentMethodId: this.expensePaymentMethodId(),
          description,
          amountCents,
          supplier: this.expenseSupplier().trim() || null,
          note: this.expenseNote().trim() || null,
        },
        this.expenseRequestKey,
      );
      this.expenseFeedback.set(
        `Gasto registrado: ${expense.categoryName} · ${formatSoles(expense.amountCents)}`,
      );
      this.expenseDescription.set('');
      this.expenseAmountSoles.set('');
      this.expenseSupplier.set('');
      this.expenseNote.set('');
      this.expenseRequestKey = this.expenseFacade.newRegistrationRequestKey();
      await this.loadCashSummary();
      await this.loadCloseReadiness();
    } catch (error: unknown) {
      const code = errorCode(error);
      this.expenseError.set(
        code === 'EXPENSE_NOTE_REQUIRED'
          ? 'Escribe una nota que explique la pérdida o el consumo no cobrado.'
          : code === 'EXPENSE_JOURNEY_REQUIRED'
            ? 'La jornada ya no está abierta. Actualiza el estado de Caja.'
            : 'No se pudo registrar el gasto. Inténtalo nuevamente.',
      );
    } finally {
      this.expenseBusy.set(false);
    }
  }

  setInitialAmount(value: string): void {
    this.initialAmountSoles.set(value);
    this.openingError.set('');
  }

  setOpeningObservation(value: string): void {
    this.openingObservation.set(value);
  }

  async openJourney(): Promise<void> {
    if (this.openingBusy() || this.journeyStatus() !== 'NONE') return;
    const initialAmountCents = parseSolesToCents(this.initialAmountSoles());
    if (initialAmountCents === null) {
      this.openingError.set('Ingresa un monto inicial válido. Usa como máximo dos decimales.');
      return;
    }

    this.openingBusy.set(true);
    this.openingError.set('');
    try {
      const journey = await this.journeyFacade.open(
        initialAmountCents,
        this.openingObservation().trim() || null,
        this.openingRequestKey,
      );
      this.journeyBusinessDate.set(journey.businessDate);
      this.journeyOpenedBy.set(journey.openedByDisplayName);
      this.journeyStatus.set('OPEN_TODAY');
      this.openingRequestKey = this.journeyFacade.newOpeningRequestKey();
    } catch (error: unknown) {
      const code = errorCode(error);
      this.openingError.set(
        code === 'JOURNEY_ALREADY_OPEN'
          ? 'Ya existe una jornada abierta. Actualiza el estado para revisarla.'
          : 'No se pudo abrir la jornada. Inténtalo nuevamente.',
      );
    } finally {
      this.openingBusy.set(false);
    }
  }

  async loadCatalog(): Promise<void> {
    this.catalogStatus.set('LOADING');
    try {
      const catalog = await this.catalogFacade.load();
      this.categories.set(catalog.categories.map(({ code, name }) => ({ code, name })));
      this.products.set(
        catalog.products.map((product) => ({
          id: product.id,
          categoryCode: product.categoryCode,
          name: product.name,
          description: product.description ?? product.presentation ?? product.name,
          price: formatSoles(product.priceCents),
          priceCents: product.priceCents,
          allowsAddons: product.allowsAddons,
          allowsPriceChange: product.allowsPriceChange,
          availability: product.availability,
        })),
      );
      this.catalogAddons.set(catalog.addons ?? []);
      const availableCategoryCodes = new Set(catalog.categories.map((category) => category.code));
      if (!availableCategoryCodes.has(this.selectedCategoryCode())) {
        this.selectedCategoryCode.set(catalog.categories[0]?.code ?? '');
      }
      this.catalogStatus.set('READY');
    } catch {
      this.catalogStatus.set('ERROR');
    }
  }

  selectCategory(code: string): void {
    this.selectedCategoryCode.set(code);
  }

  setSearchTerm(value: string | null | undefined): void {
    this.searchTerm.set(value ?? '');
  }

  async startQuickSale(): Promise<void> {
    this.serviceDestination.set('QUICK_SALE');
    this.activeSection.set('MESAS');
    this.mobileView.set('PRODUCTOS');
    this.quickSaleError.set('');
    await Promise.all([this.loadPendingQuickSales(), this.loadQuickSaleHistory()]);
  }

  async loadPendingQuickSales(): Promise<void> {
    this.pendingQuickSalesStatus.set('LOADING');
    try {
      this.pendingQuickSales.set(await this.quickSaleFacade.listPending());
      this.pendingQuickSalesStatus.set('READY');
    } catch {
      this.pendingQuickSalesStatus.set('ERROR');
    }
  }

  async loadQuickSaleHistory(): Promise<void> {
    this.quickSaleHistoryStatus.set('LOADING');
    try {
      this.quickSaleHistory.set(await this.quickSaleFacade.listHistory());
      this.quickSaleHistoryStatus.set('READY');
    } catch {
      this.quickSaleHistoryStatus.set('ERROR');
    }
  }

  resumePendingQuickSale(sale: PendingQuickSale): void {
    this.quickSaleLines.set(
      sale.lines.map((line) => ({
        draftId: line.detailId,
        productId: line.productId,
        name: line.name,
        priceCents: line.priceCents,
        catalogPriceCents: line.catalogPriceCents,
        allowsAddons: false,
        allowsPriceChange: false,
        quantity: line.quantity,
        priceAdjustment: line.priceAdjustment,
        addons: line.addons.map((addon) => ({
          id: addon.productId,
          code: addon.productId,
          name: addon.name,
          priceCents: addon.priceCents,
          availability: 'DISPONIBLE' as const,
          quantity: addon.quantity,
        })),
      })),
    );
    this.persistedQuickSaleId.set(sale.operationId);
    this.persistedQuickSaleCode.set(sale.operationCode);
    this.quickSaleFinalized.set(false);
    this.quickSaleReadOnlyState.set(null);
    this.quickSaleAddonTarget.set(null);
    this.quickSaleFeedback.set(`Venta ${sale.operationCode} recuperada y lista para cobrar.`);
    this.quickSaleError.set('');
    this.mobileView.set('CUENTA');
  }

  viewQuickSaleHistory(sale: QuickSaleHistoryItem): void {
    this.resumePendingQuickSale({
      operationId: sale.operationId,
      operationCode: sale.operationCode,
      totalCents: sale.totalCents,
      createdAtUtc: sale.createdAtUtc,
      lines: sale.lines,
    });
    this.quickSaleFinalized.set(true);
    this.quickSaleReadOnlyState.set(sale.state);
    this.quickSaleFeedback.set(
      sale.state === 'ANULADA'
        ? `Venta anulada. Motivo: ${sale.cancellationReason ?? 'No registrado'}.`
        : `Venta finalizada. Pago: ${sale.paymentMethods.join(' + ')}.`,
    );
  }

  useTableDestination(): void {
    this.serviceDestination.set('TABLE');
    this.quickSaleAddonTarget.set(null);
    this.mobileView.set('MESAS');
  }

  addProductToQuickSale(productId: string): void {
    if (this.serviceDestination() !== 'QUICK_SALE' || this.persistedQuickSaleCode()) return;
    const product = this.products().find(
      (item) => item.id === productId && item.availability === 'DISPONIBLE',
    );
    if (!product) return;
    const existing = this.quickSaleLines().find((line) => line.productId === productId);
    if (existing) {
      this.changeQuickSaleQuantity(existing.draftId, 1);
      return;
    }
    this.quickSaleDraftSequence += 1;
    this.quickSaleLines.update((lines) => [
      ...lines,
      {
        draftId: `quick-line-${this.quickSaleDraftSequence}`,
        productId,
        name: product.name,
        priceCents: product.priceCents,
        catalogPriceCents: product.priceCents,
        allowsAddons: product.allowsAddons,
        allowsPriceChange: product.allowsPriceChange,
        quantity: 1,
        addons: [],
        priceAdjustment: null,
      },
    ]);
    this.mobileView.set('CUENTA');
  }

  changeQuickSaleQuantity(draftId: string, change: number): void {
    if (this.persistedQuickSaleCode()) return;
    this.quickSaleLines.update((lines) =>
      lines
        .map((line) =>
          line.draftId === draftId ? { ...line, quantity: line.quantity + change } : line,
        )
        .filter((line) => line.quantity > 0),
    );
    if (!this.quickSaleLines().some((line) => line.draftId === this.quickSaleAddonTarget())) {
      this.quickSaleAddonTarget.set(null);
    }
  }

  selectAddonTarget(draftId: string): void {
    const line = this.quickSaleLines().find((item) => item.draftId === draftId);
    this.quickSaleAddonTarget.set(line?.allowsAddons ? draftId : null);
  }

  selectQuickSalePriceTarget(draftId: string): void {
    const line = this.quickSaleLines().find((item) => item.draftId === draftId);
    if (!line?.allowsPriceChange || this.persistedQuickSaleCode()) return;
    this.quickSalePriceTarget.set(draftId);
    this.quickSaleAppliedPriceSoles.set((line.priceCents / 100).toFixed(2));
    this.quickSalePriceReason.set(line.priceAdjustment?.reason ?? '');
    this.quickSalePriceType.set(line.priceAdjustment?.type ?? 'DESCUENTO');
    this.quickSaleError.set('');
  }

  applyQuickSalePriceAdjustment(): void {
    const target = this.quickSalePriceTarget();
    const priceCents = parseSolesToCents(this.quickSaleAppliedPriceSoles());
    const reason = this.quickSalePriceReason().trim();
    const line = this.quickSaleLines().find((item) => item.draftId === target);
    const type = this.quickSalePriceType();
    if (
      !line ||
      priceCents === null ||
      priceCents < 0 ||
      reason.length === 0 ||
      (type === 'DESCUENTO' && priceCents >= line.catalogPriceCents) ||
      (type === 'PRECIO_PERSONALIZADO' && priceCents === line.catalogPriceCents)
    ) {
      this.quickSaleError.set('Ingresa un precio válido y el motivo del ajuste.');
      return;
    }
    this.quickSaleLines.update((lines) =>
      lines.map((item) =>
        item.draftId === target ? { ...item, priceCents, priceAdjustment: { type, reason } } : item,
      ),
    );
    this.quickSalePriceTarget.set(null);
    this.quickSaleError.set('');
  }

  removeQuickSalePriceAdjustment(draftId: string): void {
    if (this.persistedQuickSaleCode()) return;
    this.quickSaleLines.update((lines) =>
      lines.map((line) =>
        line.draftId === draftId
          ? { ...line, priceCents: line.catalogPriceCents, priceAdjustment: null }
          : line,
      ),
    );
  }

  addQuickSaleAddon(addon: SaleCatalogAddon): void {
    const target = this.quickSaleAddonTarget();
    if (!target || addon.availability !== 'DISPONIBLE' || this.persistedQuickSaleCode()) return;
    this.quickSaleLines.update((lines) =>
      lines.map((line) => {
        if (line.draftId !== target) return line;
        const existing = line.addons.find((item) => item.id === addon.id);
        return {
          ...line,
          addons: existing
            ? line.addons.map((item) =>
                item.id === addon.id ? { ...item, quantity: item.quantity + 1 } : item,
              )
            : [...line.addons, { ...addon, quantity: 1 }],
        };
      }),
    );
  }

  changeQuickSaleAddonQuantity(draftId: string, addonId: string, change: number): void {
    if (this.persistedQuickSaleCode()) return;
    this.quickSaleLines.update((lines) =>
      lines.map((line) =>
        line.draftId !== draftId
          ? line
          : {
              ...line,
              addons: line.addons
                .map((addon) =>
                  addon.id === addonId ? { ...addon, quantity: addon.quantity + change } : addon,
                )
                .filter((addon) => addon.quantity > 0),
            },
      ),
    );
  }

  async confirmQuickSaleDraft(): Promise<void> {
    if (this.quickSaleBusy() || this.quickSaleLines().length === 0 || this.persistedQuickSaleCode())
      return;
    this.quickSaleBusy.set(true);
    this.quickSaleError.set('');
    try {
      const created = await this.quickSaleFacade.create(
        this.quickSaleLines().map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          priceAdjustment:
            line.priceAdjustment === null
              ? null
              : {
                  ...line.priceAdjustment,
                  appliedPriceCents: line.priceCents,
                },
          addons: line.addons.map((addon) => ({ productId: addon.id, quantity: addon.quantity })),
        })),
        null,
        this.quickSaleRequestKey,
      );
      this.persistedQuickSaleCode.set(created.operationCode);
      this.persistedQuickSaleId.set(created.operationId);
      this.quickSaleFeedback.set(`Venta ${created.operationCode} guardada y lista para cobrar.`);
      this.quickSaleRequestKey = this.quickSaleFacade.newRequestKey();
    } catch {
      this.quickSaleError.set(
        'No se pudo guardar la venta rápida. Revisa los productos e inténtalo nuevamente.',
      );
    } finally {
      this.quickSaleBusy.set(false);
    }
  }

  newQuickSaleDraft(): void {
    this.quickSaleLines.set([]);
    this.quickSaleAddonTarget.set(null);
    this.quickSalePriceTarget.set(null);
    this.persistedQuickSaleCode.set(null);
    this.persistedQuickSaleId.set(null);
    this.quickSaleFinalized.set(false);
    this.quickSaleReadOnlyState.set(null);
    this.quickSaleReceivedSoles.set('');
    this.quickSaleYapeSoles.set('');
    this.quickSaleCancellationReason.set('');
    this.quickSaleFeedback.set('');
    this.quickSaleError.set('');
    this.mobileView.set('PRODUCTOS');
    void this.loadPendingQuickSales();
    void this.loadQuickSaleHistory();
  }

  setQuickSalePaymentMethod(method: 'EFECTIVO' | 'YAPE' | 'COMBINADO'): void {
    this.quickSalePaymentMethod.set(method);
    this.quickSaleReceivedSoles.set('');
    this.quickSaleYapeSoles.set('');
    this.quickSaleError.set('');
  }

  setQuickSaleReceived(value: string): void {
    this.quickSaleReceivedSoles.set(value);
    this.quickSaleError.set('');
  }

  async finalizeQuickSale(): Promise<void> {
    const operationId = this.persistedQuickSaleId();
    if (!operationId || this.quickSaleBusy() || this.quickSaleFinalized()) return;
    const method = this.quickSalePaymentMethod();
    const total = this.quickSaleTotalCents();
    const cashReceived = parseSolesToCents(this.quickSaleReceivedSoles().trim());
    const yapeApplied = parseSolesToCents(this.quickSaleYapeSoles().trim());
    const payments =
      method === 'YAPE'
        ? [{ methodCode: 'YAPE' as const, appliedCents: total, receivedCents: total }]
        : method === 'EFECTIVO'
          ? [
              {
                methodCode: 'EFECTIVO' as const,
                appliedCents: total,
                receivedCents: cashReceived ?? -1,
              },
            ]
          : [
              {
                methodCode: 'EFECTIVO' as const,
                appliedCents: total - (yapeApplied ?? 0),
                receivedCents: cashReceived ?? -1,
              },
              {
                methodCode: 'YAPE' as const,
                appliedCents: yapeApplied ?? -1,
                receivedCents: yapeApplied ?? -1,
              },
            ];
    if (
      payments.some(
        (payment) => payment.appliedCents <= 0 || payment.receivedCents < payment.appliedCents,
      )
    ) {
      this.quickSaleError.set(
        method === 'COMBINADO'
          ? 'Yape debe cubrir solo una parte y el efectivo recibido debe cubrir el resto.'
          : 'El efectivo recibido no puede ser menor que el total.',
      );
      return;
    }
    this.quickSaleBusy.set(true);
    this.quickSaleError.set('');
    try {
      const result = await this.quickSaleFacade.finalize(
        operationId,
        payments,
        this.quickSalePaymentKey,
      );
      this.quickSaleFinalized.set(true);
      this.quickSaleFeedback.set(
        `Venta cobrada y finalizada.${result.changeCents > 0 ? ` Vuelto: ${formatSoles(result.changeCents)}.` : ''}`,
      );
      this.quickSalePaymentKey = this.quickSaleFacade.newRequestKey();
      await this.loadPendingQuickSales();
      await this.loadQuickSaleHistory();
    } catch {
      this.quickSaleError.set('No se pudo confirmar el cobro. Inténtalo nuevamente.');
    } finally {
      this.quickSaleBusy.set(false);
    }
  }

  async cancelQuickSale(): Promise<void> {
    const operationId = this.persistedQuickSaleId();
    const reason = this.quickSaleCancellationReason().trim();
    if (!operationId || !reason || this.quickSaleBusy() || this.quickSaleFinalized()) {
      if (!reason) this.quickSaleError.set('Escribe el motivo de la anulación.');
      return;
    }
    this.quickSaleBusy.set(true);
    this.quickSaleError.set('');
    try {
      const cancelled = await this.quickSaleFacade.cancel(
        operationId,
        reason,
        this.quickSaleCancellationKey,
      );
      this.quickSaleCancellationKey = this.quickSaleFacade.newRequestKey();
      this.newQuickSaleDraft();
      this.quickSaleFeedback.set(
        `Venta ${cancelled.operationCode} anulada sin movimientos de caja.`,
      );
    } catch {
      this.quickSaleError.set('No se pudo anular. La venta puede haber sido cobrada o modificada.');
    } finally {
      this.quickSaleBusy.set(false);
    }
  }

  async changeProductAvailability(request: ProductAvailabilityChangeRequest): Promise<void> {
    if (this.availabilityBusyProductIds().has(request.productId)) return;
    this.availabilityFeedback.set('');
    this.availabilityFeedbackError.set(false);
    this.availabilityBusyProductIds.update((ids) => new Set([...ids, request.productId]));
    try {
      const result = await this.catalogFacade.changeAvailability(
        request.productId,
        request.availability,
      );
      this.products.update((products) =>
        products.map((product) =>
          product.id === result.productId
            ? { ...product, availability: result.currentAvailability }
            : product,
        ),
      );
      const productName = this.products().find((product) => product.id === result.productId)?.name;
      this.availabilityFeedback.set(
        `${productName ?? 'Producto'}: ${result.currentAvailability === 'AGOTADO' ? 'Agotado' : 'Disponible'}`,
      );
    } catch {
      this.availabilityFeedbackError.set(true);
      this.availabilityFeedback.set('No se pudo cambiar la disponibilidad. Inténtalo nuevamente.');
    } finally {
      this.availabilityBusyProductIds.update(
        (ids) => new Set([...ids].filter((id) => id !== request.productId)),
      );
    }
  }
  selectTable(id: string): void {
    this.selectedTableId.set(id);
    const account = this.tables().find((table) => table.id === id)?.accounts[0] ?? null;
    this.selectedTableAccountId.set(account?.operationId ?? '');
    this.selectedAccountLabel.set(account?.label ?? '');
    this.tableAccountError.set('');
    if (account) void this.loadTableAccount(account.operationId);
    else this.tableAccount.set(null);
    this.mobileView.set('CUENTA');
  }
  async openTableAccount(): Promise<void> {
    const table = this.selectedTable();
    if (!table || !this.canCreateAccount() || this.tableAccountBusy()) return;
    this.tableAccountBusy.set(true);
    this.tableAccountError.set('');
    try {
      const opened = await this.tableServiceFacade.openAccount(
        table.id,
        null,
        this.tableAccountRequestKey,
      );
      this.tableAccountRequestKey = this.tableServiceFacade.newRequestKey();
      await this.loadTables(opened.operationId);
    } catch (error: unknown) {
      const code = errorCode(error);
      this.tableAccountError.set(
        code === 'TABLE_ACCOUNT_LIMIT'
          ? 'La mesa ya tiene dos cuentas abiertas.'
          : code === 'OPEN_JOURNEY_FOR_TABLE_ACCOUNT_REQUIRED'
            ? 'Abre una jornada antes de crear la cuenta.'
            : 'No se pudo abrir la cuenta. Inténtalo nuevamente.',
      );
    } finally {
      this.tableAccountBusy.set(false);
    }
  }
  toggleTablePanel(): void {
    this.tablePanelCollapsed.update((value) => !value);
  }
  selectMobileView(view: 'MESAS' | 'PRODUCTOS' | 'CUENTA'): void {
    this.mobileView.set(view);
  }
}

function formatSoles(cents: number): string {
  return `S/${(cents / 100).toFixed(2)}`;
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-PE');
}

function parseSolesToCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [soles, cents = ''] = normalized.split('.');
  const amount = Number(soles) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export function formatBusinessDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}
