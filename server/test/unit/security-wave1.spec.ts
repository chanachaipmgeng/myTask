import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '../../src/auth/auth.service';
import { decryptSecret, encryptSecret, timingSafeEqualStr } from '../../src/common/crypto';
import { sanitizeEvidenceUrl, validateExternalUrl } from '../../src/common/security';
import { INSECURE_DEV_TOKEN_ENC_KEY, readConfig } from '../../src/config';
import { csvEscape } from '../../src/api/work-items.controller';

describe('Wave 1 Security Hardening', () => {
  it('rejects default placeholder TOKEN_ENC_KEY in production', () => {
    assert.throws(
      () =>
        readConfig({
          NODE_ENV: 'production',
          TOKEN_ENC_KEY: INSECURE_DEV_TOKEN_ENC_KEY,
        }),
      /TOKEN_ENC_KEY/,
    );

    assert.throws(
      () =>
        readConfig({
          NODE_ENV: 'production',
          TOKEN_ENC_KEY: 'too-short',
        }),
      /TOKEN_ENC_KEY/,
    );

    const valid = readConfig({
      NODE_ENV: 'production',
      TOKEN_ENC_KEY: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6',
    });
    assert.equal(valid.production, true);
    assert.equal(valid.devLogin, false);
  });

  it('encrypts with v1 HKDF and decrypts both v1 and rotated prevKeys', () => {
    const key1 = 'primary-secret-key-at-least-32-chars!!';
    const key2 = 'rotated-new-key-at-least-32-chars!!!!';
    const sealed = encryptSecret('glpat-super-secret', key1);
    assert.ok(sealed.startsWith('v1.'));
    assert.equal(decryptSecret(sealed, key1), 'glpat-super-secret');
    assert.equal(decryptSecret(sealed, key2, [key1]), 'glpat-super-secret');
    assert.throws(() => decryptSecret(sealed, key2), /decryption failed/);
    assert.throws(() => decryptSecret('bad', key1), /malformed/);
  });

  it('derives GitLab OAuth callback URL properly for production and Docker', () => {
    const makeSvc = (overrides: Record<string, string>) => {
      const cfg = readConfig({
        NODE_ENV: overrides['NODE_ENV'] ?? 'development',
        TOKEN_ENC_KEY: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6',
        ...overrides,
      });
      return new AuthService({} as never, cfg);
    };

    assert.equal(
      makeSvc({ NODE_ENV: 'production', APP_URL: 'https://scorecard.example.com' }).oauthCallbackUrl(),
      'https://scorecard.example.com/api/auth/gitlab/callback',
    );
    assert.equal(
      makeSvc({ APP_URL: 'http://localhost:8080' }).oauthCallbackUrl(),
      'http://localhost:8080/api/auth/gitlab/callback',
    );
    assert.equal(
      makeSvc({ APP_URL: 'http://127.0.0.1:4200', PORT: '3000' }).oauthCallbackUrl(),
      'http://127.0.0.1:3000/api/auth/gitlab/callback',
    );
    assert.equal(
      makeSvc({
        NODE_ENV: 'production',
        APP_URL: 'https://scorecard.example.com',
        OAUTH_CALLBACK_URL: 'https://api.example.com/api/auth/gitlab/callback',
      }).oauthCallbackUrl(),
      'https://api.example.com/api/auth/gitlab/callback',
    );
  });

  it('validates external integration URLs and sanitizes evidenceUrl', () => {
    assert.throws(
      () => validateExternalUrl('http://op.example.com', { production: true }),
      /HTTPS/,
    );
    assert.throws(
      () => validateExternalUrl('https://169.254.169.254/latest', { production: false }),
      /Disallowed/,
    );
    assert.throws(
      () => validateExternalUrl('https://127.0.0.1:3000', { production: true }),
      /Loopback/,
    );
    assert.throws(
      () =>
        validateExternalUrl('https://evil.example.com', {
          production: true,
          allowedHosts: ['myproject.example.com'],
        }),
      /ALLOWED_INTEGRATION_HOSTS/,
    );
    assert.equal(
      validateExternalUrl('https://myproject.example.com/', {
        production: true,
        allowedHosts: ['myproject.example.com'],
      }),
      'https://myproject.example.com',
    );

    assert.throws(() => sanitizeEvidenceUrl('javascript:alert(1)'), /http or https/);
    assert.equal(sanitizeEvidenceUrl('https://gitlab.example.com/mr/1'), 'https://gitlab.example.com/mr/1');
  });

  it('performs constant-time comparison and neutralizes CSV formula injection', () => {
    assert.equal(timingSafeEqualStr('secret-token', 'secret-token'), true);
    assert.equal(timingSafeEqualStr('secret-token', 'secret-tokeN'), false);
    assert.equal(timingSafeEqualStr('short', 'much-longer-token'), false);

    assert.equal(csvEscape('=SUM(A1:A2)'), `"'=SUM(A1:A2)"`.replace(/^"|"$/g, ''));
    assert.equal(csvEscape('+cmd|calc'), "'+cmd|calc");
    assert.equal(csvEscape('-1+1'), "'-1+1");
    assert.equal(csvEscape('@SUM(1,2)'), `"'@SUM(1,2)"`);
    assert.equal(csvEscape('@cmd'), "'@cmd");
    assert.equal(csvEscape('normal title'), 'normal title');
  });
});
