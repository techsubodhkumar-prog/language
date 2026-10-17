import fs from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

/**
 * Official Supabase Root 2021 CA certificate (PEM format).
 * Supabase hosted PostgreSQL databases and poolers (Supavisor) use certificates
 * issued by the Supabase Root 2021 CA. Because this root certificate is not part
 * of standard public Web PKI bundles (such as Mozilla's bundle built into Node.js),
 * connecting to *.pooler.supabase.com or *.supabase.co with strict TLS validation
 * (rejectUnauthorized: true) fails with SELF_SIGNED_CERT_IN_CHAIN unless this CA is trusted.
 */
export const SUPABASE_ROOT_2021_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

/**
 * Resolves PostgreSQL SSL configuration with secure defaults:
 * - Hosted / remote databases and production environments default to strict TLS certificate verification (rejectUnauthorized: true).
 * - Optional custom CA certificate via DATABASE_CA_CERT or PGSSLROOTCERT (inline PEM string or file path).
 * - For Supabase hosted endpoints, trusts the Supabase Root 2021 CA certificate if no custom CA is provided.
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

  const isSupabase =
    databaseUrl.includes('supabase.co') ||
    databaseUrl.includes('pooler.supabase.com');

  const isRemoteDb =
    isSupabase ||
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('amazonaws.com') ||
    databaseUrl.includes('sslmode=require');

  const requiresSsl = nodeEnv === 'production' || isRemoteDb;
  if (!requiresSsl) {
    return undefined;
  }

  // Explicit opt-out of certificate validation (insecure)
  const explicitlyDisabled =
    (rejectUnauthorizedEnv ?? process.env.DATABASE_SSL_REJECT_UNAUTHORIZED) ===
    'false';

  if (explicitlyDisabled) {
    return {
      rejectUnauthorized: false,
    };
  }

  // Check for custom CA certificate (inline PEM or file path)
  const caCertSource =
    caCertEnv ?? process.env.DATABASE_CA_CERT ?? process.env.PGSSLROOTCERT;
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

  // For Supabase endpoints, attach the Supabase Root CA if no custom CA was provided
  if (!caCertContent && isSupabase) {
    caCertContent = SUPABASE_ROOT_2021_CA;
  }

  // Secure default: strictly verify certificates using public trusted CAs or custom CA
  return {
    rejectUnauthorized: true,
    ...(caCertContent ? { ca: caCertContent } : {}),
  };
}

