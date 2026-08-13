import { TestBed } from '@angular/core/testing';

import { SALE_CATALOG_FACADE } from './catalog.facade';
import { JOURNEY_FACADE } from './journey.facade';
import { EXPENSE_FACADE } from './expense.facade';
import { ServiceWorkspacePage } from './service-workspace.page';
import type { ReopenCandidate } from '../../domain/journey/reopen-journey.use-case';
import { QUICK_SALE_FACADE } from './quick-sale.facade';
import { TABLE_SERVICE_FACADE } from './table-service.facade';
import { SCHEDULED_ORDERS_FACADE } from './scheduled-orders.facade';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';

describe('ServiceWorkspacePage', () => {
  const catalogFacade = {
    load: vi.fn().mockResolvedValue({
      categories: [
        { code: 'KANKACHO', name: 'Kankacho', order: 1 },
        { code: 'BEBIDAS', name: 'Bebidas', order: 2 },
      ],
      products: [
        {
          id: 'product-k20',
          code: 'KANKACHO_20',
          categoryCode: 'KANKACHO',
          name: 'Kankacho S/20',
          description: 'Porción normal',
          presentation: 'Normal',
          priceCents: 2000,
          availability: 'DISPONIBLE',
          allowsAddons: true,
          allowsPriceChange: true,
          currentImagePath: null,
        },
        {
          id: 'product-inka',
          code: 'INKA_600',
          categoryCode: 'BEBIDAS',
          name: 'Inca Kola 600 ml',
          description: 'Botella de 600 ml',
          presentation: '600 ml',
          priceCents: 350,
          availability: 'AGOTADO',
          allowsAddons: false,
          allowsPriceChange: false,
          currentImagePath: null,
        },
      ],
      addons: [
        {
          id: 'addon-potato',
          code: 'PAPA_ADICIONAL_2',
          name: 'Papa adicional S/2',
          priceCents: 200,
          availability: 'DISPONIBLE',
        },
      ],
    }),
    changeAvailability: vi.fn().mockResolvedValue({
      productId: 'product-k20',
      previousAvailability: 'DISPONIBLE',
      currentAvailability: 'AGOTADO',
      changed: true,
    }),
  };
  const journeyFacade = {
    getStatus: vi.fn().mockResolvedValue({
      kind: 'OPEN_TODAY',
      currentBusinessDate: '2026-07-29',
      journey: {
        id: 'journey-1',
        businessDate: '2026-07-29',
        initialAmountCents: 10000,
        openedByUserId: 'user-cashier',
        openedByDisplayName: 'Caja',
        openedAtUtc: '2026-07-29T14:00:00.000Z',
      },
    }),
    open: vi.fn(),
    newOpeningRequestKey: vi.fn().mockReturnValue('opening-request-1'),
    canReopenJourney: vi.fn().mockReturnValue(true),
    getReopenCandidate: vi.fn().mockResolvedValue(null),
    reopen: vi.fn().mockResolvedValue({}),
  };
  const expenseFacade = {
    loadOptions: vi.fn().mockResolvedValue({
      categories: [
        { id: 'category-supplies', code: 'INSUMOS', name: 'Compra de insumos' },
        {
          id: 'category-loss',
          code: 'PERDIDA_CONSUMO_NO_COBRADO',
          name: 'Pérdida o consumo no cobrado',
        },
      ],
      paymentMethods: [
        { id: 'payment-cash', code: 'EFECTIVO', name: 'Efectivo' },
        { id: 'payment-yape', code: 'YAPE', name: 'Yape' },
      ],
    }),
    register: vi.fn().mockResolvedValue({
      id: 'expense-1',
      categoryName: 'Compra de insumos',
      paymentMethodName: 'Efectivo',
      amountCents: 5050,
    }),
    newRegistrationRequestKey: vi.fn().mockReturnValue('expense-request-1'),
    loadCashSummary: vi.fn().mockResolvedValue({
      journeyId: 'journey-1',
      businessDate: '2026-07-29',
      initialCashCents: 10000,
      expectedCashCents: 12500,
      methods: [
        {
          id: 'payment-cash',
          code: 'EFECTIVO',
          name: 'Efectivo',
          inflowCents: 5000,
          outflowCents: 2500,
          netCents: 2500,
        },
        {
          id: 'payment-yape',
          code: 'YAPE',
          name: 'Yape',
          inflowCents: 3000,
          outflowCents: 0,
          netCents: 3000,
        },
      ],
    }),
    loadCloseReadiness: vi.fn().mockResolvedValue({
      canClose: false,
      actualCashCents: null,
      differenceType: null,
      differenceCents: null,
      blockers: [
        {
          kind: 'OPEN_TABLE',
          operationId: 'account-1',
          operationCode: 'CTA-1',
          tableName: 'Mesa 4',
        },
        {
          kind: 'PENDING_ACCOUNT',
          operationId: 'account-1',
          operationCode: 'CTA-1',
          balanceCents: 4200,
        },
        { kind: 'CASH_COUNT_REQUIRED' },
      ],
    }),
    closeJourney: vi.fn().mockResolvedValue({
      closeId: 'close-1',
      journeyId: 'journey-1',
      businessDate: '2026-07-29',
      expectedCashCents: 10000,
      actualCashCents: 10000,
      differenceType: 'CUADRA',
      differenceCents: 0,
      justification: null,
      closedByUserId: 'user-cashier',
      closedAtUtc: '2026-07-29T22:00:00Z',
    }),
    newClosingRequestKey: vi.fn().mockReturnValue('closing-request-1'),
    canPerformExceptionalClose: vi.fn().mockReturnValue(true),
    canCorrectClose: vi.fn().mockReturnValue(true),
    loadPendingCorrection: vi.fn().mockResolvedValue(null),
    closeExceptionalJourney: vi.fn().mockResolvedValue({
      closeId: 'close-exceptional',
      journeyId: 'journey-old',
      businessDate: '2026-07-28',
      expectedCashCents: 10000,
      actualCashCents: 10000,
      differenceType: 'CUADRA',
      differenceCents: 0,
      justification: 'Corte eléctrico',
      closedByUserId: 'admin',
      closedAtUtc: '2026-07-29T14:00:00Z',
    }),
    closeCorrectedJourney: vi.fn().mockResolvedValue({
      closeId: 'close-corrected',
      journeyId: 'journey-1',
      businessDate: '2026-07-29',
      expectedCashCents: 10000,
      actualCashCents: 10000,
      differenceType: 'CUADRA',
      differenceCents: 0,
      justification: 'Conteo rectificado',
      closedByUserId: 'admin',
      closedAtUtc: '2026-07-29T22:20:00Z',
    }),
  };
  const quickSaleFacade = {
    create: vi.fn().mockResolvedValue({
      operationId: 'sale-1',
      operationCode: 'VR-20260729-0001',
      journeyId: 'journey-1',
      state: 'ABIERTA',
      totalCents: 2200,
      balanceCents: 2200,
      detailCount: 2,
      createdByUserId: 'cashier',
      createdAtUtc: '2026-07-29T20:00:00Z',
    }),
    finalize: vi.fn().mockResolvedValue({
      operationId: 'sale-1',
      operationCode: 'VR-20260729-0001',
      paymentId: 'payment-1',
      totalCents: 2200,
      receivedCents: 2500,
      changeCents: 300,
      payments: [{ methodCode: 'EFECTIVO', appliedCents: 2200, receivedCents: 2500 }],
      finalizedAtUtc: '2026-07-29T20:05:00Z',
    }),
    listPending: vi.fn().mockResolvedValue([
      {
        operationId: 'pending-sale-1',
        operationCode: 'VR-20260729-PENDING',
        totalCents: 2200,
        createdAtUtc: '2026-07-29T19:00:00Z',
        lines: [
          {
            detailId: 'pending-detail-1',
            productId: 'product-k20',
            name: 'Kankacho S/20',
            quantity: 1,
            priceCents: 2000,
            catalogPriceCents: 2000,
            priceAdjustment: null,
            addons: [
              {
                detailId: 'pending-addon-1',
                productId: 'addon-potato',
                name: 'Papa adicional S/2',
                quantity: 1,
                priceCents: 200,
              },
            ],
          },
        ],
      },
    ]),
    cancel: vi.fn().mockResolvedValue({
      operationId: 'sale-1',
      operationCode: 'VR-20260729-0001',
      reason: 'Cliente desistió',
      cancelledByUserId: 'cashier',
      cancelledAtUtc: '2026-07-30T12:00:00Z',
    }),
    listHistory: vi.fn().mockResolvedValue([
      {
        operationId: 'history-sale-1',
        operationCode: 'VR-HISTORY-1',
        state: 'FINALIZADA',
        totalCents: 2000,
        createdAtUtc: '2026-07-30T10:00:00Z',
        closedAtUtc: '2026-07-30T10:05:00Z',
        cancellationReason: null,
        paymentMethods: ['Efectivo', 'Yape'],
        lines: [
          {
            detailId: 'history-detail-1',
            productId: 'product-k20',
            name: 'Kankacho S/20',
            quantity: 1,
            priceCents: 2000,
            catalogPriceCents: 2000,
            priceAdjustment: null,
            addons: [],
          },
        ],
      },
    ]),
    newRequestKey: vi.fn().mockReturnValue('quick-sale-key-1'),
  };
  const tableServiceFacade = {
    list: vi.fn().mockResolvedValue([
      {
        id: 'table-1',
        code: 'M1',
        name: 'Mesa 1',
        joinedName: null,
        state: 'DISPONIBLE',
        balanceCents: 0,
        accounts: [],
      },
      {
        id: 'table-4',
        code: 'M4',
        name: 'Mesa 4',
        joinedName: null,
        state: 'PENDIENTE_SERVIR',
        balanceCents: 4200,
        accounts: [
          {
            operationId: 'account-4a',
            operationCode: 'CM-4A',
            label: 'Cuenta A',
            state: 'PENDIENTE_SERVIR',
            balanceCents: 4200,
            createdAtUtc: 'now',
          },
        ],
      },
      {
        id: 'table-5',
        code: 'M5',
        name: 'Mesa 5',
        joinedName: null,
        state: 'OCUPADA',
        balanceCents: 6500,
        accounts: [
          {
            operationId: 'account-5a',
            operationCode: 'CM-5A',
            label: 'Cuenta A',
            state: 'OCUPADA',
            balanceCents: 3000,
            createdAtUtc: 'a',
          },
          {
            operationId: 'account-5b',
            operationCode: 'CM-5B',
            label: 'Cuenta B',
            state: 'OCUPADA',
            balanceCents: 3500,
            createdAtUtc: 'b',
          },
        ],
      },
    ]),
    openAccount: vi.fn().mockResolvedValue({
      operationId: 'account-1a',
      operationCode: 'CM-1A',
      tableId: 'table-1',
      accountLabel: 'Cuenta A',
      journeyId: 'journey-1',
      createdAtUtc: 'now',
    }),
    loadAccount: vi.fn().mockResolvedValue({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      state: 'ABIERTA',
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0,
      principalTableId: 'table-4',
      principalTableName: 'Mesa 4',
      linkedTables: [],
      lines: [],
    }),
    addToAccount: vi.fn().mockResolvedValue({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      state: 'ABIERTA',
      totalCents: 2000,
      paidCents: 0,
      balanceCents: 2000,
      principalTableId: 'table-4',
      principalTableName: 'Mesa 4',
      linkedTables: [],
      lines: [],
    }),
    addAddonToAccount: vi.fn(),
    changeAccountQuantity: vi.fn(),
    markAccountLineServed: vi.fn(),
    linkTable: vi.fn(),
    unlinkTable: vi.fn(),
    payAccount: vi.fn().mockResolvedValue({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      paymentId: 'payment-1',
      amountCents: 2200,
      balanceCents: 0,
      state: 'PAGADA',
      changeCents: 300,
      confirmedAtUtc: 'now',
    }),
    finalizeAttention: vi.fn().mockResolvedValue({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      finalizedAtUtc: 'now',
      releasedTableIds: ['table-4'],
    }),
    newRequestKey: vi.fn().mockReturnValue('table-account-key-1'),
  };
  const scheduledOrdersFacade = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    advance: vi.fn(),
    transition: vi.fn(),
    newRequestKey: vi.fn().mockReturnValue('scheduled-key-1'),
  };

  beforeEach(() => {
    catalogFacade.load.mockClear();
    catalogFacade.changeAvailability.mockClear();
    journeyFacade.getStatus.mockClear();
    journeyFacade.open.mockClear();
    journeyFacade.newOpeningRequestKey.mockClear();
    journeyFacade.canReopenJourney.mockClear();
    journeyFacade.getReopenCandidate.mockClear();
    journeyFacade.reopen.mockClear();
    expenseFacade.loadOptions.mockClear();
    expenseFacade.register.mockClear();
    expenseFacade.newRegistrationRequestKey.mockClear();
    expenseFacade.loadCashSummary.mockClear();
    expenseFacade.loadCloseReadiness.mockClear();
    expenseFacade.closeJourney.mockClear();
    expenseFacade.newClosingRequestKey.mockClear();
    expenseFacade.canPerformExceptionalClose.mockClear();
    expenseFacade.canCorrectClose.mockClear();
    expenseFacade.loadPendingCorrection.mockClear();
    expenseFacade.closeExceptionalJourney.mockClear();
    expenseFacade.closeCorrectedJourney.mockClear();
    quickSaleFacade.create.mockClear();
    quickSaleFacade.finalize.mockClear();
    quickSaleFacade.listPending.mockClear();
    quickSaleFacade.cancel.mockClear();
    quickSaleFacade.listHistory.mockClear();
    quickSaleFacade.newRequestKey.mockClear();
    tableServiceFacade.list.mockClear();
    tableServiceFacade.openAccount.mockClear();
    tableServiceFacade.newRequestKey.mockClear();
    TestBed.configureTestingModule({
      imports: [ServiceWorkspacePage],
      providers: [
        AuthorizationPolicy,
        { provide: SALE_CATALOG_FACADE, useValue: catalogFacade },
        { provide: JOURNEY_FACADE, useValue: journeyFacade },
        { provide: EXPENSE_FACADE, useValue: expenseFacade },
        { provide: QUICK_SALE_FACADE, useValue: quickSaleFacade },
        { provide: TABLE_SERVICE_FACADE, useValue: tableServiceFacade },
        { provide: SCHEDULED_ORDERS_FACADE, useValue: scheduledOrdersFacade },
      ],
    });
  });

  it('opens Caja and loads active expense form options', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.selectSection('CAJA');
    fixture.detectChanges();

    expect(expenseFacade.loadOptions).toHaveBeenCalledOnce();
    const cashView = fixture.nativeElement.querySelector('.cash-workspace') as HTMLElement;
    expect(cashView.textContent).toContain('Registrar gasto');
    expect(cashView.textContent).toContain('Compra de insumos');
    expect(cashView.textContent).toContain('Efectivo');
    expect(cashView.textContent).toContain('Yape');
  });

  it('reloads active tables when returning from administration to the operational panel', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    tableServiceFacade.list.mockClear();

    await fixture.componentInstance.selectSection('MESAS');

    expect(tableServiceFacade.list).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.tables().map((table) => table.label)).toContain('Mesa 1');
  });

  it('builds and saves a quick-sale draft with an addon only on confirmation', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.startQuickSale();
    fixture.componentInstance.addProductToQuickSale('product-k20');
    const line = fixture.componentInstance.quickSaleLines()[0];
    fixture.componentInstance.selectAddonTarget(line.draftId);
    fixture.componentInstance.addQuickSaleAddon(fixture.componentInstance.catalogAddons()[0]);
    expect(quickSaleFacade.create).not.toHaveBeenCalled();
    await fixture.componentInstance.confirmQuickSaleDraft();
    expect(quickSaleFacade.create).toHaveBeenCalledWith(
      [
        {
          productId: 'product-k20',
          quantity: 1,
          priceAdjustment: null,
          addons: [{ productId: 'addon-potato', quantity: 1 }],
        },
      ],
      null,
      'quick-sale-key-1',
    );
    expect(fixture.componentInstance.persistedQuickSaleCode()).toBe('VR-20260729-0001');
  });

  it('collects cash and finalizes a saved quick sale only after explicit confirmation', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.startQuickSale();
    fixture.componentInstance.addProductToQuickSale('product-k20');
    await fixture.componentInstance.confirmQuickSaleDraft();

    fixture.componentInstance.setQuickSaleReceived('25.00');
    await fixture.componentInstance.finalizeQuickSale();

    expect(quickSaleFacade.finalize).toHaveBeenCalledWith(
      'sale-1',
      [{ methodCode: 'EFECTIVO', appliedCents: 2000, receivedCents: 2500 }],
      'quick-sale-key-1',
    );
    expect(fixture.componentInstance.quickSaleFinalized()).toBe(true);
    expect(fixture.componentInstance.quickSaleFeedback()).toContain('Vuelto: S/3.00');
  });

  it('splits a quick-sale payment between Yape and cash and calculates cash change', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.startQuickSale();
    fixture.componentInstance.addProductToQuickSale('product-k20');
    await fixture.componentInstance.confirmQuickSaleDraft();
    fixture.componentInstance.setQuickSalePaymentMethod('COMBINADO');
    fixture.componentInstance.quickSaleYapeSoles.set('8.00');
    fixture.componentInstance.setQuickSaleReceived('15.00');

    await fixture.componentInstance.finalizeQuickSale();

    expect(quickSaleFacade.finalize).toHaveBeenCalledWith(
      'sale-1',
      [
        { methodCode: 'EFECTIVO', appliedCents: 1200, receivedCents: 1500 },
        { methodCode: 'YAPE', appliedCents: 800, receivedCents: 800 },
      ],
      'quick-sale-key-1',
    );
  });

  it('applies a justified line discount before persisting the quick sale', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.startQuickSale();
    fixture.componentInstance.addProductToQuickSale('product-k20');
    const line = fixture.componentInstance.quickSaleLines()[0];
    fixture.componentInstance.selectQuickSalePriceTarget(line.draftId);
    fixture.componentInstance.quickSaleAppliedPriceSoles.set('18.00');
    fixture.componentInstance.quickSalePriceReason.set('Promoción del día');
    fixture.componentInstance.applyQuickSalePriceAdjustment();

    expect(fixture.componentInstance.quickSaleTotalCents()).toBe(1800);
    await fixture.componentInstance.confirmQuickSaleDraft();
    expect(quickSaleFacade.create).toHaveBeenCalledWith(
      [
        {
          productId: 'product-k20',
          quantity: 1,
          priceAdjustment: {
            type: 'DESCUENTO',
            appliedPriceCents: 1800,
            reason: 'Promoción del día',
          },
          addons: [],
        },
      ],
      null,
      'quick-sale-key-1',
    );
  });

  it('loads and resumes a saved pending quick sale in read-only payment mode', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.startQuickSale();
    const pending = fixture.componentInstance.pendingQuickSales()[0];
    fixture.componentInstance.resumePendingQuickSale(pending);

    expect(quickSaleFacade.listPending).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.persistedQuickSaleId()).toBe('pending-sale-1');
    expect(fixture.componentInstance.persistedQuickSaleCode()).toBe('VR-20260729-PENDING');
    expect(fixture.componentInstance.quickSaleTotalCents()).toBe(2200);
    expect(fixture.componentInstance.quickSaleLines()[0].addons[0].name).toBe('Papa adicional S/2');
  });

  it('cancels a saved unpaid quick sale only with an explicit reason', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.startQuickSale();
    fixture.componentInstance.addProductToQuickSale('product-k20');
    await fixture.componentInstance.confirmQuickSaleDraft();
    fixture.componentInstance.quickSaleCancellationReason.set('Cliente desistió');

    await fixture.componentInstance.cancelQuickSale();

    expect(quickSaleFacade.cancel).toHaveBeenCalledWith(
      'sale-1',
      'Cliente desistió',
      'quick-sale-key-1',
    );
    expect(fixture.componentInstance.persistedQuickSaleId()).toBeNull();
    expect(fixture.componentInstance.quickSaleFeedback()).toContain('anulada');
  });

  it('opens a finalized quick sale from journey history in read-only mode', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.startQuickSale();

    fixture.componentInstance.viewQuickSaleHistory(fixture.componentInstance.quickSaleHistory()[0]);

    expect(quickSaleFacade.listHistory).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.persistedQuickSaleCode()).toBe('VR-HISTORY-1');
    expect(fixture.componentInstance.quickSaleReadOnlyState()).toBe('FINALIZADA');
    expect(fixture.componentInstance.quickSaleFinalized()).toBe(true);
    expect(fixture.componentInstance.quickSaleFeedback()).toContain('Efectivo + Yape');
  });

  it('shows expected cash separately from other payment methods', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.selectSection('CAJA');
    fixture.detectChanges();

    expect(expenseFacade.loadCashSummary).toHaveBeenCalledOnce();
    const summary = fixture.nativeElement.querySelector('.cash-summary') as HTMLElement;
    expect(summary.textContent).toContain('Efectivo esperado');
    expect(summary.textContent).toContain('S/125.00');
    expect(summary.textContent).toContain('Yape');
    expect(summary.textContent).toContain('S/30.00');
  });

  it('lists every condition that currently blocks the journey close', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.selectSection('CAJA');
    fixture.detectChanges();

    expect(expenseFacade.loadCloseReadiness).toHaveBeenCalledWith(null, '');
    const closePanel = fixture.nativeElement.querySelector('.cash-close-panel') as HTMLElement;
    expect(closePanel.textContent).toContain('Mesa 4 sigue abierta');
    expect(closePanel.textContent).toContain('CTA-1 tiene S/42.00 pendiente');
    expect(closePanel.textContent).toContain('Ingresa el efectivo real contado');
    expect(closePanel.textContent).not.toContain('Puedes cerrar la jornada');
  });

  it('confirms the journey close only after all conditions are complete', async () => {
    expenseFacade.loadCloseReadiness.mockResolvedValueOnce({
      canClose: true,
      actualCashCents: 10000,
      differenceType: 'CUADRA',
      differenceCents: 0,
      blockers: [],
    });
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.actualCashSoles.set('100.00');
    await fixture.componentInstance.selectSection('CAJA');
    await fixture.componentInstance.confirmJourneyClose();
    expect(expenseFacade.closeJourney).toHaveBeenCalledWith(10000, null, 'closing-request-1');
    expect(fixture.componentInstance.closingFeedback()).toContain('cerrada correctamente');
  });

  it('shows and confirms a corrected close only with an administrative reason', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.activeSection.set('CAJA');
    fixture.componentInstance.pendingCorrection.set({
      journeyId: 'journey-1',
      businessDate: '2026-07-29',
      reopeningId: 'reopen-1',
      previousCloseId: 'close-1',
      previousCloseSequence: 1,
      reopeningReason: 'Corregir conteo',
    });
    fixture.componentInstance.closeReadiness.set({
      canClose: true,
      actualCashCents: 10000,
      differenceType: 'CUADRA',
      differenceCents: 0,
      blockers: [],
    });
    fixture.componentInstance.actualCashSoles.set('100.00');
    fixture.componentInstance.closeJustification.set('Conteo rectificado');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirmar cierre corregido');
    await fixture.componentInstance.confirmCorrectedJourneyClose();
    expect(expenseFacade.closeCorrectedJourney).toHaveBeenCalledWith(
      10000,
      'Conteo rectificado',
      'closing-request-1',
    );
  });

  it('registers an expense in cents and resets the form only after confirmation', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.selectSection('CAJA');
    fixture.componentInstance.expenseCategoryId.set('category-supplies');
    fixture.componentInstance.expensePaymentMethodId.set('payment-cash');
    fixture.componentInstance.expenseDescription.set('Compra de carbón');
    fixture.componentInstance.expenseAmountSoles.set('50.50');

    await fixture.componentInstance.registerExpense();

    expect(expenseFacade.register).toHaveBeenCalledWith(
      {
        categoryId: 'category-supplies',
        paymentMethodId: 'payment-cash',
        description: 'Compra de carbón',
        amountCents: 5050,
        supplier: null,
        note: null,
      },
      'expense-request-1',
    );
    expect(fixture.componentInstance.expenseDescription()).toBe('');
    expect(fixture.componentInstance.expenseFeedback()).toContain('S/50.50');
  });

  it('requires a note before registering loss or unpaid consumption', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.selectSection('CAJA');
    fixture.componentInstance.expenseCategoryId.set('category-loss');
    fixture.componentInstance.expensePaymentMethodId.set('payment-cash');
    fixture.componentInstance.expenseDescription.set('Plato servido no cobrado');
    fixture.componentInstance.expenseAmountSoles.set('20');

    await fixture.componentInstance.registerExpense();

    expect(expenseFacade.register).not.toHaveBeenCalled();
    expect(fixture.componentInstance.expenseError()).toContain('nota');
  });

  it('asks for the initial cash amount and opens the journey for the active user', async () => {
    journeyFacade.getStatus.mockResolvedValueOnce({
      kind: 'NONE',
      currentBusinessDate: '2026-07-29',
    });
    journeyFacade.open.mockResolvedValueOnce({
      id: 'journey-new',
      businessDate: '2026-07-29',
      initialAmountCents: 15050,
      openedByUserId: 'user-cashier',
      openedByDisplayName: 'Caja',
      openedAtUtc: '2026-07-29T15:00:00.000Z',
    });
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Abrir jornada');
    fixture.componentInstance.initialAmountSoles.set('150.50');
    fixture.componentInstance.openingObservation.set('Turno de tarde');
    await fixture.componentInstance.openJourney();

    expect(journeyFacade.open).toHaveBeenCalledWith(15050, 'Turno de tarde', 'opening-request-1');
    expect(fixture.componentInstance.journeyStatus()).toBe('OPEN_TODAY');
  });

  it('shows a closed day and lets the administrator reopen it with a reason', async () => {
    journeyFacade.getStatus.mockResolvedValueOnce({
      kind: 'NONE',
      currentBusinessDate: '2026-07-29',
    });
    const candidate: ReopenCandidate = {
      journeyId: 'journey-1',
      businessDate: '2026-07-29',
      closeId: 'close-1',
      closeType: 'NORMAL',
      closedAtUtc: '2026-07-29T22:00:00Z',
    };
    journeyFacade.getReopenCandidate.mockResolvedValueOnce(candidate);
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.reopenCandidate.set(candidate);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('La jornada de hoy ya fue cerrada');
    expect(fixture.nativeElement.textContent).not.toContain('Abrir jornada y comenzar');
    fixture.componentInstance.reopenReason.set('Corregir conteo final');
    await fixture.componentInstance.reopenJourney();
    expect(journeyFacade.reopen).toHaveBeenCalledWith(
      candidate,
      'Corregir conteo final',
      'opening-request-1',
    );
  });

  it('blocks a new opening and identifies a previous-day journey', async () => {
    journeyFacade.getStatus.mockResolvedValueOnce({
      kind: 'OPEN_PREVIOUS_DAY',
      currentBusinessDate: '2026-07-29',
      journey: {
        id: 'journey-old',
        businessDate: '2026-07-28',
        initialAmountCents: 0,
        openedByUserId: 'user-cashier',
        openedByDisplayName: 'Caja',
        openedAtUtc: '2026-07-28T14:00:00.000Z',
      },
    });
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Jornada anterior pendiente');
    expect(fixture.nativeElement.textContent).toContain('28/07/2026');
    expect(fixture.nativeElement.querySelector('.open-journey-button')).toBeNull();
    expect(journeyFacade.open).not.toHaveBeenCalled();
  });

  it('lets an administrator exceptionally close a previous-day journey', async () => {
    journeyFacade.getStatus.mockResolvedValueOnce({
      kind: 'OPEN_PREVIOUS_DAY',
      currentBusinessDate: '2026-07-29',
      journey: {
        id: 'journey-old',
        businessDate: '2026-07-28',
        initialAmountCents: 10000,
        openedByUserId: 'cashier',
        openedByDisplayName: 'Caja',
        openedAtUtc: '2026-07-28T14:00:00Z',
      },
    });
    expenseFacade.loadCloseReadiness.mockResolvedValue({
      canClose: true,
      actualCashCents: 10000,
      differenceType: 'CUADRA',
      differenceCents: 0,
      blockers: [],
    });
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.actualCashSoles.set('100');
    fixture.componentInstance.closeJustification.set('Corte eléctrico');
    await fixture.componentInstance.loadCloseReadiness();
    await fixture.componentInstance.confirmExceptionalJourneyClose();
    expect(expenseFacade.closeExceptionalJourney).toHaveBeenCalledWith(
      10000,
      'Corte eléctrico',
      'closing-request-1',
    );
  });

  it('loads products from the catalog and filters them by category', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(catalogFacade.load).toHaveBeenCalledOnce();
    let productPanel = fixture.nativeElement.querySelector('.products-panel') as HTMLElement;
    expect(productPanel.textContent).toContain('Kankacho S/20');
    expect(productPanel.textContent).not.toContain('Inca Kola 600 ml');

    fixture.componentInstance.selectCategory('BEBIDAS');
    fixture.detectChanges();

    productPanel = fixture.nativeElement.querySelector('.products-panel') as HTMLElement;
    expect(productPanel.textContent).toContain('Inca Kola 600 ml');
    expect(productPanel.textContent).toContain('Agotado');
    expect(productPanel.querySelector<HTMLButtonElement>('.product')?.disabled).toBe(true);
  });

  it('filters the selected category using normalized product text', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.setSearchTerm('porcion NORMAL');
    expect(fixture.componentInstance.visibleProducts().map((product) => product.name)).toEqual([
      'Kankacho S/20',
    ]);
    fixture.componentInstance.setSearchTerm('inca');
    expect(fixture.componentInstance.visibleProducts()).toEqual([]);
    fixture.componentInstance.selectCategory('BEBIDAS');
    expect(fixture.componentInstance.visibleProducts().map((product) => product.name)).toEqual([
      'Inca Kola 600 ml',
    ]);
  });

  it('shows a safe retry state when the local catalog cannot be loaded', async () => {
    catalogFacade.load.mockRejectedValueOnce(new Error('sensitive sqlite detail'));
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.catalogStatus()).toBe('ERROR');
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar el catálogo local.');
    expect(fixture.nativeElement.textContent).not.toContain('sensitive sqlite detail');

    await fixture.componentInstance.loadCatalog();
    expect(fixture.componentInstance.catalogStatus()).toBe('READY');
  });

  it('updates a product only after SQLite confirms its availability change', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    const change = fixture.componentInstance.changeProductAvailability({
      productId: 'product-k20',
      availability: 'AGOTADO',
    });
    expect(fixture.componentInstance.products()[0].availability).toBe('DISPONIBLE');
    await change;

    expect(catalogFacade.changeAvailability).toHaveBeenCalledWith('product-k20', 'AGOTADO');
    expect(fixture.componentInstance.products()[0].availability).toBe('AGOTADO');
    expect(fixture.componentInstance.availabilityFeedback()).toBe('Kankacho S/20: Agotado');
  });

  it('keeps the previous availability and hides technical details when persistence fails', async () => {
    catalogFacade.changeAvailability.mockRejectedValueOnce(new Error('private sqlite failure'));
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.changeProductAvailability({
      productId: 'product-k20',
      availability: 'AGOTADO',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.products()[0].availability).toBe('DISPONIBLE');
    expect(fixture.componentInstance.availabilityFeedbackError()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No se pudo cambiar la disponibilidad.');
    expect(fixture.nativeElement.textContent).not.toContain('private sqlite failure');
  });

  it('keeps the selected table and account visible while adding products', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    component.selectTable('table-4');
    fixture.detectChanges();

    expect(component.selectedTable()?.label).toBe('Mesa 4');
    expect(component.selectedAccountLabel()).toBe('Cuenta A');
    expect(fixture.nativeElement.textContent).toMatch(/AGREGANDO A\s*Mesa 4 · Cuenta A/);
  });

  it('allows a second account but blocks a third one in the visual model', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.selectTable('table-5');

    expect(component.canCreateAccount()).toBe(false);
    expect(component.selectedTable()?.openAccounts).toBe(2);
  });

  it('collapses and restores the table panel without losing selection', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.selectTable('table-4');

    component.toggleTablePanel();
    expect(component.tablePanelCollapsed()).toBe(true);
    expect(component.selectedTable()?.id).toBe('table-4');
    component.toggleTablePanel();
    expect(component.tablePanelCollapsed()).toBe(false);
  });

  it('opens the first real account and refreshes the selected table', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectTable('table-1');
    await fixture.componentInstance.openTableAccount();
    expect(tableServiceFacade.openAccount).toHaveBeenCalledWith(
      'table-1',
      null,
      'table-account-key-1',
    );
    expect(tableServiceFacade.list).toHaveBeenCalledTimes(2);
  });

  it('adds a selected catalog product to the active real table account', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectTable('table-4');
    await fixture.componentInstance.addProductToTableAccount('product-k20');
    expect(tableServiceFacade.addToAccount).toHaveBeenCalledWith(
      'account-4a',
      [{ productId: 'product-k20', quantity: 1 }],
      'table-account-key-1',
    );
  });

  it('switches explicitly between two independent accounts on the same table', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectTable('table-5');
    fixture.componentInstance.selectTableAccount('account-5b', 'Cuenta B');
    expect(fixture.componentInstance.selectedAccountLabel()).toBe('Cuenta B');
    expect(tableServiceFacade.loadAccount).toHaveBeenCalledWith('account-5b');
  });

  it('selects only unpaid product quantities and calculates their exact total', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.tableAccount.set({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      state: 'ABIERTA',
      totalCents: 6000,
      paidCents: 2000,
      balanceCents: 4000,
      principalTableId: 'table-4',
      principalTableName: 'Mesa 4',
      linkedTables: [],
      lines: [
        {
          detailId: 'detail-1',
          productId: 'product-k20',
          name: 'Kankacho',
          quantity: 3,
          servedQuantity: 3,
          paidQuantity: 1,
          unitPriceCents: 2000,
          subtotalCents: 6000,
          serviceState: 'SERVIDO',
          catalogUnitPriceCents: 2000,
          allowsAddons: true,
          allowsPriceChange: true,
          addons: [],
        },
      ],
    });
    fixture.componentInstance.changeTablePaymentSelection('detail-1', 3);
    expect(fixture.componentInstance.tablePaymentSelection()['detail-1']).toBe(2);
    expect(fixture.componentInstance.tablePaymentTotalCents()).toBe(4000);
  });

  it('sends a combined table payment with concrete detail allocations', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectTable('table-4');
    fixture.componentInstance.tableAccount.set({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      state: 'ABIERTA',
      totalCents: 2200,
      paidCents: 0,
      balanceCents: 2200,
      principalTableId: 'table-4',
      principalTableName: 'Mesa 4',
      linkedTables: [],
      lines: [
        {
          detailId: 'detail-1',
          productId: 'product-k20',
          name: 'Kankacho',
          quantity: 1,
          servedQuantity: 0,
          paidQuantity: 0,
          unitPriceCents: 2200,
          subtotalCents: 2200,
          serviceState: 'PENDIENTE',
          catalogUnitPriceCents: 2200,
          allowsAddons: false,
          allowsPriceChange: false,
          addons: [],
        },
      ],
    });
    fixture.componentInstance.changeTablePaymentSelection('detail-1', 1);
    fixture.componentInstance.setTablePaymentMethod('COMBINADO');
    fixture.componentInstance.tableYapeSoles.set('10');
    fixture.componentInstance.tableCashReceivedSoles.set('15');
    await fixture.componentInstance.confirmTablePayment();
    expect(tableServiceFacade.payAccount).toHaveBeenCalledWith(
      'account-4a',
      [{ detailId: 'detail-1', quantity: 1 }],
      [
        { methodCode: 'EFECTIVO', appliedCents: 1200, receivedCents: 1500 },
        { methodCode: 'YAPE', appliedCents: 1000, receivedCents: 1000 },
      ],
      'table-account-key-1',
    );
  });

  it('finalizes a zero-balance attention only through the explicit action', async () => {
    const fixture = TestBed.createComponent(ServiceWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectTable('table-4');
    fixture.componentInstance.tableAccount.set({
      operationId: 'account-4a',
      operationCode: 'CM-4A',
      state: 'PAGADA',
      totalCents: 2000,
      paidCents: 2000,
      balanceCents: 0,
      principalTableId: 'table-4',
      principalTableName: 'Mesa 4',
      linkedTables: [],
      lines: [],
    });
    await fixture.componentInstance.finalizeTableAttention();
    expect(tableServiceFacade.finalizeAttention).toHaveBeenCalledWith(
      'account-4a',
      'table-account-key-1',
    );
  });
});
