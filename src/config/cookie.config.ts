import type { CookieOptions } from 'express';

export const CSRF_COOKIE_NAME = '_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const getCsrfCookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredSameSite = process.env.CSRF_COOKIE_SAME_SITE as
    | 'lax'
    | 'strict'
    | 'none'
    | undefined;

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: configuredSameSite ?? (isProduction ? 'none' : 'lax'),
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };
};
