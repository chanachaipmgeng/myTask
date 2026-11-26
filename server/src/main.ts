import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import {
  createRateLimiterMiddleware,
  originCsrfMiddleware,
  securityHeadersMiddleware,
} from './common/security';
import { loadEnv, readConfig } from './config';
import { Db, poolAsQueryable } from './db/db.service';
import { migrate } from './db/migrate';
import { seedEnterpriseIfEmpty, seedIfEmpty } from './db/seed';

async function bootstrap(): Promise<void> {
  loadEnv();
  const config = readConfig();
  const app = await NestFactory.create(AppModule, { cors: false });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);
  expressApp.disable('x-powered-by');

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  const allowedOrigins = config.production
    ? [config.appUrl, ...config.corsOrigins].filter(Boolean)
    : [
        config.appUrl,
        ...config.corsOrigins,
        'http://127.0.0.1:4200',
        'http://localhost:4200',
        'http://127.0.0.1:8080',
        'http://localhost:8080',
      ].filter(Boolean);
  const allowedOriginSet = new Set(allowedOrigins);

  app.enableCors({
    origin: [...allowedOriginSet],
    credentials: true,
  });

  app.use(securityHeadersMiddleware(config.production));
  app.use(originCsrfMiddleware(allowedOriginSet, config.production));
  app.use(createRateLimiterMiddleware());
  app.useGlobalFilters(new AllExceptionsFilter(config.production));
  app.enableShutdownHooks();

  const db = app.get(Db);
  await migrate(db.pool, (line) => console.log(line));
  const disableAutoSeed =
    config.production || String(process.env['DISABLE_AUTO_SEED'] ?? '').toLowerCase() === 'true';
  if (disableAutoSeed) {
    console.log(
      config.production
        ? 'skip auto-seed (production)'
        : 'skip auto-seed (DISABLE_AUTO_SEED=true)',
    );
  } else {
    await seedIfEmpty(poolAsQueryable(db.pool), (line) => console.log(line));
    await seedEnterpriseIfEmpty(poolAsQueryable(db.pool), (line) => console.log(line));
  }

  await app.listen(config.port, config.host);
  console.log(`manday server listening on http://${config.host}:${config.port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
