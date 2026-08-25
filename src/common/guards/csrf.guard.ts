import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { AppException, ErrorCode } from '../errors';
import { IS_CSRF_EXEMPT_KEY } from '../decorators/csrf-exempt.decorator';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../config/cookie.config';

/**
 * Parses raw cookie strings into key-value pairs.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // 1. WebSocket / non-HTTP contexts pass through
    if (!req || !req.method) {
      return true;
    }

    // 2. Safe read-only HTTP methods (GET, HEAD, OPTIONS) are exempt
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method.toUpperCase())) {
      return true;
    }

    // 3. Check for @CsrfExempt() decorator on handler or class
    const isExempt = this.reflector.getAllAndOverride<boolean>(
      IS_CSRF_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isExempt) {
      return true;
    }

    // 4. Extract token from cookie (req.cookies or parse req.headers.cookie)
    const rawCookies =
      (req.cookies as Record<string, string> | undefined) ||
      parseCookies(
        typeof req.headers?.cookie === 'string'
          ? req.headers.cookie
          : undefined,
      );
    const rawCookieToken = rawCookies[CSRF_COOKIE_NAME];
    const cookieToken =
      typeof rawCookieToken === 'string' ? rawCookieToken.trim() : undefined;

    // 5. Extract token from header or body
    const headerToken =
      (req.headers[CSRF_HEADER_NAME] as string | undefined) ||
      (req.headers['x-xsrf-token'] as string | undefined) ||
      (req.body as Record<string, unknown> | undefined)?._csrf ||
      (req.body as Record<string, unknown> | undefined)?.csrfToken;

    const submittedToken =
      typeof headerToken === 'string' ? headerToken.trim() : undefined;

    if (!cookieToken || !submittedToken) {
      throw new AppException(
        ErrorCode.CSRF_TOKEN_MISSING,
        'CSRF token missing from cookie or request header',
        HttpStatus.FORBIDDEN,
      );
    }

    // 6. Timing-safe comparison using crypto.timingSafeEqual
    const cookieBuffer = Buffer.from(cookieToken, 'utf-8');
    const submittedBuffer = Buffer.from(submittedToken, 'utf-8');

    if (
      cookieBuffer.length !== submittedBuffer.length ||
      !crypto.timingSafeEqual(cookieBuffer, submittedBuffer)
    ) {
      throw new AppException(
        ErrorCode.CSRF_TOKEN_INVALID,
        'Invalid CSRF token',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
