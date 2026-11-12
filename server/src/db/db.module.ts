import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig, loadEnv, readConfig } from '../config';
import { Db } from './db.service';

loadEnv();
const config: AppConfig = readConfig();

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useValue: config },
    Db,
  ],
  exports: [APP_CONFIG, Db],
})
export class DbModule {}
