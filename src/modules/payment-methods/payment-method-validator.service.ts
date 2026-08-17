import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '../../common/errors';

/**
 * Minimal view of a payment provider that the validation engine needs.
 * Anything exposing `name` (plus optional `countryCode`/`type`) is accepted,
 * so callers can pass a full Prisma `payment_provider` row or a plain object.
 */
export interface PaymentProviderInfo {
  name: string;
  type?: string;
  countryCode?: string | null;
}

export type AccountIdentifierValidator = (accountIdentifier: string) => boolean;

export const INVALID_ACCOUNT_IDENTIFIER_MESSAGE =
  'Invalid account identifier for the selected payment provider.';

// ── Shared primitives ──────────────────────────────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Costa Rican phone number, as used by SINPE Móvil.
 * Accepts optional country code (+506 / 506 / 00506) and any common
 * separator (spaces, dashes, parentheses). A valid number is exactly
 * 8 digits and starts with a mobile prefix (6, 7 or 8).
 */
function isValidCostaRicanPhone(value: string): boolean {
  const digits = stripNonDigits(value);
  const normalized = digits.replace(/^(00506|506)/, '');
  return /^[678]\d{7}$/.test(normalized);
}

/**
 * Venezuelan phone number, as used by Pago Móvil.
 * Accepts the national `04XX-XXXXXXX` form (with optional separators) and
 * the international `+58 4XX-XXXXXXX` form. A valid number is 11 digits
 * starting with `04` and one of the mobile prefixes (412, 414, 416, 424, 426).
 */
function isValidVenezuelanPhone(value: string): boolean {
  const digits = stripNonDigits(value);
  let normalized = digits;
  if (/^58/.test(digits)) {
    normalized = `0${digits.slice(2)}`;
  }
  return /^04(12|14|16|24|26)\d{7}$/.test(normalized);
}

/**
 * ISO 13616 IBAN. Length is validated against a per-country table when the
 * country is known, and the check digits are always verified with the
 * standard mod-97 algorithm.
 */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SC: 31,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
};

function mod97(value: string): number {
  let remainder = 0;
  for (let i = 0; i < value.length; i += 7) {
    remainder = Number(remainder + value.slice(i, i + 7)) % 97;
  }
  return remainder;
}

function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) return false;

  const countryCode = iban.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (expectedLength !== undefined && iban.length !== expectedLength) {
    return false;
  }
  if (iban.length < 15 || iban.length > 34) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    numeric += code >= 48 && code <= 57 ? char : String(code - 55);
  }
  return mod97(numeric) === 1;
}

/**
 * Brazilian CPF (Cadastro de Pessoas Físicas). 11 digits with two check
 * digits. Rejects all-identical sequences such as `111.111.111-11`.
 */
function isValidCpf(value: string): boolean {
  const digits = stripNonDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  const first = (sum * 10) % 11;
  if ((first === 10 ? 0 : first) !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  const second = (sum * 10) % 11;
  return (second === 10 ? 0 : second) === Number(digits[10]);
}

/**
 * Brazilian mobile phone, as used by Pix. Accepts the national 11-digit form
 * (DDD + 9XXXXXXXX) and the international `+55` form. Pix only accepts mobile
 * numbers, so the third digit must be the mobile `9` marker.
 */
function isValidBrazilianPhone(value: string): boolean {
  const digits = stripNonDigits(value);
  const normalized = digits.replace(/^55(?=[1-9])/, '');
  return /^[1-9]\d9\d{8}$/.test(normalized);
}

/**
 * Pix keys are one of: CPF, e-mail, phone number, or a random (UUID) key.
 */
function isValidPixKey(value: string): boolean {
  return (
    isValidCpf(value) ||
    isValidEmail(value) ||
    isValidBrazilianPhone(value) ||
    UUID_PATTERN.test(value.trim())
  );
}

/**
 * Fallback for providers without a registered rule: rejects empty values
 * but otherwise accepts any identifier, so adding a new provider to the
 * catalog never breaks existing behavior.
 */
function defaultValidator(accountIdentifier: string): boolean {
  return (
    typeof accountIdentifier === 'string' && accountIdentifier.trim().length > 0
  );
}

/**
 * Centralized payment method validation engine.
 *
 * Every payment provider's `accountIdentifier` is validated before being
 * persisted. Rules are registered under a normalized provider name (see the
 * constructor) and can be extended at runtime via {@link registerValidator},
 * so new providers can be supported without touching existing logic.
 */
@Injectable()
export class PaymentMethodValidatorService {
  private readonly validators = new Map<string, AccountIdentifierValidator>();

  constructor() {
    // SINPE Móvil → Costa Rican mobile phone
    this.registerValidator('sinpe movil', isValidCostaRicanPhone);
    // Pago Móvil (Venezuela) → Venezuelan mobile phone
    this.registerValidator('pago movil', isValidVenezuelanPhone);
    // PayPal → e-mail address
    this.registerValidator('paypal', isValidEmail);
    // IBAN banks → valid ISO 13616 IBAN
    this.registerValidator('iban bank', isValidIban);
    // Pix → CPF, e-mail, phone or random key
    this.registerValidator('pix', isValidPixKey);
  }

  /**
   * Provider names are matched case- and diacritic-insensitively after
   * trimming (e.g. `SINPE Móvil` matches the registered `sinpe movil`).
   */
  registerValidator(name: string, validator: AccountIdentifierValidator): this {
    this.validators.set(this.normalizeName(name), validator);
    return this;
  }

  /**
   * Non-throwing check. Returns `true` when the identifier passes the rule
   * selected by the provider (or the default rule when none is registered).
   */
  isValid(provider: PaymentProviderInfo, accountIdentifier: string): boolean {
    const validator = this.validators.get(this.normalizeName(provider.name));
    const rule = validator ?? defaultValidator;
    return rule(accountIdentifier);
  }

  /**
   * Throwing variant used by write paths. Throws a 400 AppException
   * (INVALID_ACCOUNT_IDENTIFIER) when the identifier does not match the
   * selected provider's format; otherwise returns `true`.
   */
  validate(provider: PaymentProviderInfo, accountIdentifier: string): true {
    if (!this.isValid(provider, accountIdentifier)) {
      throw new AppException(
        ErrorCode.INVALID_ACCOUNT_IDENTIFIER,
        INVALID_ACCOUNT_IDENTIFIER_MESSAGE,
      );
    }
    return true;
  }

  private normalizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
