import { SetMetadata } from '@nestjs/common';

export const IS_CSRF_EXEMPT_KEY = 'isCsrfExempt';

/**
 * Decorator to mark a controller or handler as exempt from CSRF validation.
 * Use for server-to-server webhooks or public callback endpoints protected by alternative mechanisms (e.g., HMAC signatures).
 */
export const CsrfExempt = () => SetMetadata(IS_CSRF_EXEMPT_KEY, true);
