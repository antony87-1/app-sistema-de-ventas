import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ProductPreview } from './workspace.models';
import { StatusBadgeComponent } from './status-badge.component';
import type { ProductAvailability } from './workspace.models';

export interface ProductAvailabilityChangeRequest {
  readonly productId: string;
  readonly availability: ProductAvailability;
}

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [StatusBadgeComponent],
  template: `<article class="product-shell">
    <button
      type="button"
      class="product"
      [disabled]="product.availability === 'AGOTADO'"
      (click)="selected.emit(product.id)"
    >
      <span class="product-image" aria-hidden="true">🍽️</span
      ><span class="product-copy"
        ><strong>{{ product.name }}</strong
        ><small>{{ product.description }}</small
        ><b>{{ product.price }}</b></span
      >
      @if (product.availability === 'AGOTADO') {
        <app-status-badge label="Agotado" icon="×" tone="danger" />
      }
    </button>
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
      .product {
        position: relative;
        width: 100%;
        min-height: 122px;
        text-align: left;
        border: 1px solid #eadbc9;
        border-radius: 16px;
        background: #fff;
        padding: 0.7rem;
        display: flex;
        gap: 0.7rem;
        color: #2c1a13;
        box-shadow: 0 4px 14px rgba(79, 42, 22, 0.06);
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
    `,
  ],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: ProductPreview;
  @Input() availabilityBusy = false;
  @Output() readonly selected = new EventEmitter<string>();
  @Output() readonly availabilityChangeRequested =
    new EventEmitter<ProductAvailabilityChangeRequest>();

  requestAvailabilityChange(): void {
    this.availabilityChangeRequested.emit({
      productId: this.product.id,
      availability: this.product.availability === 'DISPONIBLE' ? 'AGOTADO' : 'DISPONIBLE',
    });
  }
}
