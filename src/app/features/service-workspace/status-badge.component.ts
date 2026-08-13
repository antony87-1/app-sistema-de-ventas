import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [attr.data-tone]="tone"
    ><span aria-hidden="true">{{ icon }}</span
    >{{ label }}</span
  >`,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border-radius: 999px;
        padding: 0.32rem 0.58rem;
        font-size: 0.75rem;
        font-weight: 800;
        background: #edf7ed;
        color: #225c2a;
      }
      .badge[data-tone='warning'] {
        background: #fff1d6;
        color: #794b00;
      }
      .badge[data-tone='danger'] {
        background: #fce4df;
        color: #8b2616;
      }
      .badge[data-tone='neutral'] {
        background: #ece8e4;
        color: #574b45;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input({ required: true }) label = '';
  @Input() icon = '●';
  @Input() tone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
}
