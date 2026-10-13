export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_PREFIX: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_JWT_SECRET?: string;
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

  return {
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    PORT: port,
    API_PREFIX: apiPrefix,
    DATABASE_URL: config.DATABASE_URL as string | undefined,
    SUPABASE_URL: config.SUPABASE_URL as string | undefined,
    SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY as string | undefined,
    SUPABASE_JWT_SECRET: config.SUPABASE_JWT_SECRET as string | undefined,
  };
}
