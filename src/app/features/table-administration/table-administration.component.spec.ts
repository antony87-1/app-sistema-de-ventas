import { TestBed } from '@angular/core/testing';

import { TableAdministrationComponent } from './table-administration.component';
import { TABLE_ADMINISTRATION_FACADE } from './table-administration.facade';

describe('TableAdministrationComponent', () => {
  it('notifies the operational workspace after a table is saved', async () => {
    const facade = {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue({
        id: 'table-3',
        code: 'MESA-3',
        name: 'Mesa 3',
        order: 3,
        active: true,
        openAccounts: 0,
      }),
    };
    TestBed.configureTestingModule({
      imports: [TableAdministrationComponent],
      providers: [{ provide: TABLE_ADMINISTRATION_FACADE, useValue: facade }],
    });
    const fixture = TestBed.createComponent(TableAdministrationComponent);
    const changed = vi.fn();
    fixture.componentInstance.tablesChanged.subscribe(changed);
    fixture.componentInstance.name.set('Mesa 3');
    fixture.componentInstance.order.set('3');

    await fixture.componentInstance.save();

    expect(facade.save).toHaveBeenCalledWith({
      id: undefined,
      name: 'Mesa 3',
      order: 3,
      active: true,
    });
    expect(changed).toHaveBeenCalledOnce();
  });
});
