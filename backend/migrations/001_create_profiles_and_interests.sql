-- Migration: 001_create_profiles_and_interests
-- Description: Creates profiles, interests, and user_interests tables with constraints and indexes.

-- Enable pgcrypto for gen_random_uuid() if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_user_id UUID UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 50),
    bio VARCHAR(300) CHECK (bio IS NULL OR length(bio) <= 300),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Interests Taxonomy Table
CREATE TABLE IF NOT EXISTS interests (
    interest_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interests_category ON interests(category);
CREATE INDEX IF NOT EXISTS idx_interests_is_active ON interests(is_active);

-- 3. User Interests Many-to-Many Table
CREATE TABLE IF NOT EXISTS user_interests (
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    interest_id VARCHAR(50) NOT NULL REFERENCES interests(interest_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, interest_id)
);

CREATE INDEX IF NOT EXISTS idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_interest_id ON user_interests(interest_id);
