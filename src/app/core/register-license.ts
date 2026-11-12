import { registerLicense } from '@syncfusion/ej2-base';
import { syncfusionLicenseKey } from './syncfusion-license.generated';

export function registerSyncfusionLicense(): void {
  const key = syncfusionLicenseKey.trim();
  if (key.length > 0) {
    registerLicense(key);
  }
}
