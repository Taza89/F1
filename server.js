// =========================================================================
//  FORMULA MANAGER - BACKEND SERVER (server.js)
// =========================================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const setupDatabase = require('./database');
const { getTrackByRound } = require('./tracks');

const app = express();
app.set('trust proxy', 1);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET mangler i .env-filen.');
}

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: "For mange forsøg. Prøv igen senere." }
});

let db;

// #region 2. HJÆLPEFUNKTIONER & KONSTANTER
function getTodayString() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' });
}

function seededRandom(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    let a = h >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const POINTS_BY_POSITION = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const DRIVER_FOCUS_SKILL = { engine: 'overtaking', aero: 'technique', reliability: 'consistency' };

// 5 fiktive AI-hold med 2 kørere hver (100% fri for varemærker)
const AI_DRIVERS = [
    { name: "Viktor Lindqvist", team: "Apex GP", base: 245 },
    { name: "Noah Mercer", team: "Apex GP", base: 215 },
    { name: "Lorenzo Moretti", team: "Scuderia Rossa", base: 240 },
    { name: "Matteo Conti", team: "Scuderia Rossa", base: 238 },
    { name: "Callum Vance", team: "Vanguard Racing", base: 242 },
    { name: "Liam Gallagher", team: "Vanguard Racing", base: 235 },
    { name: "Lukas Weber", team: "SilverArrow Motorsport", base: 232 },
    { name: "Felix Brandt", team: "SilverArrow Motorsport", base: 212 },
    { name: "Mateo Silva", team: "Emerald Racing", base: 222 },
    { name: "Sebastien Moreau", team: "Emerald Racing", base: 198 }
];

let txQueue = Promise.resolve();
function withTransaction(fn) {
    const run = txQueue.then(async () => {
        await db.exec('BEGIN');
        try {
            const result = await fn();
            await db.exec('COMMIT');
            return result;
        } catch (err) {
            await db.exec('ROLLBACK');
            throw err;
        }
    });
    txQueue = run.catch(() => {});
    return run;
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Adgang nægtet. Ingen token." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Ugyldig token." });
        req.user = user;
        next();
    });
}
// #endregion


// #region 3. SÆSON- & LØBSMOTOR
function buildDriverGrid(seedKey, playerDriverEntries) {
    const rand = seededRandom(seedKey);
    const grid = playerDriverEntries.map(e => ({
        teamId: e.team_id,
        teamName: e.team_name,
        driverId: e.driver_id,
        driverName: e.driver_name,
        score: e.score,
        isAI: false
    }));

    AI_DRIVERS.forEach(ai => {
        grid.push({
            teamId: null,
            teamName: ai.team,
            driverId: null,
            driverName: ai.name,
            score: ai.base + (rand() * 40 - 20),
            isAI: true
        });
    });

    grid.sort((a, b) => (b.score - a.score) || a.driverName.localeCompare(b.driverName));
    return grid;
}

async function settleRace(season, round) {
    await withTransaction(async () => {
        const driverEntries = await db.all(`
            SELECT d.team_id, d.driver_id, d.driver_name, d.score, t.team_name
            FROM driver_race_results d
            JOIN teams t ON t.id = d.team_id
            WHERE d.season = ? AND d.round = ? AND d.settled = 0
        `, [season, round]);

        if (driverEntries.length === 0) return;

        const grid = buildDriverGrid(`s${season}r${round}`, driverEntries);
        const teamRewards = new Map();

        for (let i = 0; i < grid.length; i++) {
            const g = grid[i];
            if (g.isAI) continue;

            const position = i + 1;
            const points = POINTS_BY_POSITION[i] || 0;
            const prize = Math.max(250000, (16 - position) * 200000);

            await db.run(`
                UPDATE driver_race_results
                SET position = ?, points = ?, settled = 1
                WHERE driver_id = ? AND season = ? AND round = ?
            `, [position, points, g.driverId, season, round]);

            const current = teamRewards.get(g.teamId) || { points: 0, prize: 0 };
            current.points += points;
            current.prize += prize;
            teamRewards.set(g.teamId, current);
        }

        for (const [teamId, reward] of teamRewards.entries()) {
            await db.run(`
                UPDATE race_entries
                SET settled = 1, total_points = ?, prize_money = ?
                WHERE team_id = ? AND season = ? AND round = ?
            `, [reward.points, reward.prize, teamId, season, round]);

            await db.run('UPDATE teams SET budget = budget + ? WHERE id = ?', [reward.prize, teamId]);
        }
    });
}

