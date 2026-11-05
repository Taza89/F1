const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const setupDatabase = require('./database');
const { tracks, getTodayTrack } = require('./tracks');

const app = express();
const JWT_SECRET = 'f1_super_hemmelig_noegle_123';

app.use(cors());
app.use(express.json());

let db;

// Start database og derefter serveren
setupDatabase().then(databaseInstance => {
    db = databaseInstance;
    app.listen(3000, () => {
        console.log("🏎️ F1 Manager Server kører på http://localhost:3000");
    });
});

// Middleware: Tjekker om brugeren er logget ind med token
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

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// 1. OPRET BRUGER, HOLD OG KØRERE
app.post('/api/register', async (req, res) => {
    const { username, password, teamName } = req.body;

    if (!username || !password || !teamName) {
        return res.status(400).json({ error: "Udfyld venligst brugernavn, adgangskode og holdnavn." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await db.run(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );

        const userId = userResult.lastID;

        const teamResult = await db.run(
            'INSERT INTO teams (user_id, team_name, budget, engine_power, aero_level, reliability) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, teamName, 15000000, 50, 50, 50]
        );

        const teamId = teamResult.lastID;

        // Opret 3 startkørere med navne og alder
        await db.run(
            'INSERT INTO drivers (team_id, name, role, skill, age, salary) VALUES (?, ?, ?, ?, ?, ?)',
            [teamId, 'Lucas Vestergaard', '1. Kører', 68, 22, 600000]
        );
        await db.run(
            'INSERT INTO drivers (team_id, name, role, skill, age, salary) VALUES (?, ?, ?, ?, ?, ?)',
            [teamId, 'Marco Rossi', '2. Kører', 62, 28, 450000]
        );
        await db.run(
            'INSERT INTO drivers (team_id, name, role, skill, age, salary) VALUES (?, ?, ?, ?, ?, ?)',
            [teamId, 'Oliver Hansen', 'Reserve', 54, 19, 200000]
        );

        res.status(201).json({ message: "Bruger, F1-hold og kørere er oprettet succesfuldt!" });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Brugernavnet er optaget." });
        }
        res.status(500).json({ error: "Der skete en fejl under oprettelsen." });
    }
});

// 2. LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: "Forkert brugernavn eller adgangskode." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Forkert brugernavn eller adgangskode." });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: "Login succesfuldt!", token });
});

// 3. HENT MIT HOLD
app.get('/api/my-team', authenticateToken, async (req, res) => {
    const team = await db.get('SELECT * FROM teams WHERE user_id = ?', [req.user.userId]);
    if (!team) return res.status(404).json({ error: "Hold ikke fundet." });

    res.json({ team });
});

// 4. HENT HOLDETS KØRERE
app.get('/api/my-drivers', authenticateToken, async (req, res) => {
    try {
        const team = await db.get('SELECT id FROM teams WHERE user_id = ?', [req.user.userId]);
        if (!team) return res.status(404).json({ error: "Hold ikke fundet." });

        const drivers = await db.all('SELECT * FROM drivers WHERE team_id = ?', [team.id]);
        res.json({ drivers });
    } catch (error) {
        res.status(500).json({ error: "Fejl ved hentning af kørere." });
    }
});

// 5. HENT DAGENS BANE
app.get('/api/today-track', (req, res) => {
    const track = getTodayTrack();
    res.json({ track, dayOfMonth: new Date().getDate() });
});

// 6. KØR DAGENS LØB (MAX 1 GANG OM DAGEN)
app.post('/api/race', authenticateToken, async (req, res) => {
    try {
        const team = await db.get('SELECT * FROM teams WHERE user_id = ?', [req.user.userId]);
        if (!team) return res.status(404).json({ error: "Hold ikke fundet." });

        const todayStr = new Date().toISOString().split('T')[0];

        if (team.last_race_date === todayStr) {
            return res.status(400).json({ error: "Du har allerede kørt dagens Grand Prix! Kom tilbage i morgen." });
        }

        const drivers = await db.all('SELECT * FROM drivers WHERE team_id = ? AND role != "Reserve"', [team.id]);
        const avgDriverSkill = drivers.reduce((acc, d) => acc + d.skill, 0) / (drivers.length || 1);

        const currentTrack = getTodayTrack();

        let carPerformance = team.engine_power + team.aero_level + team.reliability;

        if (currentTrack.statFocus === 'engine') {
            carPerformance += team.engine_power * 1.5;
        } else if (currentTrack.statFocus === 'aero') {
            carPerformance += team.aero_level * 1.5;
        } else if (currentTrack.statFocus === 'reliability') {
            carPerformance += team.reliability * 1.5;
        }

        const totalScore = carPerformance + (avgDriverSkill * 1.5);

        let grid = [
            { team: team.team_name, score: totalScore + (Math.random() * 15 - 7.5), isUser: true }
        ];

        const aiTeams = ["Red Bull", "Ferrari", "Mercedes", "McLaren", "Aston Martin", "Alpine", "Williams", "Haas", "Sauber"];
        aiTeams.forEach(aiName => {
            grid.push({
                team: aiName,
                score: Math.floor(Math.random() * 100) + 160,
                isUser: false
            });
        });

        grid.sort((a, b) => b.score - a.score);

        const position = grid.findIndex(item => item.isUser) + 1;
        const prizeMoney = Math.max(500000, (11 - position) * 500000);

        const newBudget = team.budget + prizeMoney;

        await db.run('UPDATE teams SET budget = ?, last_race_date = ? WHERE id = ?', [newBudget, todayStr, team.id]);

        res.json({
            track: currentTrack,
            position,
            prizeMoney,
            newBudget,
            grid: grid.map((g, index) => ({ position: index + 1, team: g.team, isUser: g.isUser }))
        });

    } catch (error) {
        res.status(500).json({ error: "Fejl under løbssimulering." });
    }
});