CREATE TABLE IF NOT EXISTS daily_usage (
    date TEXT NOT NULL,
    feature TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, feature)
);
