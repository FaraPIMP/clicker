const API_URL = 'http://193.42.124.100/api';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
let currentMatchId = null;
let matchCheckInterval = null;

if (!token) {
    window.location.href = 'index.html';
}

const canvas = document.getElementById('main-dark-veil-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

const blobs = [];
for (let i = 0; i < 8; i++) {
    blobs.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 300 + 200,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        hue: Math.random() * 60 + 260
    });
}

function animateDarkVeil() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    blobs.forEach(blob => {
        blob.x += blob.vx;
        blob.y += blob.vy;

        if (blob.x < -blob.radius || blob.x > canvas.width + blob.radius) blob.vx *= -1;
        if (blob.y < -blob.radius || blob.y > canvas.height + blob.radius) blob.vy *= -1;

        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.radius);
        gradient.addColorStop(0, `hsla(${blob.hue}, 70%, 50%, 0.3)`);
        gradient.addColorStop(0.5, `hsla(${blob.hue}, 70%, 40%, 0.1)`);
        gradient.addColorStop(1, `hsla(${blob.hue}, 70%, 30%, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    requestAnimationFrame(animateDarkVeil);
}

animateDarkVeil();

async function sendHeartbeat() {
    try {
        await fetch(`${API_URL}/heartbeat`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (error) {
        console.error('Heartbeat error:', error);
    }
}

sendHeartbeat();
setInterval(sendHeartbeat, 30000);

document.getElementById('username').textContent = currentUser.username || 'Игрок';
document.getElementById('user-elo').textContent = currentUser.elo || 1000;
document.getElementById('user-games').textContent = currentUser.gamesPlayed || 0;

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById(screenId).style.display = 'flex';
}

function showMainMenu() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById('main-menu').style.display = 'block';
    
    if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
    }
    
    if (challengeCheckInterval) {
        clearInterval(challengeCheckInterval);
    }
    
    currentChallengeId = null;
}

document.getElementById('practice-btn').addEventListener('click', () => {
    showScreen('practice-screen');
    initPracticeMode();
});

document.getElementById('ranked-btn').addEventListener('click', async () => {
    showScreen('player-selection-screen');
    await loadPlayers();
    startChallengeCheck();
});

document.getElementById('leaderboard-btn').addEventListener('click', async () => {
    showScreen('leaderboard-screen');
    await loadLeaderboard();
});

let counter = 0;
let clickTimes = [];
let isFreeMode = true;
let isTestActive = false;
let testStartCount = 0;

const counterDisplay = document.getElementById('counter');
const cpsDisplay = document.getElementById('cps-value');
const testStatus = document.getElementById('test-status');
const freeModeButtons = document.getElementById('free-mode-buttons');
const testModeButtons = document.getElementById('test-mode-buttons');

function initPracticeMode() {
    // Initialization if needed
}

document.getElementById('free-mode-btn').addEventListener('click', () => {
    isFreeMode = true;
    document.getElementById('free-mode-btn').classList.add('active');
    document.getElementById('test-mode-btn').classList.remove('active');
    freeModeButtons.style.display = 'block';
    testModeButtons.style.display = 'none';
    testStatus.textContent = '';
    testStatus.className = 'test-status';
});

document.getElementById('test-mode-btn').addEventListener('click', () => {
    isFreeMode = false;
    document.getElementById('test-mode-btn').classList.add('active');
    document.getElementById('free-mode-btn').classList.remove('active');
    testModeButtons.style.display = 'block';
    freeModeButtons.style.display = 'none';
    testStatus.textContent = '';
    testStatus.className = 'test-status';
    clickTimes = [];
    cpsDisplay.textContent = '0.00';
});

function incrementCounter() {
    counter++;
    counterDisplay.textContent = counter;
    clickTimes.push(Date.now());
    calculateCPS();
    triggerLightning();
}

function calculateCPS() {
    const now = Date.now();
    clickTimes = clickTimes.filter(time => now - time <= 10000);
    const cps = clickTimes.length / 10;
    cpsDisplay.textContent = cps.toFixed(2);
}

document.getElementById('increment-free').addEventListener('click', incrementCounter);
document.getElementById('increment-test').addEventListener('click', incrementCounter);



document.getElementById('reset-free').addEventListener('click', () => {
    counter = 0;
    clickTimes = [];
    counterDisplay.textContent = counter;
    cpsDisplay.textContent = '0.00';
});

document.getElementById('start-test').addEventListener('click', startPreparation);

function startPreparation() {
    document.getElementById('start-test').disabled = true;
    document.getElementById('increment-test').disabled = true;
    testStatus.className = 'test-status preparation';
    
    let countdown = 5;
    testStatus.textContent = `Приготовьтесь: ${countdown}`;
    
    const prepInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            testStatus.textContent = `Приготовьтесь: ${countdown}`;
        } else {
            clearInterval(prepInterval);
            startTest();
        }
    }, 1000);
}

function startTest() {
    testStartCount = counter;
    clickTimes = [];
    isTestActive = true;
    testStatus.className = 'test-status active';
    document.getElementById('increment-test').disabled = false;
    
    let countdown = 10;
    testStatus.textContent = `Тест: ${countdown}с`;
    
    const testInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            testStatus.textContent = `Тест: ${countdown}с`;
        } else {
            clearInterval(testInterval);
            endTest();
        }
    }, 1000);
}

function endTest() {
    isTestActive = false;
    document.getElementById('increment-test').disabled = true;
    testStatus.className = 'test-status finished';
    
    const testClicks = counter - testStartCount;
    const finalCPS = parseFloat(cpsDisplay.textContent);
    
    testStatus.textContent = `Тест завершен! Клики: ${testClicks} | CPS: ${finalCPS.toFixed(2)}`;
    
    setTimeout(() => {
        document.getElementById('start-test').disabled = false;
    }, 2000);
}

function generateLightningPath(startX, startY, endX, endY) {
    let path = `M ${startX} ${startY}`;
    const segments = 15;
    const dx = (endX - startX) / segments;
    const dy = (endY - startY) / segments;
    
    let currentX = startX;
    let currentY = startY;
    
    for (let i = 0; i < segments; i++) {
        const offsetX = (Math.random() - 0.5) * 50;
        const offsetY = (Math.random() - 0.5) * 50;
        
        currentX += dx + offsetX;
        currentY += dy + offsetY;
        
        path += ` L ${currentX} ${currentY}`;
        
        if (Math.random() > 0.7) {
            const branchX = currentX + (Math.random() - 0.5) * 100;
            const branchY = currentY + (Math.random() - 0.5) * 100;
            path += ` M ${currentX} ${currentY} L ${branchX} ${branchY} M ${currentX} ${currentY}`;
        }
    }
    
    path += ` L ${endX} ${endY}`;
    return path;
}

function triggerLightning() {
    const button = isFreeMode ? document.getElementById('increment-free') : document.getElementById('increment-test');
    const buttonRect = button.getBoundingClientRect();
    const buttonCenterX = buttonRect.left + buttonRect.width / 2;
    const buttonCenterY = buttonRect.top + buttonRect.height / 2;
    
    const side = Math.floor(Math.random() * 4);
    let startX, startY;
    
    switch(side) {
        case 0: startX = Math.random() * window.innerWidth; startY = 0; break;
        case 1: startX = window.innerWidth; startY = Math.random() * window.innerHeight; break;
        case 2: startX = Math.random() * window.innerWidth; startY = window.innerHeight; break;
        case 3: startX = 0; startY = Math.random() * window.innerHeight; break;
    }
    
    const path = generateLightningPath(startX, startY, buttonCenterX, buttonCenterY);
    
    const lightningSvg = document.getElementById('lightning-svg');
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', path);
    pathElement.setAttribute('class', 'lightning');
    pathElement.style.animation = 'lightning-flash 0.6s ease-out';
    
    lightningSvg.appendChild(pathElement);
    
    setTimeout(() => {
        lightningSvg.removeChild(pathElement);
    }, 600);
}

let currentFilter = 'all';
let allPlayers = [];
let challengeCheckInterval = null;
let currentChallengeId = null;

async function loadPlayers() {
    try {
        const response = await fetch(`${API_URL}/players`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        allPlayers = await response.json();
        displayPlayers(allPlayers);
    } catch (error) {
        console.error('Load players error:', error);
        alert('Ошибка загрузки списка игроков');
    }
}

function displayPlayers(players) {
    const playersList = document.getElementById('players-list');
    
    if (players.length === 0) {
        playersList.innerHTML = '<p style="text-align: center; color: #b794f6; padding: 40px;">Нет доступных игроков</p>';
        return;
    }
    
    playersList.innerHTML = players.map(player => `
        <div class="player-card">
            <div class="player-info-card">
                <div class="player-name">
                    ${player.isOnline ? '<span class="online-indicator"></span>' : '<span class="offline-indicator"></span>'}
                    ${player.username}
                </div>
                <div class="player-stats">
                    <span><span class="stat-label">ELO:</span> ${player.elo_rating}</span>
                    <span><span class="stat-label">Игр:</span> ${player.games_played}</span>
                    <span><span class="stat-label">Побед:</span> ${player.games_won}</span>
                    <span><span class="stat-label">Поражений:</span> ${player.games_lost}</span>
                </div>
            </div>
            <button class="challenge-player-btn" onclick="challengePlayer(${player.id}, '${player.username}')">
                ⚔️ Вызвать
            </button>
        </div>
    `).join('');
}

document.getElementById('filter-all').addEventListener('click', () => {
    setFilter('all');
    displayPlayers(allPlayers);
});

document.getElementById('filter-similar').addEventListener('click', () => {
    setFilter('similar');
    const myElo = currentUser.elo || 1000;
    const filtered = allPlayers.filter(p => Math.abs(p.elo_rating - myElo) <= 200);
    displayPlayers(filtered);
});

document.getElementById('filter-online').addEventListener('click', () => {
    setFilter('online');
    const filtered = allPlayers.filter(p => p.isOnline);
    displayPlayers(filtered);
});

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`filter-${filter}`).classList.add('active');
}

async function challengePlayer(playerId, playerName) {
    try {
        const response = await fetch(`${API_URL}/challenge`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ opponentId: playerId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentMatchId = data.matchId;
            document.getElementById('challenged-player-name').textContent = playerName;
            showScreen('matchmaking-screen');
            startChallengeStatusCheck();
        } else {
            alert(data.error || 'Ошибка отправки вызова');
        }
    } catch (error) {
        console.error('Challenge error:', error);
        alert('Ошибка отправки вызова');
    }
}

// Проверка статуса вызова (для отправителя)
async function startChallengeStatusCheck() {
    matchCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/challenges/${currentMatchId}/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.status === 'in_progress') {
                clearInterval(matchCheckInterval);
                await startBattle(currentMatchId);
            }
        } catch (error) {
            console.error('Challenge status check error:', error);
        }
    }, 2000);
}

// Проверка входящих вызовов
async function checkIncomingChallenges() {
    try {
        const response = await fetch(`${API_URL}/challenges`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const challenge = await response.json();
        
        if (challenge && challenge.id !== currentChallengeId) {
            currentChallengeId = challenge.id;
            currentMatchId = challenge.id;
            showChallengeNotification(challenge);
        }
    } catch (error) {
        console.error('Check challenges error:', error);
    }
}

function showChallengeNotification(challenge) {
    document.getElementById('challenger-name').textContent = challenge.username;
    document.getElementById('challenger-elo').textContent = challenge.elo_rating;
    showScreen('challenge-screen');
}

function startChallengeCheck() {
    if (challengeCheckInterval) {
        clearInterval(challengeCheckInterval);
    }
    checkIncomingChallenges(); // Проверяем сразу
    challengeCheckInterval = setInterval(checkIncomingChallenges, 3000);
}

async function acceptChallenge() {
    try {
        const response = await fetch(`${API_URL}/challenges/${currentMatchId}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            await startBattle(currentMatchId);
        } else {
            const data = await response.json();
            alert(data.error || 'Ошибка принятия вызова');
            showScreen('player-selection-screen');
        }
    } catch (error) {
        console.error('Accept challenge error:', error);
        alert('Ошибка принятия вызова');
    }
}

