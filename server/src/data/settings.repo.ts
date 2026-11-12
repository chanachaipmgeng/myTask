import {
  DEFAULT_TRACK_WEIGHTS,
  FOCUS_HOURS_PER_MD,
  TrackWeights,
  WEEKLY_QUOTA,
} from '../../../shared/domain/scoring';
import { Level } from '../../../shared/domain/models';
import {
  DEFAULT_OPENPROJECT_MAPPING,
  OpenProjectMapping,
  validateMapping,
} from '../integrations/openproject/openproject.mapper';
import { Queryable } from '../db/db.service';
import { AlertRulesSetting, AppSettings, ConnectionRow } from './types';
import { decryptSecret, encryptSecret } from '../common/crypto';

const SETTINGS_KEY = 'app';

const DEFAULT_ALERTS: AlertRulesSetting = {
  deadline: true,
  overrun: true,
  overrunLimit: 1.5,
};

export function defaultSettings(): AppSettings {
  return {
    weeklyQuotas: { ...WEEKLY_QUOTA },
    trackWeights: {
      implement: { ...DEFAULT_TRACK_WEIGHTS.implement },
      research: { ...DEFAULT_TRACK_WEIGHTS.research },
    },
    alertRules: { ...DEFAULT_ALERTS },
    levelOverrides: {},
    hoursPerMd: FOCUS_HOURS_PER_MD,
    openprojectMapping: { ...DEFAULT_OPENPROJECT_MAPPING, customFields: { ...DEFAULT_OPENPROJECT_MAPPING.customFields } },
  };
}

export async function getSettings(db: Queryable): Promise<AppSettings> {
  const rows = await db.query<{ value: AppSettings | string }>('SELECT value FROM settings WHERE key = $1', [
    SETTINGS_KEY,
  ]);
  if (!rows[0]) {
    return defaultSettings();
  }
  const raw = typeof rows[0].value === 'string' ? (JSON.parse(rows[0].value) as Partial<AppSettings>) : rows[0].value;
  return mergeSettings(raw);
}

export async function saveSettings(db: Queryable, settings: AppSettings, updatedBy: string | null): Promise<AppSettings> {
  const merged = mergeSettings(settings);
  await db.query(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(merged), updatedBy],
  );
  return merged;
}

export function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const mappingCheck = validateMapping(raw.openprojectMapping ?? base.openprojectMapping);
  return {
    weeklyQuotas: { ...base.weeklyQuotas, ...(raw.weeklyQuotas ?? {}) },
    trackWeights: {
      implement: { ...base.trackWeights.implement, ...(raw.trackWeights?.implement ?? {}) },
      research: { ...base.trackWeights.research, ...(raw.trackWeights?.research ?? {}) },
    },
    alertRules: { ...base.alertRules, ...(raw.alertRules ?? {}) },
    levelOverrides: { ...(raw.levelOverrides ?? {}) },
    hoursPerMd:
      typeof raw.hoursPerMd === 'number' && raw.hoursPerMd > 0 && raw.hoursPerMd <= 24
        ? raw.hoursPerMd
        : base.hoursPerMd,
    openprojectMapping: mappingCheck.mapping ?? base.openprojectMapping,
  };
}

export async function getConnection(db: Queryable, id: string): Promise<ConnectionRow | null> {
  const rows = await db.query<ConnectionRow>('SELECT * FROM connections WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function upsertConnection(
  db: Queryable,
  input: {
    id: string;
    baseUrl: string;
    token: string | null;
    enabled: boolean;
    updatedBy: string | null;
    encKey: string;
  },
): Promise<void> {
  const existing = await getConnection(db, input.id);
  const tokenEnc =
    input.token === null || input.token === ''
      ? (existing?.token_enc ?? null)
      : encryptSecret(input.token, input.encKey);
  await db.query(
    `INSERT INTO connections (id, base_url, token_enc, enabled, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       base_url = EXCLUDED.base_url,
       token_enc = EXCLUDED.token_enc,
       enabled = EXCLUDED.enabled,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [input.id, input.baseUrl, tokenEnc, input.enabled, input.updatedBy],
  );
}

export function connectionToken(row: ConnectionRow | null, encKey: string): string {
  if (!row?.token_enc) {
    return '';
  }
  return decryptSecret(row.token_enc, encKey);
}

export type { OpenProjectMapping, TrackWeights, Level };
