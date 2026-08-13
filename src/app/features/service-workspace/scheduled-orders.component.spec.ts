import { TestBed } from '@angular/core/testing';

import { ScheduledOrdersComponent } from './scheduled-orders.component';
import { SCHEDULED_ORDERS_FACADE } from './scheduled-orders.facade';

describe('ScheduledOrdersComponent', () => {
  const order = {
    operationId: 'order-1',
    operationCode: 'PP-1',
    customerName: 'Ana',
    customerPhone: '999111222',
    scheduledLocal: '2026-07-31T12:30',
    deliveryType: 'RECOJO' as const,
    address: null,
    preparationState: 'REGISTRADO' as const,
    paymentState: 'SIN_ADELANTO' as const,
    totalCents: 2200,
    paidCents: 0,
    balanceCents: 2200,
    lines: [],
  };
  const facade = {
    list: vi.fn().mockResolvedValue([order]),
    create: vi.fn().mockResolvedValue(order),
    advance: vi.fn().mockResolvedValue({
      ...order,
      paidCents: 500,
      balanceCents: 1700,
      paymentState: 'CON_ADELANTO',
    }),
    transition: vi.fn().mockResolvedValue({
      ...order,
      preparationState: 'PENDIENTE_DE_PREPARACION',
    }),
    newRequestKey: vi.fn().mockReturnValue('request-key'),
  };

  beforeEach(() => {
    Object.values(facade).forEach((value) => typeof value === 'function' && value.mockClear());
    TestBed.configureTestingModule({
      imports: [ScheduledOrdersComponent],
      providers: [{ provide: SCHEDULED_ORDERS_FACADE, useValue: facade }],
    });
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ScheduledOrdersComponent);
    fixture.componentRef.setInput('products', [
      {
        id: 'product-1',
        categoryCode: 'KANKACHO',
        name: 'Kankacho',
        description: 'Porción',
        price: 'S/20.00',
        priceCents: 2000,
        allowsAddons: true,
        allowsPriceChange: false,
        availability: 'DISPONIBLE',
      },
    ]);
    fixture.componentRef.setInput('addons', [
      { id: 'addon-1', code: 'PAPA', name: 'Papa', priceCents: 200, availability: 'DISPONIBLE' },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('creates a scheduled order with concrete products and addons', async () => {
    const fixture = createFixture();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.customerName.set('Ana');
    component.customerPhone.set('999111222');
    component.scheduledLocal.set('2026-07-31T12:30');
    component.addProduct(component.products()[0]);
    component.addonTarget.set(component.lines()[0].id);
    component.addAddon(component.addons()[0]);

    await component.create();

    expect(facade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Ana',
        lines: [
          { productId: 'product-1', quantity: 1, addons: [{ productId: 'addon-1', quantity: 1 }] },
        ],
      }),
      'request-key',
    );
  });

  it('records an advance against the selected order', async () => {
    const fixture = createFixture();
    await fixture.whenStable();
    fixture.componentInstance.advanceSoles.set('5.00');

    await fixture.componentInstance.registerAdvance();

    expect(facade.advance).toHaveBeenCalledWith(
      'order-1',
      [{ methodCode: 'EFECTIVO', appliedCents: 500, receivedCents: 500 }],
      'request-key',
    );
  });

  it('adds a written custom size and price to the scheduled order', async () => {
    const fixture = createFixture();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.customerName.set('Ana');
    component.customerPhone.set('999111222');
    component.scheduledLocal.set('2026-07-31T12:30');
    component.customDescription.set('Kankacho entero');
    component.customPresentation.set('Entero grande');
    component.customQuantity.set('2');
    component.customPriceSoles.set('85');
    component.addCustomLine();

    await component.create();

    expect(facade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          {
            customDescription: 'Kankacho entero',
            presentation: 'Entero grande',
            quantity: 2,
            unitPriceCents: 8500,
          },
        ],
      }),
      'request-key',
    );
  });

  it('moves preparation through its next explicit state', async () => {
    const fixture = createFixture();
    await fixture.whenStable();

    await fixture.componentInstance.advancePreparation();

    expect(facade.transition).toHaveBeenCalledWith(
      'order-1',
      'PENDIENTE_DE_PREPARACION',
      'request-key',
    );
  });
});
