import { Component, inject, signal } from '@angular/core';
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
  selector: 'app-recovery',
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
  templateUrl: './recovery.page.html',
  styleUrl: './auth.pages.scss',
})
export class RecoveryPage {
  private readonly facade = inject(AUTH_FACADE);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly newRecoveryCode = signal('');
  readonly form = this.fb.group({
    recoveryCode: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64)]],
    confirmation: ['', Validators.required],
  });
  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.newPassword !== value.confirmation) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.facade.recoverAdministrator(value.recoveryCode, value.newPassword);
      this.newRecoveryCode.set(result.newRecoveryCode);
      this.form.disable();
    } catch (e) {
      this.errorMessage.set(e instanceof Error ? e.message : 'No se pudo recuperar el acceso.');
    } finally {
      this.loading.set(false);
    }
  }
  goToLogin(): Promise<boolean> {
    return this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
