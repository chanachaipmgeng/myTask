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
  dbPoolMax: number;
  dbSsl: boolean;
  /** Public URL of the web app, used for OAuth redirects. */
  appUrl: string;
  oauthCallbackUrl: string;
  corsOrigins: string[];
  allowedIntegrationHosts: string[];
  sessionDays: number;
  devLogin: boolean;
  tokenEncKey: string;
  tokenEncKeyPrev: string[];
  geminiApiKey: string;
  /** Shared ai-core-service base URL. Cutover on only when both URL + API key are set. */
  aiCoreUrl: string;
  aiCoreApiKey: string;
  gitlab: {
    url: string;
    clientId: string;
    clientSecret: string;
    apiToken: string;
    webhookSecret: string;
    projectIds: string[];
    bootstrapAdmins: string[];
  };
  openproject: {
    url: string;
    token: string;
    writeback: boolean;
    /** Cron for scheduled sync. Empty disables it. */
    cron: string;
    /**
     * Team staging: `all` = เปิดสมาชิก/ใบงานทุกทีม (ค่าเริ่ม), `rd` = POC เฉพาะแผนก R&D
     * Env: OPENPROJECT_TEAM_STAGING=rd|all
     */
    teamStaging: 'rd' | 'all';
  };
  teams: {
    webhookUrl: string;
    defaultChannel: string;
  };
}

export const INSECURE_DEV_TOKEN_ENC_KEY = 'dev-only-insecure-key-change-me-please';

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env['NODE_ENV'] === 'production';
  const tokenEncKey = (env['TOKEN_ENC_KEY'] ?? '').trim();
  if (production && (tokenEncKey.length < 32 || tokenEncKey === INSECURE_DEV_TOKEN_ENC_KEY)) {
    throw new Error(
      'TOKEN_ENC_KEY must be set to a unique secret (32+ chars, not the dev placeholder) in production',
    );
  }
  return {
    production,
    port: Number(env['PORT'] ?? 3000),
    host: (env['HOST'] ?? '127.0.0.1').trim() || '127.0.0.1',
    databaseUrl: env['DATABASE_URL'] ?? 'postgres://manday:manday@localhost:5433/manday',
    dbPoolMax: Math.min(100, Math.max(2, Number(env['DB_POOL_MAX'] ?? 15) || 15)),
    dbSsl: bool(env['DATABASE_SSL'], false),
    appUrl: trimSlash(env['APP_URL'] ?? 'http://127.0.0.1:4200'),
    oauthCallbackUrl: trimSlash(env['OAUTH_CALLBACK_URL'] ?? ''),
    corsOrigins: list(env['CORS_ORIGINS']).map(trimSlash),
    allowedIntegrationHosts: list(env['ALLOWED_INTEGRATION_HOSTS']).map((h) => h.toLowerCase()),
    sessionDays: Number(env['SESSION_DAYS'] ?? 7),
    devLogin: !production && bool(env['AUTH_DEV_LOGIN'], false),
    tokenEncKey: tokenEncKey || INSECURE_DEV_TOKEN_ENC_KEY,
    tokenEncKeyPrev: list(env['TOKEN_ENC_KEY_PREV']),
    geminiApiKey: (env['GEMINI_API_KEY'] ?? '').trim(),
    aiCoreUrl: trimSlash(env['AI_CORE_URL'] ?? ''),
    aiCoreApiKey: (env['AI_CORE_API_KEY'] ?? '').trim(),
    gitlab: {
      url: trimSlash(env['GITLAB_URL'] ?? ''),
      clientId: env['GITLAB_OAUTH_CLIENT_ID'] ?? '',
      clientSecret: env['GITLAB_OAUTH_CLIENT_SECRET'] ?? '',
      apiToken: (env['GITLAB_API_TOKEN'] ?? '').trim(),
      webhookSecret: (env['GITLAB_WEBHOOK_SECRET'] ?? '').trim(),
      projectIds: list(env['GITLAB_PROJECT_IDS']),
      bootstrapAdmins: list(env['BOOTSTRAP_ADMIN_GITLAB_USERNAMES']).map((name) => name.toLowerCase()),
    },
    openproject: {
      url: trimSlash(env['OPENPROJECT_URL'] ?? ''),
      token: env['OPENPROJECT_API_TOKEN'] ?? '',
      writeback: bool(env['OPENPROJECT_WRITEBACK'], false),
      cron: env['OPENPROJECT_SYNC_CRON'] ?? '*/15 * * * *',
      teamStaging: (env['OPENPROJECT_TEAM_STAGING'] ?? 'all').trim().toLowerCase() === 'rd' ? 'rd' : 'all',
    },
    teams: {
      webhookUrl: (env['TEAMS_WEBHOOK_URL'] ?? '').trim(),
      defaultChannel: (env['TEAMS_DEFAULT_CHANNEL'] ?? 'dev-alerts').trim() || 'dev-alerts',
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
