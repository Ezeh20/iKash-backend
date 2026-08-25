import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  getCsrfCookieOptions,
} from './cookie.config';

describe('cookie.config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should export CSRF_COOKIE_NAME and CSRF_HEADER_NAME', () => {
    expect(CSRF_COOKIE_NAME).toBe('_csrf');
    expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
  });

  it('should default to sameSite: "lax" and secure: false in non-production environments', () => {
    delete process.env.NODE_ENV;
    delete process.env.CSRF_COOKIE_SAME_SITE;

    const options = getCsrfCookieOptions();
    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  });

  it('should default to sameSite: "none" and secure: true in production environment', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CSRF_COOKIE_SAME_SITE;

    const options = getCsrfCookieOptions();
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  });

  it('should allow overriding sameSite via CSRF_COOKIE_SAME_SITE in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CSRF_COOKIE_SAME_SITE = 'strict';

    const options = getCsrfCookieOptions();
    expect(options.sameSite).toBe('strict');
    expect(options.secure).toBe(true);
  });

  it('should allow overriding sameSite via CSRF_COOKIE_SAME_SITE in non-production', () => {
    process.env.NODE_ENV = 'development';
    process.env.CSRF_COOKIE_SAME_SITE = 'none';

    const options = getCsrfCookieOptions();
    expect(options.sameSite).toBe('none');
    expect(options.secure).toBe(false);
  });
});
