import { getJwtSecret } from './jwt.config';

describe('getJwtSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return the secret if it is at least 32 characters long', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    expect(getJwtSecret()).toBe('a'.repeat(32));
  });

  it('should throw an error if JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(
      'JWT_SECRET environment variable is missing. It must be provided and be at least 32 characters long.',
    );
  });

  it('should throw an error if JWT_SECRET is less than 32 characters long', () => {
    process.env.JWT_SECRET = 'a'.repeat(31);
    expect(() => getJwtSecret()).toThrow(
      'JWT_SECRET must be at least 32 characters long for security purposes.',
    );
  });
});
