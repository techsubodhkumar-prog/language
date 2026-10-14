import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'RATE_LIMIT_METADATA_KEY';

export interface RateLimitOptions {
  points: number;
  durationSeconds: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
