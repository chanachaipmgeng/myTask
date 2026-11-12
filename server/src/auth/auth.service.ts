import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AccessRole, Person } from '../../../shared/domain/models';
import { randomToken } from '../common/crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { Db } from '../db/db.service';
import { findPersonByGitlabUsername, getPerson, upsertPerson } from '../data/people.repo';
import { createSession, deleteSession, findSessionPersonId } from '../data/sessions.repo';
import { AuthUser, GitlabProfile, SESSION_COOKIE } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async userFromRequest(rawToken: string | undefined): Promise<AuthUser | null> {
    if (!rawToken) {
      return null;
    }
    const personId = await findSessionPersonId(this.db, rawToken);
    if (!personId) {
      return null;
    }
    const person = await getPerson(this.db, personId);
    if (!person) {
      return null;
    }
    return { person, access: (person.access ?? 'member') as AccessRole };
  }

  async requireUser(rawToken: string | undefined): Promise<AuthUser> {
    const user = await this.userFromRequest(rawToken);
    if (!user) {
      throw new UnauthorizedException('login required');
    }
    return user;
  }

  gitlabAuthorizeUrl(state: string): string {
    const { url, clientId } = this.config.gitlab;
    if (!url || !clientId) {
      throw new UnauthorizedException('GitLab OAuth is not configured');
    }
    const redirectUri = `${this.config.appUrl.replace(/4200$/, '3000')}/api/auth/gitlab/callback`;
    // Prefer API callback on the server host.
    const callback = this.oauthCallbackUrl();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: 'code',
      scope: 'read_user',
      state,
    });
    void redirectUri;
    return `${url}/oauth/authorize?${params.toString()}`;
  }

  oauthCallbackUrl(): string {
    // Server listens on PORT; OAuth redirect must hit the API, not the Angular app.
    const port = this.config.port;
    const base = this.config.appUrl.includes('4200')
      ? this.config.appUrl.replace('4200', String(port))
      : `http://127.0.0.1:${port}`;
    return `${base}/api/auth/gitlab/callback`;
  }

  async exchangeGitlabCode(code: string): Promise<GitlabProfile> {
    const { url, clientId, clientSecret } = this.config.gitlab;
    if (!url || !clientId || !clientSecret) {
      throw new UnauthorizedException('GitLab OAuth is not configured');
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.oauthCallbackUrl(),
    });
    const tokenRes = await fetch(`${url}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('GitLab token exchange failed');
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new UnauthorizedException('GitLab token missing');
    }
    const userRes = await fetch(`${url}/api/v4/user`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userRes.ok) {
      throw new UnauthorizedException('GitLab user fetch failed');
    }
    const profile = (await userRes.json()) as {
      id: number;
      username: string;
      name?: string;
      email?: string;
    };
    return {
      id: profile.id,
      username: profile.username,
      name: profile.name ?? profile.username,
      email: profile.email ?? null,
    };
  }

  async loginWithGitlabProfile(profile: GitlabProfile, res: Response): Promise<AuthUser> {
    let person = await findPersonByGitlabUsername(this.db, profile.username);
    if (!person) {
      const isBootstrap = this.config.gitlab.bootstrapAdmins.includes(profile.username.toLowerCase());
      if (!isBootstrap) {
        throw new UnauthorizedException('GitLab user is not linked to a person');
      }
      person = await upsertPerson(this.db, {
        id: `gl-${profile.username.toLowerCase()}`,
        nickname: profile.name || profile.username,
        fullName: profile.name || profile.username,
        role: 'Admin',
        level: 'Senior',
        track: 'Implement',
        plannedMd: 3.5,
        access: 'admin',
        email: profile.email,
        gitlabUsername: profile.username,
        teamId: 'implement',
      });
    }
    return this.issueSession(person, res);
  }

  async loginAsPerson(personId: string, res: Response): Promise<AuthUser> {
    if (!this.config.devLogin) {
      throw new UnauthorizedException('dev login is disabled');
    }
    const person = await getPerson(this.db, personId);
    if (!person) {
      throw new UnauthorizedException('person not found');
    }
    return this.issueSession(person, res);
  }

  async logout(rawToken: string | undefined, res: Response): Promise<void> {
    if (rawToken) {
      await deleteSession(this.db, rawToken);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  private async issueSession(person: Person, res: Response): Promise<AuthUser> {
    const token = randomToken(32);
    const expires = new Date(Date.now() + this.config.sessionDays * 86_400_000);
    await createSession(this.db, person.id, token, expires);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.production,
      path: '/',
      expires,
    });
    await this.db.audit(person.id, 'auth.login', person.id, { access: person.access });
    return { person, access: (person.access ?? 'member') as AccessRole };
  }
}
