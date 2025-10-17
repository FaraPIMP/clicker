require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Необходима авторизация' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }
};

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Введите имя пользователя и пароль' });
    }
    
    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: 'Имя пользователя должно быть от 3 до 50 символов' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashedPassword]
        );
        
        res.status(201).json({ 
            message: 'Пользователь зарегистрирован',
            userId: result.insertId 
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Имя пользователя уже занято' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
        }
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
        }
        
        await pool.execute(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                elo: user.elo_rating,
                totalClicks: user.total_clicks,
                gamesPlayed: user.games_played,
                gamesWon: user.games_won,
                gamesLost: user.games_lost
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, username, elo_rating, total_clicks, games_played, games_won, games_lost, created_at FROM users WHERE id = ?',
            [req.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Ошибка получения профиля' });
    }
});

app.get('/api/players', authMiddleware, async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT id, username, elo_rating, games_played, games_won, games_lost,
                    TIMESTAMPDIFF(SECOND, last_activity, NOW()) as seconds_since_activity
             FROM users WHERE id != ? ORDER BY elo_rating DESC`,
            [req.userId]
        );
        
        const usersWithStatus = users.map(user => ({
            ...user,
            isOnline: user.seconds_since_activity !== null && user.seconds_since_activity < 60
        }));
        
        res.json(usersWithStatus);
    } catch (error) {
        console.error('Players list error:', error);
        res.status(500).json({ error: 'Ошибка получения списка игроков' });
    }
});

app.post('/api/heartbeat', authMiddleware, async (req, res) => {
    try {
        await pool.execute(
            'UPDATE users SET last_activity = NOW() WHERE id = ?',
            [req.userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ error: 'Ошибка обновления активности' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT username, elo_rating, games_played, games_won, games_lost,
                    TIMESTAMPDIFF(SECOND, last_activity, NOW()) as seconds_since_activity
             FROM users ORDER BY elo_rating DESC LIMIT 100`
        );
        
        const usersWithStatus = users.map(user => ({
            ...user,
            isOnline: user.seconds_since_activity !== null && user.seconds_since_activity < 60
        }));
        
        res.json(usersWithStatus);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Ошибка получения таблицы лидеров' });
    }
});

app.get('/api/tournaments', async (req, res) => {
    try {
        const [tournaments] = await pool.execute(
            'SELECT * FROM tournaments WHERE status = "active" ORDER BY start_date DESC'
        );
        res.json(tournaments);
    } catch (error) {
        console.error('Tournaments error:', error);
        res.status(500).json({ error: 'Ошибка получения турниров' });
    }
});

