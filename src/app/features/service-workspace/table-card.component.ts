import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TablePreview } from './workspace.models';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
  selector: 'app-table-card',
  standalone: true,
  imports: [StatusBadgeComponent],
  template: `<button
    type="button"
    class="table-card"
    [class.selected]="selected"
    (click)="activate.emit(table.id)"
  >
    <span
      ><strong>{{ table.joinedLabel || table.label }}</strong
      ><small>{{ description }}</small></span
    ><app-status-badge [label]="stateLabel" [icon]="stateIcon" [tone]="stateTone" />
  </button>`,
  styles: [
    `
      .table-card {
        width: 100%;
        min-height: 78px;
        border: 1px solid #dfd7d1;
        border-radius: 14px;
        background: #fff;
        padding: 0.65rem;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        gap: 0.5rem;
        text-align: left;
        color: #291a14;
      }
      .table-card.selected {
        border: 3px solid #a63d20;
        background: #fff8ee;
        padding: 0.52rem;
      }
      .table-card span:first-child {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .table-card strong {
        font-size: 1rem;
      }
      .table-card small {
        color: #6b584f;
      }
    `,
  ],
})
export class TableCardComponent {
  @Input({ required: true }) table!: TablePreview;
  @Input() selected = false;
  @Output() readonly activate = new EventEmitter<string>();
  get description(): string {
    if (this.table.openAccounts === 2) return '2 cuentas abiertas';
    if (this.table.balance) return `Saldo ${this.table.balance}`;
    return 'Sin cuenta abierta';
  }
  get stateLabel(): string {
    return (
      {
        DISPONIBLE: 'Disponible',
        OCUPADA: 'Ocupada',
        PENDIENTE_SERVIR: 'Pendiente de servir',
        PAGADA: 'Pagada — finalizar',
      } as const
    )[this.table.state];
  }
  get stateIcon(): string {
    return this.table.state === 'DISPONIBLE'
      ? '✓'
      : this.table.state === 'PENDIENTE_SERVIR'
        ? '!'
        : '●';
  }
  get stateTone(): 'success' | 'warning' | 'danger' | 'neutral' {
    return this.table.state === 'DISPONIBLE'
      ? 'success'
      : this.table.state === 'PENDIENTE_SERVIR'
        ? 'warning'
        : this.table.state === 'PAGADA'
          ? 'success'
          : 'neutral';
  }
}
