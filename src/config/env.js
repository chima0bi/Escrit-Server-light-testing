// Central place for reading and validating environment variables.
// Nothing else in the codebase should call `process.env` directly —
// that way missing config fails loudly, once, at startup.
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  mongodbUri: required('MONGODB_URI'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },

  paystack: {
    secretKey: required('PAYSTACK_SECRET_KEY'),
    publicKey: required('PAYSTACK_PUBLIC_KEY'),
    baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  },

  autoReleaseHours: Number(process.env.AUTO_RELEASE_HOURS) || 72,

  // Comma-separated seller emails allowed to resolve disputes / hit the
  // internal admin routes. Empty by default so a missing config fails
  // *closed* (403 on every admin route) rather than silently letting
  // any authenticated seller resolve any other seller's dispute.
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
