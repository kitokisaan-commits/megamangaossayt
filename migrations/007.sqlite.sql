CREATE TABLE rate_limits(id TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL CHECK(count>=1));
CREATE INDEX rate_limits_window ON rate_limits(window);
