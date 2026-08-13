import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
  IonItem,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { AUTH_FACADE } from './authentication.facade';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonInput,
    IonButton,
    IonText,
    IonSpinner,
  ],
  templateUrl: './login.page.html',
  styleUrl: './auth.pages.scss',
})
export class LoginPage implements OnInit {
  private readonly facade = inject(AUTH_FACADE);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  async ngOnInit(): Promise<void> {
    try {
      if (!(await this.facade.hasUsers()))
        await this.router.navigateByUrl('/configuracion-inicial', { replaceUrl: true });
    } catch (e) {
      this.errorMessage.set(toMessage(e));
    }
  }
  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const value = this.form.getRawValue();
      await this.facade.login(value.username, value.password);
      await this.router.navigateByUrl('/inicio', { replaceUrl: true });
    } catch (e) {
      this.errorMessage.set(toMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
}
