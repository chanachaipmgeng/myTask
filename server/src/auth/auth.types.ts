import { AccessRole, Person } from '../../../shared/domain/models';

export const SESSION_COOKIE = 'manday_session';

export interface AuthUser {
  person: Person;
  access: AccessRole;
}

export interface GitlabProfile {
  id: number;
  username: string;
  name: string;
  email: string | null;
}