let advanceLock = Promise.resolve();
function checkAndAdvanceSeason() {
    const run = advanceLock.then(async () => {
        const todayStr = getTodayString();
        const state = await db.get('SELECT * FROM game_state WHERE id = 1');

        if (!state.last_processed_date) {
            await db.run('UPDATE game_state SET last_processed_date = ? WHERE id = 1', [todayStr]);
            return;
        }

        const unsettledRounds = await db.all(
            'SELECT DISTINCT season, round FROM race_entries WHERE settled = 0 AND (season < ? OR (season = ? AND round < ?))',
            [state.current_season, state.current_season, state.current_round]
        );
        for (const u of unsettledRounds) {
            await settleRace(u.season, u.round);
        }

        if (state.last_processed_date !== todayStr) {
            await settleRace(state.current_season, state.current_round);

            let nextRound = state.current_round + 1;
            let nextSeason = state.current_season;

            if (nextRound > 25) {
                const teamChamp = await db.get(`
                    SELECT t.team_name, COALESCE(SUM(r.total_points), 0) AS pts
                    FROM teams t
                    LEFT JOIN race_entries r ON r.team_id = t.id AND r.season = ? AND r.settled = 1
                    GROUP BY t.id ORDER BY pts DESC LIMIT 1
                `, [nextSeason]);

                const driverChamp = await db.get(`
                    SELECT driver_name, COALESCE(SUM(points), 0) AS pts
                    FROM driver_race_results
                    WHERE season = ? AND settled = 1
                    GROUP BY driver_id ORDER BY pts DESC LIMIT 1
                `, [nextSeason]);

                if (teamChamp) {
                    await db.run(
                        'INSERT INTO hall_of_fame (season, team_name, team_points, driver_name, driver_points) VALUES (?, ?, ?, ?, ?)',
                        [nextSeason, teamChamp.team_name, teamChamp.pts, driverChamp?.driver_name || '-', driverChamp?.pts || 0]
                    );
                }

                await db.run('UPDATE drivers SET age = age + 1');
                nextSeason += 1;
                nextRound = 1;
            }

            await db.run(
                'UPDATE game_state SET current_season = ?, current_round = ?, last_processed_date = ? WHERE id = 1',
                [nextSeason, nextRound, todayStr]
            );
        }
    });
    advanceLock = run.catch(console.error);
    return run;
}
// #endregion


// #region 4. API ENDPOINTS - AUTH & BRUGER
const START_BUDGET = 15000000;
const START_CAR_LEVEL = 20;

