import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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
  selector: 'app-initial-setup',
  imports: [
    ReactiveFormsModule,
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
  templateUrl: './initial-setup.page.html',
  styleUrl: './auth.pages.scss',
})
export class InitialSetupPage implements OnInit {
  private readonly facade = inject(AUTH_FACADE);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly recoveryCode = signal('');
  readonly form = this.formBuilder.group({
    administratorUsername: ['', Validators.required],
    administratorDisplayName: ['', Validators.required],
    administratorPassword: [
      '',
      [Validators.required, Validators.minLength(8), Validators.maxLength(64)],
    ],
    administratorPasswordConfirmation: ['', Validators.required],
    cashierUsername: ['', Validators.required],
    cashierDisplayName: ['', Validators.required],
    cashierPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64)]],
    cashierPasswordConfirmation: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    try {
      if (await this.facade.hasUsers())
        await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (error: unknown) {
      this.errorMessage.set(messageFrom(error));
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (
      value.administratorPassword !== value.administratorPasswordConfirmation ||
      value.cashierPassword !== value.cashierPasswordConfirmation
    ) {
      this.errorMessage.set('Las confirmaciones de contraseña deben coincidir.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.facade.provisionInitialUsers({
        administrator: {
          username: value.administratorUsername,
          displayName: value.administratorDisplayName,
          password: value.administratorPassword,
        },
        cashier: {
          username: value.cashierUsername,
          displayName: value.cashierDisplayName,
          password: value.cashierPassword,
        },
      });
      this.recoveryCode.set(result.recoveryCode);
      this.form.disable();
    } catch (error: unknown) {
      this.errorMessage.set(messageFrom(error));
    } finally {
      this.loading.set(false);
    }
  }

  continueToLogin(): Promise<boolean> {
    return this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
