const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const highSpan = document.getElementById('highDisplay');
        const highSpan2 = document.getElementById('highDisplay2');
        const livesSpan = document.getElementById('livesDisplay');

        // ----- CONSTANTS -----
        const COLS = 21, ROWS = 24;
        const TILE = canvas.width / COLS; // 32
        const WALL = '#', DOT = '.', PELLET = 'o', EMPTY = ' ', DOOR = '-';

        // ----- MAZE LAYOUTS (all 24 rows, fully connected) -----
        const MAZES = [
            // Maze 1: Classic
            [
                "#####################",
                "#.........#.........#",
                "#o##.####.#.####.##o#",
                "#...................#",
                "#.##.#.#######.#.##.#",
                "#....#....#....#....#",
                "####.#### # ####.####",
                "   #.#         #.#   ",
                "####.#.###-###.#.####",
                "    .  #     #  .    ",
                "####.#.#######.#.####",
                "   #.#         #.#   ",
                "####.#.#######.#.####",
                "#.........#.........#",
                "#.##.####.#.####.##.#",
                "#o.#......P......#.o#",
                "##.#.#.#######.#.#.##",
                "#....#....#....#....#",
                "#.#######.#.#######.#",
                "#...................#",
                "####.#######.########",
                "#...................#",
                "#...................#",
                "#####################"
            ],
            // Maze 2: Symmetrical
            [
                "#####################",
                "#o.................o#",
                "#.###.###.###.###.###",
                "#.#.#.#.#.#.#.#.#.#.#",
                "#.#.#.#.#.#.#.#.#.#.#",
                "#...................#",
                "#.###.### # ###.###.#",
                "#.#   #       #   #.#",
                "#.###.#.###-###.#.###",
                "#.....# #   # #.....#",
                "#.###.#.#####.#.###.#",
                "#.#   #       #   #.#",
                "#.###.###.#.###.###.#",
                "#.........#.........#",
                "#.###.#######.###.###",
                "#o..#.....P.....#..o#",
                "###.#.###.###.###.###",
                "#.....#.......#.....#",
                "#.#####.#####.#####.#",
                "#...................#",
                "####.#######.########",
                "#...................#",
                "#...................#",
                "#####################"
            ],
            // Maze 3: Cross (different upper/lower structure)
            [
                "#####################",
                "#.........#.........#",
                "#o##.###.###.###.##o#",
                "#.....#.....#.....#.#",
                "###.#.#.###.#.#.#.###",
                "#...#.#.....#.#.#...#",
                "#.###.#.###.#.#.###.#",
                "   #.#         #.#   ",
                "####.#.###-###.#.####",
                "    .  #     #  .    ",
                "####.#.#######.#.####",
                "   #.#         #.#   ",
                "####.#.#######.#.####",
                "#.........#.........#",
                "#.##.####.#.####.##.#",
                "#o.#......P......#.o#",
                "##.#.#.#######.#.#.##",
                "#....#....#....#....#",
                "#.#######.#.#######.#",
                "#...................#",
                "####.#######.########",
                "#o.........#.......o#",
                "#...................#",
                "#####################"
            ],
            // Maze 4: Compact (denser corridors)
            [
                "#####################",
                "#o.....#.....#.....o#",
                "#.###.#.###.#.###.#.#",
                "#...#.#...#.#...#.#.#",
                "###.#.###.#.###.#.#.#",
                "#...#.....#.....#.#.#",
                "#.###.#####.###.#.#.#",
                "   #.#         #.#   ",
                "####.#.###-###.#.####",
                "    .  #     #  .    ",
                "####.#.#######.#.####",
                "   #.#         #.#   ",
                "####.#.#######.#.####",
                "#.........#.........#",
                "#.##.####.#.####.##.#",
                "#o.#......P......#.o#",
                "##.#.#.#######.#.#.##",
                "#....#....#....#....#",
                "#.#######.#.#######.#",
                "#...................#",
                "####.#######.########",
                "#o.........#.......o#",
                "#...................#",
                "#####################"
            ]
        ];

        let MAZE = MAZES[0];

        // ----- STATES -----
        const STATE_START = 0, STATE_PLAYING = 1, STATE_DYING = 2, STATE_GAMEOVER = 3, STATE_LEVELCLEAR = 4;
        let gameState = STATE_START;

        // ----- GAME DATA -----
        let score = 0;
        let highScore = parseInt(localStorage.getItem('pacman_highscore')) || 0;
        let lives = 3;
        let level = 1;
        let dotsRemaining = 0;
        let grid = [];
        let pac = null;
        let ghosts = [];
        let ghostEatenCombo = 0;
        let frightenedTimer = 0;
        let modeTimer = 0;
        let scatterMode = true;
        let lastTime = 0;
        let speedMultiplier = 1.0;
        let deathTimer = 0;
        let levelClearTimer = 0;

        highSpan.textContent = highScore;
        highSpan2.textContent = highScore;
        livesSpan.textContent = lives;

        // ----- AUDIO -----
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }
        const Sound = {
            waka() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.exponentialRampToValueAtTime(900, now + 0.05);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.06);
            },
            pellet() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.3);
            },
            ghostEaten() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.2);
            },
            death() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.8);
            }
        };

        // ----- HELPERS -----
        function isWall(x, y) {
            const tx = Math.floor(x);
            const ty = Math.floor(y);
            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false; // Allow tunnel
            return grid[ty][tx] === WALL;
        }
        function isPassable(x, y, forGhost) {
            const tx = Math.floor(x);
            const ty = Math.floor(y);
            if (tx < 0 || tx >= COLS) return true; // Tunnel is passable
            if (ty < 0 || ty >= ROWS) return false;
            const c = grid[ty][tx];
            if (c === WALL) return false;
            if (c === DOOR) return forGhost;
            return true;
        }
        // Tunnel wrap
        function wrapX(x) {
            if (x < -0.5) return COLS - 0.5;
            if (x > COLS - 0.5) return -0.5;
            return x;
        }

        // ----- BUILD GRID -----
        function buildGrid() {
            grid = [];
            dotsRemaining = 0;
            MAZE = MAZES[(level - 1) % MAZES.length];

            // Normalize every row to the actual 21-column playfield. A malformed
            // row used to leave the visual layout and collision grid out of sync.
            for (let y = 0; y < ROWS; y++) {
                const source = MAZE[y] || '';
                const row = [];
                for (let x = 0; x < COLS; x++) {
                    let c = source[x] ?? WALL;
                    if (c === 'P') c = EMPTY;
                    row.push(c);
                }
                grid.push(row);
            }

            // Make the visible maze match the playable maze. Some of the supplied
            // layouts contain small open pockets that are not connected to Pac-Man's
            // starting area. Those pockets looked walkable but were actually
            // unreachable, which felt like an invisible collision barrier.
            const start = (() => {
                for (let y = 0; y < ROWS; y++) {
                    for (let x = 0; x < COLS; x++) {
                        if (MAZE[y] && MAZE[y][x] === 'P') return { x, y };
                    }
                }
                return { x: 10, y: 15 };
            })();

            const reachable = new Set([`${start.x},${start.y}`]);
            const queue = [start];
            while (queue.length) {
                const { x, y } = queue.shift();
                const neighbors = [
                    { x: x + 1, y }, { x: x - 1, y },
                    { x, y: y + 1 }, { x, y: y - 1 }
                ];

                for (const n of neighbors) {
                    let nx = n.x;
                    if (nx < 0) nx = COLS - 1;
                    if (nx >= COLS) nx = 0;
                    const ny = n.y;
                    if (ny < 0 || ny >= ROWS) continue;

                    const key = `${nx},${ny}`;
                    if (reachable.has(key) || grid[ny][nx] === WALL) continue;
                    reachable.add(key);
                    queue.push({ x: nx, y: ny });
                }
            }

            // Turn disconnected "floor" pockets into visible walls.
            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    if (grid[y][x] !== WALL && !reachable.has(`${x},${y}`)) {
                        grid[y][x] = WALL;
                    }
                }
            }

            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    if (grid[y][x] === DOT || grid[y][x] === PELLET) dotsRemaining++;
                }
            }
        }

        // ----- PAC-MAN -----
        function createPac() {
            let startPos = { x: 10, y: 15 };
            for (let y = 0; y < MAZE.length; y++) {
                for (let x = 0; x < COLS; x++) {
                    if (MAZE[y][x] === 'P') startPos = { x, y };
                }
            }
            return {
                x: startPos.x, y: startPos.y,
                targetX: startPos.x, targetY: startPos.y,
                dir: { x: 0, y: 0 },
                nextDir: { x: 0, y: 0 },
                speed: 0.15,
                mouth: 0,
                anim: 0,
                moving: false
            };
        }

        // ----- GHOSTS -----
        const GHOST_COLORS = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];
        const GHOST_NAMES = ['Blinky', 'Pinky', 'Inky', 'Clyde'];
        // Ghost house interior: rows 8-10, cols 9-11. Door at (10, 8).
        const GHOST_START = [
            { x: 10, y: 9 },   // Blinky - center
            { x: 9, y: 9 },    // Pinky - left
            { x: 11, y: 9 },   // Inky - right
            { x: 8, y: 9 }     // Clyde - far left (row 10 is a solid wall in every maze, so Clyde can't spawn there)
        ];
        const GHOST_HOME = { x: 10, y: 9 };
        const GHOST_EXIT = { x: 10, y: 7 }; // Point just above the door

        function createGhosts() {
            ghosts = GHOST_START.map((pos, i) => ({
                name: GHOST_NAMES[i],
                color: GHOST_COLORS[i],
                x: pos.x, y: pos.y,
                targetX: pos.x, targetY: pos.y,
                dir: { x: 0, y: 0 },
                mode: 'scatter',       // scatter | chase | frightened | eaten
                home: { ...pos },
                scatterTarget: getScatterTarget(i),
                speed: 0.12,
                anim: 0,
                released: i === 0,     // Blinky starts released, others wait
                releaseTimer: i * 30,  // Staggered release countdown
                inHouse: true
            }));
        }

        function getScatterTarget(i) {
            const targets = [
                { x: 0, y: 0 },        // Blinky: top-left
                { x: COLS - 1, y: 0 }, // Pinky: top-right
                { x: COLS - 1, y: ROWS - 1 }, // Inky: bottom-right
                { x: 0, y: ROWS - 1 }  // Clyde: bottom-left
            ];
            return targets[i];
        }

        // ----- GHOST AI HELPERS -----
        function getDistance(x1, y1, x2, y2) {
            return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        }

        function getValidDirs(x, y, currentDir, forGhost, allowReverse, allowDoor = true) {
            const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
            let valid = dirs.filter(d => {
                // Ghosts can't reverse direction unless forced or in ghost house.
                if (forGhost && !allowReverse && d.x === -currentDir.x && d.y === -currentDir.y) return false;

                const nx = Math.round(x + d.x);
                const ny = Math.round(y + d.y);

                // Once a ghost has left the house, never let normal AI choose
                // the one-way house door as a destination. Without this guard
                // the scatter/chase target can make ghosts oscillate forever
                // between the door and the tile above it.
                if (forGhost && !allowDoor && ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && grid[ny][nx] === DOOR) {
                    return false;
                }

                return isPassable(nx, ny, forGhost);
            });
            // If no valid moves, allow reverse
            if (valid.length === 0 && forGhost) {
                valid = dirs.filter(d => isPassable(Math.round(x + d.x), Math.round(y + d.y), forGhost));
            }
            return valid;
        }

        // ----- GHOST TARGETS (chase behavior) -----
        function getChaseTarget(ghost) {
            const p = pac;
            switch (ghost.name) {
                case 'Blinky':
                    return { x: p.x, y: p.y };
                case 'Pinky': {
                    // 4 tiles ahead of Pac-Man
                    let tx = p.x + p.dir.x * 4;
                    let ty = p.y + p.dir.y * 4;
                    return { x: wrapX(tx), y: ty };
                }
                case 'Inky': {
                    // 2 tiles ahead of Pac-Man, then double the vector from Blinky
                    const ahead = { x: wrapX(p.x + p.dir.x * 2), y: p.y + p.dir.y * 2 };
                    const blinky = ghosts[0];
                    const dx = ahead.x - blinky.x;
                    const dy = ahead.y - blinky.y;
                    return { x: wrapX(blinky.x + dx * 2), y: blinky.y + dy * 2 };
                }
                case 'Clyde': {
                    // If far from Pac-Man, chase; if close, scatter to corner
                    const dist = Math.abs(ghost.x - p.x) + Math.abs(ghost.y - p.y);
                    if (dist > 8) return { x: p.x, y: p.y };
                    return getScatterTarget(3);
                }
            }
        }

        // ----- GHOST UPDATE -----
        function updateGhost(ghost) {
            const speed = (ghost.mode === 'frightened' ? 0.06 : (ghost.mode === 'eaten' ? 0.25 : 0.12)) * speedMultiplier;

            // Check if ghost is in the ghost house
            const inHouse = ghost.y >= 8 && ghost.y <= 10 && ghost.x >= 9 && ghost.x <= 11;

            // If at tile center, decide next move.
            // NOTE: subtract a tiny epsilon from the threshold. Floating-point
            // addition (e.g. 9 - 0.12) can land a hair under the true value,
            // which made this check fire again one frame after leaving a tile
            // center -- snapping the ghost straight back to where it started
            // and freezing it in an infinite loop.
            if (Math.abs(ghost.x - Math.round(ghost.x)) < speed - 1e-6 && Math.abs(ghost.y - Math.round(ghost.y)) < speed - 1e-6) {
                ghost.x = Math.round(ghost.x);
                ghost.y = Math.round(ghost.y);

                let target = null;

                if (ghost.mode === 'eaten') {
                    // Return to ghost house
                    target = GHOST_HOME;
                    if (ghost.x === GHOST_HOME.x && ghost.y === GHOST_HOME.y) {
                        ghost.mode = 'scatter';
                        ghost.inHouse = true;
                        ghost.released = false;
                        ghost.releaseTimer = 30;
                        ghost.dir = { x: 0, y: 0 };
                    }
                } else if (inHouse) {
                    // Inside ghost house
                    if (ghost.released) {
                        // Exit the house: move toward the door, then out
                        if (ghost.y > 8) {
                            target = { x: 10, y: 8 }; // Move toward door
                        } else if (ghost.y === 8 && ghost.x === 10) {
                            target = GHOST_EXIT; // At door, exit
                        } else {
                            target = { x: 10, y: 8 }; // Move toward door column
                        }
                    } else {
                        // Not released - stay in house, move toward center
                        target = GHOST_HOME;
                    }
                } else if (ghost.mode === 'frightened') {
                    const valid = getValidDirs(ghost.x, ghost.y, ghost.dir, true, false, ghost.inHouse || ghost.mode === 'eaten');
                    if (valid.length > 0) {
                        ghost.dir = valid[Math.floor(Math.random() * valid.length)];
                    }
                } else {
                    target = ghost.mode === 'chase' ? getChaseTarget(ghost) : ghost.scatterTarget;
                }

                if (target) {
                    // Allow reverse direction when in the ghost house (needed for returning eaten ghosts)
                    const valid = getValidDirs(
                        ghost.x,
                        ghost.y,
                        ghost.dir,
                        true,
                        inHouse,
                        inHouse || ghost.mode === 'eaten'
                    );
                    if (valid.length > 0) {
                        let bestDir = valid[0];
                        let minDist = Infinity;
                        for (const d of valid) {
                            const dist = getDistance(ghost.x + d.x, ghost.y + d.y, target.x, target.y);
                            if (dist < minDist) {
                                minDist = dist;
                                bestDir = d;
                            }
                        }
                        ghost.dir = bestDir;
                    }
                }
            }

            // A ghost should always have a direction while active. If a malformed
            // maze leaves it without one, pick a legal direction instead of freezing.
            if (ghost.dir.x === 0 && ghost.dir.y === 0) {
                const fallback = getValidDirs(
                    Math.round(ghost.x),
                    Math.round(ghost.y),
                    ghost.dir,
                    true,
                    true,
                    ghost.inHouse || ghost.mode === 'eaten'
                );
                if (fallback.length) ghost.dir = fallback[0];
            }

            ghost.x += ghost.dir.x * speed;
            ghost.y += ghost.dir.y * speed;
            ghost.x = wrapX(ghost.x);

            // Update inHouse state
            ghost.inHouse = ghost.y >= 8 && ghost.y <= 10 && ghost.x >= 9 && ghost.x <= 11;

            // Animation
            ghost.anim += 0.1;
        }

        // ----- RESET / INIT -----
        function resetGame() {
            score = 0;
            lives = 3;
            level = 1;
            speedMultiplier = 1.0;
            resetLevel();
            updateHUD();
        }

        function resetLevel() {
            buildGrid();
            pac = createPac();
            createGhosts();
            ghostEatenCombo = 0;
            frightenedTimer = 0;
            modeTimer = 0;
            scatterMode = true;
            gameState = STATE_PLAYING;
        }

        // ----- HUD -----
        function updateHUD() {
            highSpan.textContent = highScore;
            highSpan2.textContent = highScore;
            livesSpan.textContent = lives;
        }

        // ----- SCORING -----
        function addScore(pts) {
            score += pts;
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('pacman_highscore', highScore);
                updateHUD();
            }
        }

        // ----- PAC UPDATE -----
        function updatePac() {
            const speed = pac.speed * speedMultiplier;

            // At tile center, check for turns or stopping.
            // Same epsilon fix as the ghosts: without it, floating-point drift
            // could make this fire one frame after leaving a tile, snapping
            // Pac-Man back to the tile he just left -- which felt like an
            // invisible wall blocking movement at seemingly random spots.
            if (Math.abs(pac.x - Math.round(pac.x)) < speed - 1e-6 && Math.abs(pac.y - Math.round(pac.y)) < speed - 1e-6) {
                const tx = Math.round(pac.x);
                const ty = Math.round(pac.y);

                // Apply queued direction
                if (pac.nextDir.x !== 0 || pac.nextDir.y !== 0) {
                    if (isPassable(tx + pac.nextDir.x, ty + pac.nextDir.y, false)) {
                        pac.dir = { ...pac.nextDir };
                        pac.x = tx;
                        pac.y = ty;
                    }
                }

                // Check for walls
                if (!isPassable(tx + pac.dir.x, ty + pac.dir.y, false)) {
                    pac.dir = { x: 0, y: 0 };
                    pac.x = tx;
                    pac.y = ty;
                } else {
                    pac.x = tx;
                    pac.y = ty;
                }

                // Eat items
                const gridX = ((tx % COLS) + COLS) % COLS;
                const cell = grid[ty][gridX];
                if (cell === DOT) {
                    grid[ty][gridX] = EMPTY;
                    dotsRemaining--;
                    addScore(10);
                    Sound.waka();
                } else if (cell === PELLET) {
                    grid[ty][gridX] = EMPTY;
                    dotsRemaining--;
                    addScore(50);
                    Sound.pellet();
                    frightenedTimer = 400;
                    ghostEatenCombo = 0;
                    ghosts.forEach(g => { if (g.mode !== 'eaten') g.mode = 'frightened'; });
                }
            }

            pac.x += pac.dir.x * speed;
            pac.y += pac.dir.y * speed;
            pac.x = wrapX(pac.x);

            // Track movement for animation
            pac.moving = (pac.dir.x !== 0 || pac.dir.y !== 0);
            if (pac.moving) {
                pac.mouth += 0.3;
            }

            // Level clear
            if (dotsRemaining <= 0) {
                gameState = STATE_LEVELCLEAR;
                levelClearTimer = 0;
                return;
            }

            // Ghost collisions
            for (const g of ghosts) {
                if (getDistance(pac.x, pac.y, g.x, g.y) < 0.6) {
                    if (g.mode === 'frightened') {
                        g.mode = 'eaten';
                        ghostEatenCombo++;
                        addScore(200 * Math.pow(2, ghostEatenCombo - 1));
                        Sound.ghostEaten();
                    } else if (g.mode !== 'eaten') {
                        die();
                        return;
                    }
                }
            }
        }

        // ----- DEATH -----
        function die() {
            Sound.death();
            gameState = STATE_DYING;
            deathTimer = 0;
            lives--;
            updateHUD();
        }

        // ----- UPDATE -----
        function update() {
            if (gameState === STATE_PLAYING) {
                updatePac();
                if (gameState !== STATE_PLAYING) return;

                // Ghost release - each ghost has its own countdown timer
                ghosts.forEach(g => {
                    if (!g.released && g.inHouse) {
                        g.releaseTimer--;
                        if (g.releaseTimer <= 0) {
                            g.released = true;
                        }
                    }
                });

                modeTimer++;
                if (modeTimer > 420) {
                    modeTimer = 0;
                    scatterMode = !scatterMode;
                    ghosts.forEach(g => {
                        if (g.mode !== 'frightened' && g.mode !== 'eaten') {
                            g.mode = scatterMode ? 'scatter' : 'chase';
                        }
                    });
                }

                if (frightenedTimer > 0) {
                    frightenedTimer--;
                    if (frightenedTimer === 0) {
                        ghosts.forEach(g => {
                            if (g.mode === 'frightened') g.mode = scatterMode ? 'scatter' : 'chase';
                        });
                    }
                }

                ghosts.forEach(g => updateGhost(g));
            } else if (gameState === STATE_DYING) {
                deathTimer++;
                if (deathTimer > 60) {
                    if (lives <= 0) {
                        gameState = STATE_GAMEOVER;
                    } else {
                        resetLevel();
                    }
                }
            } else if (gameState === STATE_LEVELCLEAR) {
                levelClearTimer++;
                if (levelClearTimer > 90) {
                    level++;
                    speedMultiplier = Math.min(1.5, 1.0 + (level - 1) * 0.05);
                    resetLevel();
                }
            }
        }

        // ----- RENDER -----
        function draw(timestamp) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Background
            ctx.fillStyle = '#030406';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw maze
            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    const c = grid[y][x];
                    const px = x * TILE, py = y * TILE;
                    if (c === WALL) {
                        ctx.fillStyle = '#1a237e';
                        ctx.fillRect(px, py, TILE, TILE);
                        ctx.strokeStyle = '#3949ab';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
                    } else if (c === DOT) {
                        ctx.fillStyle = '#ffb8ae';
                        ctx.beginPath();
                        ctx.arc(px + TILE / 2, py + TILE / 2, 3, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (c === PELLET) {
                        const pulse = 1 + 0.15 * Math.sin(timestamp / 200);
                        ctx.fillStyle = '#ffb8ae';
                        ctx.shadowColor = '#ffb8ae';
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.arc(px + TILE / 2, py + TILE / 2, 6 * pulse, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    } else if (c === DOOR) {
                        ctx.fillStyle = '#ffb8ae';
                        ctx.fillRect(px + 2, py + TILE / 2 - 2, TILE - 4, 4);
                    }
                }
            }

            // Draw ghosts
            ghosts.forEach(g => {
                const px = g.x * TILE + TILE / 2;
                const py = g.y * TILE + TILE / 2;
                const r = TILE * 0.4;

                if (g.mode !== 'eaten') {
                    let color = g.color;
                    if (g.mode === 'frightened') {
                        const flash = Math.floor(timestamp / 100) % 2 === 0;
                        color = flash ? '#2121de' : '#ffffff';
                    }

                    // Body
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(px, py - r * 0.2, r, Math.PI, 0);

                    // Wavy bottom animation
                    const waveOffset = Math.sin(g.anim * 2) * 2;
                    ctx.lineTo(px + r, py + r * 0.8 + waveOffset);
                    for (let i = 0; i <= 4; i++) {
                        const wx = px + r - (i * r * 2) / 4;
                        const wy = py + r * 0.8 + (i % 2 === 0 ? waveOffset : -waveOffset);
                        ctx.lineTo(wx, wy);
                    }
                    ctx.lineTo(px - r, py + r * 0.8 + waveOffset);
                    ctx.closePath();
                    ctx.fill();
                }

                // Eyes
                if (g.mode === 'frightened') {
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.arc(px - r * 0.3, py - r * 0.1, r * 0.25, 0, Math.PI * 2);
                    ctx.arc(px + r * 0.3, py - r * 0.1, r * 0.25, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#2121de';
                    ctx.beginPath();
                    ctx.arc(px - r * 0.3, py - r * 0.1, r * 0.1, 0, Math.PI * 2);
                    ctx.arc(px + r * 0.3, py - r * 0.1, r * 0.1, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Eyes look in direction of movement
                    const eyeOffsetX = g.dir.x * 2;
                    const eyeOffsetY = g.dir.y * 2;
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.arc(px - r * 0.3, py - r * 0.2, r * 0.3, 0, Math.PI * 2);
                    ctx.arc(px + r * 0.3, py - r * 0.2, r * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#2121de';
                    ctx.beginPath();
                    ctx.arc(px - r * 0.3 + eyeOffsetX, py - r * 0.2 + eyeOffsetY, r * 0.15, 0, Math.PI * 2);
                    ctx.arc(px + r * 0.3 + eyeOffsetX, py - r * 0.2 + eyeOffsetY, r * 0.15, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // Draw Pac-Man
            if (gameState !== STATE_DYING) {
                const px = pac.x * TILE + TILE / 2;
                const py = pac.y * TILE + TILE / 2;
                const r = TILE * 0.45;

                // Mouth animation - opens/closes smoothly, faster when moving
                if (pac.moving) {
                    pac.mouth += 0.3;
                }
                const mouthAngle = Math.abs(Math.sin(pac.mouth)) * 0.6;

                // Direction angle
                let angle = 0;
                if (pac.dir.x === 1) angle = 0;
                else if (pac.dir.x === -1) angle = Math.PI;
                else if (pac.dir.y === -1) angle = -Math.PI / 2;
                else if (pac.dir.y === 1) angle = Math.PI / 2;

                ctx.fillStyle = '#facc15';
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(px, py, r, angle + mouthAngle, angle + Math.PI * 2 - mouthAngle);
                ctx.lineTo(px, py);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                // Death animation: shrinking circle with expanding ring
                const t = deathTimer / 60;
                const px = pac.x * TILE + TILE / 2;
                const py = pac.y * TILE + TILE / 2;
                
                // Expanding ring
                ctx.strokeStyle = `rgba(250, 204, 21, ${1 - t})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(px, py, TILE * 0.45 + t * TILE * 2, 0, Math.PI * 2);
                ctx.stroke();
                
                // Shrinking circle
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.arc(px, py, TILE * 0.45 * (1 - t), 0, Math.PI * 2);
                ctx.fill();
            }

            // UI Overlay
            ctx.textAlign = 'center';
            ctx.shadowBlur = 0;

            if (gameState === STATE_START) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#facc15';
                ctx.font = '800 48px Outfit, sans-serif';
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 20;
                ctx.fillText('PAC-MAN', canvas.width / 2, canvas.height / 2 - 40);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#94a3b8';
                ctx.font = '500 18px Outfit, sans-serif';
                ctx.fillText('Arrow / WASD to start', canvas.width / 2, canvas.height / 2 + 20);
                ctx.fillText('Eat dots · Avoid ghosts · Grab power pellets', canvas.width / 2, canvas.height / 2 + 50);
            } else if (gameState === STATE_GAMEOVER) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ef4444';
                ctx.font = '800 40px Outfit, sans-serif';
                ctx.shadowColor = '#00000080';
                ctx.shadowBlur = 16;
                ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.font = '600 22px Outfit, sans-serif';
                ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
                ctx.fillText(`Best: ${highScore}`, canvas.width / 2, canvas.height / 2 + 55);
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '400 15px Outfit, sans-serif';
                ctx.fillText('Press any key to restart', canvas.width / 2, canvas.height / 2 + 95);
            } else if (gameState === STATE_LEVELCLEAR) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#22c55e';
                ctx.font = '800 36px Outfit, sans-serif';
                ctx.shadowColor = '#22c55e';
                ctx.shadowBlur = 16;
                ctx.fillText('LEVEL CLEAR!', canvas.width / 2, canvas.height / 2);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.font = '600 20px Outfit, sans-serif';
                ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 40);
            } else if (gameState === STATE_PLAYING) {
                // Score display top-left
                ctx.textAlign = 'left';
                ctx.font = '800 20px Outfit, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#00000080';
                ctx.shadowBlur = 8;
                ctx.fillText(`SCORE ${score}`, 12, 30);
                ctx.textAlign = 'right';
                ctx.fillText(`LV ${level}`, canvas.width - 12, 30);
                ctx.shadowBlur = 0;
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
            if (key === 'ArrowUp' || key === 'w' || key === 'W') pac.nextDir = { x: 0, y: -1 };
            else if (key === 'ArrowDown' || key === 's' || key === 'S') pac.nextDir = { x: 0, y: 1 };
            else if (key === 'ArrowLeft' || key === 'a' || key === 'A') pac.nextDir = { x: -1, y: 0 };
            else if (key === 'ArrowRight' || key === 'd' || key === 'D') pac.nextDir = { x: 1, y: 0 };
        });

        // Touch controls (swipe)
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
                pac.nextDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
            } else {
                pac.nextDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
            }
            touchStart = { x: t.clientX, y: t.clientY };
        });
        canvas.addEventListener('touchend', e => { touchStart = null; });

        // ----- LOOP -----
        function loop(timestamp) {
            const dt = timestamp - lastTime;
            lastTime = timestamp;

            if (gameState === STATE_PLAYING || gameState === STATE_DYING || gameState === STATE_LEVELCLEAR) {
                update();
            }
            draw(timestamp);
            requestAnimationFrame(loop);
        }

        // ----- INIT -----
        buildGrid();
        pac = createPac();
        createGhosts();
        gameState = STATE_START;
        requestAnimationFrame(loop);