const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function setupDatabase() {
    const db = await open({
        filename: './f1_manager.db',
        driver: sqlite3.Database
    });

    // 1. Opret brugertabel
    await db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    `);

    // 2. Opret holdtabel
    await db.run(`
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            team_name TEXT,
            budget INTEGER,
            engine_power INTEGER,
            aero_level INTEGER,
            reliability INTEGER,
            last_race_date TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    // 3. Opret kørertabel (med 'age')
    await db.run(`
        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            name TEXT,
            role TEXT,
            skill INTEGER,
            age INTEGER,
            salary INTEGER,
            FOREIGN KEY(team_id) REFERENCES teams(id)
        )
    `);

    console.log("Database og tabeller er klar!");
    return db;
}

module.exports = setupDatabase;