import { Component, Input } from '@angular/core';
@Component({
  selector: 'app-local-save-indicator',
  standalone: true,
  template: `<span class="save" [attr.data-state]="state"
    ><span aria-hidden="true">{{ state === 'GUARDADO' ? '✓' : state === 'ERROR' ? '!' : '…' }}</span
    >{{
      state === 'GUARDADO' ? 'Guardado' : state === 'ERROR' ? 'Error al guardar' : 'Guardando'
    }}</span
  >`,
  styles: [
    `
      .save {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: #58675b;
        font-size: 0.78rem;
        font-weight: 700;
      }
      .save[data-state='ERROR'] {
        color: #a02b1d;
      }
    `,
  ],
})
export class LocalSaveIndicatorComponent {
  @Input() state: 'GUARDANDO' | 'GUARDADO' | 'ERROR' = 'GUARDADO';
}
