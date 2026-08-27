process.env.JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
    ? process.env.JWT_SECRET
    : 'test-jwt-secret-that-is-at-least-32-characters-long!';
