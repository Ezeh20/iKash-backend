import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard, parseCookies } from './csrf.guard';
import { AppException, ErrorCode } from '../errors';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../config/cookie.config';

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new CsrfGuard(reflector);
  });

  const createMockContext = (
    req: Record<string, unknown>,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('parseCookies helper', () => {
    it('should parse cookie string correctly', () => {
      const parsed = parseCookies('_csrf=abc123token; session=xyz; foo=bar');
      expect(parsed).toEqual({
        _csrf: 'abc123token',
        session: 'xyz',
        foo: 'bar',
      });
    });

    it('should handle undefined or empty string', () => {
      expect(parseCookies(undefined)).toEqual({});
      expect(parseCookies('')).toEqual({});
    });
  });

  describe('canActivate', () => {
    it('should allow GET, HEAD, and OPTIONS requests without tokens', () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        const ctx = createMockContext({ method, headers: {} });
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('should allow non-HTTP or socket contexts without method', () => {
      const ctx = createMockContext({});
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow state-changing requests if endpoint is marked @CsrfExempt()', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const ctx = createMockContext({
        method: 'POST',
        headers: {},
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should pass state-changing requests when cookie token matches header token', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const token = 'a'.repeat(64);
      const ctx = createMockContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: token },
        headers: { [CSRF_HEADER_NAME]: token },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should pass state-changing requests when cookie is parsed from raw headers.cookie', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const token = 'b'.repeat(64);
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          cookie: `${CSRF_COOKIE_NAME}=${token}`,
          [CSRF_HEADER_NAME]: token,
        },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should pass state-changing requests when token is in request body', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const token = 'c'.repeat(64);
      const ctx = createMockContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: token },
        headers: {},
        body: { _csrf: token },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should throw 403 Forbidden with CSRF_TOKEN_MISSING when cookie token is missing', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const ctx = createMockContext({
        method: 'POST',
        cookies: {},
        headers: { [CSRF_HEADER_NAME]: 'some-token' },
      });

      try {
        guard.canActivate(ctx);
        fail('Should have thrown AppException');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        const appErr = err as AppException;
        const resp = appErr.getResponse() as {
          error: ErrorCode;
          statusCode: number;
        };
        expect(resp.error).toBe(ErrorCode.CSRF_TOKEN_MISSING);
        expect(appErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should throw 403 Forbidden with CSRF_TOKEN_MISSING when submitted token is missing', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const ctx = createMockContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'some-token' },
        headers: {},
      });

      try {
        guard.canActivate(ctx);
        fail('Should have thrown AppException');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        const appErr = err as AppException;
        const resp = appErr.getResponse() as {
          error: ErrorCode;
          statusCode: number;
        };
        expect(resp.error).toBe(ErrorCode.CSRF_TOKEN_MISSING);
        expect(appErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should throw 403 Forbidden with CSRF_TOKEN_INVALID when tokens mismatch', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const ctx = createMockContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'token-one-1234567890' },
        headers: { [CSRF_HEADER_NAME]: 'token-two-1234567890' },
      });

      try {
        guard.canActivate(ctx);
        fail('Should have thrown AppException');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        const appErr = err as AppException;
        const resp = appErr.getResponse() as {
          error: ErrorCode;
          statusCode: number;
        };
        expect(resp.error).toBe(ErrorCode.CSRF_TOKEN_INVALID);
        expect(appErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should throw 403 Forbidden with CSRF_TOKEN_INVALID when tokens have different lengths', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const ctx = createMockContext({
        method: 'POST',
        cookies: { [CSRF_COOKIE_NAME]: 'short-token' },
        headers: { [CSRF_HEADER_NAME]: 'a-much-longer-token-value' },
      });

      try {
        guard.canActivate(ctx);
        fail('Should have thrown AppException');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        const appErr = err as AppException;
        const resp = appErr.getResponse() as {
          error: ErrorCode;
          statusCode: number;
        };
        expect(resp.error).toBe(ErrorCode.CSRF_TOKEN_INVALID);
        expect(appErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });
});
