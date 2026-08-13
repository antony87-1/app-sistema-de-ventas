import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader';
import { appConfig } from './app/app.config';
import { App } from './app/app';

async function prepareWebDatabase(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return;

  defineJeepSqlite(window);
  if (!document.querySelector('jeep-sqlite')) {
    const element = document.createElement('jeep-sqlite');
    element.setAttribute('autoSave', 'true');
    document.body.appendChild(element);
  }
  await customElements.whenDefined('jeep-sqlite');
  await CapacitorSQLite.initWebStore();
}

prepareWebDatabase()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err: unknown) => console.error(err));
