import { Component, HostListener, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SessionService } from './core/auth/session.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly session = inject(SessionService);

  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  registerActivity(): void {
    this.session.touch();
  }
}
