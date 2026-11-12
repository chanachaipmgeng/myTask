import { Pool } from 'pg';
import { loadEnv, readConfig } from '../config';
import { migrate } from './migrate';

async function main(): Promise<void> {
  loadEnv();
  const config = readConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    const applied = await migrate(pool, (line) => console.log(line));
    if (applied.length === 0) {
      console.log('migrations up to date');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
