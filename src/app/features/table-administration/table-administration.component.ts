import { Component, inject, OnInit, output, signal } from '@angular/core';

import type { ManagedTable } from '../../domain/table/manage-tables.use-case';
import { TABLE_ADMINISTRATION_FACADE } from './table-administration.facade';

@Component({
  selector: 'app-table-administration',
  standalone: true,
  templateUrl: './table-administration.component.html',
  styleUrl: './table-administration.component.scss',
})
export class TableAdministrationComponent implements OnInit {
  private readonly facade = inject(TABLE_ADMINISTRATION_FACADE);
  readonly tablesChanged = output<void>();
  readonly tables = signal<readonly ManagedTable[]>([]);
  readonly name = signal('');
  readonly order = signal('1');
  readonly editingId = signal('');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  ngOnInit(): void {
    void this.load();
  }
  async load(): Promise<void> {
    try {
      this.tables.set(await this.facade.list());
    } catch {
      this.error.set('No se pudieron cargar las mesas.');
    }
  }
  edit(table: ManagedTable): void {
    this.editingId.set(table.id);
    this.name.set(table.name);
    this.order.set(String(table.order));
    this.message.set('');
    this.error.set('');
  }
  cancel(): void {
    this.editingId.set('');
    this.name.set('');
    this.order.set(String(this.tables().length + 1));
  }
  async save(active = true): Promise<void> {
    const order = Number(this.order());
    if (!this.name().trim() || !Number.isSafeInteger(order) || order < 0 || this.busy()) {
      this.error.set('Escribe un nombre y un orden válido.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.facade.save({
        id: this.editingId() || undefined,
        name: this.name(),
        order,
        active,
      });
      this.message.set(active ? 'Mesa guardada.' : 'Mesa desactivada sin borrar su historial.');
      this.cancel();
      await this.load();
      this.tablesChanged.emit();
    } catch (error: unknown) {
      this.error.set(
        typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'TABLE_WITH_OPEN_ACCOUNTS'
          ? 'Primero finaliza las cuentas abiertas de esta mesa.'
          : 'No se pudo guardar la mesa.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
