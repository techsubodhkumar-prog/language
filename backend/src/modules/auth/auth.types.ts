export interface AuthenticatedUser {
  userId: string; // Supabase Auth User ID (sub claim)
  email?: string;
  role?: string;
  appMetadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
}
