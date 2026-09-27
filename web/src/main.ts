import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

fetch('/app-config.json')
  .then((response) => response.ok ? response.json() : {})
  .catch(() => ({}))
  .then((config: { apiBaseUrl?: string }) => {
    window.medicalStoreConfig = config;
    return bootstrapApplication(App, appConfig);
  })
  .catch((err) => console.error(err));
