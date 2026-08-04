        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const highSpan = document.getElementById('highDisplay');

        // ----- DIFFICULTY -----
        let currentDifficulty = 'easy';
        const DIFFICULTIES = {
            easy:   { tileCount: 15, fruitCount: 1, targetFruits: 10, baseSpeed: 130 },
            medium: { tileCount: 20, fruitCount: 2, targetFruits: 20, baseSpeed: 95 },
            hard:   { tileCount: 25, fruitCount: 3, targetFruits: 35, baseSpeed: 65 }
        };
        const diffBtns = document.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                diffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentDifficulty = btn.dataset.diff;
                if (gameState === STATE_PLAYING || gameState === STATE_GAMEOVER) {
                    resetGame();
                } else {
                    tileCount = DIFFICULTIES[currentDifficulty].tileCount;
                    gridSize = canvas.width / tileCount;
                }
            });
        });

        // ----- STATES -----
        const STATE_START = 0, STATE_PLAYING = 1, STATE_GAMEOVER = 2;
        let gameState = STATE_START;
        let score = 0, highScore = parseInt(localStorage.getItem('snake_highscore')) || 0;
        highSpan.textContent = highScore;

        let tileCount = DIFFICULTIES.easy.tileCount;
        let gridSize = canvas.width / tileCount;
        let gameSpeed = 130;
        let lastMoveTime = 0;

        // ----- SNAKE DATA (with animation interpolation) -----
        let snake = [];
        let dir = { x: 0, y: 0 };
        let nextDir = { x: 0, y: 0 };
        let foods = [];

        // Animation state: we store previous positions for smooth interpolation
        let prevSnake = [];

        // ----- AUDIO -----
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }
        const Sound = {
            eat() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.1);
            },
            hit() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.3);
            }
        };

        // ----- HELPERS -----
        function spawnSingleFood() {
            let newFood;
            let attempts = 0;
            do {
                newFood = { x: Math.floor(Math.random() * tileCount), y: Math.floor(Math.random() * tileCount) };
                attempts++;
            } while ((snake.some(s => s.x === newFood.x && s.y === newFood.y) || foods.some(f => f.x === newFood.x && f.y === newFood.y)) && attempts < 100);
            return newFood;
        }

        function spawnAllFood() {
            foods = [];
            const count = DIFFICULTIES[currentDifficulty].fruitCount;
            for (let i = 0; i < count; i++) foods.push(spawnSingleFood());
        }

        // ----- RESET / INIT -----
        function resetGame() {
            const config = DIFFICULTIES[currentDifficulty];
            tileCount = config.tileCount;
            gridSize = canvas.width / tileCount;
            gameSpeed = config.baseSpeed;
            const startX = Math.floor(tileCount / 2), startY = Math.floor(tileCount / 2);
            snake = [
                { x: startX, y: startY },
                { x: startX, y: startY + 1 },
                { x: startX, y: startY + 2 }
            ];
            prevSnake = snake.map(s => ({ ...s }));
            dir = { x: 0, y: -1 };
            nextDir = { x: 0, y: -1 };
            score = 0;
            spawnAllFood();
            gameState = STATE_PLAYING;
        }

        // ----- GAME OVER -----
        function gameOver() {
            if (gameState === STATE_PLAYING) {
                Sound.hit();
                gameState = STATE_GAMEOVER;
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('snake_highscore', highScore);
                    highSpan.textContent = highScore;
                }
            }
        }

        // ----- UPDATE (with interpolation prep) -----
        function update() {
            // store previous positions for smooth rendering
            prevSnake = snake.map(s => ({ ...s }));

            dir = { ...nextDir };
            const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

            // wall collision
            if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
                gameOver();
                return;
            }
            // self collision
            if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
                gameOver();
                return;
            }

            snake.unshift(head);
            const eatenIndex = foods.findIndex(f => f.x === head.x && f.y === head.y);
            if (eatenIndex !== -1) {
                score++;
                Sound.eat();
                if (score > highScore) { highScore = score; localStorage.setItem('snake_highscore', highScore); highSpan.textContent = highScore; }
                foods.splice(eatenIndex, 1);
                foods.push(spawnSingleFood());
                gameSpeed = Math.max(40, DIFFICULTIES[currentDifficulty].baseSpeed - Math.floor(score / 2) * 2);
            } else {
                snake.pop();
            }
        }

        // ----- RENDER (with smooth interpolation) -----
        function draw(timestamp) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // --- BACKGROUND with subtle grid ---
            const bg = ctx.createRadialGradient(200,200,50,200,200,300);
            bg.addColorStop(0, '#1a1f35');
            bg.addColorStop(1, '#0b0d19');
            ctx.fillStyle = bg;
            ctx.fillRect(0,0,canvas.width,canvas.height);

            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= tileCount; i++) {
                ctx.beginPath();
                ctx.moveTo(i * gridSize, 0);
                ctx.lineTo(i * gridSize, canvas.height);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i * gridSize);
                ctx.lineTo(canvas.width, i * gridSize);
                ctx.stroke();
            }

            // --- FOOD with pulse & glow ---
            foods.forEach((food, idx) => {
                const pulse = 1 + 0.08 * Math.sin((timestamp / 300) + idx * 1.5);
                const rad = (gridSize / 2 - 2) * pulse;
                const cx = food.x * gridSize + gridSize / 2;
                const cy = food.y * gridSize + gridSize / 2;
                ctx.shadowColor = '#ff2a6d';
                ctx.shadowBlur = 16;
                ctx.fillStyle = '#ff2a6d';
                ctx.beginPath();
                ctx.arc(cx, cy, rad, 0, Math.PI*2);
                ctx.fill();
                // inner highlight
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ff6b9d';
                ctx.beginPath();
                ctx.arc(cx-2, cy-2, rad*0.4, 0, Math.PI*2);
                ctx.fill();
            });
            ctx.shadowBlur = 0;

            // --- SNAKE with smooth interpolation between frames ---
            // We compute interpolation factor based on time since last move
            const moveInterval = gameSpeed;
            const elapsed = timestamp - lastMoveTime;
            const t = Math.min(1, elapsed / moveInterval); // 0..1

            // Draw each segment with interpolation
            for (let i = 0; i < snake.length; i++) {
                const cur = snake[i];
                const prev = (i < prevSnake.length) ? prevSnake[i] : cur;
                // interpolated position
                const ix = prev.x + (cur.x - prev.x) * t;
                const iy = prev.y + (cur.y - prev.y) * t;

                const x = ix * gridSize + 1;
                const y = iy * gridSize + 1;
                const size = gridSize - 2;

                // gradient for body
                const grad = ctx.createLinearGradient(x, y, x + size, y + size);
                if (i === 0) {
                    grad.addColorStop(0, '#00f2fe');
                    grad.addColorStop(1, '#4facfe');
                } else {
                    const ratio = i / snake.length;
                    const r = Math.floor(30 + 30 * ratio);
                    const g = Math.floor(180 + 70 * (1 - ratio));
                    const b = Math.floor(200 + 55 * (1 - ratio));
                    grad.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
                    grad.addColorStop(1, `rgb(${r-20}, ${g-20}, ${b-20})`);
                }

                ctx.fillStyle = grad;
                ctx.shadowColor = i === 0 ? '#00f2fe60' : '#4facfe30';
                ctx.shadowBlur = i === 0 ? 14 : 6;
                ctx.beginPath();
                ctx.roundRect(x, y, size, size, 4);
                ctx.fill();

                // eye on head
                if (i === 0) {
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'white';
                    const eyeOff = gridSize * 0.18;
                    const eyeSize = gridSize * 0.16;
                    // determine eye position based on direction
                    let ex1 = x + eyeOff, ey1 = y + eyeOff;
                    let ex2 = x + size - eyeOff, ey2 = y + eyeOff;
                    if (dir.x === 1) { ex1 = x + size - eyeOff; ex2 = x + size - eyeOff; ey1 = y + eyeOff; ey2 = y + size - eyeOff; }
                    else if (dir.x === -1) { ex1 = x + eyeOff; ex2 = x + eyeOff; ey1 = y + eyeOff; ey2 = y + size - eyeOff; }
                    else if (dir.y === -1) { ex1 = x + eyeOff; ex2 = x + size - eyeOff; ey1 = y + eyeOff; ey2 = y + eyeOff; }
                    else if (dir.y === 1) { ex1 = x + eyeOff; ex2 = x + size - eyeOff; ey1 = y + size - eyeOff; ey2 = y + size - eyeOff; }
                    ctx.beginPath();
                    ctx.arc(ex1, ey1, eyeSize, 0, Math.PI*2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(ex2, ey2, eyeSize, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(ex1 + dir.x*2, ey1 + dir.y*2, eyeSize*0.5, 0, Math.PI*2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(ex2 + dir.x*2, ey2 + dir.y*2, eyeSize*0.5, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            ctx.shadowBlur = 0;

            // --- UI OVERLAY ---
            ctx.textAlign = 'center';
            ctx.shadowBlur = 0;
            const target = DIFFICULTIES[currentDifficulty].targetFruits;

            if (gameState === STATE_START) {
                ctx.font = '800 40px Outfit, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#00000060';
                ctx.shadowBlur = 18;
                ctx.fillText('SNAKE', canvas.width/2, 170);
                ctx.font = '500 16px Outfit, sans-serif';
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Arrow / WASD to start', canvas.width/2, 220);
            } else if (gameState === STATE_PLAYING) {
                ctx.textAlign = 'left';
                ctx.font = '800 18px Outfit, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#00000080';
                ctx.shadowBlur = 8;
                ctx.fillText(`🍎 ${score} / ${target}`, 14, 32);
                ctx.shadowBlur = 0;
            } else if (gameState === STATE_GAMEOVER) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.roundRect(50, 120, 300, 170, 16);
                ctx.fill();
                ctx.fillStyle = '#ef4444';
                ctx.font = '800 34px Outfit, sans-serif';
                ctx.shadowColor = '#00000080';
                ctx.shadowBlur = 16;
                ctx.fillText('GAME OVER', canvas.width/2, 175);
                ctx.fillStyle = '#fff';
                ctx.font = '600 20px Outfit, sans-serif';
                ctx.shadowBlur = 8;
                ctx.fillText(`Score: ${score}`, canvas.width/2, 225);
                ctx.fillText(`Best: ${highScore}`, canvas.width/2, 260);
                ctx.shadowBlur = 0;
                ctx.font = '400 14px Outfit, sans-serif';
                ctx.fillStyle = '#cbd5e1';
                ctx.fillText('Press any key to restart', canvas.width/2, 295);
            }
        }

        // ----- CONTROLS -----
        window.addEventListener('keydown', e => {
            initAudio();
            if (gameState === STATE_START || gameState === STATE_GAMEOVER) {
                resetGame();
                e.preventDefault();
                return;
            }
            const key = e.key;
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','s','S','a','A','d','D'].includes(key)) {
                e.preventDefault();
            }
            if ((key === 'ArrowUp' || key === 'w' || key === 'W') && dir.y === 0) nextDir = { x: 0, y: -1 };
            else if ((key === 'ArrowDown' || key === 's' || key === 'S') && dir.y === 0) nextDir = { x: 0, y: 1 };
            else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && dir.x === 0) nextDir = { x: -1, y: 0 };
            else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && dir.x === 0) nextDir = { x: 1, y: 0 };
        });

        // touch controls for mobile (swipe)
        let touchStart = null;
        canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            touchStart = { x: t.clientX, y: t.clientY };
            initAudio();
            if (gameState === STATE_START || gameState === STATE_GAMEOVER) {
                resetGame();
                touchStart = null;
            }
        });
        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (!touchStart || gameState !== STATE_PLAYING) return;
            const t = e.touches[0];
            const dx = t.clientX - touchStart.x;
            const dy = t.clientY - touchStart.y;
            if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0 && dir.x === 0) nextDir = { x: 1, y: 0 };
                else if (dx < 0 && dir.x === 0) nextDir = { x: -1, y: 0 };
            } else {
                if (dy > 0 && dir.y === 0) nextDir = { x: 0, y: 1 };
                else if (dy < 0 && dir.y === 0) nextDir = { x: 0, y: -1 };
            }
            touchStart = { x: t.clientX, y: t.clientY };
        });
        canvas.addEventListener('touchend', e => { touchStart = null; });

        // ----- POLYFILL roundRect -----
        if (!CanvasRenderingContext2D.prototype.roundRect) {
            CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
                if (r > w/2) r = w/2;
                if (r > h/2) r = h/2;
                this.moveTo(x + r, y);
                this.lineTo(x + w - r, y);
                this.quadraticCurveTo(x + w, y, x + w, y + r);
                this.lineTo(x + w, y + h - r);
                this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                this.lineTo(x + r, y + h);
                this.quadraticCurveTo(x, y + h, x, y + h - r);
                this.lineTo(x, y + r);
                this.quadraticCurveTo(x, y, x + r, y);
                return this;
            };
        }

        // ----- LOOP -----
        function loop(timestamp) {
            if (gameState === STATE_PLAYING) {
                if (timestamp - lastMoveTime > gameSpeed) {
                    update();
                    lastMoveTime = timestamp;
                }
            }
            draw(timestamp);
            requestAnimationFrame(loop);
        }

        // set initial state
        gameState = STATE_START;
        const config = DIFFICULTIES.easy;
        tileCount = config.tileCount;
        gridSize = canvas.width / tileCount;
        const startX = Math.floor(tileCount / 2), startY = Math.floor(tileCount / 2);
        snake = [
            { x: startX, y: startY },
            { x: startX, y: startY + 1 },
            { x: startX, y: startY + 2 }
        ];
        prevSnake = snake.map(s => ({ ...s }));
        dir = { x: 0, y: -1 };
        nextDir = { x: 0, y: -1 };
        spawnAllFood();
        requestAnimationFrame(loop);
    