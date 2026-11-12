import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { registerSyncfusionLicense } from './app/core/register-license';

registerSyncfusionLicense();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
