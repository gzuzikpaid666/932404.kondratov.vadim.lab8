CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    tech_stack  TEXT NOT NULL DEFAULT '',   
    link        TEXT NOT NULL DEFAULT '',   
    date        TEXT NOT NULL              
                CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
CREATE INDEX IF NOT EXISTS idx_projects_date ON projects(date DESC);
