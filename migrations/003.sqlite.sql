ALTER TABLE assets ADD COLUMN responsive_ready INTEGER NOT NULL DEFAULT 0 CHECK(responsive_ready IN (0,1));
