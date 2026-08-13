import { TestBed } from '@angular/core/testing';

import { ProductCardComponent } from './product-card.component';

describe('ProductCardComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ProductCardComponent] }));

  it('keeps an exhausted product blocked for sale but allows marking it available', () => {
    const fixture = TestBed.createComponent(ProductCardComponent);
    fixture.componentRef.setInput('product', {
      id: 'product-1',
      categoryCode: 'KANKACHO',
      name: 'Kankacho S/20',
      description: 'Porción normal',
      price: 'S/20.00',
      availability: 'AGOTADO',
    });
    const requested = vi.fn();
    fixture.componentInstance.availabilityChangeRequested.subscribe(requested);
    fixture.detectChanges();

    const productButton = fixture.nativeElement.querySelector('.product') as HTMLButtonElement;
    expect(productButton.disabled).toBe(true);
    const availabilityButton = fixture.nativeElement.querySelector(
      '.availability-action',
    ) as HTMLButtonElement;
    expect(availabilityButton?.disabled).toBe(false);
    expect(availabilityButton?.textContent).toContain('Marcar disponible');

    availabilityButton?.click();
    expect(requested).toHaveBeenCalledWith({ productId: 'product-1', availability: 'DISPONIBLE' });
  });
});
