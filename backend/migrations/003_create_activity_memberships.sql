-- One row per activity/user. The host remains represented by activities.host_user_id
-- and is counted separately as the first place in capacity calculations.
CREATE TABLE activity_memberships (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(activity_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'participant' CHECK (role IN ('participant')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('requested', 'approved', 'rejected', 'withdrawn', 'left', 'removed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT activity_memberships_unique_user UNIQUE (activity_id, user_id),
    CONSTRAINT activity_memberships_decision_time CHECK (
      (status = 'requested' AND decided_at IS NULL)
      OR (status IN ('approved', 'rejected', 'withdrawn', 'left', 'removed') AND decided_at IS NOT NULL)
    )
);

CREATE INDEX idx_activity_memberships_activity_status
  ON activity_memberships(activity_id, status, requested_at, membership_id);
CREATE INDEX idx_activity_memberships_user_status
  ON activity_memberships(user_id, status, updated_at DESC);
