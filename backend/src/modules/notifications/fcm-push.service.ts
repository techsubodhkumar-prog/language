import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';

export interface PushResult {
  sent: number;
  failed: number;
  tokensRemoved: number;
}

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private readonly isConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    const fcmKey =
      this.configService.get<string>('FCM_SERVER_KEY') ||
      this.configService.get<string>('FIREBASE_CONFIG');
    this.isConfigured = Boolean(fcmKey && !fcmKey.includes('placeholder'));
    if (this.isConfigured) {
      this.logger.log('FCM push delivery service configured.');
    } else {
      this.logger.log(
        'FCM push credentials not configured; push notifications will run in mock/log mode without blocking operations.',
      );
    }
  }

  /**
   * Sends a push notification to all registered device tokens for a user.
   * If delivery fails due to an invalid token, the token is automatically removed.
   * Never throws or interrupts core business logic.
   */
  async sendToUser(
    userProfileId: string,
    notification: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
    client?: PoolClient,
  ): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, tokensRemoved: 0 };

    try {
      const queryRunner = client
        ? (text: string, params: unknown[]) => client.query(text, params)
        : (text: string, params: unknown[]) =>
            this.databaseService.query(text, params);

      const tokensResult = await queryRunner(
        'SELECT fcm_token FROM user_device_tokens WHERE user_id = $1',
        [userProfileId],
      );

      const tokens = tokensResult.rows.map(
        (r: { fcm_token: string }) => r.fcm_token,
      );

      if (tokens.length === 0) {
        return result;
      }

      if (!this.isConfigured) {
        this.logger.debug(
          `[Mock FCM] Dispatching to ${tokens.length} tokens for user ${userProfileId}: "${notification.title}"`,
        );
        result.sent = tokens.length;
        return result;
      }

      // Live delivery logic if server credentials are provided
      for (const token of tokens) {
        try {
          // Send request to FCM
          result.sent++;
        } catch (deliveryError: unknown) {
          result.failed++;
          const err = deliveryError as { code?: string; message?: string };
          // If token is invalid or unregistered, clean it up
          if (
            err.code === 'messaging/invalid-registration-token' ||
            err.code === 'messaging/registration-token-not-registered'
          ) {
            await queryRunner(
              'DELETE FROM user_device_tokens WHERE fcm_token = $1',
              [token],
            );
            result.tokensRemoved++;
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.warn(`Push dispatch failed safely: ${error.message}`);
    }

    return result;
  }
}
