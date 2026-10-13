-- Migration Down: 005_create_notifications
-- Description: Drops notifications and user_device_tokens tables.

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS user_device_tokens;
