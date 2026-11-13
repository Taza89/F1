const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function setupDatabase() {
    const db = await open({
        filename: process.env.DB_PATH || './f1_manager.db',
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            current_season INTEGER NOT NULL DEFAULT 1,
            current_round INTEGER NOT NULL DEFAULT 1,
            last_processed_date TEXT
        );

        CREATE TABLE IF NOT EXISTS hall_of_fame (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season INTEGER NOT NULL,
            team_name TEXT NOT NULL,
            team_points INTEGER NOT NULL,
            driver_name TEXT,
            driver_points INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_name TEXT NOT NULL,
            budget INTEGER NOT NULL DEFAULT 0,
            engine_power INTEGER NOT NULL DEFAULT 1,
            aero_level INTEGER NOT NULL DEFAULT 1,
            reliability INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            name TEXT NOT NULL,
            role TEXT,
            skill INTEGER NOT NULL DEFAULT 1,
            pace INTEGER NOT NULL DEFAULT 50,
            overtaking INTEGER NOT NULL DEFAULT 50,
            technique INTEGER NOT NULL DEFAULT 50,
            consistency INTEGER NOT NULL DEFAULT 50,
            potential INTEGER NOT NULL DEFAULT 70,
            last_trained_date TEXT,
            age INTEGER,
            salary INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS race_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            season INTEGER NOT NULL,
            round INTEGER NOT NULL,
            track_name TEXT,
            settled INTEGER NOT NULL DEFAULT 0,
            total_points INTEGER NOT NULL DEFAULT 0,
            prize_money INTEGER NOT NULL DEFAULT 0,
            UNIQUE (team_id, season, round),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS driver_race_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            driver_id INTEGER NOT NULL,
            driver_name TEXT NOT NULL,
            season INTEGER NOT NULL,
            round INTEGER NOT NULL,
            track_name TEXT,
            tyre_strategy TEXT DEFAULT 'medium',
            car_setup TEXT DEFAULT 'balanced',
            score REAL NOT NULL DEFAULT 0,
            settled INTEGER NOT NULL DEFAULT 0,
            position INTEGER,
            points INTEGER NOT NULL DEFAULT 0,
            UNIQUE (driver_id, season, round),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id);
        CREATE INDEX IF NOT EXISTS idx_drivers_team ON drivers(team_id);
        CREATE INDEX IF NOT EXISTS idx_entries_season_round ON race_entries(season, round, settled);
        CREATE INDEX IF NOT EXISTS idx_driver_results_season ON driver_race_results(season, round, settled);
    `);

    const state = await db.get('SELECT * FROM game_state WHERE id = 1');
    if (!state) {
        await db.run('INSERT INTO game_state (id, current_season, current_round) VALUES (1, 1, 1)');
    }

    console.log("Database med Kører- & Holdmesterskab er klar!");
    return db;
}

module.exports = setupDatabase;