async function declineChallenge() {
    try {
        await fetch(`${API_URL}/challenges/${currentMatchId}/decline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        currentChallengeId = null;
        showScreen('player-selection-screen');
    } catch (error) {
        console.error('Decline challenge error:', error);
    }
}

async function startMatchmaking() {
    try {
        const response = await fetch(`${API_URL}/matchmaking`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        currentMatchId = data.matchId;
        
        if (data.waiting) {
            document.getElementById('matchmaking-status').textContent = 'Ожидание соперника...';
            matchCheckInterval = setInterval(checkMatchStatus, 2000);
        } else {
            await startBattle(data.matchId);
        }
    } catch (error) {
        console.error('Matchmaking error:', error);
        alert('Ошибка поиска матча');
        showMainMenu();
    }
}

async function checkMatchStatus() {
    try {
        const response = await fetch(`${API_URL}/matches/${currentMatchId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const match = await response.json();
        
        if (match.status === 'in_progress') {
            clearInterval(matchCheckInterval);
            await startBattle(currentMatchId);
        }
    } catch (error) {
        console.error('Match check error:', error);
    }
}

function cancelMatchmaking() {
    if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
    }
    if (challengeCheckInterval) {
        clearInterval(challengeCheckInterval);
    }
    showScreen('player-selection-screen');
    startChallengeCheck();
}

let battleClicks = 0;
let opponentClicks = 0;
let battleActive = false;
let battleUpdateInterval = null;

async function startBattle(matchId) {
    showScreen('battle-screen');
    
    try {
        const response = await fetch(`${API_URL}/matches/${matchId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const match = await response.json();
        
        const isPlayer1 = match.player1_id === currentUser.id;
        const opponentName = isPlayer1 ? match.player2_name : match.player1_name;
        const opponentElo = isPlayer1 ? match.player2_elo : match.player1_elo;
        
        document.getElementById('battle-player1-name').textContent = currentUser.username;
        document.getElementById('battle-player1-elo').textContent = currentUser.elo;
        document.getElementById('battle-player2-name').textContent = opponentName || 'Соперник';
        document.getElementById('battle-player2-elo').textContent = opponentElo || 1000;
        
        document.getElementById('battle-score1').textContent = '0';
        document.getElementById('battle-score2').textContent = '0';
        
        await battleCountdown();
    } catch (error) {
        console.error('Battle start error:', error);
        alert('Ошибка запуска битвы');
        showMainMenu();
    }
}

async function battleCountdown() {
    document.getElementById('battle-status').textContent = 'Приготовьтесь...';
    let countdown = 3;
    
    const countInterval = setInterval(() => {
        document.getElementById('battle-timer').textContent = countdown;
        countdown--;
        
        if (countdown < 0) {
            clearInterval(countInterval);
            startBattleClicking();
        }
    }, 1000);
}

function startBattleClicking() {
    battleActive = true;
    battleClicks = 0;
    document.getElementById('battle-status').textContent = 'КЛИКАЙ!';
    document.getElementById('battle-click-btn').disabled = false;
    
    let timeLeft = 10;
    document.getElementById('battle-timer').textContent = timeLeft;
    
    const battleTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('battle-timer').textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(battleTimer);
            endBattle();
        }
    }, 1000);
    
    battleUpdateInterval = setInterval(updateBattleClicks, 500);
}

document.getElementById('battle-click-btn').addEventListener('click', () => {
    if (battleActive) {
        battleClicks++;
        document.getElementById('battle-score1').textContent = battleClicks;
        triggerBattleLightning();
    }
});

async function updateBattleClicks() {
    try {
        await fetch(`${API_URL}/matches/${currentMatchId}/clicks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clicks: battleClicks })
        });
        
        const response = await fetch(`${API_URL}/matches/${currentMatchId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const match = await response.json();
        
        const isPlayer1 = match.player1_id === currentUser.id;
        opponentClicks = isPlayer1 ? match.player2_clicks : match.player1_clicks;
        
        document.getElementById('battle-score2').textContent = opponentClicks;
    } catch (error) {
        console.error('Update clicks error:', error);
    }
}

async function endBattle() {
    battleActive = false;
    document.getElementById('battle-click-btn').disabled = true;
    document.getElementById('battle-status').textContent = 'Завершение...';
    
    if (battleUpdateInterval) {
        clearInterval(battleUpdateInterval);
    }
    
    try {
        await fetch(`${API_URL}/matches/${currentMatchId}/clicks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clicks: battleClicks })
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await fetch(`${API_URL}/matches/${currentMatchId}/finish`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        console.log('Match result:', result);
        
        const isPlayer1 = result.player1_id === currentUser.id;
        const yourClicks = isPlayer1 ? result.player1_clicks : result.player2_clicks;
        const opponentFinalClicks = isPlayer1 ? result.player2_clicks : result.player1_clicks;
        const yourEloChange = isPlayer1 ? result.player1EloChange : result.player2EloChange;
        const isDraw = result.isDraw;
        const won = !isDraw && (result.winnerId === currentUser.id);
        
        console.log('Your ELO change:', yourEloChange);
        
        showResults(yourClicks, opponentFinalClicks, yourEloChange, won, isDraw);
        
        currentUser.elo = isPlayer1 ? result.newPlayer1Elo : result.newPlayer2Elo;
        localStorage.setItem('user', JSON.stringify(currentUser));
        document.getElementById('user-elo').textContent = currentUser.elo;
    } catch (error) {
        console.error('End battle error:', error);
        alert('Ошибка завершения битвы');
        showMainMenu();
    }
}

