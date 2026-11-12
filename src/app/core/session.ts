import { computed, signal } from '@angular/core';
import { AccessRole, Person } from './models';

export interface SessionUser {
  person: Person;
  access: AccessRole;
}

const sessionUser = signal<SessionUser | null>(null);

export const currentSession = sessionUser.asReadonly();

export const sessionAccess = computed(() => sessionUser()?.access ?? null);

export function setSessionUser(person: Person | null, access: AccessRole | null): void {
  if (!person || !access) {
    sessionUser.set(null);
    return;
  }
  sessionUser.set({ person, access });
}
