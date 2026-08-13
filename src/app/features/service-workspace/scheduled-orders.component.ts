import { Component, computed, inject, input, OnInit, signal } from '@angular/core';

import type { SaleCatalogAddon } from '../../domain/catalog/list-sale-catalog.use-case';
import type {
  PreparationState,
  ScheduledOrderSummary,
} from '../../domain/scheduled-order/manage-scheduled-orders.use-case';
import { SCHEDULED_ORDERS_FACADE } from './scheduled-orders.facade';
import type { ProductPreview } from './workspace.models';

interface ScheduledDraftAddon extends SaleCatalogAddon {
  readonly quantity: number;
}

interface ScheduledDraftLine {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly priceCents: number;
  readonly quantity: number;
  readonly addons: readonly ScheduledDraftAddon[];
  readonly custom: boolean;
  readonly presentation: string | null;
}

@Component({
  selector: 'app-scheduled-orders',
  standalone: true,
  templateUrl: './scheduled-orders.component.html',
  styleUrl: './scheduled-orders.component.scss',
})
export class ScheduledOrdersComponent implements OnInit {
  private readonly facade = inject(SCHEDULED_ORDERS_FACADE);
  private createKey = this.facade.newRequestKey();
  private advanceKey = this.facade.newRequestKey();
  private transitionKey = this.facade.newRequestKey();
  private sequence = 0;

  readonly products = input.required<readonly ProductPreview[]>();
  readonly addons = input.required<readonly SaleCatalogAddon[]>();
  readonly orders = signal<readonly ScheduledOrderSummary[]>([]);
  readonly status = signal<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  readonly busy = signal(false);
  readonly feedback = signal('');
  readonly error = signal('');
  readonly selectedId = signal('');
  readonly customerName = signal('');
  readonly customerPhone = signal('');
  readonly scheduledLocal = signal('');
  readonly deliveryType = signal<'RECOJO' | 'DOMICILIO'>('RECOJO');
  readonly address = signal('');
  readonly reference = signal('');
  readonly lines = signal<readonly ScheduledDraftLine[]>([]);
  readonly customDescription = signal('');
  readonly customPresentation = signal('');
  readonly customQuantity = signal('1');
  readonly customPriceSoles = signal('');
  readonly addonTarget = signal('');
  readonly advanceSoles = signal('');
  readonly advanceMethod = signal<'EFECTIVO' | 'YAPE'>('EFECTIVO');
  readonly selected = computed(
    () => this.orders().find((order) => order.operationId === this.selectedId()) ?? null,
  );
  readonly draftTotalCents = computed(() =>
    this.lines().reduce(
      (sum, line) =>
        sum +
        line.quantity * line.priceCents +
        line.addons.reduce((addonSum, addon) => addonSum + addon.quantity * addon.priceCents, 0),
      0,
    ),
  );
  readonly nextPreparationState = computed(() => nextState(this.selected()?.preparationState));

  ngOnInit(): void {
    void this.load();
  }

  async load(preferredId = ''): Promise<void> {
    this.status.set('LOADING');
    try {
      const orders = await this.facade.list();
      this.orders.set(orders);
      const selected = preferredId || this.selectedId();
      this.selectedId.set(
        orders.some((order) => order.operationId === selected)
          ? selected
          : (orders[0]?.operationId ?? ''),
      );
      this.status.set('READY');
    } catch {
      this.status.set('ERROR');
    }
  }

