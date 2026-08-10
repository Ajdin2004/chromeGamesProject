const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const highSpan = document.getElementById('highDisplay');

        // ----- CONSTANTS -----
        const GROUND_Y = 250;          // top of ground line
        const GROUND_HEIGHT = 50;      // ground strip height
        const DINO_X = 60;             // fixed dino x position
        const GRAVITY = 0.55;          // per physics step (60Hz)
        const JUMP_VELOCITY = -12.5;   // per physics step
        const DUCK_HEIGHT = 28;        // dino height when ducking
        const RUN_HEIGHT = 46;         // dino height when running
        const DINO_WIDTH = 40;
        const BASE_SPEED = 6;
        const MAX_SPEED = 16;
        const MIN_OBSTACLE_GAP = 200;  // minimum pixel gap between obstacles
        const PTERODACTYL_MIN_DISTANCE = 300; // no pterodactyls before this distance
        const FIXED_DT = 1000 / 60;    // 60Hz physics timestep
        const NIGHT_CYCLE_DISTANCE = 700;
        const NIGHT_TRANSITION_FRAMES = 60;  // ~1s crossfade

        // ----- STATES -----
        const STATE_START = 0;
        const STATE_PLAYING = 1;
        const STATE_GAMEOVER = 2;
        let gameState = STATE_START;
        let score = 0;
        let highScore = parseInt(localStorage.getItem('dino_highscore')) || 0;
        highSpan.textContent = highScore;
        let frameCount = 0;            // physics step counter
        let speed = BASE_SPEED;
        let distance = 0;

        // ----- FIXED TIMESTEP ENGINE -----
        let lastTime = 0;
        let accumulator = 0;
        let paused = false;
        const MAX_FRAME_DELTA = 250;   // clamp huge tab-switch deltas

        // ----- DAY/NIGHT -----
        let nightT = 0;                // 0 = day, 1 = night (interpolated)
        let nightTarget = 0;
        function updateDayNight() {
            nightTarget = Math.floor(distance / NIGHT_CYCLE_DISTANCE) % 2 === 1 ? 1 : 0;
            const step = 1 / NIGHT_TRANSITION_FRAMES;
            if (nightT < nightTarget) nightT = Math.min(1, nightT + step);
            else if (nightT > nightTarget) nightT = Math.max(0, nightT - step);
        }
        function isNight() { return nightTarget === 1; }

        // ----- PALETTE (day/night aware) -----
        function getColors() {
            // Interpolate between day and night colors
            const t = nightT;
            const lerp = (a, b) => Math.round(a + (b - a) * t);
            return {
                skyTop: `rgb(${lerp(247, 26)}, ${lerp(247, 26)}, ${lerp(247, 46)})`,
                skyBottom: `rgb(${lerp(247, 26)}, ${lerp(247, 26)}, ${lerp(247, 46)})`,
                ground: `rgb(${lerp(232, 52)}, ${lerp(232, 52)}, ${lerp(232, 77)})`,
                groundLine: `rgb(${lerp(83, 205)}, ${lerp(83, 205)}, ${lerp(83, 214)})`,
                texture: `rgb(${lerp(214, 130)}, ${lerp(214, 130)}, ${lerp(214, 158)})`,
                sprite: `rgb(${lerp(83, 205)}, ${lerp(83, 205)}, ${lerp(83, 214)})`,
                cloud: `rgba(${lerp(224, 180)}, ${lerp(224, 180)}, ${lerp(224, 190)}, ${lerp(1, 0.25)})`,
                textDark: `rgb(${lerp(83, 220)}, ${lerp(83, 220)}, ${lerp(83, 220)})`,
                textMuted: `rgb(${lerp(138, 200)}, ${lerp(138, 200)}, ${lerp(138, 220)})`
            };
        }

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
                osc.frequency.setValueAtTime(200, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(); osc.stop(audioCtx.currentTime + 0.1);
            },
            score(milestone) {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                // vary pitch by milestone: 100 -> 880, 200 -> 990, 300 -> 1100...
                const base = 880 + (milestone / 100 - 1) * 110;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(base, now);
                osc.frequency.setValueAtTime(base * 1.25, now + 0.08);
                gain.gain.setValueAtTime(0.08, now);
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
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.3);
            }
        };

        // ----- DINO -----
        const dino = {
            y: GROUND_Y - RUN_HEIGHT,
            velocity: 0,
            ducking: false,
            downHeld: false,       // is ↓ currently held
            legFrame: 0,
            dead: false,
            reset() {
                this.y = GROUND_Y - RUN_HEIGHT;
                this.velocity = 0;
                this.ducking = false;
                this.downHeld = false;
                this.legFrame = 0;
                this.dead = false;
            },
            jump() {
                if (this.y >= GROUND_Y - RUN_HEIGHT) {
                    this.velocity = JUMP_VELOCITY;
                    this.ducking = false;
                    Sound.jump();
                }
            },
            duck(on) {
                this.downHeld = on;
                if (on) {
                    // instant duck if grounded
                    if (this.y >= GROUND_Y - RUN_HEIGHT) {
                        this.ducking = true;
                        this.y = GROUND_Y - DUCK_HEIGHT;
                    }
                    // if airborne, downHeld is set; duck() auto-applies on landing in update()
                } else {
                    this.ducking = false;
                    if (this.y >= GROUND_Y - DUCK_HEIGHT) this.y = GROUND_Y - RUN_HEIGHT;
                }
            },
            update() {
                // Auto-duck on landing if ↓ still held
                if (this.downHeld && this.velocity >= 0 && this.y >= GROUND_Y - RUN_HEIGHT) {
                    this.ducking = true;
                    this.y = GROUND_Y - DUCK_HEIGHT;
                    this.velocity = 0;
                }
                // Standing target while ducking & grounded
                if (!this.downHeld && this.ducking && this.velocity >= 0 && this.y >= GROUND_Y - DUCK_HEIGHT) {
                    this.ducking = false;
                    this.y = GROUND_Y - RUN_HEIGHT;
                    this.velocity = 0;
                }
                // Ducked & grounded -> stay grounded, no gravity
                if (this.ducking && this.velocity >= 0 && this.y >= GROUND_Y - DUCK_HEIGHT) {
                    this.y = GROUND_Y - DUCK_HEIGHT;
                    this.velocity = 0;
                    this.legFrame++;
                    return;
                }
                this.velocity += GRAVITY;
                this.y += this.velocity;
                const groundY = this.ducking ? GROUND_Y - DUCK_HEIGHT : GROUND_Y - RUN_HEIGHT;
                if (this.y >= groundY) {
                    this.y = groundY;
                    this.velocity = 0;
                    // If down is held while landing, start ducking
                    if (this.downHeld && !this.ducking) {
                        this.ducking = true;
                        this.y = GROUND_Y - DUCK_HEIGHT;
                    }
                }
                if (this.y < 0) { this.y = 0; this.velocity = 0; }
                if (gameState === STATE_PLAYING) this.legFrame++;
            },
            getBounds() {
                const h = this.ducking ? DUCK_HEIGHT : RUN_HEIGHT;
                return { x: DINO_X, y: this.y, w: DINO_WIDTH, h };
            },
            draw(palette) {
                const b = this.getBounds();
                ctx.save();
                if (this.dead) ctx.globalAlpha = 0.5;
                ctx.fillStyle = palette.sprite;
                // body
                ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
                // head
                ctx.fillRect(b.x + b.w - 10, b.y - 6, 14, 14);
                // eye
                ctx.fillStyle = '#fff';
                ctx.fillRect(b.x + b.w - 4, b.y - 2, 5, 5);
                ctx.fillStyle = palette.sprite;
                ctx.fillRect(b.x + b.w - 2, b.y, 2, 2);
                // mouth
                ctx.fillRect(b.x + b.w - 12, b.y + 8, 16, 2);
                // tail
                ctx.fillRect(b.x - 6, b.y + 4, 10, 4);
                ctx.fillRect(b.x - 10, b.y + 8, 8, 4);
                // legs
                if (this.ducking) {
                    ctx.fillRect(b.x + 6, b.y + b.h - 6, 10, 6);
                    ctx.fillRect(b.x + 22, b.y + b.h - 6, 10, 6);
                } else {
                    const legOffset = Math.floor(this.legFrame / 6) % 2 === 0 ? 0 : 6;
                    ctx.fillRect(b.x + 6, b.y + b.h - 8, 8, 8);
                    ctx.fillRect(b.x + 22 + legOffset, b.y + b.h - 8, 8, 8);
                }
                // arm
                ctx.fillRect(b.x + b.w - 16, b.y + 10, 4, 10);
                ctx.restore();
            }
        };

        // ----- OBSTACLES -----
        let obstacles = [];
        let spawnTimer = 0;

        function spawnObstacle() {
            const r = Math.random();
            let type, w, h, y;
            // Pterodactyls only after enough distance.
            // When locked, remap r from 0-1 to 0-0.85 so the pterodactyl branch never triggers.
            const pterodactylUnlocked = distance > PTERODACTYL_MIN_DISTANCE;
            const roll = pterodactylUnlocked ? r : r * 0.85;
            if (roll < 0.55) {
                // small cactus
                type = 'small-cactus';
                w = 16; h = 32;
                y = GROUND_Y - h;
            } else if (roll < 0.85) {
                // large cactus
                type = 'large-cactus';
                w = 24; h = 48;
                y = GROUND_Y - h;
            } else {
                // pterodactyl
                type = 'pterodactyl';
                w = 40; h = 26;
                const alt = Math.random();
                if (alt < 0.4) y = GROUND_Y - 60;
                else if (alt < 0.7) y = GROUND_Y - 100;
                else y = GROUND_Y - 140;
            }
            obstacles.push({ type, x: canvas.width + 20, w, h, y, passed: false });
        }

        function updateObstacles() {
            spawnTimer--;
            if (spawnTimer <= 0) {
                // Check minimum pixel gap from the last obstacle
                const lastX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -Infinity;
                if (canvas.width + 20 - lastX >= MIN_OBSTACLE_GAP) {
                    spawnObstacle();
                }
                // Gap scales with speed but clamped: between 40 and 110 frames
                const gapFrames = Math.floor((55 + Math.random() * 55) * (BASE_SPEED / speed));
                spawnTimer = Math.max(35, Math.min(110, gapFrames));
            }
            for (let i = obstacles.length - 1; i >= 0; i--) {
                const o = obstacles[i];
                o.x -= speed;
                if (o.x + o.w < 0) obstacles.splice(i, 1);
            }
        }

        function checkCollision() {
            const db = dino.getBounds();
            for (const o of obstacles) {
                // shrink hitboxes slightly for fairness
                const d = { x: db.x + 4, y: db.y + 4, w: db.w - 8, h: db.h - 8 };
                const ob = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 };
                if (d.x < ob.x + ob.w && d.x + d.w > ob.x && d.y < ob.y + ob.h && d.y + d.h > ob.y) {
                    return true;
                }
            }
            return false;
        }

        function drawObstacles(palette) {
            obstacles.forEach(o => {
                ctx.fillStyle = palette.sprite;
                if (o.type === 'small-cactus') {
                    ctx.fillRect(o.x + 4, o.y, 8, o.h);
                    ctx.fillRect(o.x, o.y + 8, 4, 12);
                    ctx.fillRect(o.x + 12, o.y + 12, 4, 10);
                } else if (o.type === 'large-cactus') {
                    ctx.fillRect(o.x + 6, o.y, 12, o.h);
                    ctx.fillRect(o.x, o.y + 10, 6, 16);
                    ctx.fillRect(o.x + 18, o.y + 14, 6, 14);
                    ctx.fillRect(o.x + 2, o.y + 4, 4, 8);
                } else if (o.type === 'pterodactyl') {
                    // body
                    ctx.fillRect(o.x + 8, o.y + 8, 20, 10);
                    // head
                    ctx.fillRect(o.x + 26, o.y + 4, 10, 8);
                    // beak
                    ctx.fillRect(o.x + 34, o.y + 6, 6, 3);
                    // eye
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(o.x + 30, o.y + 5, 3, 3);
                    ctx.fillStyle = palette.sprite;
                    // wings (flap by physics frame)
                    const flap = Math.floor(frameCount / 8) % 2 === 0;
                    if (flap) {
                        ctx.fillRect(o.x + 4, o.y, 14, 6);
                        ctx.fillRect(o.x + 2, o.y - 4, 8, 6);
                    } else {
                        ctx.fillRect(o.x + 4, o.y + 14, 14, 6);
                        ctx.fillRect(o.x + 2, o.y + 18, 8, 6);
                    }
                }
            });
        }

        // ----- GROUND -----
        let groundOffset = 0;
        function drawGround(palette) {
            // ground line
            ctx.fillStyle = palette.groundLine;
            ctx.fillRect(0, GROUND_Y, canvas.width, 3);
            // ground texture (moving dashes)
            ctx.fillStyle = palette.texture;
            const dashW = 24;
            const gap = 18;
            const total = dashW + gap;
            const offset = -(groundOffset % total);
            for (let x = offset; x < canvas.width; x += total) {
                ctx.fillRect(x, GROUND_Y + 10, dashW, 3);
            }
            // ground fill
            ctx.fillStyle = palette.ground;
            ctx.fillRect(0, GROUND_Y + 3, canvas.width, GROUND_HEIGHT - 3);
        }

        // ----- CLOUDS -----
        let clouds = [];
        for (let i = 0; i < 4; i++) {
            clouds.push({
                x: Math.random() * canvas.width,
                y: 30 + Math.random() * 80,
                w: 40 + Math.random() * 30,
                speed: Math.random() * 0.4 + 0.2
            });
        }
        function drawClouds(palette) {
            clouds.forEach(c => {
                c.x -= c.speed * (speed / BASE_SPEED);
                if (c.x + c.w < 0) {
                    c.x = canvas.width + c.w;
                    c.y = 30 + Math.random() * 80;
                }
                ctx.fillStyle = palette.cloud;
                ctx.beginPath();
                ctx.ellipse(c.x, c.y, c.w * 0.5, 10, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(c.x - c.w * 0.3, c.y - 6, c.w * 0.3, 8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(c.x + c.w * 0.3, c.y - 3, c.w * 0.25, 7, 0, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // ----- STARS (night mode) -----
        let stars = [];
        for (let i = 0; i < 30; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * 120,
                size: Math.random() * 2 + 1,
                twinkle: Math.random() * Math.PI * 2
            });
        }
        function drawStars() {
            stars.forEach(s => {
                const alpha = (0.5 + 0.5 * Math.sin(frameCount * 0.05 + s.twinkle)) * nightT;
                if (alpha <= 0) return;
                ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
                ctx.fillRect(s.x, s.y, s.size, s.size);
            });
        }

        // ----- UI -----
        function drawUI(palette) {
            ctx.textAlign = 'center';
            if (gameState === STATE_PLAYING) {
                ctx.font = '800 22px Outfit, sans-serif';
                ctx.fillStyle = palette.textDark;
                ctx.fillText(score, canvas.width / 2, 40);
            } else if (gameState === STATE_START) {
                ctx.font = '800 26px Outfit, sans-serif';
                ctx.fillStyle = palette.textDark;
                ctx.fillText('CHROME DINO', canvas.width / 2, 90);
                ctx.font = '500 15px Outfit, sans-serif';
                ctx.fillStyle = palette.textMuted;
                ctx.fillText('Press Space / Tap to start', canvas.width / 2, 120);
            } else if (gameState === STATE_GAMEOVER) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.beginPath();
                ctx.roundRect(canvas.width / 2 - 130, 70, 260, 130, 14);
                ctx.fill();
                ctx.fillStyle = '#ef4444';
                ctx.font = '800 26px Outfit, sans-serif';
                ctx.fillText('GAME OVER', canvas.width / 2, 110);
                ctx.fillStyle = '#fff';
                ctx.font = '600 18px Outfit, sans-serif';
                ctx.fillText(`Score: ${score}`, canvas.width / 2, 145);
                ctx.fillText(`Best: ${highScore}`, canvas.width / 2, 172);
                ctx.font = '400 13px Outfit, sans-serif';
                ctx.fillStyle = '#cbd5e1';
                ctx.fillText('Space / Tap to restart', canvas.width / 2, 195);
            }
        }

        // ----- GAME CONTROL -----
        function triggerAction() {
            initAudio();
            if (gameState === STATE_START) {
                gameState = STATE_PLAYING;
                dino.jump();
            } else if (gameState === STATE_PLAYING) {
                dino.jump();
            } else if (gameState === STATE_GAMEOVER) {
                resetGame();
            }
        }

        function gameOver() {
            if (gameState === STATE_PLAYING) {
                gameState = STATE_GAMEOVER;
                dino.dead = true;
                Sound.hit();
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('dino_highscore', highScore);
                    highSpan.textContent = highScore;
                }
            }
        }

        function resetGame() {
            dino.reset();
            obstacles = [];
            spawnTimer = 30;
            score = 0;
            speed = BASE_SPEED;
            distance = 0;
            frameCount = 0;
            groundOffset = 0;
            nightT = 0;
            nightTarget = 0;
            accumulator = 0;
            lastTime = 0;
            gameState = STATE_PLAYING;
            dino.jump();
        }

        // ----- PHYSICS STEP -----
        function physicsStep() {
            frameCount++;
            distance += speed;
            // increase speed over time (0.5 per 500 distance, capped)
            speed = Math.min(MAX_SPEED, BASE_SPEED + Math.floor(distance / 500) * 0.5);
            // score: 1 point per 10 distance units
            const newScore = Math.floor(distance / 10);
            if (newScore > score) {
                score = newScore;
                if (score > 0 && score % 100 === 0) Sound.score(score);
            }
            groundOffset += speed;
            updateDayNight();
            dino.update();
            updateObstacles();
            if (checkCollision()) gameOver();
        }

        // ----- RENDER -----
        function render() {
            const palette = getColors();

            // sky background (interpolated day/night)
            ctx.fillStyle = palette.skyTop;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            drawStars();
            drawClouds(palette);
            drawGround(palette);
            drawObstacles(palette);
            dino.draw(palette);
            drawUI(palette);
        }

        // ----- EVENT LISTENERS -----
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                triggerAction();
            }
            if (e.code === 'ArrowDown') {
                e.preventDefault();
                dino.duck(true);
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowDown') {
                dino.duck(false);
            }
        });
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            triggerAction();
        });
        canvas.addEventListener('mousedown', () => {
            triggerAction();
        });

        // Pause when tab is hidden (prevents instant death)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                paused = true;
            } else {
                // reset timers so no giant physics catch-up happens
                lastTime = performance.now();
                accumulator = 0;
                paused = false;
            }
        });

        // ----- MAIN LOOP (fixed timestep) -----
        function gameLoop(now) {
            requestAnimationFrame(gameLoop);

            if (paused) {
                lastTime = now;
                return;
            }
            if (!lastTime) lastTime = now;

            let delta = now - lastTime;
            lastTime = now;
            // clamp to avoid huge catch-up after tab switch / frame drops
            if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;

            accumulator += delta;
            while (accumulator >= FIXED_DT) {
                if (gameState === STATE_PLAYING) {
                    physicsStep();
                } else {
                    // still advance day/night & animations in start/gameover? only frameCount for flutter
                    frameCount++;
                }
                accumulator -= FIXED_DT;
            }

            render();
        }

        // polyfill roundRect
        if (!CanvasRenderingContext2D.prototype.roundRect) {
            CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
                if (r > w / 2) r = w / 2;
                if (r > h / 2) r = h / 2;
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

        gameLoop(performance.now());