function triggerBattleLightning() {
    const button = document.getElementById('battle-click-btn');
    const buttonRect = button.getBoundingClientRect();
    const buttonCenterX = buttonRect.left + buttonRect.width / 2;
    const buttonCenterY = buttonRect.top + buttonRect.height / 2;
    
    const side = Math.floor(Math.random() * 4);
    let startX, startY;
    
    switch(side) {
        case 0: startX = Math.random() * window.innerWidth; startY = 0; break;
        case 1: startX = window.innerWidth; startY = Math.random() * window.innerHeight; break;
        case 2: startX = Math.random() * window.innerWidth; startY = window.innerHeight; break;
        case 3: startX = 0; startY = Math.random() * window.innerHeight; break;
    }
    
    const path = generateLightningPath(startX, startY, buttonCenterX, buttonCenterY);
    
    const lightningSvg = document.getElementById('battle-lightning-svg');
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', path);
    pathElement.setAttribute('class', 'lightning');
    pathElement.style.animation = 'lightning-flash 0.6s ease-out';
    
    lightningSvg.appendChild(pathElement);
    
    setTimeout(() => {
        lightningSvg.removeChild(pathElement);
    }, 600);
}

function showResults(yourClicks, opponentClicks, eloChange, won, isDraw = false) {
    showScreen('results-screen');
    
    let resultTitle;
    if (isDraw) {
        resultTitle = 'НИЧЬЯ!';
    } else if (won) {
        resultTitle = 'ПОБЕДА!';
    } else {
        resultTitle = 'ПОРАЖЕНИЕ';
    }
    
    document.getElementById('result-title').textContent = resultTitle;
    document.getElementById('result-your-clicks').textContent = yourClicks;
    document.getElementById('result-opponent-clicks').textContent = opponentClicks;
    
    const eloChangeElement = document.getElementById('elo-change');
    if (eloChange !== undefined && eloChange !== null) {
        eloChangeElement.textContent = (eloChange >= 0 ? '+' : '') + eloChange + ' ELO';
        eloChangeElement.className = 'elo-change ' + (eloChange >= 0 ? 'positive' : 'negative');
    } else {
        eloChangeElement.textContent = '0 ELO';
        eloChangeElement.className = 'elo-change';
    }
}

async function loadLeaderboard() {
    try {
        const response = await fetch(`${API_URL}/leaderboard`);
        const leaderboard = await response.json();
        
        const tbody = document.getElementById('leaderboard-body');
        tbody.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const row = tbody.insertRow();
            const onlineStatus = player.isOnline 
                ? '<span class="online-indicator"></span>' 
                : '<span class="offline-indicator"></span>';
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${onlineStatus} ${player.username}</td>
                <td>${player.elo_rating}</td>
                <td>${player.games_played}</td>
                <td>${player.games_won}</td>
                <td>${player.games_lost}</td>
            `;
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        alert('Ошибка загрузки таблицы лидеров');
    }
}
