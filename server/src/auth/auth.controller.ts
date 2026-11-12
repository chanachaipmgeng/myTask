import { Body, Controller, Get, Post, Query, Res, Req } from '@nestjs/common';
import { Response } from 'express';
import { randomToken } from '../common/crypto';
import { AuthService } from './auth.service';
import { AuthedRequest, Public, readSession } from './auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('me')
  async me(@Req() req: AuthedRequest) {
    const user = req.authUser ?? null;
    if (!user) {
      return { authenticated: false, person: null };
    }
    return {
      authenticated: true,
      person: user.person,
      access: user.access,
    };
  }

  @Public()
  @Get('gitlab')
  startGitlab(@Res() res: Response): void {
    const state = randomToken(16);
    res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600_000 });
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
    if (!code || !state || !expected || state !== expected) {
      res.status(400).send('Invalid OAuth state');
      return;
    }
    const profile = await this.auth.exchangeGitlabCode(code);
    await this.auth.loginWithGitlabProfile(profile, res);
    res.redirect('/');
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
