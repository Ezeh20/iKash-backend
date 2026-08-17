import { Test, TestingModule } from '@nestjs/testing';
import {
  INVALID_ACCOUNT_IDENTIFIER_MESSAGE,
  PaymentMethodValidatorService,
  PaymentProviderInfo,
} from './payment-method-validator.service';
import { AppException, ErrorCode } from '../../common/errors';

describe('PaymentMethodValidatorService', () => {
  let service: PaymentMethodValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentMethodValidatorService],
    }).compile();

    service = module.get(PaymentMethodValidatorService);
  });

  const provider = (name: string): PaymentProviderInfo => ({ name });

  describe('PayPal (e-mail)', () => {
    it('accepts valid e-mails', () => {
      for (const email of [
        'user@example.com',
        'first.last+tag@sub.domain.co',
        'pix-user_42@paypal.com',
      ]) {
        expect(service.isValid(provider('PayPal'), email)).toBe(true);
      }
    });

    it('rejects invalid e-mails', () => {
      for (const email of [
        'not-an-email',
        'user@',
        '@domain.com',
        'user name@example.com',
        '',
      ]) {
        expect(service.isValid(provider('PayPal'), email)).toBe(false);
      }
    });
  });

  describe('SINPE Móvil (Costa Rican phone)', () => {
    it('accepts valid Costa Rican mobile numbers', () => {
      for (const phone of [
        '61234567',
        '7123-4567',
        '8000 1234',
        '+506 6123 4567',
        '50661234567',
      ]) {
        expect(service.isValid(provider('SINPE Móvil'), phone)).toBe(true);
      }
    });

    it('rejects invalid Costa Rican phone numbers', () => {
      for (const phone of [
        '12345678',
        '51234567',
        '6123456',
        '612345678',
        '+507 6123 4567',
        '',
      ]) {
        expect(service.isValid(provider('SINPE Móvil'), phone)).toBe(false);
      }
    });
  });

  describe('Pago Móvil (Venezuelan phone)', () => {
    it('accepts valid Venezuelan mobile numbers', () => {
      for (const phone of [
        '04121234567',
        '0414-1234567',
        '0416 123 4567',
        '+58 412-1234567',
        '+58 4241234567',
      ]) {
        expect(service.isValid(provider('Pago Movil'), phone)).toBe(true);
      }
    });

    it('rejects invalid Venezuelan phone numbers', () => {
      for (const phone of [
        '4121234567',
        '04111234567',
        '04171234567',
        '02121234567',
        '12345678901',
        '',
      ]) {
        expect(service.isValid(provider('Pago Movil'), phone)).toBe(false);
      }
    });
  });

  describe('IBAN Bank', () => {
    it('accepts valid IBANs with or without spaces', () => {
      for (const iban of [
        'DE89370400440532013000',
        'DE89 3704 0044 0532 0130 00',
        'GB29NWBK60161331926819',
        'FR1420041010050500013M02606',
      ]) {
        expect(service.isValid(provider('IBAN Bank'), iban)).toBe(true);
      }
    });

    it('rejects invalid IBANs', () => {
      for (const iban of [
        'DE89370400440532013001',
        'GB29NWBK6016133192681',
        'ZZ89370400440532013000',
        'DE8937040044053201',
        'ABC',
        '',
      ]) {
        expect(service.isValid(provider('IBAN Bank'), iban)).toBe(false);
      }
    });
  });

  describe('Pix', () => {
    it('accepts a valid CPF', () => {
      expect(service.isValid(provider('Pix'), '529.982.247-25')).toBe(true);
      expect(service.isValid(provider('Pix'), '52998224725')).toBe(true);
    });

    it('rejects an invalid CPF', () => {
      expect(service.isValid(provider('Pix'), '111.111.111-11')).toBe(false);
      expect(service.isValid(provider('Pix'), '123.456.789-10')).toBe(false);
    });

    it('accepts an e-mail key', () => {
      expect(service.isValid(provider('Pix'), 'user@example.com')).toBe(true);
    });

    it('accepts a Brazilian phone key', () => {
      expect(service.isValid(provider('Pix'), '+55 11 91234 5678')).toBe(true);
      expect(service.isValid(provider('Pix'), '11912345678')).toBe(true);
    });

    it('rejects an invalid phone key', () => {
      expect(service.isValid(provider('Pix'), '1191234567')).toBe(false);
    });

    it('accepts a random (UUID) key', () => {
      expect(
        service.isValid(
          provider('Pix'),
          '123e4567-e89b-12d3-a456-426614174000',
        ),
      ).toBe(true);
    });

    it('rejects unsupported Pix keys', () => {
      expect(service.isValid(provider('Pix'), 'not-a-pix-key')).toBe(false);
      expect(service.isValid(provider('Pix'), '')).toBe(false);
    });
  });

  describe('default rule for unknown providers', () => {
    it('accepts any non-empty identifier', () => {
      expect(
        service.isValid(provider('Some Future Provider'), 'anything-at-all'),
      ).toBe(true);
    });

    it('rejects empty identifiers', () => {
      expect(service.isValid(provider('Some Future Provider'), '')).toBe(false);
      expect(service.isValid(provider('Some Future Provider'), '   ')).toBe(
        false,
      );
    });
  });

  describe('extensibility', () => {
    it('lets new providers register a rule without modifying existing logic', () => {
      service.registerValidator('custom provider', (id) => id === 'secret');

      expect(service.isValid(provider('Custom Provider'), 'secret')).toBe(true);
      expect(service.isValid(provider('Custom Provider'), 'other')).toBe(false);
    });
  });

  describe('validate', () => {
    it('returns true for a valid identifier', () => {
      expect(service.validate(provider('PayPal'), 'user@example.com')).toBe(
        true,
      );
    });

    it('throws a 400 INVALID_ACCOUNT_IDENTIFIER for an invalid identifier', () => {
      try {
        service.validate(provider('PayPal'), 'not-an-email');
        fail('expected validate to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(400);
        const body = (error as AppException).getResponse() as {
          error: ErrorCode;
          message: string;
        };
        expect(body.error).toBe(ErrorCode.INVALID_ACCOUNT_IDENTIFIER);
        expect(body.message).toBe(INVALID_ACCOUNT_IDENTIFIER_MESSAGE);
      }
    });
  });
});