app.post('/api/register', authLimiter, async (req, res) => {
    const { username, password, teamName } = req.body || {};
    if (!username || !password || !teamName || password.length < 6) {
        return res.status(400).json({ error: "Udfyld gyldige oplysninger (adgangskode mindst 6 tegn)." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await withTransaction(async () => {
            const userResult = await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username.trim(), hashedPassword]);
            const teamResult = await db.run(
                'INSERT INTO teams (user_id, team_name, budget, engine_power, aero_level, reliability) VALUES (?, ?, ?, ?, ?, ?)',
                [userResult.lastID, teamName.trim(), START_BUDGET, START_CAR_LEVEL, START_CAR_LEVEL, START_CAR_LEVEL]
            );

            const teamId = teamResult.lastID;
            const startDrivers = [
                ['Lucas Vestergaard', '1. Kører', 56, 52, 58, 54, 85, 22, 600000],
                ['Marco Rossi', '2. Kører', 52, 55, 46, 47, 70, 28, 450000],
                ['Oliver Hansen', 'Reserve', 48, 44, 46, 42, 90, 19, 200000]
            ];

            for (const [name, role, pace, overtaking, technique, consistency, potential, age, salary] of startDrivers) {
                const overall = Math.round((pace + overtaking + technique + consistency) / 4);
                await db.run(`
                    INSERT INTO drivers (team_id, name, role, skill, pace, overtaking, technique, consistency, potential, age, salary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [teamId, name, role, overall, pace, overtaking, technique, consistency, potential, age, salary]);
            }
        });

        res.status(201).json({ message: "Hold oprettet!" });
    } catch (error) {
        res.status(400).json({ error: "Brugernavnet er optaget." });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: "Forkert brugernavn eller adgangskode." });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: "Login succesfuldt!", token });
});
// #endregion


// #region 5. API ENDPOINTS - HOLD, BIL OG OPGRADERINGER
app.get('/api/my-team', authenticateToken, async (req, res) => {
    await checkAndAdvanceSeason();
    const team = await db.get('SELECT * FROM teams WHERE user_id = ?', [req.user.userId]);
    res.json({ team, upgrades: getUpgradeInfo(team) });
});

const MAX_CAR_LEVEL = 100;
const UPGRADE_COST_PER_LEVEL = 50000;
const UPGRADE_STATS = { engine: 'engine_power', aero: 'aero_level', reliability: 'reliability' };

function getUpgradeInfo(team) {
    const info = {};
    for (const [key, column] of Object.entries(UPGRADE_STATS)) {
        const level = team[column];
        info[key] = { level, cost: level * UPGRADE_COST_PER_LEVEL, maxed: level >= MAX_CAR_LEVEL };
    }
    return info;
}

app.post('/api/upgrade', authenticateToken, async (req, res) => {
    const stat = req.body?.stat;
    const column = UPGRADE_STATS[stat];
    if (!column) return res.status(400).json({ error: "Ugyldig opgradering." });

    const team = await db.get('SELECT * FROM teams WHERE user_id = ?', [req.user.userId]);
    const cost = team[column] * UPGRADE_COST_PER_LEVEL;
    if (team.budget < cost) return res.status(400).json({ error: "Ikke nok penge." });

    await db.run(`UPDATE teams SET budget = budget - ?, ${column} = ${column} + 1 WHERE id = ?`, [cost, team.id]);
    const updated = await db.get('SELECT * FROM teams WHERE id = ?', [team.id]);
    res.json({ message: `Opgraderet! Nyt niveau: ${updated[column]}`, team: updated, upgrades: getUpgradeInfo(updated) });
});
// #endregion


// #region 6. API ENDPOINTS - KØRERE & TRÆNING
const TRAIN_SKILLS = ['pace', 'overtaking', 'technique', 'consistency'];

function driverView(d, todayStr) {
    const training = {};
    for (const skill of TRAIN_SKILLS) {
        training[skill] = { level: d[skill], cost: d[skill] * 5000, gain: d.age <= 23 ? 2 : 1, maxed: d[skill] >= d.potential };
    }
    return { ...d, overall: d.skill, trainedToday: d.last_trained_date === todayStr, training };
}

app.get('/api/my-drivers', authenticateToken, async (req, res) => {
    const team = await db.get('SELECT id FROM teams WHERE user_id = ?', [req.user.userId]);
    const drivers = await db.all(
        `SELECT * FROM drivers WHERE team_id = ? ORDER BY CASE role WHEN '1. Kører' THEN 1 WHEN '2. Kører' THEN 2 ELSE 3 END`,
        [team.id]
    );
    res.json({ drivers: drivers.map(d => driverView(d, getTodayString())) });
});

app.post('/api/drivers/:id/train', authenticateToken, async (req, res) => {
    const driverId = parseInt(req.params.id, 10);
    const skill = req.body?.skill;
    const team = await db.get('SELECT * FROM teams WHERE user_id = ?', [req.user.userId]);
    const driver = await db.get('SELECT * FROM drivers WHERE id = ? AND team_id = ?', [driverId, team.id]);

    const todayStr = getTodayString();
    if (driver.last_trained_date === todayStr) return res.status(400).json({ error: "Allerede trænet i dag." });

    const cost = driver[skill] * 5000;
    if (team.budget < cost) return res.status(400).json({ error: "Ikke nok penge." });

    const gain = driver.age <= 23 ? 2 : 1;
    await withTransaction(async () => {
        await db.run('UPDATE teams SET budget = budget - ? WHERE id = ?', [cost, team.id]);
        await db.run(`UPDATE drivers SET ${skill} = ${skill} + ?, last_trained_date = ? WHERE id = ?`, [gain, todayStr, driver.id]);
        await db.run('UPDATE drivers SET skill = CAST(ROUND((pace + overtaking + technique + consistency) / 4.0) AS INTEGER) WHERE id = ?', [driver.id]);
    });

    res.json({ message: "Trænet succesfuldt!" });
});

app.post('/api/drivers/swap', authenticateToken, async (req, res) => {
    const { driverId, withDriverId } = req.body;
    const team = await db.get('SELECT id FROM teams WHERE user_id = ?', [req.user.userId]);
    const a = await db.get('SELECT * FROM drivers WHERE id = ? AND team_id = ?', [driverId, team.id]);
    const b = await db.get('SELECT * FROM drivers WHERE id = ? AND team_id = ?', [withDriverId, team.id]);

    await withTransaction(async () => {
        await db.run('UPDATE drivers SET role = ? WHERE id = ?', [b.role, a.id]);
        await db.run('UPDATE drivers SET role = ? WHERE id = ?', [a.role, b.id]);
    });
    res.json({ message: "Roller byttet!" });
});
// #endregion


// #region 7. API ENDPOINTS - LØB, STRATEGI & LIGA
app.get('/api/today-track', async (req, res) => {
    await checkAndAdvanceSeason();
    const state = await db.get('SELECT current_season, current_round FROM game_state WHERE id = 1');
    const track = getTrackByRound(state.current_round);
    res.json({ track, season: state.current_season, round: state.current_round });
});

app.post('/api/race', authenticateToken, async (req, res) => {
    await checkAndAdvanceSeason();
    const state = await db.get('SELECT current_season, current_round FROM game_state WHERE id = 1');
    const team = await db.get('SELECT * FROM teams WHERE user_id = ?', [req.user.userId]);

    // Modtager strategier for Bil 1 og Bil 2 separat fra frontend
    const { car1 = {}, car2 = {} } = req.body || {};

    const existing = await db.get(
        'SELECT id FROM race_entries WHERE team_id = ? AND season = ? AND round = ?',
        [team.id, state.current_season, state.current_round]
    );
    if (existing) return res.status(400).json({ error: "Du er allerede tilmeldt dette løb." });

    const activeDrivers = await db.all(
        'SELECT * FROM drivers WHERE team_id = ? AND role != "Reserve" ORDER BY CASE role WHEN "1. Kører" THEN 1 ELSE 2 END',
        [team.id]
    );
    if (activeDrivers.length < 2) {
        return res.status(400).json({ error: "Du skal have mindst 2 aktive kørere (1. og 2. kører) for at tilmelde begge biler." });
    }

    const currentTrack = getTrackByRound(state.current_round);
    const focusSkill = DRIVER_FOCUS_SKILL[currentTrack.statFocus] || 'pace';

    let baseCarPerf = team.engine_power + team.aero_level + team.reliability;
    if (currentTrack.statFocus === 'engine') baseCarPerf += team.engine_power * 1.5;
    if (currentTrack.statFocus === 'aero') baseCarPerf += team.aero_level * 1.5;
    if (currentTrack.statFocus === 'reliability') baseCarPerf += team.reliability * 1.5;

    // Funktion til at beregne individuel bil-score
    function calculateCarScore(driver, strategy) {
        let carPerf = baseCarPerf;
        let setup = strategy.carSetup || 'balanced';
        let tyre = strategy.tyreStrategy || 'medium';

        let setupMultiplier = 1.0;
        if (setup === currentTrack.statFocus) {
            setupMultiplier = 1.15;
        } else if (setup === 'risky') {
            setupMultiplier = Math.random() < 0.5 ? 1.25 : 0.85;
        }
        carPerf *= setupMultiplier;

        let tyreBonus = 0;
        let tyreSpreadRisk = 12;
        if (tyre === 'soft') {
            tyreBonus = 15;
            tyreSpreadRisk = 22;
        } else if (tyre === 'hard') {
            tyreBonus = -5;
            tyreSpreadRisk = 6;
        }

        const driverRating = 0.5 * driver.pace + 0.5 * driver[focusSkill];
        return {
            score: carPerf + tyreBonus + (driverRating * 1.5) + (Math.random() * tyreSpreadRisk - tyreSpreadRisk / 2),
            tyre,
            setup
        };
    }

    const car1Result = calculateCarScore(activeDrivers[0], car1);
    const car2Result = calculateCarScore(activeDrivers[1], car2);

    await withTransaction(async () => {
        await db.run(
            'INSERT INTO race_entries (team_id, season, round, track_name, tyre_strategy, car_setup) VALUES (?, ?, ?, ?, ?, ?)',
            [team.id, state.current_season, state.current_round, currentTrack.name, 'individual', 'individual']
        );

        // Gem Bil #1 (1. Kører)
        await db.run(`
            INSERT INTO driver_race_results (team_id, driver_id, driver_name, season, round, track_name, tyre_strategy, car_setup, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [team.id, activeDrivers[0].id, activeDrivers[0].name, state.current_season, state.current_round, currentTrack.name, car1Result.tyre, car1Result.setup, car1Result.score]);

        // Gem Bil #2 (2. Kører)
        await db.run(`
            INSERT INTO driver_race_results (team_id, driver_id, driver_name, season, round, track_name, tyre_strategy, car_setup, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [team.id, activeDrivers[1].id, activeDrivers[1].name, state.current_season, state.current_round, currentTrack.name, car2Result.tyre, car2Result.setup, car2Result.score]);
    });

    res.status(201).json({ message: `Begge biler er tilmeldt Sæson ${state.current_season}, Løb ${state.current_round}/25 med individuelle strategier!` });
});

// #endregion

// #region 8. SERVER START
setupDatabase().then(async databaseInstance => {
    db = databaseInstance;
    await checkAndAdvanceSeason();
    setInterval(() => checkAndAdvanceSeason().catch(console.error), 60 * 1000);
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🏎️ Formula Manager Server kører på http://localhost:${PORT}`);
    });
});
// #endregion