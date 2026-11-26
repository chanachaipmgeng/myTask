import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import {
  extractOpAvatarUserId,
  normalizeOpenProjectAvatarUrl,
} from '../../../../../shared/domain/op-team-staging';
import { ScorecardService } from '../../../core/scorecard.service';
import { Person } from '../../../core/models';

export type PersonAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Session-level cache of user avatar lookups that returned 404 to prevent repeated requests */
const SESSION_CACHE_KEY = 'manday_failed_avatars';
const FAILED_AVATAR_USERS = new Set<string>();

try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const cached = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        parsed.forEach((k) => {
          if (typeof k === 'string') FAILED_AVATAR_USERS.add(k);
        });
      }
    }
  }
} catch {
  // ignore
}

export function isFailedAvatarKey(key: string | null | undefined): boolean {
  const k = key?.trim();
  return Boolean(k && FAILED_AVATAR_USERS.has(k));
}

export function recordFailedAvatar(keys: string[]): void {
  let changed = false;
  for (const k of keys) {
    if (k && !FAILED_AVATAR_USERS.has(k)) {
      FAILED_AVATAR_USERS.add(k);
      changed = true;
    }
  }
  if (!changed) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify([...FAILED_AVATAR_USERS]));
    }
  } catch {
    // ignore
  }
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #2746b3 0%, #4f6ef7 100%)',
  'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
  'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)',
  'linear-gradient(135deg, #e11d48 0%, #fb7185 100%)',
  'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
] as const;

function hashIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % AVATAR_GRADIENTS.length;
}

@Component({
  selector: 'app-person-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-avatar.html',
  styleUrl: './person-avatar.scss',
})
export class PersonAvatarComponent {
  private readonly scorecard = inject(ScorecardService);

  readonly personId = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>(null);
  readonly avatarUrl = input<string | null | undefined>(null);
  readonly size = input<PersonAvatarSize>('sm');
  readonly showName = input<boolean>(false);
  readonly subtitle = input<string | null | undefined>(null);

  /** 0 = direct /api/v3/users/:id/avatar, 1 = authenticated backend proxy, 2 = initials fallback */
  protected readonly imgStage = signal<0 | 1 | 2>(0);

  protected readonly resolvedPerson = computed<Person | null>(() => {
    const roster = this.scorecard.roster();
    const id = this.personId()?.trim();
    if (id) {
      const hit = roster.find((p) => p.id === id);
      if (hit) return hit;
      const opMatch = /^op:(\d+)$/i.exec(id);
      if (opMatch) {
        const opId = Number(opMatch[1]);
        const opHit = roster.find((p) => p.openprojectUserId === opId);
        if (opHit) return opHit;
      }
    }
    const rawName = this.name()?.trim();
    if (rawName && rawName !== '-' && rawName !== 'ยังไม่ระบุ') {
      const opMatch = /^op:(\d+)$/i.exec(rawName);
      if (opMatch) {
        const opId = Number(opMatch[1]);
        const opHit = roster.find((p) => p.openprojectUserId === opId);
        if (opHit) return opHit;
      }
      const lower = rawName.toLowerCase();
      return (
        roster.find(
          (p) =>
            p.nickname.toLowerCase() === lower ||
            p.fullName.toLowerCase() === lower ||
            p.id.toLowerCase() === lower,
        ) ?? null
      );
    }
    return null;
  });

  protected readonly directUrl = computed(() => {
    const explicit = this.avatarUrl()?.trim();
    const person = this.resolvedPerson();
    if (explicit) {
      return normalizeOpenProjectAvatarUrl(explicit, person?.openprojectUserId);
    }
    return normalizeOpenProjectAvatarUrl(person?.avatarUrl, person?.openprojectUserId);
  });

  protected readonly proxyUrl = computed(() => {
    if (!this.scorecard.usingApi()) return null;
    const person = this.resolvedPerson();
    const rawOp = /^op:(\d+)$/i.exec((this.personId() || this.name() || '').trim());
    const opId =
      person?.openprojectUserId ??
      (rawOp ? Number(rawOp[1]) : null) ??
      extractOpAvatarUserId(this.directUrl());
    return opId != null ? `/api/integrations/openproject/users/${opId}/avatar` : null;
  });

  private lookupKey(): string {
    return (this.personId() || String(this.resolvedPerson()?.openprojectUserId ?? '') || this.name() || '').trim();
  }

