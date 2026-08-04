
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const highSpan = document.getElementById('highDisplay');

        // ----- DIFFICULTY -----
        let difficulty = 'normal'; // 'normal', 'hard', 'crazy'
        const diffBtns = document.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                diffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                difficulty = btn.dataset.diff;
                if (gameState === STATE_START || gameState === STATE_GAMEOVER) {
                    resetGame(true);
                }
            });
        });

        // ----- CONSTANTS (modified by difficulty) -----
        const BASE_GRAVITY = 0.25;
        const BASE_JUMP = -5.5;
        const BASE_PIPE_SPEED = 2;
        const BASE_SPAWN_RATE = 110;
        const PIPE_GAP = 130;

        function getDifficultyParams() {
            switch(difficulty) {
                case 'hard': return { gravity: 0.32, jump: -5.0, speed: 2.6, spawnRate: 90 };
                case 'crazy': return { gravity: 0.38, jump: -4.6, speed: 3.2, spawnRate: 70 };
                default: return { gravity: 0.25, jump: -5.5, speed: 2.0, spawnRate: 110 };
            }
        }

        // ----- STATES -----
        const STATE_START = 0;
        const STATE_PLAYING = 1;
        const STATE_GAMEOVER = 2;
        let gameState = STATE_START;
        let score = 0;
        let highScore = parseInt(localStorage.getItem('flappy_highscore')) || 0;
        highSpan.textContent = highScore;
        let frameCount = 0;

        // ----- AUDIO -----
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }
        const Sound = {
            jump() {
                if (!audioCtx) return;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(150, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(); osc.stop(audioCtx.currentTime + 0.12);
            },
            score() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.08);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.2);
            },
            hit() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.25);
            }
        };

        // ----- BIRD -----
        const bird = {
            x: 80, y: 250, radius: 14, velocity: 0, rotation: 0,
            reset() { this.y = 250; this.velocity = 0; this.rotation = 0; },
            jump() { this.velocity = getDifficultyParams().jump; },
            update() {
                const { gravity } = getDifficultyParams();
                this.velocity += gravity;
                this.y += this.velocity;
                this.rotation = Math.min(Math.PI/4, Math.max(-Math.PI/4, this.velocity/10));
                if (this.y + this.radius >= canvas.height - 40) {
                    this.y = canvas.height - 40 - this.radius;
                    gameOver();
                }
                if (this.y - this.radius <= 0) { this.y = this.radius; this.velocity = 0; }
            },
            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rotation);
                // glow
                ctx.shadowColor = '#facc1540';
                ctx.shadowBlur = 18;
                // body
                ctx.beginPath();
                ctx.arc(0, 0, this.radius, 0, Math.PI*2);
                ctx.fillStyle = '#facc15';
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 2;
                ctx.stroke();
                // eye
                ctx.beginPath();
                ctx.arc(5, -4, 4.5, 0, Math.PI*2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(6.5, -4, 2.2, 0, Math.PI*2);
                ctx.fillStyle = '#0f172a';
                ctx.fill();
                // beak
                ctx.beginPath();
                ctx.fillStyle = '#f97316';
                ctx.arc(8, 3, 6, 0, Math.PI);
                ctx.fill();
                ctx.restore();
            }
        };

        // ----- PIPES -----
        let pipes = [];
        function createPipe() {
            const minTop = 50, maxTop = canvas.height - 40 - PIPE_GAP - 50;
            const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
            pipes.push({ x: canvas.width, top: topHeight, bottom: canvas.height - 40 - (topHeight + PIPE_GAP), passed: false });
        }
        function updatePipes() {
            const { speed, spawnRate } = getDifficultyParams();
            if (frameCount % spawnRate === 0) createPipe();
            for (let i = pipes.length-1; i >= 0; i--) {
                const p = pipes[i];
                p.x -= speed;
                const birdLeft = bird.x - bird.radius, birdRight = bird.x + bird.radius;
                const birdTop = bird.y - bird.radius, birdBottom = bird.y + bird.radius;
                const inPipeX = birdRight > p.x && birdLeft < p.x + 52;
                const hitTop = birdTop < p.top;
                const hitBottom = birdBottom > canvas.height - 40 - p.bottom;
                if (inPipeX && (hitTop || hitBottom)) { gameOver(); }
                if (!p.passed && p.x + 52 < bird.x) { score++; p.passed = true; Sound.score(); 
                    if (score > highScore) { highScore = score; localStorage.setItem('flappy_highscore', highScore); highSpan.textContent = highScore; } }
                if (p.x + 52 < 0) pipes.splice(i, 1);
            }
        }
        function drawPipes() {
            pipes.forEach(p => {
                const grad = ctx.createLinearGradient(p.x, 0, p.x+52, 0);
                grad.addColorStop(0, '#22c55e');
                grad.addColorStop(0.5, '#4ade80');
                grad.addColorStop(1, '#22c55e');
                ctx.fillStyle = grad;
                ctx.shadowColor = '#22c55e40';
                ctx.shadowBlur = 14;
                // top pipe
                ctx.fillRect(p.x, 0, 52, p.top);
                ctx.fillStyle = '#15803d';
                ctx.shadowBlur = 0;
                ctx.fillRect(p.x-6, p.top-18, 64, 18);
                // bottom
                const bottomY = canvas.height - 40 - p.bottom;
                ctx.fillStyle = grad;
                ctx.shadowBlur = 14;
                ctx.fillRect(p.x, bottomY, 52, p.bottom);
                ctx.fillStyle = '#15803d';
                ctx.shadowBlur = 0;
                ctx.fillRect(p.x-6, bottomY, 64, 18);
                ctx.shadowBlur = 0;
                // border
                ctx.strokeStyle = '#0f172a20';
                ctx.lineWidth = 1;
                ctx.strokeRect(p.x, 0, 52, p.top);
                ctx.strokeRect(p.x, bottomY, 52, p.bottom);
            });
        }

        // ----- PARTICLES (background & effects) -----
        let particles = [];
        class Particle {
            constructor() { this.reset(); }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 3 + 1;
                this.speed = Math.random() * 0.4 + 0.1;
                this.opacity = Math.random() * 0.5 + 0.1;
                this.drift = (Math.random() - 0.5) * 0.3;
            }
            update() {
                this.y += this.speed;
                this.x += this.drift;
                if (this.y > canvas.height) { this.y = -5; this.x = Math.random() * canvas.width; }
                if (this.x < 0 || this.x > canvas.width) this.drift *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
                ctx.fillStyle = `rgba(255,255,240,${this.opacity})`;
                ctx.fill();
            }
        }
        for (let i=0; i<40; i++) particles.push(new Particle());

        // ----- BACKGROUND (parallax clouds) -----
        let clouds = [];
        for (let i=0; i<6; i++) {
            clouds.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * 0.6,
                w: Math.random() * 100 + 60,
                speed: Math.random() * 0.3 + 0.1,
                opacity: Math.random() * 0.15 + 0.05
            });
        }
        function drawBackground() {
            // sky gradient
            const sky = ctx.createLinearGradient(0,0,0,canvas.height);
            sky.addColorStop(0, '#4facfe');
            sky.addColorStop(0.5, '#70c5ce');
            sky.addColorStop(1, '#a8d8ea');
            ctx.fillStyle = sky;
            ctx.fillRect(0,0,canvas.width,canvas.height);
            // clouds
            clouds.forEach(c => {
                c.x += c.speed * 0.5;
                if (c.x > canvas.width + c.w) c.x = -c.w;
                ctx.fillStyle = `rgba(255,255,255,${c.opacity})`;
                ctx.beginPath();
                ctx.ellipse(c.x, c.y, c.w*0.5, 18, 0, 0, Math.PI*2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(c.x - c.w*0.3, c.y-8, c.w*0.3, 14, 0, 0, Math.PI*2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(c.x + c.w*0.3, c.y-4, c.w*0.25, 12, 0, 0, Math.PI*2);
                ctx.fill();
            });
            // particles
            particles.forEach(p => { p.update(); p.draw(); });
        }

        // ----- GROUND -----
        function drawGround() {
            ctx.fillStyle = '#8c9a6e';
            ctx.fillRect(0, canvas.height-40, canvas.width, 40);
            ctx.fillStyle = '#6b7f4f';
            ctx.fillRect(0, canvas.height-40, canvas.width, 8);
            ctx.fillStyle = '#4f6b3a';
            ctx.fillRect(0, canvas.height-8, canvas.width, 8);
            // grass detail
            ctx.strokeStyle = '#3d5a2a';
            ctx.lineWidth = 2;
            for (let i=0; i<canvas.width; i+=12) {
                ctx.beginPath();
                ctx.moveTo(i, canvas.height-40);
                ctx.lineTo(i+4, canvas.height-46);
                ctx.stroke();
            }
        }

        // ----- UI -----
        function drawUI() {
            ctx.textAlign = 'center';
            ctx.shadowBlur = 0;
            if (gameState === STATE_PLAYING) {
                ctx.font = '800 42px Outfit, sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#00000050';
                ctx.shadowBlur = 14;
                ctx.fillText(score, canvas.width/2, 70);
                ctx.shadowBlur = 0;
            } else if (gameState === STATE_START) {
                ctx.font = '800 30px Outfit, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#00000060';
                ctx.shadowBlur = 16;
                ctx.fillText('FLAP', canvas.width/2, 200);
                ctx.font = '500 18px Outfit, sans-serif';
                ctx.fillText('Space / Tap', canvas.width/2, 250);
                ctx.shadowBlur = 0;
            } else if (gameState === STATE_GAMEOVER) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.roundRect(50, 170, 300, 190, 18);
                ctx.fill();
                ctx.fillStyle = '#ef4444';
                ctx.font = '800 34px Outfit, sans-serif';
                ctx.shadowColor = '#00000080';
                ctx.shadowBlur = 16;
                ctx.fillText('GAME OVER', canvas.width/2, 225);
                ctx.fillStyle = '#fff';
                ctx.font = '600 22px Outfit, sans-serif';
                ctx.shadowBlur = 8;
                ctx.fillText(`Score: ${score}`, canvas.width/2, 280);
                ctx.fillText(`Best: ${highScore}`, canvas.width/2, 320);
                ctx.shadowBlur = 0;
                ctx.font = '400 14px Outfit, sans-serif';
                ctx.fillStyle = '#cbd5e1';
                ctx.fillText('Tap or Space to restart', canvas.width/2, 360);
            }
        }

        // ----- GAME CONTROL -----
        function triggerAction() {
            initAudio();
            if (gameState === STATE_START) {
                gameState = STATE_PLAYING;
                bird.jump(); Sound.jump();
            } else if (gameState === STATE_PLAYING) {
                bird.jump(); Sound.jump();
            } else if (gameState === STATE_GAMEOVER) {
                resetGame(false);
            }
        }
        function gameOver() {
            if (gameState === STATE_PLAYING) {
                gameState = STATE_GAMEOVER;
                Sound.hit();
                if (score > highScore) { highScore = score; localStorage.setItem('flappy_highscore', highScore); highSpan.textContent = highScore; }
            }
        }
        function resetGame(keepState) {
            bird.reset();
            pipes = [];
            score = 0;
            frameCount = 0;
            gameState = keepState ? STATE_START : STATE_PLAYING;
        }

        // ----- EVENT LISTENERS -----
        window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); triggerAction(); } });
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); triggerAction(); });
        canvas.addEventListener('mousedown', () => { triggerAction(); });

        // ----- MAIN LOOP -----
        function gameLoop() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawBackground();

            if (gameState === STATE_PLAYING) {
                frameCount++;
                bird.update();
                updatePipes();
            }
            drawPipes();
            drawGround();
            bird.draw();
            drawUI();
            requestAnimationFrame(gameLoop);
        }

        // polyfill roundRect
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

        resetGame(true);
        gameLoop();
    