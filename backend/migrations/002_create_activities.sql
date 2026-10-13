-- Activities are owned by an existing profile. max_participants is total capacity
-- including the host, who occupies one place from creation onward.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE RESTRICT,
    title VARCHAR(100) NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 100),
    description VARCHAR(2000) NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
    category_id VARCHAR(50) NOT NULL REFERENCES interests(interest_id) ON DELETE RESTRICT,
    location_name VARCHAR(150) NOT NULL CHECK (length(btrim(location_name)) BETWEEN 2 AND 150),
    location_description VARCHAR(500) NOT NULL CHECK (length(btrim(location_description)) BETWEEN 2 AND 500),
    location_point GEOGRAPHY(Point, 4326),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    min_participants SMALLINT NOT NULL DEFAULT 1 CHECK (min_participants >= 1),
    max_participants SMALLINT NOT NULL CHECK (max_participants BETWEEN 1 AND 100),
    estimated_cost NUMERIC(10, 2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
    visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'invite_only')),
    join_policy VARCHAR(16) NOT NULL DEFAULT 'approval' CHECK (join_policy IN ('approval', 'auto_join')),
    status VARCHAR(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT activities_valid_time CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT activities_valid_capacity CHECK (min_participants <= max_participants)
);

CREATE INDEX idx_activities_status_start_id ON activities(status, starts_at, activity_id);
CREATE INDEX idx_activities_category_status_start_id ON activities(category_id, status, starts_at, activity_id);
CREATE INDEX idx_activities_host_start ON activities(host_user_id, starts_at);
CREATE INDEX idx_activities_location ON activities USING GIST(location_point);

COMMENT ON COLUMN activities.max_participants IS
    'Total capacity including the host; future guest capacity is max_participants minus one.';
COMMENT ON COLUMN activities.min_participants IS
    'Minimum target including the host.';
