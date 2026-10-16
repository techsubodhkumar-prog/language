export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_PREFIX: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_JWT_SECRET?: string;
  CORS_ORIGIN?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CONFIG?: string;
  FCM_SERVER_KEY?: string;
  DATABASE_SSL_REJECT_UNAUTHORIZED?: string;
  DATABASE_CA_CERT?: string;
  PGSSLROOTCERT?: string;
  CRON_SECRET?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnv = (config.NODE_ENV as string) || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV: ${nodeEnv}. Must be development, production, or test.`,
    );
  }

  const rawPort =
    typeof config.PORT === 'string' || typeof config.PORT === 'number'
      ? config.PORT.toString()
      : '3000';
  const port = Number(rawPort);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(
      `Invalid PORT: ${rawPort}. Must be a valid port number between 1 and 65535.`,
    );
  }

  const apiPrefix = (config.API_PREFIX as string) || 'api/v1';

  const databaseUrl = config.DATABASE_URL as string | undefined;
  const supabaseUrl = config.SUPABASE_URL as string | undefined;
  const supabaseAnonKey = config.SUPABASE_ANON_KEY as string | undefined;
  const supabaseJwtSecret = config.SUPABASE_JWT_SECRET as string | undefined;

  // Strict production assertions to prevent cloud deployment misconfiguration
  if (nodeEnv === 'production') {
    if (!databaseUrl || databaseUrl.includes('placeholder')) {
      throw new Error(
        'DATABASE_URL is required in production and must not be a placeholder.',
      );
    }
    if (
      !databaseUrl.startsWith('postgresql://') &&
      !databaseUrl.startsWith('postgres://')
    ) {
      throw new Error(
        'DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://',
      );
    }

    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      throw new Error(
        'SUPABASE_URL is required in production and must not be a placeholder.',
      );
    }
    if (!supabaseUrl.startsWith('https://')) {
      throw new Error(
        'SUPABASE_URL must be a secure HTTPS URL starting with https://',
      );
    }

    if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
      throw new Error(
        'SUPABASE_ANON_KEY is required in production and must not be a placeholder.',
      );
    }

    if (supabaseJwtSecret && supabaseJwtSecret.includes('placeholder')) {
      throw new Error(
        'SUPABASE_JWT_SECRET contains a placeholder. Omit this variable to use Supabase project JWKS/API verification or supply a valid secret.',
      );
    }
  }

  return {
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    PORT: port,
    API_PREFIX: apiPrefix,
    DATABASE_URL: databaseUrl,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_JWT_SECRET: supabaseJwtSecret,
    CORS_ORIGIN: (config.CORS_ORIGIN as string | undefined) ?? '*',
    FIREBASE_PROJECT_ID: config.FIREBASE_PROJECT_ID as string | undefined,
    FIREBASE_CLIENT_EMAIL: config.FIREBASE_CLIENT_EMAIL as string | undefined,
    FIREBASE_PRIVATE_KEY: config.FIREBASE_PRIVATE_KEY as string | undefined,
    FIREBASE_CONFIG: config.FIREBASE_CONFIG as string | undefined,
    FCM_SERVER_KEY: config.FCM_SERVER_KEY as string | undefined,
    DATABASE_SSL_REJECT_UNAUTHORIZED: config.DATABASE_SSL_REJECT_UNAUTHORIZED as
      | string
      | undefined,
    DATABASE_CA_CERT: config.DATABASE_CA_CERT as string | undefined,
    PGSSLROOTCERT: config.PGSSLROOTCERT as string | undefined,
    CRON_SECRET: config.CRON_SECRET as string | undefined,
  };
}
