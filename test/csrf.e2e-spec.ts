import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../src/config/cookie.config';

import express from 'express';

describe('CSRF Protection (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (
        req: express.Request,
        _res: express.Response,
        next: express.NextFunction,
      ) => {
        if (!req.cookies) {
          const parsedCookies: Record<string, string> = {};
          if (typeof req.headers.cookie === 'string') {
            for (const cookie of req.headers.cookie.split(';')) {
              const [key, ...val] = cookie.trim().split('=');
              if (key) {
                parsedCookies[key] = decodeURIComponent(val.join('='));
              }
            }
          }
          req.cookies = parsedCookies;
        }
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /auth/csrf - issues a CSRF token and sets the _csrf SameSite cookie', async () => {
    const res = await request(app.getHttpServer()).get('/auth/csrf');
    const body = res.body as { csrfToken?: string };

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('csrfToken');
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken?.length).toBeGreaterThan(0);

    const cookies = res.get('Set-Cookie');
    expect(cookies).toBeDefined();
    const csrfCookie = cookies?.find((c: string) =>
      c.startsWith(`${CSRF_COOKIE_NAME}=`),
    );
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toContain('HttpOnly');
    expect(csrfCookie?.toLowerCase()).toContain('samesite=');
  });

  it('GET /orders - read-only endpoints are exempt from CSRF validation', async () => {
    const res = await request(app.getHttpServer()).get('/orders');
    expect(res.status).not.toBe(403);
  });

  it('POST /escrows/open - rejects state-changing request without CSRF token with 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .post('/escrows/open')
      .send({ orderId: '123' });
    const body = res.body as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('CSRF_TOKEN_MISSING');
  });

  it('POST /escrows/open - rejects state-changing request with mismatched CSRF token with 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .post('/escrows/open')
      .set('Cookie', [`${CSRF_COOKIE_NAME}=token-in-cookie-1234567890`])
      .set(CSRF_HEADER_NAME, 'different-token-in-header-1234567890')
      .send({ orderId: '123' });
    const body = res.body as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('CSRF_TOKEN_INVALID');
  });

  it('POST /escrows/open - allows request when CSRF cookie matches X-CSRF-Token header', async () => {
    const token = 'valid-test-csrf-token-1234567890abcdef';
    const res = await request(app.getHttpServer())
      .post('/escrows/open')
      .set('Cookie', [`${CSRF_COOKIE_NAME}=${token}`])
      .set(CSRF_HEADER_NAME, token)
      .send({ orderId: '123' });

    // The request passes CSRF guard; any subsequent validation failure (e.g., 400 Bad Request) proves CSRF 403 was bypassed
    expect(res.status).not.toBe(403);
  });

  it('POST /kyc/webhook - @CsrfExempt() route bypasses CSRF check even without tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/kyc/webhook')
      .send({});

    // KYC webhook requires signature headers, so it fails with signature error (400/500/etc), but NOT CSRF 403!
    expect(res.status).not.toBe(403);
  });
});
