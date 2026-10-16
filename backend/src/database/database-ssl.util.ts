import fs from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

/**
 * Resolves PostgreSQL SSL configuration with secure defaults:
 * - Hosted / remote databases and production environments default to strict TLS certificate verification (rejectUnauthorized: true).
 * - Optional custom CA certificate via DATABASE_CA_CERT or PGSSLROOTCERT (inline PEM string or file path).
 * - Insecure bypass (rejectUnauthorized: false) is only permitted if DATABASE_SSL_REJECT_UNAUTHORIZED is explicitly set to 'false'.
 */
export function getDatabaseSslConfig(
  databaseUrl: string | undefined,
  nodeEnv: string = process.env.NODE_ENV || 'development',
  rejectUnauthorizedEnv?: string,
  caCertEnv?: string,
): ConnectionOptions | undefined {
  if (!databaseUrl || databaseUrl.includes('placeholder')) {
    return undefined;
  }

  const isRemoteDb =
    databaseUrl.includes('supabase.co') ||
    databaseUrl.includes('pooler.supabase.com') ||
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('amazonaws.com') ||
    databaseUrl.includes('sslmode=require');

  const requiresSsl = nodeEnv === 'production' || isRemoteDb;
  if (!requiresSsl) {
    return undefined;
  }

  // Explicit opt-out of certificate validation (insecure)
  const explicitlyDisabled =
    (rejectUnauthorizedEnv ?? process.env.DATABASE_SSL_REJECT_UNAUTHORIZED) === 'false';

  if (explicitlyDisabled) {
    return {
      rejectUnauthorized: false,
    };
  }

  // Check for custom CA certificate (inline PEM or file path)
  const caCertSource = caCertEnv ?? process.env.DATABASE_CA_CERT ?? process.env.PGSSLROOTCERT;
  let caCertContent: string | undefined;

  if (caCertSource && caCertSource.trim().length > 0) {
    const trimmed = caCertSource.trim();
    if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
      caCertContent = trimmed;
    } else {
      try {
        if (fs.existsSync(trimmed)) {
          caCertContent = fs.readFileSync(trimmed, 'utf-8');
        }
      } catch {
        // Fall back to system trusted roots if file read fails
      }
    }
  }

  // Secure default: strictly verify certificates using public trusted CAs or custom CA
  return {
    rejectUnauthorized: true,
    ...(caCertContent ? { ca: caCertContent } : {}),
  };
}
