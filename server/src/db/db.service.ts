import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';

// OID 1082 = PostgreSQL DATE — return exact 'YYYY-MM-DD' string without local TZ Date shift.
types.setTypeParser(1082, (val: string) => val);

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
}

function asQueryable(client: Pick<PoolClient, 'query'>): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await client.query<T>(sql, params);
      return result.rows;
    },
  };
}

@Injectable()
export class Db implements OnModuleDestroy, Queryable {
  private readonly log = new Logger(Db.name);
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
      ...(config.dbSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    this.pool.on('error', (err) => {
      this.log.error(`Unexpected idle PostgreSQL client error: ${err.message}`);
    });
  }

  async withAdvisoryLock<T>(
    lockKey: number,
    work: () => Promise<T>,
  ): Promise<{ acquired: true; result: T } | { acquired: false }> {
    const client = await this.pool.connect();
    let locked = false;
    try {
      const res = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [lockKey],
      );
      locked = Boolean(res.rows[0]?.locked);
      if (!locked) {
        return { acquired: false };
      }
      const result = await work();
      return { acquired: true, result };
    } finally {
      if (locked) {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => undefined);
      }
      client.release();
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async tx<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(asQueryable(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async audit(actorId: string | null, action: string, target: string | null, detail: unknown = {}): Promise<void> {
    await this.pool.query('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)', [
      actorId,
      action,
      target,
      JSON.stringify(detail),
    ]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export function poolAsQueryable(pool: Pool): Queryable {
  return asQueryable(pool);
}
