import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Walks up from `start` until it finds `name`. Used for .env and migrations. */
export function findUp(name: string, start = __dirname): string | null {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

let loaded = false;

/** Loads server/.env first, then the repo .env. Existing process env wins. */
export function loadEnv(): void {
  if (loaded) {
    return;
  }
  loaded = true;
  const serverPkg = findUp('package.json');
  const serverDir = serverPkg ? dirname(serverPkg) : process.cwd();
  for (const file of [join(serverDir, '.env'), join(serverDir, '..', '.env')]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function trimSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export interface AppConfig {
  production: boolean;
  port: number;
  /** Bind address. Use 0.0.0.0 inside Docker so other containers can reach the API. */
  host: string;
  databaseUrl: string;
  /** Public URL of the web app, used for OAuth redirects. */
  appUrl: string;
  sessionDays: number;
  devLogin: boolean;
  tokenEncKey: string;
  gitlab: {
    url: string;
    clientId: string;
    clientSecret: string;
    apiToken: string;
    projectIds: string[];
    bootstrapAdmins: string[];
  };
  openproject: {
    url: string;
    token: string;
    writeback: boolean;
    /** Cron for scheduled sync. Empty disables it. */
    cron: string;
  };
  teams: {
    webhookUrl: string;
    defaultChannel: string;
  };
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env['NODE_ENV'] === 'production';
  const tokenEncKey = env['TOKEN_ENC_KEY'] ?? '';
  if (production && tokenEncKey.length < 32) {
    throw new Error('TOKEN_ENC_KEY must be set (32+ chars) in production');
  }
  return {
    production,
    port: Number(env['PORT'] ?? 3000),
    host: (env['HOST'] ?? '127.0.0.1').trim() || '127.0.0.1',
    databaseUrl: env['DATABASE_URL'] ?? 'postgres://manday:manday@localhost:5433/manday',
    appUrl: trimSlash(env['APP_URL'] ?? 'http://127.0.0.1:4200'),
    sessionDays: Number(env['SESSION_DAYS'] ?? 7),
    devLogin: !production && bool(env['AUTH_DEV_LOGIN'], false),
    tokenEncKey: tokenEncKey || 'dev-only-insecure-key-change-me-please',
    gitlab: {
      url: trimSlash(env['GITLAB_URL'] ?? ''),
      clientId: env['GITLAB_OAUTH_CLIENT_ID'] ?? '',
      clientSecret: env['GITLAB_OAUTH_CLIENT_SECRET'] ?? '',
      apiToken: (env['GITLAB_API_TOKEN'] ?? '').trim(),
      projectIds: list(env['GITLAB_PROJECT_IDS']),
      bootstrapAdmins: list(env['BOOTSTRAP_ADMIN_GITLAB_USERNAMES']).map((name) => name.toLowerCase()),
    },
    openproject: {
      url: trimSlash(env['OPENPROJECT_URL'] ?? ''),
      token: env['OPENPROJECT_API_TOKEN'] ?? '',
      writeback: bool(env['OPENPROJECT_WRITEBACK'], false),
      cron: env['OPENPROJECT_SYNC_CRON'] ?? '*/15 * * * *',
    },
    teams: {
      webhookUrl: (env['TEAMS_WEBHOOK_URL'] ?? '').trim(),
      defaultChannel: (env['TEAMS_DEFAULT_CHANNEL'] ?? 'dev-alerts').trim() || 'dev-alerts',
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
