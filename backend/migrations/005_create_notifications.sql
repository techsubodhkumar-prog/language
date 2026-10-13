-- Migration: 005_create_notifications
-- Description: Creates notifications table and user_device_tokens table for persistent in-app notifications and FCM push tokens.

CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL CHECK (
        type IN (
            'join_request',
            'request_approved',
            'request_rejected',
            'activity_cancelled',
            'activity_updated',
            'activity_reminder',
            'chat_message',
            'system'
        )
    ),
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    activity_id UUID REFERENCES activities(activity_id) ON DELETE CASCADE,
    reference_id UUID,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recipient reverse chronological index for paginated list queries
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications(recipient_id, created_at DESC, notification_id DESC);

-- Recipient unread count index
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
    ON notifications(recipient_id)
    WHERE read_at IS NULL;

-- Activity reference index
CREATE INDEX IF NOT EXISTS idx_notifications_activity
    ON notifications(activity_id);

-- Idempotency index for activity reminders (ensures reminder is sent only once per user per activity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_activity_reminder_unique
    ON notifications(activity_id, recipient_id, type)
    WHERE type = 'activity_reminder';

-- Device registration tokens for push notifications (FCM)
CREATE TABLE IF NOT EXISTS user_device_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    fcm_token VARCHAR(500) NOT NULL,
    device_type VARCHAR(16) NOT NULL DEFAULT 'android' CHECK (device_type IN ('android', 'ios', 'web')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_device_tokens_unique_token UNIQUE (fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user
    ON user_device_tokens(user_id);

COMMENT ON TABLE notifications IS 'Persistent in-app notification records for platform events.';
COMMENT ON TABLE user_device_tokens IS 'FCM device tokens associated with user profiles.';
