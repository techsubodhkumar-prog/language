-- Migration: 004_create_activity_messages
-- Description: Creates activity_messages table for activity group chat and persistent messaging.

CREATE TABLE IF NOT EXISTS activity_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(activity_id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    content VARCHAR(2000) NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chronological query index for activity messages (supports pagination by activity and timestamp)
CREATE INDEX IF NOT EXISTS idx_activity_messages_activity_created
    ON activity_messages(activity_id, created_at DESC, message_id DESC);

-- Index for sender queries
CREATE INDEX IF NOT EXISTS idx_activity_messages_sender
    ON activity_messages(sender_id);

COMMENT ON TABLE activity_messages IS 'Persistent plain-text messages for activity group chat.';
COMMENT ON COLUMN activity_messages.content IS 'Plain-text message content limited to 1-2000 characters, whitespace-trimmed.';