app.post('/api/tournaments/:id/join', authMiddleware, async (req, res) => {
    const tournamentId = req.params.id;
    
    try {
        await pool.execute(
            'INSERT INTO tournament_participants (tournament_id, user_id) VALUES (?, ?)',
            [tournamentId, req.userId]
        );
        res.json({ message: 'Вы присоединились к турниру' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Вы уже участвуете в этом турнире' });
        }
        console.error('Join tournament error:', error);
        res.status(500).json({ error: 'Ошибка присоединения к турниру' });
    }
});

app.post('/api/challenge', authMiddleware, async (req, res) => {
    const { opponentId } = req.body;
    
    if (!opponentId) {
        return res.status(400).json({ error: 'Укажите ID соперника' });
    }
    
    if (opponentId === req.userId) {
        return res.status(400).json({ error: 'Нельзя вызвать самого себя' });
    }
    
    try {
        const [result] = await pool.execute(
            'INSERT INTO matches (player1_id, player2_id, status) VALUES (?, ?, "waiting")',
            [req.userId, opponentId]
        );
        
        res.json({ 
            matchId: result.insertId,
            message: 'Вызов отправлен'
        });
    } catch (error) {
        console.error('Challenge error:', error);
        res.status(500).json({ error: 'Ошибка отправки вызова' });
    }
});

app.get('/api/challenges', authMiddleware, async (req, res) => {
    try {
        const [challenges] = await pool.execute(
            `SELECT m.id, m.player1_id, u.username, u.elo_rating, m.created_at
             FROM matches m
             JOIN users u ON m.player1_id = u.id
             WHERE m.player2_id = ? AND m.status = "waiting"
             ORDER BY m.created_at DESC
             LIMIT 1`,
            [req.userId]
        );
        
        res.json(challenges.length > 0 ? challenges[0] : null);
    } catch (error) {
        console.error('Get challenges error:', error);
        res.status(500).json({ error: 'Ошибка получения вызовов' });
    }
});

app.post('/api/challenges/:id/accept', authMiddleware, async (req, res) => {
    const matchId = req.params.id;
    
    try {
        const [matches] = await pool.execute(
            'SELECT * FROM matches WHERE id = ? AND player2_id = ? AND status = "waiting"',
            [matchId, req.userId]
        );
        
        if (matches.length === 0) {
            return res.status(404).json({ error: 'Вызов не найден' });
        }
        
        await pool.execute(
            'UPDATE matches SET status = "in_progress", started_at = NOW() WHERE id = ?',
            [matchId]
        );
        
        res.json({ message: 'Вызов принят', matchId });
    } catch (error) {
        console.error('Accept challenge error:', error);
        res.status(500).json({ error: 'Ошибка принятия вызова' });
    }
});

app.post('/api/challenges/:id/decline', authMiddleware, async (req, res) => {
    const matchId = req.params.id;
    
    try {
        await pool.execute(
            'DELETE FROM matches WHERE id = ? AND player2_id = ? AND status = "waiting"',
            [matchId, req.userId]
        );
        
        res.json({ message: 'Вызов отклонен' });
    } catch (error) {
        console.error('Decline challenge error:', error);
        res.status(500).json({ error: 'Ошибка отклонения вызова' });
    }
});

app.get('/api/challenges/:id/status', authMiddleware, async (req, res) => {
    const matchId = req.params.id;
    
    try {
        const [matches] = await pool.execute(
            'SELECT status FROM matches WHERE id = ? AND player1_id = ?',
            [matchId, req.userId]
        );
        
        if (matches.length === 0) {
            return res.status(404).json({ error: 'Матч не найден' });
        }
        
        res.json({ status: matches[0].status });
    } catch (error) {
        console.error('Challenge status error:', error);
        res.status(500).json({ error: 'Ошибка проверки статуса' });
    }
});

app.post('/api/matchmaking', authMiddleware, async (req, res) => {
    try {
        const [currentUser] = await pool.execute(
            'SELECT elo_rating FROM users WHERE id = ?',
            [req.userId]
        );
        
        const currentElo = currentUser[0].elo_rating;
        const eloRange = 200;
        
        const [waitingMatches] = await pool.execute(
            `SELECT m.*, u.elo_rating 
             FROM matches m 
             JOIN users u ON m.player1_id = u.id 
             WHERE m.status = 'waiting' 
             AND m.player1_id != ? 
             AND u.elo_rating BETWEEN ? AND ?
             LIMIT 1`,
            [req.userId, currentElo - eloRange, currentElo + eloRange]
        );
        
        if (waitingMatches.length > 0) {
            const match = waitingMatches[0];
            await pool.execute(
                'UPDATE matches SET player2_id = ?, status = "in_progress", started_at = NOW() WHERE id = ?',
                [req.userId, match.id]
            );
            
            res.json({ 
                matchId: match.id,
                message: 'Матч найден!',
                opponentId: match.player1_id
            });
        } else {
            const [result] = await pool.execute(
                'INSERT INTO matches (player1_id, status) VALUES (?, "waiting")',
                [req.userId]
            );
            
            res.json({ 
                matchId: result.insertId,
                message: 'Ожидание соперника...',
                waiting: true
            });
        }
    } catch (error) {
        console.error('Matchmaking error:', error);
        res.status(500).json({ error: 'Ошибка поиска матча' });
    }
});

app.get('/api/matches/:id', authMiddleware, async (req, res) => {
    try {
        const [matches] = await pool.execute(
            `SELECT m.*, 
                    u1.username as player1_name, u1.elo_rating as player1_elo,
                    u2.username as player2_name, u2.elo_rating as player2_elo
             FROM matches m
             LEFT JOIN users u1 ON m.player1_id = u1.id
             LEFT JOIN users u2 ON m.player2_id = u2.id
             WHERE m.id = ?`,
            [req.params.id]
        );
        
        if (matches.length === 0) {
            return res.status(404).json({ error: 'Матч не найден' });
        }
        
        res.json(matches[0]);
    } catch (error) {
        console.error('Match info error:', error);
        res.status(500).json({ error: 'Ошибка получения информации о матче' });
    }
});

app.post('/api/matches/:id/clicks', authMiddleware, async (req, res) => {
    const { clicks } = req.body;
    const matchId = req.params.id;
    
    try {
        const [matches] = await pool.execute(
            'SELECT * FROM matches WHERE id = ? AND status = "in_progress"',
            [matchId]
        );
        
        if (matches.length === 0) {
            return res.status(404).json({ error: 'Матч не найден или завершен' });
        }
        
        const match = matches[0];
        
        if (match.player1_id === req.userId) {
            await pool.execute(
                'UPDATE matches SET player1_clicks = ? WHERE id = ?',
                [clicks, matchId]
            );
        } else if (match.player2_id === req.userId) {
            await pool.execute(
                'UPDATE matches SET player2_clicks = ? WHERE id = ?',
                [clicks, matchId]
            );
        } else {
            return res.status(403).json({ error: 'Вы не участвуете в этом матче' });
        }
        
        res.json({ message: 'Клики обновлены' });
    } catch (error) {
        console.error('Update clicks error:', error);
        res.status(500).json({ error: 'Ошибка обновления кликов' });
    }
});

app.post('/api/matches/:id/finish', authMiddleware, async (req, res) => {
    const matchId = req.params.id;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [matches] = await connection.execute(
            'SELECT * FROM matches WHERE id = ?',
            [matchId]
        );
        
        if (matches.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Матч не найден' });
        }
        
        const match = matches[0];
        
        if (match.status === 'completed') {
            await connection.rollback();
            
            const [player1] = await connection.execute('SELECT elo_rating FROM users WHERE id = ?', [match.player1_id]);
            const [player2] = await connection.execute('SELECT elo_rating FROM users WHERE id = ?', [match.player2_id]);
            
            return res.json({
                message: 'Матч уже завершен',
                winnerId: match.winner_id,
                isDraw: match.winner_id === null,
                player1_id: match.player1_id,
                player2_id: match.player2_id,
                player1_clicks: match.player1_clicks,
                player2_clicks: match.player2_clicks,
                player1EloChange: match.player1_elo_change,
                player2EloChange: match.player2_elo_change,
                newPlayer1Elo: player1[0].elo_rating,
                newPlayer2Elo: player2[0].elo_rating
            });
        }
        
        if (match.status !== 'in_progress') {
            await connection.rollback();
            return res.status(400).json({ error: 'Матч в неправильном статусе' });
        }
        
        let winnerId;
        if (match.player1_clicks > match.player2_clicks) {
            winnerId = match.player1_id;
        } else if (match.player2_clicks > match.player1_clicks) {
            winnerId = match.player2_id;
        } else {
            winnerId = null;
        }
        
        const [player1] = await connection.execute('SELECT elo_rating FROM users WHERE id = ?', [match.player1_id]);
        const [player2] = await connection.execute('SELECT elo_rating FROM users WHERE id = ?', [match.player2_id]);
        
        const player1Elo = player1[0].elo_rating;
        const player2Elo = player2[0].elo_rating;
        
        let player1EloChange = 0;
        let player2EloChange = 0;
        let newPlayer1Elo = player1Elo;
        let newPlayer2Elo = player2Elo;
        
        const K = 32;
        const expectedP1 = 1 / (1 + Math.pow(10, (player2Elo - player1Elo) / 400));
        const expectedP2 = 1 / (1 + Math.pow(10, (player1Elo - player2Elo) / 400));
        
        let actualP1, actualP2;
        if (winnerId === null) {
            actualP1 = 0.5;
            actualP2 = 0.5;
        } else if (winnerId === match.player1_id) {
            actualP1 = 1;
            actualP2 = 0;
        } else {
            actualP1 = 0;
            actualP2 = 1;
        }
        
        player1EloChange = Math.round(K * (actualP1 - expectedP1));
        player2EloChange = Math.round(K * (actualP2 - expectedP2));
        
        newPlayer1Elo = player1Elo + player1EloChange;
        newPlayer2Elo = player2Elo + player2EloChange;
        
        await connection.execute(
            'UPDATE matches SET winner_id = ?, player1_elo_change = ?, player2_elo_change = ?, status = "completed", completed_at = NOW() WHERE id = ?',
            [winnerId, player1EloChange, player2EloChange, matchId]
        );
        
        const player1Won = winnerId === match.player1_id ? 1 : 0;
        const player1Lost = winnerId === match.player2_id ? 1 : 0;
        const player2Won = winnerId === match.player2_id ? 1 : 0;
        const player2Lost = winnerId === match.player1_id ? 1 : 0;
        
        await connection.execute(
            `UPDATE users SET 
                elo_rating = ?, 
                total_clicks = total_clicks + ?,
                games_played = games_played + 1,
                games_won = games_won + ?,
                games_lost = games_lost + ?
             WHERE id = ?`,
            [newPlayer1Elo, match.player1_clicks, player1Won, player1Lost, match.player1_id]
        );
        
        await connection.execute(
            `UPDATE users SET 
                elo_rating = ?, 
                total_clicks = total_clicks + ?,
                games_played = games_played + 1,
                games_won = games_won + ?,
                games_lost = games_lost + ?
             WHERE id = ?`,
            [newPlayer2Elo, match.player2_clicks, player2Won, player2Lost, match.player2_id]
        );
        
        await connection.execute(
            'INSERT INTO elo_history (user_id, match_id, old_elo, new_elo, elo_change) VALUES (?, ?, ?, ?, ?)',
            [match.player1_id, matchId, player1Elo, newPlayer1Elo, player1EloChange]
        );
        
        await connection.execute(
            'INSERT INTO elo_history (user_id, match_id, old_elo, new_elo, elo_change) VALUES (?, ?, ?, ?, ?)',
            [match.player2_id, matchId, player2Elo, newPlayer2Elo, player2EloChange]
        );
        
        await connection.commit();
        
        res.json({
            message: 'Матч завершен',
            winnerId,
            isDraw: winnerId === null,
            player1_id: match.player1_id,
            player2_id: match.player2_id,
            player1_clicks: match.player1_clicks,
            player2_clicks: match.player2_clicks,
            player1EloChange,
            player2EloChange,
            newPlayer1Elo,
            newPlayer2Elo
        });
    } catch (error) {
        await connection.rollback();
        console.error('Finish match error:', error);
        res.status(500).json({ error: 'Ошибка завершения матча' });
    } finally {
        connection.release();
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
});
