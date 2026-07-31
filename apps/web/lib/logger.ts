import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const redactPaths = [
  'Authorization',
  'authorization',
  'Cookie',
  'cookie',
  'headers.Authorization',
  'headers.authorization',
  'headers.Cookie',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LOOPS_API_KEY',
  'MCP_TOKEN_SECRET',
  'OPENAI_API_KEY',
  '*.token',
  '*.jwt',
  '*.password',
  '*.secret',
  'context.user.password',
  'context.user.emailConfirmToken',
  'context.session.access_token',
  'context.session.refresh_token',
];

export const logger = pino({
  level: LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
    remove: false,
  },
  base: {
    env: process.env.NODE_ENV,
    service: '@pm-operator/web',
  },
});

export default logger;