  addProduct(product: ProductPreview): void {
    if (product.availability !== 'DISPONIBLE') return;
    this.lines.update((lines) => {
      const existing = lines.find(
        (line) => line.productId === product.id && line.addons.length === 0,
      );
      if (existing)
        return lines.map((line) =>
          line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      return [
        ...lines,
        {
          id: `scheduled-${++this.sequence}`,
          productId: product.id,
          name: product.name,
          priceCents: product.priceCents,
          quantity: 1,
          addons: [],
          custom: false,
          presentation: null,
        },
      ];
    });
    this.error.set('');
  }

  addCustomLine(): void {
    const description = this.customDescription().trim();
    const presentation = this.customPresentation().trim();
    const quantity = Number(this.customQuantity());
    const priceCents = parseSoles(this.customPriceSoles());
    if (
      !description ||
      !presentation ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      priceCents === null ||
      priceCents <= 0
    ) {
      this.error.set('Completa descripción, tamaño, cantidad y precio del pedido escrito.');
      return;
    }
    this.lines.update((lines) => [
      ...lines,
      {
        id: `scheduled-custom-${++this.sequence}`,
        productId: '',
        name: description,
        priceCents,
        quantity,
        addons: [],
        custom: true,
        presentation,
      },
    ]);
    this.customDescription.set('');
    this.customPresentation.set('');
    this.customQuantity.set('1');
    this.customPriceSoles.set('');
    this.error.set('');
  }

  changeQuantity(id: string, delta: number): void {
    this.lines.update((lines) =>
      lines
        .map((line) => (line.id === id ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  addAddon(addon: SaleCatalogAddon): void {
    const target = this.addonTarget();
    if (!target || addon.availability !== 'DISPONIBLE') return;
    this.lines.update((lines) =>
      lines.map((line) => {
        if (line.id !== target) return line;
        const current = line.addons.find((item) => item.id === addon.id);
        return {
          ...line,
          addons: current
            ? line.addons.map((item) =>
                item.id === addon.id ? { ...item, quantity: item.quantity + 1 } : item,
              )
            : [...line.addons, { ...addon, quantity: 1 }],
        };
      }),
    );
  }

  async create(): Promise<void> {
    const name = this.customerName().trim();
    const phone = this.customerPhone().trim();
    if (
      !name ||
      !phone ||
      !this.scheduledLocal() ||
      this.lines().length === 0 ||
      (this.deliveryType() === 'DOMICILIO' && !this.address().trim())
    ) {
      this.error.set(
        'Completa cliente, teléfono, fecha, productos y dirección cuando corresponda.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const order = await this.facade.create(
        {
          customerName: name,
          customerPhone: phone,
          scheduledLocal: this.scheduledLocal(),
          deliveryType: this.deliveryType(),
          address: this.address().trim() || null,
          reference: this.reference().trim() || null,
          lines: this.lines().map((line) =>
            line.custom
              ? {
                  customDescription: line.name,
                  presentation: line.presentation ?? 'Personalizado',
                  quantity: line.quantity,
                  unitPriceCents: line.priceCents,
                }
              : {
                  productId: line.productId,
                  quantity: line.quantity,
                  addons: line.addons.map((addon) => ({
                    productId: addon.id,
                    quantity: addon.quantity,
                  })),
                },
          ),
        },
        this.createKey,
      );
      this.createKey = this.facade.newRequestKey();
      this.lines.set([]);
      this.customerName.set('');
      this.customerPhone.set('');
      this.address.set('');
      this.reference.set('');
      this.feedback.set(`Pedido ${order.operationCode} registrado.`);
      await this.load(order.operationId);
    } catch {
      this.error.set(
        'No se pudo registrar el pedido programado. Revisa los datos e inténtalo nuevamente.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async registerAdvance(): Promise<void> {
    const order = this.selected();
    const cents = parseSoles(this.advanceSoles());
    if (!order || cents === null || cents <= 0 || cents > order.balanceCents) {
      this.error.set('Ingresa un adelanto válido que no supere el saldo pendiente.');
      return;
    }
    this.busy.set(true);
    try {
      const updated = await this.facade.advance(
        order.operationId,
        [{ methodCode: this.advanceMethod(), appliedCents: cents, receivedCents: cents }],
        this.advanceKey,
      );
      this.advanceKey = this.facade.newRequestKey();
      this.advanceSoles.set('');
      this.feedback.set(`Cobro registrado. Saldo: ${formatSoles(updated.balanceCents)}.`);
      await this.load(updated.operationId);
    } catch {
      this.error.set('No se pudo registrar el cobro. Comprueba que la jornada siga abierta.');
    } finally {
      this.busy.set(false);
    }
  }

  async advancePreparation(): Promise<void> {
    const order = this.selected();
    const target = this.nextPreparationState();
    if (!order || !target) return;
    this.busy.set(true);
    try {
      const updated = await this.facade.transition(order.operationId, target, this.transitionKey);
      this.transitionKey = this.facade.newRequestKey();
      this.feedback.set(`Preparación actualizada a ${preparationLabel(target)}.`);
      await this.load(updated.operationId);
    } catch {
      this.error.set('No se pudo cambiar el estado. Actualiza la lista e inténtalo nuevamente.');
    } finally {
      this.busy.set(false);
    }
  }

  setDeliveryType(value: string): void {
    this.deliveryType.set(value === 'DOMICILIO' ? 'DOMICILIO' : 'RECOJO');
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.feedback.set('');
    this.error.set('');
  }

  readonly formatSoles = formatSoles;
  readonly preparationLabel = preparationLabel;
}

function nextState(state: PreparationState | undefined): PreparationState | null {
  if (!state) return null;
  return (
    (
      {
        REGISTRADO: 'PENDIENTE_DE_PREPARACION',
        PENDIENTE_DE_PREPARACION: 'EN_PREPARACION',
        EN_PREPARACION: 'LISTO',
        LISTO: 'ENTREGADO',
      } as Partial<Record<PreparationState, PreparationState>>
    )[state] ?? null
  );
}

function preparationLabel(state: PreparationState): string {
  return state.toLowerCase().replaceAll('_', ' ');
}

function parseSoles(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  return Math.round(Number(value.replace(',', '.')) * 100);
}

function formatSoles(cents: number): string {
  return `S/${(cents / 100).toFixed(2)}`;
}
