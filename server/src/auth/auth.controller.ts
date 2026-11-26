import { Body, Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { randomToken, timingSafeEqualStr } from '../common/crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { listPeople } from '../data/people.repo';
import { Db } from '../db/db.service';
import { AuthedRequest, Public, readSession } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('me')
  async me(@Req() req: AuthedRequest) {
    const user = req.authUser ?? null;
    if (!user) {
      return { authenticated: false, person: null, devLoginEnabled: this.config.devLogin };
    }
    return {
      authenticated: true,
      person: user.person,
      access: user.access,
      devLoginEnabled: this.config.devLogin,
    };
  }

  @Public()
  @Get('dev-roster')
  async devRoster() {
    if (!this.config.devLogin || this.config.production) {
      return { enabled: false, people: [] };
    }
    const rawPeople = await listPeople(this.db, true);
    return {
      enabled: true,
      people: rawPeople.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        fullName: p.fullName,
        role: p.role,
        department: p.department ?? '',
        access: p.access ?? 'member',
      })),
    };
  }

  @Public()
  @Get('gitlab')
  startGitlab(@Res() res: Response): void {
    const state = randomToken(16);
    res.cookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.production,
      path: '/',
      maxAge: 600_000,
    });
    res.redirect(this.auth.gitlabAuthorizeUrl(state));
  }

  @Public()
  @Get('gitlab/callback')
  async gitlabCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const expected = cookies?.['oauth_state'];
    res.clearCookie('oauth_state', { path: '/' });
    if (!code || !state || !expected || !timingSafeEqualStr(state, expected)) {
      res.status(400).send('Invalid OAuth state');
      return;
    }
    const profile = await this.auth.exchangeGitlabCode(code);
    await this.auth.loginWithGitlabProfile(profile, res);
    res.redirect(`${this.config.appUrl}/me`);
  }

  @Public()
  @Post('dev')
  async devLogin(@Body() body: { personId?: string }, @Res({ passthrough: true }) res: Response) {
    if (!body.personId) {
      return { ok: false, message: 'personId required' };
    }
    const user = await this.auth.loginAsPerson(body.personId, res);
    return { ok: true, person: user.person, access: user.access };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readSession(req), res);
    return { ok: true };
  }
}
