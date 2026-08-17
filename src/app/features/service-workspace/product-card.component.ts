import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ProductPreview } from './workspace.models';
import { StatusBadgeComponent } from './status-badge.component';
import type { ProductAvailability } from './workspace.models';

export interface ProductAvailabilityChangeRequest {
  readonly productId: string;
  readonly availability: ProductAvailability;
}

export interface ProductSelectionRequest {
  readonly productId: string;
  readonly quantity: number;
}

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [StatusBadgeComponent],
  template: `<article class="product-shell">
    <div class="product-card" [class.selector-open]="selectorOpen">
      <button
        type="button"
        class="product"
        [disabled]="product.availability === 'AGOTADO'"
        [attr.aria-expanded]="selectorOpen"
        [attr.aria-label]="'Elegir cantidad de ' + product.name"
        (click)="toggleSelector()"
      >
        <span class="product-image" aria-hidden="true">🍽️</span
        ><span class="product-copy"
          ><strong>{{ product.name }}</strong
          ><small>{{ product.description }}</small>
          @if (!selectorOpen) {
            <b>{{ product.price }}</b>
          }
        </span>
        @if (product.availability === 'AGOTADO') {
          <app-status-badge label="Agotado" icon="×" tone="danger" />
        }
      </button>
      @if (selectorOpen && product.availability === 'DISPONIBLE') {
        <div class="quantity-selector" aria-label="Cantidad a agregar">
          <div>
            <button type="button" aria-label="Quitar uno" (click)="decrease()">−</button>
            <strong aria-live="polite">{{ quantity }}</strong>
            <button type="button" aria-label="Agregar uno" (click)="increase()">+</button>
          </div>
          <button type="button" class="add-action" (click)="confirmSelection()">Agregar</button>
        </div>
      }
    </div>
    <button
      type="button"
      class="availability-action"
      [disabled]="availabilityBusy"
      (click)="requestAvailabilityChange()"
    >
      @if (availabilityBusy) {
        Guardando…
      } @else if (product.availability === 'DISPONIBLE') {
        Marcar agotado
      } @else {
        Marcar disponible
      }
    </button>
  </article>`,
  styles: [
    `
      .product-card {
        position: relative;
        width: 100%;
        min-height: 122px;
        border: 1px solid #eadbc9;
        border-radius: 16px;
        background: #fff;
        overflow: hidden;
        box-shadow: 0 4px 14px rgba(79, 42, 22, 0.06);
      }
      .product {
        position: absolute;
        inset: 0;
        width: 100%;
        text-align: left;
        border: 0;
        background: transparent;
        padding: 0.7rem;
        display: flex;
        gap: 0.7rem;
        color: #2c1a13;
      }
      .product-shell {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.4rem;
      }
      .product:active:not(:disabled) {
        transform: scale(0.98);
      }
      .product:disabled {
        opacity: 0.66;
        background: #f4efea;
      }
      .selector-open .product {
        padding-bottom: 4.25rem;
      }
      .product-image {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 13px;
        background: #fff1df;
        font-size: 1.5rem;
      }
      .product-copy {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 0.22rem;
      }
      .product-copy strong {
        font-size: 1rem;
      }
      .product-copy small {
        color: #715b50;
      }
      .product-copy b {
        font-size: 1.08rem;
        color: #9b351c;
        margin-top: auto;
      }
      app-status-badge {
        position: absolute;
        right: 0.55rem;
        top: 0.55rem;
      }
      .availability-action {
        min-height: 42px;
        border: 1px solid #c9aa93;
        border-radius: 12px;
        background: #fffaf5;
        color: #71351f;
        font-weight: 800;
      }
      .availability-action:disabled {
        opacity: 0.6;
      }
      .quantity-selector {
        position: absolute;
        right: 0.55rem;
        bottom: 0.5rem;
        left: 0.55rem;
        z-index: 2;
        display: grid;
        gap: 0.25rem;
      }
      .quantity-selector > div {
        display: grid;
        grid-template-columns: 32px 1fr 32px;
        align-items: center;
        text-align: center;
      }
      .quantity-selector button {
        min-height: 28px;
        border: 1px solid #d3b9a4;
        border-radius: 8px;
        background: #fffaf5;
        color: #71351f;
        font-weight: 900;
      }
      .quantity-selector .add-action {
        min-height: 29px;
        border-color: #8f321a;
        background: #8f321a;
        color: #fff;
      }
    `,
  ],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: ProductPreview;
  @Input() availabilityBusy = false;
  @Output() readonly selected = new EventEmitter<ProductSelectionRequest>();
  @Output() readonly availabilityChangeRequested =
    new EventEmitter<ProductAvailabilityChangeRequest>();
  selectorOpen = false;
  quantity = 1;

  toggleSelector(): void {
    if (this.product.availability === 'AGOTADO') return;
    this.selectorOpen = !this.selectorOpen;
  }

  decrease(): void {
    this.quantity = Math.max(1, this.quantity - 1);
  }

  increase(): void {
    this.quantity = Math.min(99, this.quantity + 1);
  }

  confirmSelection(): void {
    this.selected.emit({ productId: this.product.id, quantity: this.quantity });
    this.quantity = 1;
    this.selectorOpen = false;
  }

  requestAvailabilityChange(): void {
    this.availabilityChangeRequested.emit({
      productId: this.product.id,
      availability: this.product.availability === 'DISPONIBLE' ? 'AGOTADO' : 'DISPONIBLE',
    });
  }
}
