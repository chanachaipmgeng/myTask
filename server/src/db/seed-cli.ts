import { Pool } from 'pg';
import { loadEnv, readConfig } from '../config';
import { poolAsQueryable } from './db.service';
import { migrate } from './migrate';
import { seedIfEmpty } from './seed';

async function main(): Promise<void> {
  loadEnv();
  const config = readConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await migrate(pool, (line) => console.log(line));
    await seedIfEmpty(poolAsQueryable(pool), (line) => console.log(line));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
