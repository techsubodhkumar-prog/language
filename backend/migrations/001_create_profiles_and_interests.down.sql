-- Rollback Migration: 001_create_profiles_and_interests.down.sql

DROP TABLE IF EXISTS user_interests;
DROP TABLE IF EXISTS interests;
DROP TABLE IF EXISTS profiles;
