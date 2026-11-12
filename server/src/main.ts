import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadEnv, readConfig } from './config';
import { Db } from './db/db.service';
import { migrate } from './db/migrate';
import { seedIfEmpty } from './db/seed';
import { poolAsQueryable } from './db/db.service';

async function bootstrap(): Promise<void> {
  loadEnv();
  const config = readConfig();
  const app = await NestFactory.create(AppModule, { cors: false });
  app.use(cookieParser());
  app.enableCors({
    origin: [
      config.appUrl,
      'http://127.0.0.1:4200',
      'http://localhost:4200',
      'http://127.0.0.1:8080',
      'http://localhost:8080',
    ],
    credentials: true,
  });

  const db = app.get(Db);
  await migrate(db.pool, (line) => console.log(line));
  await seedIfEmpty(poolAsQueryable(db.pool), (line) => console.log(line));

  await app.listen(config.port, config.host);
  console.log(`manday server listening on http://${config.host}:${config.port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
