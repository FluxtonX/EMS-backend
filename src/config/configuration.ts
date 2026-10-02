const jwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (
  isProduction &&
  (!jwtSecret || jwtSecret.length < 32 || /production_grade_secret_key|change_in_production/i.test(jwtSecret))
) {
  throw new Error('Set JWT_SECRET to a random value of at least 32 characters in production');
}

export default () => ({
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  database: {
    supabaseUrl: process.env.SUPABASE_URL || 'https://mock-supabase.supabase.co',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_strict_entropy_key_32_chars_min',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  brevo: {
    apiKey: process.env.BREVO_API_KEY || '',
    senderEmail: process.env.BREVO_SENDER_EMAIL || 'notifications@workforce.co.uk',
    senderName: process.env.BREVO_SENDER_NAME || 'Workforce Platform',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  },
});
