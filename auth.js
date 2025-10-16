const canvas = document.getElementById('dark-veil-canvas');
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

const API_URL = 'http://193.42.124.100/api';

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const messageDiv = document.getElementById('message');

document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    messageDiv.style.display = 'none';
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    messageDiv.style.display = 'none';
});

function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showMessage('Заполните все поля', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showMessage('Вход выполнен успешно!', 'success');
            setTimeout(() => {
                window.location.href = 'game.html';
            }, 1000);
        } else {
            showMessage(data.error || 'Ошибка входа', 'error');
        }
    } catch (error) {
        showMessage('Ошибка подключения к серверу', 'error');
        console.error(error);
    }
});

document.getElementById('register-btn').addEventListener('click', async () => {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;

    if (!username || !password) {
        showMessage('Заполните все поля', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('Регистрация успешна! Войдите в систему', 'success');
            setTimeout(() => {
                document.getElementById('show-login').click();
                document.getElementById('login-username').value = username;
            }, 1500);
        } else {
            showMessage(data.error || 'Ошибка регистрации', 'error');
        }
    } catch (error) {
        showMessage('Ошибка подключения к серверу', 'error');
        console.error(error);
    }
});

document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (loginForm.style.display !== 'none') {
                document.getElementById('login-btn').click();
            } else {
                document.getElementById('register-btn').click();
            }
        }
    });
});