  protected readonly isKnownFailed = computed(() => {
    const pId = this.personId()?.trim();
    if (pId && FAILED_AVATAR_USERS.has(pId)) return true;
    const nm = this.name()?.trim();
    if (nm && FAILED_AVATAR_USERS.has(nm)) return true;
    const op = this.resolvedPerson()?.openprojectUserId;
    if (op != null && (FAILED_AVATAR_USERS.has(String(op)) || FAILED_AVATAR_USERS.has(`op:${op}`))) return true;
    const rawOp = /^op:(\d+)$/i.exec((pId || nm || '').trim());
    if (rawOp && (FAILED_AVATAR_USERS.has(rawOp[1]) || FAILED_AVATAR_USERS.has(`op:${rawOp[1]}`))) return true;
    return false;
  });

  protected readonly resolvedUrl = computed(() => {
    if (this.isKnownFailed()) return null;
    if (this.imgStage() > 0) return null;
    const proxy = this.proxyUrl();
    if (proxy) return proxy;
    const direct = this.directUrl();
    if (!direct) return null;
    // Never send cross-origin requests directly to OpenProject or Gravatar endpoints from the browser.
    if (/(?:\/(?:api\/v3\/)?users\/\d+\/avatar|gravatar\.com\/avatar\/)/i.test(direct)) return null;
    return direct;
  });

  protected readonly displayName = computed(() => {
    const explicit = this.name()?.trim();
    if (explicit) return explicit;
    const person = this.resolvedPerson();
    return person?.nickname || person?.fullName || this.personId() || '?';
  });

  protected readonly isUnassigned = computed(() => {
    if (this.resolvedPerson()) return false;
    const raw = (this.name() ?? '').trim();
    if (!raw || raw === '-' || raw === '?') return true;
    return (
      raw.includes('ยังไม่ระบุ') ||
      raw.includes('ยังไม่มีผู้รับ') ||
      raw.includes('ยังไม่มอบหมาย') ||
      raw.includes('ยังไม่กำหนด') ||
      raw.includes('ไม่ระบุ') ||
      raw.toLowerCase() === 'unassigned' ||
      raw.toLowerCase() === 'none'
    );
  });

  protected readonly initials = computed(() => {
    if (this.isUnassigned()) return '';
    // Strip role/track suffix after middot (e.g. "ชนะชัย · Lead" -> "ชนะชัย")
    const raw = this.displayName().split('·')[0]?.trim() ?? '';
    if (!raw || raw === '-' || raw === '?') return '';

    // Strip parentheses, brackets and their contents (e.g. "Aimjit (เอม)" -> "Aimjit", "Chanachai (โอ๋) Otepim" -> "Chanachai Otepim")
    const withoutParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
    const cleanWithout = withoutParens.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    const words = cleanWithout ? cleanWithout.split(/\s+/).filter(Boolean) : [];

    if (words.length >= 2) {
      // First letter of first name + First letter of last name, e.g. "Chanachai Otepim" -> "CO"
      const first = Array.from(words[0]!)[0] ?? '';
      const last = Array.from(words[words.length - 1]!)[0] ?? '';
      return `${first}${last}`.toUpperCase();
    }
    if (words.length === 1) {
      // Single word: take first 2 characters (handles surrogate pairs and Thai characters)
      const chars = Array.from(words[0]!);
      return chars.slice(0, 2).join('').toUpperCase();
    }

    // Fallback: strip any non-letters/numbers and take first 2 characters
    const fallback = raw.replace(/[^\p{L}\p{N}]/gu, '');
    const chars = Array.from(fallback);
    return chars.slice(0, 2).join('').toUpperCase();
  });

  protected readonly fallbackBg = computed(() => {
    if (this.isUnassigned()) {
      return 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)';
    }
    const seed = this.resolvedPerson()?.id || this.displayName() || 'user';
    return AVATAR_GRADIENTS[hashIndex(seed)];
  });

  protected readonly showImage = computed(
    () => !this.isKnownFailed() && Boolean(this.resolvedUrl()) && this.imgStage() < 2,
  );

  constructor() {
    effect(() => {
      // Reset stage whenever target person or direct avatar URL changes
      this.resolvedPerson()?.id;
      this.directUrl();
      this.imgStage.set(0);
    });
  }

  protected onImgError(): void {
    const keys: string[] = [];
    const pId = this.personId()?.trim();
    if (pId) keys.push(pId);
    const nm = this.name()?.trim();
    if (nm) keys.push(nm);
    const op = this.resolvedPerson()?.openprojectUserId;
    if (op != null) {
      keys.push(String(op));
      keys.push(`op:${op}`);
    }
    const rawOp = /^op:(\d+)$/i.exec((pId || nm || '').trim());
    if (rawOp) {
      keys.push(rawOp[1]);
      keys.push(`op:${rawOp[1]}`);
    }
    recordFailedAvatar(keys);
    this.imgStage.set(2);
  }
}
