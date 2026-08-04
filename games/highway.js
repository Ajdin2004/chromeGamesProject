        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const currencySpan = document.getElementById('currencyDisplay');
        const shopCurrencySpan = document.getElementById('shopCurrency');
        const shopOverlay = document.getElementById('shopOverlay');
        const shopList = document.getElementById('shopList');
        const achToast = document.getElementById('achievementToast');
        const achText = document.getElementById('achText');

        // ----- AUDIO -----
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }
        const Sound = {
            shift() {
                if (!audioCtx) return;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(); osc.stop(audioCtx.currentTime + 0.08);
            },
            crash() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(120, now);
                osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.4);
            },
            coin() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.06);
            }
        };

        // ----- VEHICLES (Shop) -----
        const VEHICLES = [
            { id: 'default', name: 'Cyber Blue', color: '#00f2fe', price: 0, owned: true, equipped: true },
            { id: 'lava', name: 'Lava Racer', color: '#ff2a6d', price: 150, owned: false, equipped: false },
            { id: 'gold', name: 'Gold Crown', color: '#facc15', price: 300, owned: false, equipped: false },
            { id: 'neon', name: 'Neon Purple', color: '#a855f7', price: 450, owned: false, equipped: false },
            { id: 'emerald', name: 'Emerald', color: '#22c55e', price: 600, owned: false, equipped: false },
            { id: 'ice', name: 'Iceberg', color: '#e2e8f0', price: 800, owned: false, equipped: false },
        ];

        // ----- PLAYER DATA (persistent) -----
        let currency = parseInt(localStorage.getItem('highway_currency')) || 0;
        let ownedVehicles = JSON.parse(localStorage.getItem('highway_owned')) || ['default'];
        let equippedVehicle = localStorage.getItem('highway_equipped') || 'default';

        function saveData() {
            localStorage.setItem('highway_currency', currency);
            localStorage.setItem('highway_owned', JSON.stringify(ownedVehicles));
            localStorage.setItem('highway_equipped', equippedVehicle);
            currencySpan.textContent = currency;
            shopCurrencySpan.textContent = currency;
        }

        // ----- ACHIEVEMENTS -----
        const ACHIEVEMENTS = {
            firstDrive: { name: 'First Drive', desc: 'Score 50', unlocked: false, check: () => score >= 50 },
            speedster: { name: 'Speedster', desc: 'Score 200', unlocked: false, check: () => score >= 200 },
            proRacer: { name: 'Pro Racer', desc: 'Score 500', unlocked: false, check: () => score >= 500 },
            collector: { name: 'Collector', desc: 'Own 3 vehicles', unlocked: false, check: () => ownedVehicles.length >= 3 },
            rich: { name: 'Rich', desc: 'Earn 1000 coins', unlocked: false, check: () => currency >= 1000 },
        };
        let unlockedAchievements = JSON.parse(localStorage.getItem('highway_achievements')) || [];

        function checkAchievements() {
            let newUnlock = false;
            for (const [key, ach] of Object.entries(ACHIEVEMENTS)) {
                if (!ach.unlocked && ach.check()) {
                    ach.unlocked = true;
                    unlockedAchievements.push(key);
                    newUnlock = true;
                    showAchievementToast(`🏆 ${ach.name}: ${ach.desc}`);
                }
            }
            if (newUnlock) {
                localStorage.setItem('highway_achievements', JSON.stringify(unlockedAchievements));
            }
        }

        function showAchievementToast(msg) {
            achText.textContent = msg;
            achToast.classList.add('show');
            clearTimeout(window.achTimeout);
            window.achTimeout = setTimeout(() => achToast.classList.remove('show'), 3500);
        }

        // ----- GAME STATE -----
        const STATE_START = 0, STATE_PLAYING = 1, STATE_GAMEOVER = 2;
        let gameState = STATE_START;
        const LANES = [85, 160, 235, 310];
        const CAR_WIDTH = 40, CAR_HEIGHT = 70;
        let player = { lane: 1, x: LANES[1], targetX: LANES[1], y: 480 };
        let traffic = [];
        let roadOffset = 0;
        let score = 0;
        let highScore = parseInt(localStorage.getItem('highway_highscore')) || 0;
        let isBoosting = false;
        let isBraking = false;
        let baseSpeed = 5;
        let frameCount = 0;
        let coinsEarned = 0;

        // ----- RESET -----
        function resetGame() {
            player.lane = 1; player.x = LANES[1]; player.targetX = LANES[1]; player.y = 480;
            traffic = []; score = 0; roadOffset = 0; frameCount = 0; coinsEarned = 0;
            isBoosting = false; isBraking = false;
            gameState = STATE_PLAYING;
        }

        // ----- SPAWN TRAFFIC -----
        function spawnTraffic() {
            const laneIndex = Math.floor(Math.random() * LANES.length);
            const inLane = traffic.some(car => car.lane === laneIndex && car.y < 120);
            if (!inLane) {
                const colors = ['#ff2a6d', '#facc15', '#a855f7', '#22c55e', '#e2e8f0', '#f97316'];
                traffic.push({
                    lane: laneIndex,
                    x: LANES[laneIndex],
                    y: -CAR_HEIGHT,
                    speed: Math.random() * 2 + 1.8,
                    color: colors[Math.floor(Math.random() * colors.length)]
                });
            }
        }

        // ----- UPDATE -----
        function update() {
            if (gameState !== STATE_PLAYING) return;
            frameCount++;

            // Speed calculation
            let speed = baseSpeed;
            if (isBoosting) speed = 9.5;
            if (isBraking) speed = Math.max(1.8, speed - 3.2);

            player.x += (player.targetX - player.x) * 0.25;
            roadOffset = (roadOffset + speed) % 40;

            // Score & currency
            const earnRate = Math.floor(speed / 2.5);
            score += earnRate;
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('highway_highscore', highScore);
            }
            // Earn coins every 50 points
            const newCoins = Math.floor(score / 50) - coinsEarned;
            if (newCoins > 0) {
                coinsEarned += newCoins;
                currency += newCoins;
                Sound.coin();
                saveData();
            }

            // Spawn
            const spawnRate = isBoosting ? 0.055 : 0.035;
            if (Math.random() < spawnRate) spawnTraffic();

            // Update traffic
            for (let i = traffic.length - 1; i >= 0; i--) {
                const car = traffic[i];
                car.y += speed - car.speed + 1.2;

                // Collision
                if (Math.abs(player.x - car.x) < CAR_WIDTH * 0.8 &&
                    Math.abs(player.y - car.y) < CAR_HEIGHT * 0.8) {
                    Sound.crash();
                    gameState = STATE_GAMEOVER;
                    checkAchievements();
                    saveData();
                }
                if (car.y > canvas.height + CAR_HEIGHT) traffic.splice(i, 1);
            }

            // Achievements check periodically
            if (frameCount % 30 === 0) checkAchievements();
        }

        // ----- DRAWING (enhanced) -----
        function drawCar(x, y, color, isPlayer = false) {
            ctx.save();
            ctx.translate(x, y);
            // glow
            ctx.shadowColor = isPlayer ? color : 'rgba(0,0,0,0)';
            ctx.shadowBlur = isPlayer ? 22 : 0;

            // Wheels
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(-CAR_WIDTH/2 - 4, 8, 6, 16);
            ctx.fillRect(CAR_WIDTH/2 - 2, 8, 6, 16);
            ctx.fillRect(-CAR_WIDTH/2 - 4, CAR_HEIGHT - 24, 6, 16);
            ctx.fillRect(CAR_WIDTH/2 - 2, CAR_HEIGHT - 24, 6, 16);

            // Body
            ctx.shadowColor = isPlayer ? color : 'transparent';
            ctx.shadowBlur = isPlayer ? 18 : 0;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(-CAR_WIDTH/2, 0, CAR_WIDTH, CAR_HEIGHT, 8);
            ctx.fill();

            // Windshield
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(16,20,38,0.7)';
            ctx.beginPath();
            ctx.roundRect(-CAR_WIDTH/2 + 6, 16, CAR_WIDTH - 12, 16, 4);
            ctx.fill();

            // Headlights / Taillights
            if (isPlayer) {
                ctx.fillStyle = '#00f2fe';
                ctx.shadowColor = '#00f2fe';
                ctx.shadowBlur = 8;
                ctx.fillRect(-CAR_WIDTH/2 + 4, 3, 8, 5);
                ctx.fillRect(CAR_WIDTH/2 - 12, 3, 8, 5);
                // Boost flame
                if (isBoosting) {
                    ctx.fillStyle = 'rgba(255,100,0,0.5)';
                    ctx.shadowColor = '#ff6600';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.moveTo(-10, CAR_HEIGHT);
                    ctx.lineTo(0, CAR_HEIGHT + 18 + Math.random()*10);
                    ctx.lineTo(10, CAR_HEIGHT);
                    ctx.fill();
                }
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(-CAR_WIDTH/2 + 4, CAR_HEIGHT - 7, 8, 4);
                ctx.fillRect(CAR_WIDTH/2 - 12, CAR_HEIGHT - 7, 8, 4);
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        function drawRoad() {
            // Sky gradient
            const sky = ctx.createLinearGradient(0,0,0,canvas.height);
            sky.addColorStop(0, '#0a0e1a');
            sky.addColorStop(0.6, '#111833');
            ctx.fillStyle = sky;
            ctx.fillRect(0,0,canvas.width,canvas.height);

            // Road
            ctx.fillStyle = '#1a2138';
            ctx.fillRect(45, 0, 310, canvas.height);
            // Road edge glow
            ctx.fillStyle = 'rgba(0,242,254,0.04)';
            ctx.fillRect(42, 0, 6, canvas.height);
            ctx.fillRect(352, 0, 6, canvas.height);

            // Guard rails
            ctx.fillStyle = '#334155';
            ctx.fillRect(38, 0, 4, canvas.height);
            ctx.fillRect(358, 0, 4, canvas.height);

            // Lane dividers
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([20, 18]);
            ctx.lineDashOffset = -roadOffset;
            for (let i = 1; i < LANES.length; i++) {
                const dx = (LANES[i-1] + LANES[i]) / 2;
                ctx.beginPath();
                ctx.moveTo(dx, 0);
                ctx.lineTo(dx, canvas.height);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Road marks (side)
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(48, 0, 3, canvas.height);
            ctx.fillRect(349, 0, 3, canvas.height);
        }

        function drawUI() {
            ctx.textAlign = 'left';
            ctx.shadowBlur = 0;

            if (gameState === STATE_PLAYING) {
                ctx.font = '800 18px Outfit, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 8;
                ctx.fillText(`🏁 ${Math.floor(score)}`, 16, 32);
                ctx.fillStyle = '#facc15';
                ctx.fillText(`🪙 ${currency}`, 16, 56);
                ctx.shadowBlur = 0;
                // Speed indicator
                const spd = isBoosting ? 'BOOST' : isBraking ? 'BRAKE' : 'CRUISE';
                ctx.fillStyle = isBoosting ? '#ff6b6b' : isBraking ? '#4facfe' : '#94a3b8';
                ctx.font = '600 12px Outfit, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(spd, canvas.width - 16, 28);
            } else if (gameState === STATE_START) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.roundRect(40, 180, 320, 160, 16);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.font = '800 32px Outfit, sans-serif';
                ctx.fillStyle = '#00f2fe';
                ctx.shadowColor = '#00f2fe40';
                ctx.shadowBlur = 20;
                ctx.fillText('HIGHWAY', canvas.width/2, 235);
                ctx.fillStyle = '#fff';
                ctx.font = '700 20px Outfit, sans-serif';
                ctx.fillText('RACER', canvas.width/2, 275);
                ctx.shadowBlur = 0;
                ctx.font = '500 14px Outfit, sans-serif';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Press any key to start', canvas.width/2, 320);
            } else if (gameState === STATE_GAMEOVER) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.beginPath();
                ctx.roundRect(30, 170, 340, 210, 16);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.font = '800 34px Outfit, sans-serif';
                ctx.fillStyle = '#ef4444';
                ctx.shadowColor = '#ef444440';
                ctx.shadowBlur = 20;
                ctx.fillText('CRASHED', canvas.width/2, 225);
                ctx.shadowBlur = 0;
                ctx.font = '600 18px Outfit, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.fillText(`Score: ${Math.floor(score)}`, canvas.width/2, 270);
                ctx.fillStyle = '#facc15';
                ctx.fillText(`🪙 ${currency}`, canvas.width/2, 300);
                ctx.fillStyle = '#94a3b8';
                ctx.font = '500 14px Outfit, sans-serif';
                ctx.fillText(`Best: ${highScore}`, canvas.width/2, 330);
                ctx.font = '400 13px Outfit, sans-serif';
                ctx.fillStyle = '#64748b';
                ctx.fillText('Press any key to restart', canvas.width/2, 365);
            }
        }

        // ----- MAIN LOOP -----
        function gameLoop(timestamp) {
            update();
            drawRoad();
            traffic.forEach(car => drawCar(car.x, car.y, car.color, false));
            drawCar(player.x, player.y, VEHICLES.find(v => v.id === equippedVehicle)?.color || '#00f2fe', true);
            drawUI();
            requestAnimationFrame(gameLoop);
        }

        // ----- CONTROLS -----
        window.addEventListener('keydown', e => {
            initAudio();
            const key = e.key;
            if (gameState === STATE_START || gameState === STATE_GAMEOVER) {
                resetGame();
                e.preventDefault();
                return;
            }
            if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S'].includes(key)) e.preventDefault();

            if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
                if (player.lane > 0) { player.lane--; player.targetX = LANES[player.lane]; Sound.shift(); }
            } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
                if (player.lane < LANES.length - 1) { player.lane++; player.targetX = LANES[player.lane]; Sound.shift(); }
            } else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
                isBoosting = true;
            } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
                isBraking = true;
            }
        });
        window.addEventListener('keyup', e => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') isBoosting = false;
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') isBraking = false;
        });

        // ----- SHOP -----
        function renderShop() {
            shopList.innerHTML = '';
            VEHICLES.forEach(v => {
                const owned = ownedVehicles.includes(v.id);
                const equipped = equippedVehicle === v.id;
                const div = document.createElement('div');
                div.className = 'vehicle-card';
                div.innerHTML = `
                    <div class="info">
                        <div class="color-dot" style="background:${v.color}"></div>
                        <div>
                            <div class="name">${v.name}</div>
                            <div class="price">${v.price === 0 ? 'Free' : `<i class="fa-solid fa-coins"></i> ${v.price}`}</div>
                        </div>
                    </div>
                    <div>
                        ${equipped ? '<button class="buy-btn equipped">✓ Equipped</button>' :
                         owned ? `<button class="buy-btn owned" data-id="${v.id}">Owned</button>` :
                         `<button class="buy-btn" data-id="${v.id}" data-price="${v.price}">Buy</button>`}
                    </div>
                `;
                shopList.appendChild(div);
            });
            // Add event listeners for buy buttons
            shopList.querySelectorAll('.buy-btn[data-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    const vehicle = VEHICLES.find(v => v.id === id);
                    if (!vehicle) return;
                    if (ownedVehicles.includes(id)) {
                        // Equip
                        equippedVehicle = id;
                        localStorage.setItem('highway_equipped', equippedVehicle);
                        renderShop();
                        saveData();
                        return;
                    }
                    const price = parseInt(btn.dataset.price);
                    if (currency >= price) {
                        currency -= price;
                        ownedVehicles.push(id);
                        equippedVehicle = id;
                        saveData();
                        renderShop();
                        Sound.coin();
                        checkAchievements();
                    } else {
                        showAchievementToast('Not enough coins!');
                    }
                });
            });
            currencySpan.textContent = currency;
            shopCurrencySpan.textContent = currency;
        }

        document.getElementById('shopToggle').addEventListener('click', () => {
            shopOverlay.classList.toggle('open');
            renderShop();
        });
        document.getElementById('closeShop').addEventListener('click', () => {
            shopOverlay.classList.remove('open');
        });
        shopOverlay.addEventListener('click', (e) => {
            if (e.target === shopOverlay) shopOverlay.classList.remove('open');
        });

        // ----- POLYFILL -----
        if (!CanvasRenderingContext2D.prototype.roundRect) {
            CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
                if (r > w/2) r = w/2; if (r > h/2) r = h/2;
                this.moveTo(x+r,y); this.lineTo(x+w-r,y);
                this.quadraticCurveTo(x+w,y,x+w,y+r);
                this.lineTo(x+w,y+h-r);
                this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
                this.lineTo(x+r,y+h);
                this.quadraticCurveTo(x,y+h,x,y+h-r);
                this.lineTo(x,y+r);
                this.quadraticCurveTo(x,y,x+r,y);
                return this;
            };
        }

        // ----- INIT -----
        gameState = STATE_START;
        saveData();
        // Load achievements
        unlockedAchievements.forEach(key => { if (ACHIEVEMENTS[key]) ACHIEVEMENTS[key].unlocked = true; });
        requestAnimationFrame(gameLoop);
    