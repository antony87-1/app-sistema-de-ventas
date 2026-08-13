import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { AUTH_FACADE } from './authentication.facade';

@Component({
  selector: 'app-home',
  imports: [IonContent, IonButton],
  template: `<ion-content [fullscreen]="true"
    ><main class="home-shell">
      <p class="eyebrow">Sesión activa</p>
      <h1>Hola, {{ identity?.displayName }}</h1>
      <p>Rol: {{ identity?.role === 'ADMINISTRADOR' ? 'Administrador' : 'Cajero' }}</p>
      <p>
        La autenticación ya está lista. Los módulos operativos se incorporarán en las siguientes
        fases.
      </p>
      <ion-button (click)="logout()">Cerrar sesión</ion-button>
    </main></ion-content
  >`,
  styles: [
    `
      .home-shell {
        max-width: 760px;
        margin: 0 auto;
        padding: clamp(2rem, 8vw, 6rem) 1.25rem;
      }
      .eyebrow {
        color: var(--ion-color-primary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
    `,
  ],
})
export class HomePage {
  private readonly facade = inject(AUTH_FACADE);
  private readonly router = inject(Router);
  readonly identity = this.facade.currentIdentity();
  async logout(): Promise<void> {
    this.facade.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
