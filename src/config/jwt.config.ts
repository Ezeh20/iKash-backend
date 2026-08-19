export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is missing. It must be provided and be at least 32 characters long.');
  }
  
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long for security purposes.');
  }

  return secret;
}
