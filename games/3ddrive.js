// =========================================================
        // NEON HORIZON ENGINE — ULTRA 3D RENDERER & PHYSICS
        // =========================================================

        // ---------------------------------------------------------
        // 1. Noise Utilities & Math Helpers
        // ---------------------------------------------------------
        const NOISE_PERM = new Uint8Array(512);
        (function initNoise() {
            const p = new Uint8Array(256);
            for (let i = 0; i < 256; i++) p[i] = i;
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [p[i], p[j]] = [p[j], p[i]];
            }
            for (let i = 0; i < 512; i++) NOISE_PERM[i] = p[i & 255];
        })();

        function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

        function lerp(a, b, t) { return a + t * (b - a); }

        function grad(hash, x, y, z) {
            const h = hash & 15;
            const u = h < 8 ? x : y;
            const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        }

        function noise3D(x, y, z) {
            const X = Math.floor(x) & 255,
                Y = Math.floor(y) & 255,
                Z = Math.floor(z) & 255;
            x -= Math.floor(x);
            y -= Math.floor(y);
            z -= Math.floor(z);
            const u = fade(x),
                v = fade(y),
                w = fade(z);
            const A = NOISE_PERM[X] + Y,
                AA = NOISE_PERM[A] + Z,
                AB = NOISE_PERM[A + 1] + Z;
            const B = NOISE_PERM[X + 1] + Y,
                BA = NOISE_PERM[B] + Z,
                BB = NOISE_PERM[B + 1] + Z;
            return lerp(
                lerp(lerp(grad(NOISE_PERM[AA], x, y, z), grad(NOISE_PERM[BA], x - 1, y, z), u),
                    lerp(grad(NOISE_PERM[AB], x, y - 1, z), grad(NOISE_PERM[BB], x - 1, y - 1, z), u), v),
                lerp(lerp(grad(NOISE_PERM[AA + 1], x, y, z - 1), grad(NOISE_PERM[BA + 1], x - 1, y, z - 1), u),
                    lerp(grad(NOISE_PERM[AB + 1], x, y - 1, z - 1), grad(NOISE_PERM[BB + 1], x - 1, y - 1, z - 1), u),
                    v),
                w
            );
        }

        function fbm(x, y, z, octaves = 5) {
            let val = 0,
                amp = 0.5,
                freq = 1;
            for (let i = 0; i < octaves; i++) {
                val += amp * noise3D(x * freq, y * freq, z * freq);
                amp *= 0.48;
                freq *= 2.02;
            }
            return val;
        }

        // ---------------------------------------------------------
        // 2. Audio Engine Synthesizer
        // ---------------------------------------------------------
        let audioCtx = null,
            masterGain = null,
            engineNodes = null,
            windNode = null;

        function initAudio() {
            if (audioCtx) return;
            try {
                audioCtx = new(window.AudioContext || window.webkitAudioContext)();
                masterGain = audioCtx.createGain();
                masterGain.gain.value = 0.3;
                masterGain.connect(audioCtx.destination);
            } catch (e) {}
        }

        // iOS Safari (and several mobile browsers) create AudioContext in a
        // 'suspended' state and will ONLY resume it from inside the synchronous
        // call stack of a genuine user-gesture event handler — a later async
        // resume() call, or one fired from a non-gesture callback, is silently
        // ignored. touchstart on the on-screen control buttons IS that gesture,
        // so every button binds resume() directly and synchronously here.
        function unlockAudio() {
            initAudio();
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            createEngineSound();
            createWindSound();
            initMusicEngine();
        }

        function createEngineSound() {
            if (!audioCtx || engineNodes) return;
            const osc1 = audioCtx.createOscillator(),
                g1 = audioCtx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.value = 70;
            g1.gain.value = 0.05;
            osc1.connect(g1);
            g1.connect(masterGain);
            osc1.start();

            const osc2 = audioCtx.createOscillator(),
                g2 = audioCtx.createGain();
            osc2.type = 'square';
            osc2.frequency.value = 140;
            g2.gain.value = 0.02;
            osc2.connect(g2);
            g2.connect(masterGain);
            osc2.start();

            const osc3 = audioCtx.createOscillator(),
                g3 = audioCtx.createGain();
            osc3.type = 'triangle';
            osc3.frequency.value = 35;
            g3.gain.value = 0.15;
            osc3.connect(g3);
            g3.connect(masterGain);
            osc3.start();

            engineNodes = { osc1, g1, osc2, g2, osc3, g3 };
        }

        function updateEngineSound(speedRatio, throttle) {
            if (!engineNodes) return;
            const base = 50 + speedRatio * 240 + throttle * 50;
            engineNodes.osc1.frequency.setTargetAtTime(base, audioCtx.currentTime, 0.05);
            engineNodes.osc2.frequency.setTargetAtTime(base * 2.02, audioCtx.currentTime, 0.05);
            engineNodes.osc3.frequency.setTargetAtTime(base * 0.5, audioCtx.currentTime, 0.05);
            const vol = 0.03 + speedRatio * 0.08;
            engineNodes.g1.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.08);
            engineNodes.g2.gain.setTargetAtTime(vol * 0.35, audioCtx.currentTime, 0.08);
            engineNodes.g3.gain.setTargetAtTime(vol * 1.4, audioCtx.currentTime, 0.08);
        }

        function createWindSound() {
            if (!audioCtx || windNode) return;
            const bufferSize = 2 * audioCtx.sampleRate;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const src = audioCtx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 180;
            const gain = audioCtx.createGain();
            gain.gain.value = 0;
            src.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);
            src.start();
            windNode = { filter, gain };
        }

        function updateWindSound(speedRatio) {
            if (!windNode) return;
            windNode.gain.gain.setTargetAtTime(speedRatio * speedRatio * 0.15, audioCtx.currentTime, 0.15);
            windNode.filter.frequency.setTargetAtTime(180 + speedRatio * 1100, audioCtx.currentTime, 0.15);
        }

        // ---------------------------------------------------------
        // 2.5 Procedural Synthwave Music Engine
        // ---------------------------------------------------------
        // A lightweight step-sequenced synth running alongside the engine/wind
        // synthesizer above: an arpeggiated bassline, a slow sustained chord pad,
        // and a simple kick/hat drum pattern. Tempo and pitch both ramp with
        // vehicle speed so the track visibly "revs up" as the car accelerates.
        let musicEnabled = false;
        let musicNextTime = 0;
        let musicStep = 0;
        let musicChordIdx = 0;
        let padNodes = null;

        // A minor-flavoured synthwave progression, expressed as semitone offsets
        // from MUSIC_ROOT: i - VI - v - VII
        const MUSIC_CHORDS = [
            [0, 3, 7],
            [8, 12, 15],
            [5, 8, 12],
            [10, 14, 17],
        ];
        const MUSIC_ROOT = 110; // A2

        function midiRatio(semitones) { return Math.pow(2, semitones / 12); }

        function initMusicEngine() {
            if (!audioCtx || musicEnabled) return;
            musicEnabled = true;
            musicNextTime = audioCtx.currentTime + 0.1;

            // Persistent chord pad bed: 3 detuned saws through a slow lowpass,
            // gain/cutoff automated continuously rather than retriggered per
            // note, so it stays a smooth ambient bed under the arpeggio.
            const padGain = audioCtx.createGain();
            padGain.gain.value = 0.0;
            const padFilter = audioCtx.createBiquadFilter();
            padFilter.type = 'lowpass';
            padFilter.frequency.value = 700;
            padFilter.Q.value = 0.5;
            padFilter.connect(padGain);
            padGain.connect(masterGain);
            const padOscs = [];
            for (let i = 0; i < 3; i++) {
                const o = audioCtx.createOscillator();
                o.type = 'sawtooth';
                o.detune.value = (i - 1) * 7;
                o.frequency.value = MUSIC_ROOT * 2;
                o.connect(padFilter);
                o.start();
                padOscs.push(o);
            }
            padNodes = { padGain, padFilter, padOscs };
        }

        function playArpNote(freq, time, dur, vol) {
            const o = audioCtx.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(freq, time);
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(0, time);
            g.gain.linearRampToValueAtTime(vol, time + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
            o.connect(g);
            g.connect(masterGain);
            o.start(time);
            o.stop(time + dur + 0.03);
        }

        function playDrumHit(time, kind) {
            if (kind === 'kick') {
                const o = audioCtx.createOscillator();
                o.type = 'sine';
                o.frequency.setValueAtTime(150, time);
                o.frequency.exponentialRampToValueAtTime(46, time + 0.12);
                const g = audioCtx.createGain();
                g.gain.setValueAtTime(0.5, time);
                g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
                o.connect(g);
                g.connect(masterGain);
                o.start(time);
                o.stop(time + 0.25);
            } else {
                // Hi-hat: short filtered noise burst
                const bufferSize = Math.floor(audioCtx.sampleRate * 0.08);
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const src = audioCtx.createBufferSource();
                src.buffer = buffer;
                const hp = audioCtx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 6500;
                const g = audioCtx.createGain();
                g.gain.setValueAtTime(0.16, time);
                g.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
                src.connect(hp);
                hp.connect(g);
                g.connect(masterGain);
                src.start(time);
            }
        }

        // Called every frame with the current speed ratio (0..1+ during boost).
        // Schedules audio events a short window ahead of "now" (standard Web
        // Audio lookahead pattern) so playback stays sample-accurate even if a
        // render frame hitches.
        function updateMusic(speedRatio) {
            if (!musicEnabled || !audioCtx) return;
            const tempo = 92 + speedRatio * 64;          // BPM ramps with speed
            const stepDur = 60 / tempo / 4;              // 16th notes
            const pitchShift = midiRatio(speedRatio * 3); // subtle pitch lift at speed

            const now = audioCtx.currentTime;
            while (musicNextTime < now + 0.2) {
                const chord = MUSIC_CHORDS[musicChordIdx % MUSIC_CHORDS.length];
                const octaveUp = Math.floor(musicStep / chord.length) % 2 === 0 ? 0 : 12;
                const noteSemitone = chord[musicStep % chord.length] + octaveUp;
                const freq = MUSIC_ROOT * midiRatio(noteSemitone) * pitchShift;
                playArpNote(freq, musicNextTime, stepDur * 0.9, 0.045 + speedRatio * 0.03);

                if (musicStep % 4 === 0) playDrumHit(musicNextTime, 'kick');
                if (musicStep % 2 === 1) playDrumHit(musicNextTime, 'hat');

                if (musicStep % 16 === 15) {
                    musicChordIdx++;
                    if (padNodes) {
                        const newChord = MUSIC_CHORDS[musicChordIdx % MUSIC_CHORDS.length];
                        padNodes.padOscs.forEach((o, i) => {
                            const semis = newChord[i % newChord.length];
                            o.frequency.setTargetAtTime(MUSIC_ROOT * midiRatio(semis), musicNextTime, 0.4);
                        });
                    }
                }

                musicStep++;
                musicNextTime += stepDur;
            }

            if (padNodes) {
                const targetPadVol = 0.03 + speedRatio * 0.05;
                padNodes.padGain.gain.setTargetAtTime(targetPadVol, now, 0.5);
                padNodes.padFilter.frequency.setTargetAtTime(450 + speedRatio * 2200, now, 0.3);
            }
        }

        // ---------------------------------------------------------
        // 3. Three.js Core & Post-Processing Pipeline Setup
        // ---------------------------------------------------------
        const container = document.getElementById('canvas-container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0c1a);
        scene.fog = new THREE.FogExp2(0x0a0c1a, 0.0016);

        const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        container.appendChild(renderer.domElement);

        // Post-Processing Composer
        const composer = new THREE.EffectComposer(renderer);
        const renderPass = new THREE.RenderPass(scene, camera);
        composer.addPass(renderPass);

        // Unreal Bloom Glow Pass — tuned for neon (subtle so lights don't blow out)
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.45, // Strength
            0.4, // Radius
            0.75 // Threshold
        );
        composer.addPass(bloomPass);

        // Dynamic Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffaa55, 2.0);
        sunLight.position.set(200, 180, 200);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(2048, 2048);
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 600;
        const s = 280;
        sunLight.shadow.camera.left = -s;
        sunLight.shadow.camera.right = s;
        sunLight.shadow.camera.top = s;
        sunLight.shadow.camera.bottom = -s;
        sunLight.shadow.bias = -0.0008;
        sunLight.shadow.normalBias = 0.02;
        scene.add(sunLight);
        scene.add(sunLight.target);

        // Fill light from below for cyber glow
        const fillLight = new THREE.DirectionalLight(0x00f2fe, 0.3);
        fillLight.position.set(-100, -50, -100);
        scene.add(fillLight);

        const hemiLight = new THREE.HemisphereLight(0xff77a9, 0x111428, 0.5);
        scene.add(hemiLight);

        // ---- Distant starfield (fixed dome that follows the car) ----
        const STAR_COUNT = 1600;
        const starPos = new Float32Array(STAR_COUNT * 3);
        const starCol = new Float32Array(STAR_COUNT * 3);
        const _starDir = new THREE.Vector3();
        for (let i = 0; i < STAR_COUNT; i++) {
            // Random direction on the upper hemisphere, weighted toward the horizon
            const az = Math.random() * Math.PI * 2;
            const el = Math.asin(0.04 + Math.random() * Math.random() * 0.96);
            _starDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
            starPos[i * 3] = _starDir.x * 1400;
            starPos[i * 3 + 1] = _starDir.y * 1400;
            starPos[i * 3 + 2] = _starDir.z * 1400;
            // Subtle natural color variation: white / blue-white / warm
            const t = Math.random();
            let r = 0.75 + t * 0.25,
                g = 0.78 + t * 0.22,
                b = 1.0;
            if (Math.random() < 0.18) { r = 1.0; g = 0.85; b = 0.7; }
            const bright = 0.45 + Math.random() * 0.55;
            starCol[i * 3] = r * bright;
            starCol[i * 3 + 1] = g * bright;
            starCol[i * 3 + 2] = b * bright;
        }
        const starGeom = new THREE.BufferGeometry();
        starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        starGeom.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
        const starMat = new THREE.PointsMaterial({
            size: 1.8,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            fog: false,
        });
        const starField = new THREE.Points(starGeom, starMat);
        scene.add(starField);

        // ---------------------------------------------------------
        // 4. World Geometry Parameters
        // ---------------------------------------------------------
        const CHUNK_SIZE = 180;
        const CHUNK_RES = 52;
        const LOAD_RADIUS = 2;
        const ROAD_WIDTH = 14;
        const ROAD_HALF = ROAD_WIDTH / 2;
        const SEGMENT_DIST = 5;
        const GRID_CELL = 60;

        // ---------------------------------------------------------
        // 5. Procedural Road Path Calculations
        // ---------------------------------------------------------
        const roadPoints = [];
        const roadTangents = [];
        const roadNormals = [];
        const roadBinormals = [];
        const roadCurvatures = [];   // signed curvature (rad/unit) at each road point — drives banking
        const roadArcLen = [];       // TRUE cumulative 3D arc-length from index 0 — drives seamless UV mapping
        const roadGrid = new Map();

        function addToRoadGrid(idx) {
            const p = roadPoints[idx];
            const gx = Math.floor(p.x / GRID_CELL);
            const gz = Math.floor(p.z / GRID_CELL);
            const key = `${gx},${gz}`;
            if (!roadGrid.has(key)) roadGrid.set(key, []);
            roadGrid.get(key).push(idx);
        }

        function getTerrainHeight(x, z) {
            return fbm(x * 0.005, 0, z * 0.005, 4) * 35 +
                fbm(x * 0.02, 50, z * 0.02, 3) * 8 +
                fbm(x * 0.08, 100, z * 0.08, 2) * 2;
        }

        // Curvature-smoothed road generation — produces drivable sweeping curves
        // (turn rate is limited so the road can never hairpin into itself)
        let roadHeading = 0;
        let roadCurv = 0;
        function generateRoadPoints(startIdx, count) {
            for (let i = 0; i < count; i++) {
                const idx = startIdx + i;
                if (idx === 0) {
                    const y = getTerrainHeight(0, 0);
                    roadPoints[0] = new THREE.Vector3(0, y, 0);
                    roadTangents[0] = new THREE.Vector3(0, 0, 1);
                    roadNormals[0] = new THREE.Vector3(0, 1, 0);
                    roadBinormals[0] = new THREE.Vector3(-1, 0, 0);
                    roadCurvatures[0] = 0;
                    roadArcLen[0] = 0;
                    roadHeading = 0;
                    roadCurv = 0;
                    addToRoadGrid(0);
                    continue;
                }
                const prev = roadPoints[idx - 1];
                const t = idx * 0.0016;
                // Pursue a low-frequency noise target curvature; clamp the max turn rate.
                // Max curvature 0.022 rad/unit => minimum turn radius ~45 m.
                const targetCurv = fbm(t * 10, 0, 0) * 0.05 + fbm(t * 3, 120, 0) * 0.03;
                roadCurv += (targetCurv - roadCurv) * 0.09;
                roadCurv = THREE.MathUtils.clamp(roadCurv, -0.022, 0.022);
                roadHeading += roadCurv * SEGMENT_DIST;

                const x = prev.x + Math.sin(roadHeading) * SEGMENT_DIST;
                const z = prev.z + Math.cos(roadHeading) * SEGMENT_DIST;
                const y = getTerrainHeight(x, z);
                roadPoints[idx] = new THREE.Vector3(x, y, z);

                const tangent = new THREE.Vector3().subVectors(roadPoints[idx], prev).normalize();
                const up = new THREE.Vector3(0, 1, 0);
                const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
                const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

                roadTangents[idx] = tangent;
                roadNormals[idx] = normal;
                roadBinormals[idx] = binormal;
                roadCurvatures[idx] = roadCurv;
                // True 3D arc-length accumulation (never reset per-chunk) — this is
                // what makes the road texture/dashes tile seamlessly across chunk
                // boundaries and stay proportionally correct on curves & hills.
                roadArcLen[idx] = roadArcLen[idx - 1] + roadPoints[idx].distanceTo(prev);
                addToRoadGrid(idx);
            }
        }

        generateRoadPoints(0, 700);

        function getNearestRoadIndex(x, z) {
            const gx = Math.floor(x / GRID_CELL);
            const gz = Math.floor(z / GRID_CELL);
            let best = 0,
                bestDist = Infinity;
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const key = `${gx + dx},${gz + dz}`;
                    const arr = roadGrid.get(key);
                    if (!arr) continue;
                    for (const idx of arr) {
                        const p = roadPoints[idx];
                        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
                        if (d < bestDist) { bestDist = d;
                            best = idx; }
                    }
                }
            }
            return best;
        }

        function getDistanceToRoad(x, z) {
            const idx = getNearestRoadIndex(x, z);
            const p = roadPoints[idx];
            return Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
        }

        // True perpendicular distance + interpolated elevation of the road corridor.
        // Also returns a SIGNED lateral offset + local bank angle so callers can
        // reconstruct the banked road surface height (not just the flat centerline).
        function getRoadCorridor(x, z) {
            const baseIdx = getNearestRoadIndex(x, z);
            let bestD2 = Infinity, bestY = 0, found = false, bestIdx = baseIdx, bestSigned = 0;
            const lo = Math.max(1, baseIdx - 3),
                hi = Math.min(roadPoints.length - 1, baseIdx + 2);
            for (let i = lo; i <= hi; i++) {
                const a = roadPoints[i - 1],
                    b = roadPoints[i];
                const abx = b.x - a.x,
                    abz = b.z - a.z;
                const len2 = abx * abx + abz * abz;
                if (len2 < 1e-6) continue;
                let tt = ((x - a.x) * abx + (z - a.z) * abz) / len2;
                tt = Math.max(0, Math.min(1, tt));
                const px = a.x + abx * tt,
                    pz = a.z + abz * tt;
                const dx = px - x,
                    dz = pz - z;
                const d2 = dx * dx + dz * dz;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    bestY = a.y + (b.y - a.y) * tt;
                    bestIdx = i;
                    found = true;
                    // Signed lateral: project (point - road) onto the binormal at i
                    const bin = roadBinormals[i] || roadBinormals[roadBinormals.length - 1];
                    bestSigned = bin ? (-dx * bin.x - dz * bin.z) : Math.sqrt(d2);
                }
            }
            if (!found) return null;
            const bank = computeBankAngle(bestIdx);
            // Banked surface height: centerline height plus the vertical rise from
            // rotating the cross-section by `bank` at this lateral offset.
            const bankedY = bestY + bestSigned * Math.sin(bank);
            return { dist: Math.sqrt(bestD2), height: bankedY, flatHeight: bestY, signedLat: bestSigned, bank, index: bestIdx };
        }

        function getRoadDistance(x, z) {
            const c = getRoadCorridor(x, z);
            return c ? c.dist : Infinity;
        }

        const ROAD_BLEND_OUT = 30;

        function smootherstep(edge0, edge1, xx) {
            const t = Math.min(1, Math.max(0, (xx - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        // Terrain height with the road corridor cut/fill blended in.
        // Single source of truth used by BOTH terrain mesh generation and physics.
        function getBlendedGroundHeight(x, z) {
            const raw = getTerrainHeight(x, z);
            const c = getRoadCorridor(x, z);
            if (!c || c.dist >= ROAD_BLEND_OUT) return raw;
            const inner = ROAD_HALF - 1;
            if (c.dist <= inner) return c.height;
            const t = smootherstep(inner, ROAD_BLEND_OUT, c.dist);
            return raw * t + c.height * (1 - t);
        }

        // Sample the terrain EXACTLY like the rendered mesh does (bilinear between
        // chunk-grid vertices), so the car can never float or sink into the ground.
        const TERRAIN_STEP = CHUNK_SIZE / CHUNK_RES;

        function sampleTerrainMeshHeight(x, z) {
            const cxi = Math.round(x / CHUNK_SIZE);
            const czi = Math.round(z / CHUNK_SIZE);
            const ox = cxi * CHUNK_SIZE,
                oz = czi * CHUNK_SIZE;
            const half = CHUNK_SIZE / 2;
            const lx = x - (ox - half);
            const lz = z - (oz - half);
            let gx = lx / TERRAIN_STEP,
                gz = lz / TERRAIN_STEP;
            const ix = Math.min(CHUNK_RES - 1, Math.floor(gx)),
                fx = gx - ix;
            const iz = Math.min(CHUNK_RES - 1, Math.floor(gz)),
                fz = gz - iz;
            const vx0 = ox - half + ix * TERRAIN_STEP,
                vz0 = oz - half + iz * TERRAIN_STEP;
            const h00 = getBlendedGroundHeight(vx0, vz0);
            const h10 = getBlendedGroundHeight(vx0 + TERRAIN_STEP, vz0);
            const h01 = getBlendedGroundHeight(vx0, vz0 + TERRAIN_STEP);
            const h11 = getBlendedGroundHeight(vx0 + TERRAIN_STEP, vz0 + TERRAIN_STEP);
            return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
        }

        // Physical ground under a point: terrain grid height, raised onto the road
        // slab when inside the corridor (the road mesh is lifted by ROAD_LIFT).
        function getGroundUnder(x, z) {
            const base = sampleTerrainMeshHeight(x, z);
            const c = getRoadCorridor(x, z);
            if (c && c.dist < ROAD_HALF + 1) return c.height + ROAD_LIFT;
            return base;
        }

        // ---------------------------------------------------------
        // 5.5 Atmospheric Biome System
        // ---------------------------------------------------------
        // The road cycles through three biomes as the player travels. Each biome
        // supplies a terrain tint, a fog/atmosphere tint, and a "skyline density"
        // that controls how many distant silhouette structures spawn along the
        // horizon in that stretch (dense for the cyberpunk outskirts, sparse
        // elsewhere). Biomes crossfade over a blend zone so the transition reads
        // as weather drifting in rather than a hard cut.
        const BIOMES = [{
            name: 'Synthwave Desert',
            tint: new THREE.Color(0xff5fae),
            tintStrength: 0.35,
            fog: new THREE.Color(0x2a0f3a),
            skylineColor: 0x2a0f3a,
            skylineGlow: [0xff2fae, 0xffaa33, 0x8f2fff],
            skylineDensity: 0.15,
        }, {
            name: 'Cyberpunk Outskirts',
            tint: new THREE.Color(0x2255ff),
            tintStrength: 0.55,
            fog: new THREE.Color(0x03050d),
            skylineColor: 0x060810,
            skylineGlow: [0x00f2fe, 0xff0080, 0x33ff99],
            skylineDensity: 1.0,
        }, {
            name: 'Neon Forest',
            tint: new THREE.Color(0x33ff88),
            tintStrength: 0.28,
            fog: new THREE.Color(0x081810),
            skylineColor: 0x0a2018,
            skylineGlow: [0x33ff99, 0x00f2fe, 0xaaff33],
            skylineDensity: 0.2,
        }];
        const BIOME_ZONE_LEN = 2600;  // world units of road distance spent in each biome
        const BIOME_BLEND_LEN = 480;  // crossfade length between zones

        // Returns { a, b, t, name } — biome A blending toward biome B by factor t,
        // sampled at a given distance-along-road (world units, monotonic odometer).
        function getBiomeBlend(roadDist) {
            const n = BIOMES.length;
            const cycle = BIOME_ZONE_LEN * n;
            const pos = ((roadDist % cycle) + cycle) % cycle;
            const idx = Math.floor(pos / BIOME_ZONE_LEN);
            const within = pos - idx * BIOME_ZONE_LEN;
            const a = BIOMES[idx % n];
            const b = BIOMES[(idx + 1) % n];
            const t = within > BIOME_ZONE_LEN - BIOME_BLEND_LEN ?
                smootherstep(BIOME_ZONE_LEN - BIOME_BLEND_LEN, BIOME_ZONE_LEN, within) : 0;
            return { a, b, t, name: t > 0.5 ? b.name : a.name };
        }

        // Cheap approximate "distance along road" for a world point — used only
        // for biome/skyline placement decisions, not physics, so the nearest-index
        // lookup is precise enough without needing full arc-length interpolation.
        function approxRoadDistance(x, z) {
            const idx = getNearestRoadIndex(x, z);
            return roadArcLen[idx] || idx * SEGMENT_DIST;
        }

        // ---------------------------------------------------------
        // 6. Terrain & Detailed Asset Instancing
        // ---------------------------------------------------------
        const chunks = new Map();

        // High-Detail Low-Poly Tree (Pine Model) — trunk + 3 canopy tiers with
        // baked vertex colors (single instanced material renders both parts)
        const tpos = [];
        const tcol = [];

        function bakePart(geom, r, g, b) {
            // Unpack indexed geometry into flat triangles so vertices connect correctly
            const flatGeom = geom.index ? geom.toNonIndexed() : geom;
            const pos = flatGeom.attributes.position;
            
            for (let i = 0; i < pos.count; i++) {
                tpos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
                tcol.push(r, g, b);
            }
        }
        {
            const trunk = new THREE.CylinderGeometry(0.22, 0.44, 3.6, 6);
            trunk.translate(0, 1.8, 0);
            bakePart(trunk, 0.33, 0.22, 0.12);
            const c1 = new THREE.ConeGeometry(2.8, 5.5, 6);
            c1.translate(0, 4.0, 0);
            bakePart(c1, 0.10, 0.29, 0.17);
            const c2 = new THREE.ConeGeometry(2.2, 4.5, 6);
            c2.translate(0, 6.4, 0);
            bakePart(c2, 0.12, 0.35, 0.19);
            const c3 = new THREE.ConeGeometry(1.6, 3.5, 6);
            c3.translate(0, 8.4, 0);
            bakePart(c3, 0.16, 0.42, 0.23);
        }
        const treeGeom = new THREE.BufferGeometry();
        treeGeom.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
        treeGeom.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3));
        treeGeom.computeVertexNormals();

        const treeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.85,
            flatShading: true,
            metalness: 0.0
        });

        // Rock Geometry
        const rockGeom = new THREE.DodecahedronGeometry(2.0, 1);
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x4a5a6a,
            roughness: 0.95,
            flatShading: true,
            metalness: 0.05
        });

        // Grass clumps (small)
        const grassGeom = new THREE.ConeGeometry(0.25, 0.6, 4);
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x2d6a3a,
            roughness: 0.9,
            flatShading: true
        });

        // ---- Distant neon city skyline (instanced boxes along the horizon) ----
        // Unit box, scaled per-instance into tall/thin skyscraper silhouettes.
        // Emissive "window" bands are baked as vertex colors so the whole skyline
        // renders in ONE draw call per material variant, no per-building textures.
        const skylineGeom = new THREE.BoxGeometry(1, 1, 1, 1, 6, 1);
        {
            const sp = skylineGeom.attributes.position;
            const scol = [];
            for (let i = 0; i < sp.count; i++) {
                const ny = (sp.getY(i) + 0.5); // 0 (base) .. 1 (roof)
                // Window bands: alternating dark facade / lit-window brightness
                const band = Math.sin(ny * 26.0) > 0.35 ? 1.0 : 0.12;
                scol.push(band, band, band);
            }
            skylineGeom.setAttribute('color', new THREE.Float32BufferAttribute(scol, 3));
        }
        const skylineMats = BIOMES[1].skylineGlow.map((hex) => new THREE.MeshStandardMaterial({
            color: 0x05060a,
            emissive: hex,
            emissiveIntensity: 0.9,
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.1,
            fog: true,
        }));

        // ---- Shared-resource registry (for safe chunk disposal) ----
        // Anything reused across many chunks (tree/rock/grass geometry & material,
        // road textures, biome/skyline templates) must NEVER be disposed when a
        // single chunk unloads — only resources that are unique-per-chunk
        // (terrain geometry/material, per-chunk InstancedMesh instance buffers)
        // should be freed. These sets are the single source of truth for that.
        const SHARED_GEOMETRIES = new Set([treeGeom, rockGeom, grassGeom, skylineGeom]);
        const SHARED_MATERIALS = new Set([treeMat, rockMat, grassMat, ...skylineMats]);

        // Disposes everything a chunk group owns EXCEPT shared geometry/materials.
        // Handles: plain Mesh (per-chunk terrain), InstancedMesh (trees/rocks/
        // grass/skyline — shared geometry+material, but unique instance buffers
        // that must be freed via .dispose() to avoid leaking GPU buffers), and
        // any textures a per-chunk material may own.
        function disposeChunk(chunk) {
            chunk.group.traverse((obj) => {
                if (obj.isInstancedMesh) {
                    // Frees the per-instance matrix/color GPU buffers. Geometry and
                    // material are shared and intentionally left untouched.
                    if (typeof obj.dispose === 'function') obj.dispose();
                    return;
                }
                if (obj.isMesh || obj.isLine || obj.isPoints) {
                    if (obj.geometry && !SHARED_GEOMETRIES.has(obj.geometry)) {
                        obj.geometry.dispose();
                    }
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    for (const m of mats) {
                        if (!m || SHARED_MATERIALS.has(m)) continue;
                        if (m.map) m.map.dispose();
                        if (m.emissiveMap) m.emissiveMap.dispose();
                        if (m.normalMap) m.normalMap.dispose();
                        if (m.roughnessMap) m.roughnessMap.dispose();
                        m.dispose();
                    }
                }
                if (obj.isLight && obj.shadow && obj.shadow.map) {
                    obj.shadow.map.dispose();
                }
            });
        }

        function getChunkKey(cx, cz) { return `${cx},${cz}`; }

        function createChunk(cx, cz) {
            const key = getChunkKey(cx, cz);
            if (chunks.has(key)) return chunks.get(key);

            const group = new THREE.Group();
            const offX = cx * CHUNK_SIZE;
            const offZ = cz * CHUNK_SIZE;
            group.position.set(offX, 0, offZ);

            // Which biome(s) this chunk sits in — drives terrain tint + skyline.
            const chunkRoadDist = approxRoadDistance(offX, offZ);
            const biomeBlend = getBiomeBlend(chunkRoadDist);
            const biomeTint = biomeBlend.a.tint.clone().lerp(biomeBlend.b.tint, biomeBlend.t);
            const biomeStrength = THREE.MathUtils.lerp(biomeBlend.a.tintStrength, biomeBlend.b.tintStrength, biomeBlend.t);

            // Terrain Mesh with Vertex Colors & Normal Shading
            const geom = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
            geom.rotateX(-Math.PI / 2);
            const pos = geom.attributes.position;
            const colors = [];
            const _baseCol = new THREE.Color();

            for (let i = 0; i < pos.count; i++) {
                const wx = pos.getX(i) + offX;
                const wz = pos.getZ(i) + offZ;
                const h = getBlendedGroundHeight(wx, wz);
                pos.setY(i, h);

                // Richer gradient (baseline naturalistic palette)
                if (h < -1) { _baseCol.setRGB(0.08, 0.18, 0.30); } else if (h < 2) { _baseCol.setRGB(0.10, 0.28, 0.18); } else if (h < 8) {
                    _baseCol.setRGB(0.16, 0.42, 0.20);
                } else if (h < 16) { _baseCol.setRGB(0.22, 0.38, 0.22); } else if (h < 24) { _baseCol.setRGB(0.32, 0.30, 0.25); } else if (h <
                    32) { _baseCol.setRGB(0.50, 0.45, 0.38); } else { _baseCol.setRGB(0.78, 0.82, 0.90); }

                // Blend in the biome tint (multiplicative for shadows, additive for
                // glow) so each biome reads as a distinct atmosphere while the
                // underlying height-based shading still holds the terrain together.
                _baseCol.lerp(_baseCol.clone().multiply(biomeTint), biomeStrength * 0.6);
                colors.push(_baseCol.r, _baseCol.g, _baseCol.b);
            }
            geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geom.computeVertexNormals();

            const terrainMat = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.92,
                flatShading: true,
                metalness: 0.0
            });
            const terrain = new THREE.Mesh(geom, terrainMat);
            terrain.receiveShadow = true;
            group.add(terrain);

            // Asset Instances Placement
            const treeMatrices = [];
            const rockMatrices = [];
            const grassMatrices = [];

            for (let i = 0; i < 55; i++) {
                const tx = offX + (Math.random() - 0.5) * CHUNK_SIZE;
                const tz = offZ + (Math.random() - 0.5) * CHUNK_SIZE;
                if (getRoadDistance(tx, tz) < 22) continue;
                const th = sampleTerrainMeshHeight(tx, tz);
                if (th < 0.5 || th > 28) continue;

                const s = 0.7 + Math.random() * 1.0;
                const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
                const p = new THREE.Vector3(tx - offX, th, tz - offZ);
                const mat = new THREE.Matrix4().compose(p, rot, new THREE.Vector3(s, s, s));
                treeMatrices.push(mat);
            }

            for (let i = 0; i < 16; i++) {
                const rx = offX + (Math.random() - 0.5) * CHUNK_SIZE;
                const rz = offZ + (Math.random() - 0.5) * CHUNK_SIZE;
                if (getRoadDistance(rx, rz) < 16) continue;
                const rh = sampleTerrainMeshHeight(rx, rz);
                if (rh < 0 || rh > 30) continue;
                const s = 0.5 + Math.random() * 2.4;
                const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 0.3, Math.random() * 6.28, Math
                .random() * 0.3));
                const p = new THREE.Vector3(rx - offX, rh + 0.3, rz - offZ);
                const mat = new THREE.Matrix4().compose(p, rot, new THREE.Vector3(s, s * 0.55, s));
                rockMatrices.push(mat);
            }

            // Grass tufts
            for (let i = 0; i < 80; i++) {
                const gx2 = offX + (Math.random() - 0.5) * CHUNK_SIZE;
                const gz2 = offZ + (Math.random() - 0.5) * CHUNK_SIZE;
                if (getRoadDistance(gx2, gz2) < 18) continue;
                const gh2 = sampleTerrainMeshHeight(gx2, gz2);
                if (gh2 < 0.2 || gh2 > 22) continue;
                const s = 0.4 + Math.random() * 0.8;
                const p = new THREE.Vector3(gx2 - offX, gh2, gz2 - offZ);
                const mat = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() *
                    6.28, 0)), new THREE.Vector3(s, s * 0.7 + 0.3, s));
                grassMatrices.push(mat);
            }

            // ---- Distant neon skyline silhouettes ----
            // Density comes from the biome blend at this chunk: dense in the
            // Cyberpunk Outskirts, sparse-to-absent in the desert/forest biomes.
            // Buildings are kept well clear of the road/foliage band and given
            // exaggerated height so they read as a horizon skyline from the car.
            const skylineDensity = THREE.MathUtils.lerp(biomeBlend.a.skylineDensity, biomeBlend.b.skylineDensity, biomeBlend.t);
            const skylineMatrices = [[], [], []]; // bucketed per material variant
            if (skylineDensity > 0.04) {
                const count = Math.round(skylineDensity * 7);
                for (let i = 0; i < count; i++) {
                    const bx = offX + (Math.random() * 2 - 1) * CHUNK_SIZE * 0.5;
                    const bz = offZ + (Math.random() * 2 - 1) * CHUNK_SIZE * 0.5;
                    if (getRoadDistance(bx, bz) < 55) continue; // keep the drivable band clear
                    const bh = sampleTerrainMeshHeight(bx, bz);
                    const height = 26 + Math.random() * 70;
                    const width = 6 + Math.random() * 10;
                    const rot = Math.random() * Math.PI * 2;
                    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
                    const p = new THREE.Vector3(bx - offX, bh + height / 2, bz - offZ);
                    const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(width, height, width));
                    skylineMatrices[i % skylineMats.length].push(m);
                }
            }
            for (let v = 0; v < skylineMats.length; v++) {
                if (!skylineMatrices[v].length) continue;
                const sm = new THREE.InstancedMesh(skylineGeom, skylineMats[v], skylineMatrices[v].length);
                for (let i = 0; i < skylineMatrices[v].length; i++) sm.setMatrixAt(i, skylineMatrices[v][i]);
                sm.instanceMatrix.needsUpdate = true;
                sm.frustumCulled = false;
                group.add(sm);
            }

            if (treeMatrices.length) {
                const it = new THREE.InstancedMesh(treeGeom, treeMat, treeMatrices.length);
                for (let i = 0; i < treeMatrices.length; i++) it.setMatrixAt(i, treeMatrices[i]);
                it.instanceMatrix.needsUpdate = true;
                it.frustumCulled = false; // instance bounds span the chunk; don't cull by origin sphere
                it.castShadow = true;
                it.receiveShadow = true;
                group.add(it);
            }

            if (rockMatrices.length) {
                const ir = new THREE.InstancedMesh(rockGeom, rockMat, rockMatrices.length);
                for (let i = 0; i < rockMatrices.length; i++) ir.setMatrixAt(i, rockMatrices[i]);
                ir.instanceMatrix.needsUpdate = true;
                ir.frustumCulled = false;
                ir.castShadow = true;
                ir.receiveShadow = true;
                group.add(ir);
            }

            if (grassMatrices.length) {
                const ig = new THREE.InstancedMesh(grassGeom, grassMat, grassMatrices.length);
                for (let i = 0; i < grassMatrices.length; i++) ig.setMatrixAt(i, grassMatrices[i]);
                ig.instanceMatrix.needsUpdate = true;
                ig.frustumCulled = false;
                ig.castShadow = true;
                ig.receiveShadow = true;
                group.add(ig);
            }

            scene.add(group);
            const chunk = { group, cx, cz };
            chunks.set(key, chunk);
            return chunk;
        }

        function updateChunks(carX, carZ) {
            const ccx = Math.floor(carX / CHUNK_SIZE);
            const ccz = Math.floor(carZ / CHUNK_SIZE);
            const needed = new Set();
            for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
                for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
                    const k = getChunkKey(ccx + dx, ccz + dz);
                    needed.add(k);
                    if (!chunks.has(k)) createChunk(ccx + dx, ccz + dz);
                }
            }
            for (const [k, c] of chunks) {
                if (!needed.has(k)) {
                    scene.remove(c.group);
                    disposeChunk(c); // release terrain geometry/material + instance buffers — prevents GPU memory leak
                    chunks.delete(k);
                }
            }
        }

        // ---------------------------------------------------------
        // 7. Multi-Layer Road Architecture — With Texture & Markings
        // ---------------------------------------------------------
        const roadGroup = new THREE.Group();
        scene.add(roadGroup);

        // ---- Generate a high-quality road texture with markings ----
        function generateRoadTexture() {
            const canvas = document.createElement('canvas');
            const W = 1024,
                H = 1024;
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');

            // 1. Asphalt base with noise
            const imageData = ctx.createImageData(W, H);
            const data = imageData.data;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = (y * W + x) * 4;
                    const n = (Math.random() - 0.5) * 12 + 128;
                    const val = Math.max(60, Math.min(100, n));
                    data[i] = val - 2;
                    data[i + 1] = val - 4;
                    data[i + 2] = val - 6;
                    data[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // 2. Road edge lines (solid, bright)
            const edgeW = 6;
            // Left edge (x: 0 ~ edgeW)
            ctx.fillStyle = '#aaccff';
            ctx.fillRect(0, 0, edgeW, H);
            // Right edge (x: W - edgeW ~ W)
            ctx.fillRect(W - edgeW, 0, edgeW, H);

            // Neon glow overlay on edges
            const gradL = ctx.createLinearGradient(0, 0, edgeW * 2, 0);
            gradL.addColorStop(0, 'rgba(0, 242, 254, 0.0)');
            gradL.addColorStop(0.5, 'rgba(0, 242, 254, 0.08)');
            gradL.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
            ctx.fillStyle = gradL;
            ctx.fillRect(0, 0, edgeW * 2, H);

            const gradR = ctx.createLinearGradient(W - edgeW * 2, 0, W, 0);
            gradR.addColorStop(0, 'rgba(0, 242, 254, 0.0)');
            gradR.addColorStop(0.5, 'rgba(0, 242, 254, 0.08)');
            gradR.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
            ctx.fillStyle = gradR;
            ctx.fillRect(W - edgeW * 2, 0, edgeW * 2, H);

            // 3. Dashed center line (yellow)
            const dashLen = 0.32 * H;
            const gapLen = 0.28 * H;
            const centerX = W / 2 - 3;
            ctx.fillStyle = '#ffcc33';
            let yPos = 0;
            while (yPos < H) {
                if (yPos + dashLen < H) {
                    ctx.fillRect(centerX, yPos, 6, dashLen);
                }
                yPos += dashLen + gapLen;
            }

            // Center line glow
            const glowGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 80);
            glowGrad.addColorStop(0, 'rgba(255, 204, 51, 0.06)');
            glowGrad.addColorStop(1, 'rgba(255, 204, 51, 0)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(0, 0, W, H);

            // 4. Road texture — slight grain and wear marks
            for (let i = 0; i < 400; i++) {
                const x = Math.random() * W;
                const y = Math.random() * H;
                const r = 1 + Math.random() * 3;
                const alpha = 0.02 + Math.random() * 0.06;
                ctx.fillStyle = `rgba(80,80,80,${alpha})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 1);
            texture.anisotropy = 4;
            return texture;
        }

        const roadTexture = generateRoadTexture();

        const sharedRoadMat = new THREE.MeshStandardMaterial({
            map: roadTexture,
            roughness: 0.85,
            metalness: 0.05,
            side: THREE.DoubleSide,
        });

        // ---- Emissive edge glow strips (separate geometry) ----
        const edgeMat = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });

        // ---- Continuous gap-free road ribbons ----
        // Surface + edge glow are built as shared-vertex ribbon strips following the
        // road centerline, so consecutive quads can never show seams or wedge gaps.
        const ROAD_VIS_RADIUS = 130;
        const ROAD_CHUNK_SEGS = 32; // segments merged per draw call
        const ROAD_LIFT = 0.12;
        const EDGE_HALF_WIDTH = 0.22;

        const _rvPrev = new THREE.Vector3();
        const _rvNext = new THREE.Vector3();
        const _rvT = new THREE.Vector3();
        const _rvB = new THREE.Vector3();
        const _rvN = new THREE.Vector3();
        const _rvUp = new THREE.Vector3(0, 1, 0);

        // ---- Road banking (superelevation) ----
        // Real roads cant into curves so lateral g-forces push the tires into the
        // asphalt instead of off it. We derive a bank angle directly from the
        // road's signed curvature (tighter turn => more lean), smoothed so it
        // ramps in/out naturally rather than snapping at segment boundaries.
        const MAX_BANK = 0.30;       // radians, ~17° cap
        const BANK_GAIN = 9.5;       // curvature -> bank angle scale
        const bankSmoothed = [];     // low-pass filtered per-index bank cache

        function computeBankAngle(i) {
            if (bankSmoothed[i] !== undefined) return bankSmoothed[i];
            const curv = roadCurvatures[i] || 0;
            let bank = THREE.MathUtils.clamp(-curv * BANK_GAIN, -MAX_BANK, MAX_BANK);
            // Smooth against neighbours so banking eases in/out instead of kinking
            const c0 = roadCurvatures[Math.max(0, i - 4)] || 0;
            const c1 = roadCurvatures[Math.min(roadCurvatures.length - 1, i + 4)] || 0;
            const neighborBank = THREE.MathUtils.clamp(-((c0 + c1) * 0.5) * BANK_GAIN, -MAX_BANK, MAX_BANK);
            bank = bank * 0.6 + neighborBank * 0.4;
            bankSmoothed[i] = bank;
            return bank;
        }

        // Texture repeats once every this many world units along the centerline —
        // matched to the original per-segment period but now driven by TRUE
        // cumulative arc-length, so dashes never stretch/compress on curves or
        // hills and tile seamlessly across chunk boundaries.
        const ROAD_TEX_PERIOD = SEGMENT_DIST;

        // Builds a ribbon over roadPoints[idx0 .. idx0+segCount].
        // [latA, latB] = signed lateral offsets from the centerline (along binormal).
        function buildRibbonGeometry(idx0, segCount, latA, latB, lift) {
            const sections = segCount + 1;
            const pos = new Float32Array(sections * 6);
            const nor = new Float32Array(sections * 6);
            const uva = new Float32Array(sections * 4);
            for (let c = 0; c < sections; c++) {
                const i = idx0 + c;
                _rvPrev.copy(roadPoints[Math.max(0, i - 1)]);
                _rvNext.copy(roadPoints[Math.min(roadPoints.length - 1, i + 1)]);
                _rvT.subVectors(_rvNext, _rvPrev).normalize();
                _rvB.crossVectors(_rvT, _rvUp).normalize();
                _rvN.crossVectors(_rvB, _rvT).normalize();

                // Apply banking: rotate the (binormal, normal) cross-section frame
                // around the tangent axis by the smoothed bank angle.
                const bank = computeBankAngle(i);
                if (bank !== 0) {
                    _rvB.applyAxisAngle(_rvT, bank);
                    _rvN.applyAxisAngle(_rvT, bank);
                }

                const p = roadPoints[i];
                const cx = p.x + _rvN.x * lift,
                    cy = p.y + _rvN.y * lift,
                    cz = p.z + _rvN.z * lift;
                const bx = _rvB.x, by = _rvB.y, bz = _rvB.z;
                let o = c * 6;
                pos[o] = cx + bx * latA; pos[o + 1] = cy + by * latA; pos[o + 2] = cz + bz * latA;
                pos[o + 3] = cx + bx * latB; pos[o + 4] = cy + by * latB; pos[o + 5] = cz + bz * latB;
                nor[o] = _rvN.x; nor[o + 1] = _rvN.y; nor[o + 2] = _rvN.z;
                nor[o + 3] = _rvN.x; nor[o + 4] = _rvN.y; nor[o + 5] = _rvN.z;
                // True arc-length parameterization: global cumulative distance, not
                // a per-chunk-reset local counter, so the dash pattern is continuous
                // and correctly scaled everywhere.
                const v = roadArcLen[i] / ROAD_TEX_PERIOD;
                o = c * 4;
                uva[o] = 0; uva[o + 1] = v;
                uva[o + 2] = 1; uva[o + 3] = v;
            }
            const idxArr = [];
            for (let c = 0; c < segCount; c++) {
                const a = c * 2;
                idxArr.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            g.setAttribute('uv', new THREE.BufferAttribute(uva, 2));
            g.setIndex(idxArr);
            return g;
        }

        // Per-chunk road meshes (surface + two neon edge lines)
        const edgeStripMatL = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
        const edgeStripMatR = edgeStripMatL;
        const roadChunkMeshes = new Map(); // chunkId -> { mesh, geometry }
        const edgeChunkMeshesL = new Map();
        const edgeChunkMeshesR = new Map();

        function makeChunkEntry(group, geometry, material) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.receiveShadow = true;
            group.add(mesh);
            return { mesh, geometry };
        }

        function removeChunk(map, key) {
            const e = map.get(key);
            if (!e) return;
            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
            e.geometry.dispose();
            map.delete(key);
        }

        function updateRoadMesh(carIdx) {
            const start = Math.max(0, carIdx - ROAD_VIS_RADIUS);
            const end = carIdx + ROAD_VIS_RADIUS;
            if (end >= roadPoints.length - 1) generateRoadPoints(roadPoints.length, end - roadPoints.length + 100);

            // Chunks are pure functions of their id (they always cover the full
            // segment span), so they can never go stale when the window slides.
            const firstChunk = Math.max(0, Math.floor(start / ROAD_CHUNK_SEGS));
            const lastChunk = Math.floor(end / ROAD_CHUNK_SEGS);

            for (let ck = firstChunk; ck <= lastChunk; ck++) {
                if (roadChunkMeshes.has(ck)) continue;
                const s0 = ck * ROAD_CHUNK_SEGS;
                if (s0 >= roadPoints.length - 1) continue;
                const count = Math.min(ROAD_CHUNK_SEGS, roadPoints.length - 1 - s0);

                const surface = buildRibbonGeometry(s0, count, -ROAD_HALF, ROAD_HALF, ROAD_LIFT);
                roadChunkMeshes.set(ck, makeChunkEntry(roadGroup, surface, sharedRoadMat));

                const edgeL = buildRibbonGeometry(s0, count, -(ROAD_HALF - EDGE_HALF_WIDTH), -ROAD_HALF, ROAD_LIFT + 0.02);
                edgeChunkMeshesL.set(ck, makeChunkEntry(roadGroup, edgeL, edgeStripMatL));

                const edgeR = buildRibbonGeometry(s0, count, ROAD_HALF - EDGE_HALF_WIDTH, ROAD_HALF, ROAD_LIFT + 0.02);
                edgeChunkMeshesR.set(ck, makeChunkEntry(roadGroup, edgeR, edgeStripMatR));

                maybeCreateStructure(ck, s0, count);
            }

            // Cleanup chunks fully outside the visible window (with margin)
            for (const key of Array.from(roadChunkMeshes.keys())) {
                if ((key + 1) * ROAD_CHUNK_SEGS < start - ROAD_CHUNK_SEGS ||
                    key * ROAD_CHUNK_SEGS > end + ROAD_CHUNK_SEGS) {
                    removeChunk(roadChunkMeshes, key);
                    removeChunk(edgeChunkMeshesL, key);
                    removeChunk(edgeChunkMeshesR, key);
                    removeStructureChunk(key);
                }
            }
        }

        // ---------------------------------------------------------
        // 7.5 Environmental Structures — Overpasses, Neon Arches, Tunnels
        // ---------------------------------------------------------
        // Spawned on the SAME per-road-chunk cadence as the road ribbon itself
        // (see updateRoadMesh below), keyed by the identical chunk id `ck` so
        // creation/cleanup piggybacks on logic that's already proven leak-free.
        const structuresGroup = new THREE.Group();
        scene.add(structuresGroup);
        const structureChunkMeshes = new Map(); // ck -> THREE.Group | null (null = "checked, nothing here")

        const structUnitBox = new THREE.BoxGeometry(1, 1, 1);
        const structMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a1c26, metalness: 0.7, roughness: 0.45 });
        const structNeonMats = [0x00f2fe, 0xff0080, 0x8f2fff].map((hex) => new THREE.MeshBasicMaterial({
            color: hex,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
        }));
        SHARED_GEOMETRIES.add(structUnitBox);
        SHARED_MATERIALS.add(structMetalMat);
        structNeonMats.forEach((m) => SHARED_MATERIALS.add(m));

        // Every structure piece is the SAME shared unit cube, just scaled +
        // positioned — so structures need zero unique geometry/material and
        // therefore nothing chunk-owned to dispose beyond the group itself.
        function structBox(parent, w, h, d, x, y, z, mat) {
            const m = new THREE.Mesh(structUnitBox, mat);
            m.scale.set(w, h, d);
            m.position.set(x, y, z);
            parent.add(m);
            return m;
        }

        // Deterministic hash: the SAME chunk id always yields the SAME structure
        // roll, so nothing flickers or changes if a chunk unloads and reloads.
        function hashInt(n) {
            let x = (n << 13) ^ n;
            x = (x * (x * x * 15731 + 789221) + 1376312589) & 0x7fffffff;
            return x / 0x7fffffff;
        }

        const STRUCTURE_STRIDE = 5;               // only 1 in N road-chunks may host a structure
        const TUNNEL_LEN_SEGS = 10;                // road segments a tunnel encloses (~50 units)

        function buildArch(i0) {
            const g = new THREE.Group();
            g.position.copy(roadPoints[i0]);
            g.rotation.y = Math.atan2(roadTangents[i0].x, roadTangents[i0].z);
            const half = ROAD_HALF + 1.4;
            const beamY = 9.5;
            structBox(g, 0.8, beamY, 0.8, -half, beamY / 2, 0, structMetalMat);
            structBox(g, 0.8, beamY, 0.8, half, beamY / 2, 0, structMetalMat);
            structBox(g, half * 2 + 0.8, 0.6, 0.8, 0, beamY, 0, structMetalMat);
            const neon = structNeonMats[Math.floor(hashInt(i0 + 7) * structNeonMats.length) % structNeonMats.length];
            structBox(g, half * 2, 0.12, 0.3, 0, beamY - 0.5, 0.5, neon);
            return g;
        }

        function buildOverpass(i0) {
            const g = new THREE.Group();
            g.position.copy(roadPoints[i0]);
            g.rotation.y = Math.atan2(roadTangents[i0].x, roadTangents[i0].z);
            const deckY = 11.5;
            const halfSpan = 26;
            structBox(g, halfSpan * 2, 1.6, 7, 0, deckY, 0, structMetalMat);
            const pillarX = ROAD_HALF + 3.2;
            structBox(g, 1.4, deckY, 1.4, -pillarX, deckY / 2, 0, structMetalMat);
            structBox(g, 1.4, deckY, 1.4, pillarX, deckY / 2, 0, structMetalMat);
            const neon = structNeonMats[Math.floor(hashInt(i0 + 3) * structNeonMats.length) % structNeonMats.length];
            structBox(g, halfSpan * 2, 0.1, 0.2, 0, deckY - 0.85, 3.6, neon);
            structBox(g, halfSpan * 2, 0.1, 0.2, 0, deckY - 0.85, -3.6, neon);
            return g;
        }

        function buildTunnel(i0, segLen) {
            const g = new THREE.Group();
            g.position.copy(roadPoints[i0]);
            g.rotation.y = Math.atan2(roadTangents[i0].x, roadTangents[i0].z);
            const h = 8.5,
                wallX = ROAD_HALF + 1.0,
                len = segLen;
            structBox(g, 0.7, h, len, -wallX, h / 2, len / 2, structMetalMat);
            structBox(g, 0.7, h, len, wallX, h / 2, len / 2, structMetalMat);
            structBox(g, wallX * 2 + 1.4, 0.8, len, 0, h, len / 2, structMetalMat);
            const neon = structNeonMats[Math.floor(hashInt(i0 + 11) * structNeonMats.length) % structNeonMats.length];
            // Ceiling light strip running the length of the tunnel roof
            structBox(g, 0.35, 0.08, len * 0.96, 0, h - 0.45, len / 2, neon);
            // Interior point lights, spaced along the tunnel for localized glow
            const lightCount = Math.max(1, Math.round(len / 16));
            for (let k = 0; k < lightCount; k++) {
                const lz = (k + 0.5) * (len / lightCount);
                const col = k % 2 === 0 ? 0x00f2fe : 0xff0080;
                const pl = new THREE.PointLight(col, 1.1, 16, 2);
                pl.position.set(0, h * 0.55, lz);
                g.add(pl);
            }
            return g;
        }

        // Called once per road-chunk id `ck` (same id space as roadChunkMeshes).
        function maybeCreateStructure(ck, s0, count) {
            if (structureChunkMeshes.has(ck)) return;
            if (ck % STRUCTURE_STRIDE !== 0) { structureChunkMeshes.set(ck, null); return; }
            const mid = s0 + Math.floor(count / 2);
            if (mid < 2 || mid >= roadPoints.length - TUNNEL_LEN_SEGS - 2) { structureChunkMeshes.set(ck, null); return; }
            const roll = hashInt(ck * 97 + 13);
            let group = null;
            if (roll < 0.30) group = buildArch(mid);
            else if (roll < 0.58) group = buildOverpass(mid);
            else if (roll < 0.80) group = buildTunnel(mid, TUNNEL_LEN_SEGS * SEGMENT_DIST);
            if (group) structuresGroup.add(group);
            structureChunkMeshes.set(ck, group);
        }

        function removeStructureChunk(ck) {
            const group = structureChunkMeshes.get(ck);
            if (group) {
                structuresGroup.remove(group);
                // Every mesh here reuses the SHARED unit box + shared materials;
                // the only unique objects are PointLights, which hold no GPU
                // buffers (shadows disabled), so a plain remove fully cleans up.
            }
            structureChunkMeshes.delete(ck);
        }

        // ---------------------------------------------------------
        // 8. Dynamic Skybox, Sun & Environmental Atmosphere
        // ---------------------------------------------------------
        let sunMesh;

        function createEnvironment() {
            const sunGeom = new THREE.SphereGeometry(55, 32, 32);
            const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
            sunMesh = new THREE.Mesh(sunGeom, sunMat);
            sunMesh.position.set(400, 200, 800);
            scene.add(sunMesh);

            // Volumetric sun glow (large transparent sprite)
            const glowTexture = (() => {
                const c = document.createElement('canvas');
                c.width = 256;
                c.height = 256;
                const ctx = c.getContext('2d');
                const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
                grad.addColorStop(0, 'rgba(255,200,100,1)');
                grad.addColorStop(0.1, 'rgba(255,180,80,0.8)');
                grad.addColorStop(0.5, 'rgba(255,150,50,0.2)');
                grad.addColorStop(1, 'rgba(255,100,20,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 256, 256);
                return new THREE.CanvasTexture(c);
            })();
            const glowMat = new THREE.SpriteMaterial({
                map: glowTexture,
                blending: THREE.AdditiveBlending,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
            });
            const glowSprite = new THREE.Sprite(glowMat);
            glowSprite.position.copy(sunMesh.position);
            glowSprite.scale.set(400, 400, 1);
            scene.add(glowSprite);
        }
        createEnvironment();

        // ---------------------------------------------------------
        // 9. Ultra-Detailed Cyber Supercar Model
        // ---------------------------------------------------------
        const carGroup = new THREE.Group();
        carGroup.rotation.order = 'YXZ'; // MUST be YXZ so pitch/roll aligns with heading

        // Helper to taper BoxGeometries into sleek, aerodynamic wedge shapes
        function createWedge(w, h, d, topScaleX, topShiftZ) {
            const geom = new THREE.BoxGeometry(w, h, d);
            const pos = geom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) > 0) { // Target the top vertices
                    pos.setX(i, pos.getX(i) * topScaleX);
                    pos.setZ(i, pos.getZ(i) + topShiftZ);
                }
            }
            geom.computeVertexNormals();
            return geom;
        }

        // Main Metallic Bodywork — pearlescent
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x00c8d6,
            metalness: 0.65,
            roughness: 0.25,
            envMapIntensity: 1.2,
            emissive: 0x003340,
            emissiveIntensity: 0.18,
        });
        // Aggressive wedge-shaped chassis (sloped hood)
        const chassis = new THREE.Mesh(createWedge(2.4, 0.5, 4.8, 0.85, -0.4), bodyMat);
        chassis.position.y = 0.55;
        chassis.castShadow = true;
        carGroup.add(chassis);

        // Dark side skirts and splitters
        const accentMat = new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.8, roughness: 0.35 });
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.15, 4.6), accentMat);
        skirt.position.y = 0.32;
        carGroup.add(skirt);
        

        // Glass Canopy (Steep fastback windshield slope)
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x080818, metalness: 0.7, roughness: 0.1,
            transparent: true, opacity: 0.85, envMapIntensity: 1.5,
        });
        const cabin = new THREE.Mesh(createWedge(1.7, 0.4, 2.2, 0.65, -0.7), glassMat);
        cabin.position.set(0, 1.0, -0.2);
        cabin.castShadow = true;
        carGroup.add(cabin);

        // 80s Cyberpunk Rear Engine Louvers
        for (let i = 0; i < 4; i++) {
            const louver = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.3), accentMat);
            louver.position.set(0, 0.88 - i * 0.08, -1.5 - i * 0.28);
            louver.rotation.x = 0.25;
            carGroup.add(louver);
        }

        // Swept-back modern Spoiler
        const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.8, roughness: 0.3 });
        const spoiler = new THREE.Mesh(createWedge(2.1, 0.06, 0.6, 0.9, -0.2), spoilerMat);
        spoiler.position.set(0, 1.15, -2.4);
        carGroup.add(spoiler);

        // Angled spoiler struts
        const spoilerLegs = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.2), spoilerMat);
        spoilerLegs.position.set(-0.7, 0.95, -2.35);
        spoilerLegs.rotation.x = -0.3; 
        carGroup.add(spoilerLegs);
        const spoilerLegs2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.2), spoilerMat);
        spoilerLegs2.position.set(0.7, 0.95, -2.35);
        spoilerLegs2.rotation.x = -0.3;
        carGroup.add(spoilerLegs2);

        // Dual Exhaust Pipes
        const exhaustGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12);
        exhaustGeom.rotateX(Math.PI / 2);
        const exMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.4 });
        const ex1 = new THREE.Mesh(exhaustGeom, exMat);
        ex1.position.set(-0.5, 0.4, -2.5);
        carGroup.add(ex1);
        const ex2 = new THREE.Mesh(exhaustGeom, exMat);
        ex2.position.set(0.5, 0.4, -2.5);
        carGroup.add(ex2);

        // Wheels & Brake Calipers
        const wGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 24);
        wGeom.rotateZ(Math.PI / 2);
        const wMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a22,
            roughness: 0.55,
            metalness: 0.5,
        });
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0x8888aa,
            roughness: 0.3,
            metalness: 0.7,
        });
        const rimGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.39, 16);
        rimGeom.rotateZ(Math.PI / 2);
        // Wheels — steering pivot mount > suspension group > spinning tire
        const wheels = [];
        const rims = [];
        const wheelMounts = []; // yaw pivots (front pair steers)
        const suspensions = []; // vertical spring travel groups
        const WHEEL_REST_Y = 0.42; // ride height: wheel centre above contact patch
        const wheelPositions = [
            [-1.2, WHEEL_REST_Y, 1.55],
            [1.2, WHEEL_REST_Y, 1.55],
            [-1.2, WHEEL_REST_Y, -1.55],
            [1.2, WHEEL_REST_Y, -1.55]
        ];
        wheelPositions.forEach((p) => {
            const mount = new THREE.Group();
            mount.position.set(p[0], 0, p[2]);
            const spring = new THREE.Group();
            // Placeholder height; driven every frame by suspension physics
            spring.position.y = WHEEL_REST_Y;
            const w = new THREE.Mesh(wGeom, wMat);
            w.castShadow = true;
            spring.add(w);
            // Rim (geometry pre-rotated so it spins cleanly with the tire)
            const rim = new THREE.Mesh(rimGeom, rimMat);
            spring.add(rim);
            mount.add(spring);
            carGroup.add(mount);
            wheels.push(w);
            rims.push(rim);
            wheelMounts.push(mount);
            suspensions.push(spring);
        });
        const suspOffsets = [0, 0, 0, 0]; // per-tire display extension (mount->tyre)
        let steerVisual = 0;

        // ---- Semi-rigid-body suspension model ----
        // Tires are PINNED to the ground (with a small embed for tire squish);
        // the chassis floats on 4 spring-dampers. Body Y/pitch/roll are integrated
        // from the summed spring forces & torques each substep, so bumps produce
        // real weight transfer, vibration and natural settle.
        const WHEEL_R = 0.42;          // tire radius
        const TIRE_EMBED = 0.05;       // deliberate clip into ground = squish
        const SUSP_LN = 0.38;          // relaxed mount->tire-centre length
        const SUSP_COMP_MAX = 0.24;    // max compression below rest
        const SUSP_EXT_MAX = 0.16;     // max droop beyond rest
        const SPRING_K = 60;           // N/m per corner
        const BUMP_K = 320;            // bump-stop stiffness past travel
        const SUSP_C = 4.0;            // damping per corner (~0.6 ratio)
        const CAR_MASS = 1.8;          // kg (scaled)
        const SUSP_GRAV = 30;          // world gravity
        const I_PITCH = 1.4;           // m * lever^2 point-mass inertia about x
        const I_ROLL = 1.5;            // about z
        const F_MIN = -90,
            F_MAX = 260;               // force clamp (stability)
        // Integrated chassis state (body origin = ground-plane datum)
        let suspY = 0, suspTheta = 0, suspPhi = 0;      // heave, pitch (x), roll (z)
        let suspVy = 0, suspWTheta = 0, suspWPhi = 0;   // velocities

        // Snap the suspension to the ground pose (spawn / reset / teleport)
        function initSuspension() {
            const cosH = Math.cos(car.heading),
                sinH = Math.sin(car.heading);
            const gY = [];
            for (const lp of wheelPositions) {
                const wxp = car.position.x + lp[0] * cosH + lp[2] * sinH;
                const wzp = car.position.z - lp[0] * sinH + lp[2] * cosH;
                gY.push(getGroundUnder(wxp, wzp));
            }
            const frontY = (gY[0] + gY[1]) / 2,
                rearY = (gY[2] + gY[3]) / 2;
            const leftY = (gY[0] + gY[2]) / 2,
                rightY = (gY[1] + gY[3]) / 2;
            // Update the starting Y coordinate calculation
            suspY = (frontY + rearY) / 2 - 0.065;
            suspTheta = Math.atan2(rearY - frontY, 3.1);
            suspPhi = Math.atan2(rightY - leftY, 2.4);
            suspVy = suspWTheta = suspWPhi = 0;
            for (let i = 0; i < suspensions.length; i++) {
                // Change the subtraction to an addition
                suspOffsets[i] = SUSP_LN + CAR_MASS * SUSP_GRAV / (4 * SPRING_K);
                suspensions[i].position.y = suspOffsets[i];
            }
            car.position.y = suspY;
        }

        // Headlights (Aggressive sleek slits)
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const hlGeom = new THREE.BoxGeometry(0.65, 0.06, 0.05);
        const hlL = new THREE.Mesh(hlGeom, hlMat);
        hlL.position.set(-0.7, 0.58, 2.42);
        carGroup.add(hlL);
        const hlR = new THREE.Mesh(hlGeom, hlMat);
        hlR.position.set(0.7, 0.58, 2.42);
        carGroup.add(hlR);

        // Headlight glow
        const glowHlMat = new THREE.MeshBasicMaterial({
            color: 0x88ddff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending,
        });
        const hlGlowL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.1), glowHlMat);
        hlGlowL.position.set(-0.7, 0.58, 2.45);
        carGroup.add(hlGlowL);
        const hlGlowR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.1), glowHlMat);
        hlGlowR.position.set(0.7, 0.58, 2.45);
        carGroup.add(hlGlowR);

        // Spotlights — soft beams (intensity shared with the L-toggle logic)
        const HEADLIGHT_INTENSITY = 1.4;
        const spotL = new THREE.SpotLight(0x88ddff, HEADLIGHT_INTENSITY, 80, Math.PI / 6, 0.55, 1);
        spotL.position.set(-0.8, 0.7, 2.2);
        spotL.target.position.set(-0.8, 0, 20);
        carGroup.add(spotL, spotL.target);
        const spotR = new THREE.SpotLight(0x88ddff, HEADLIGHT_INTENSITY, 80, Math.PI / 6, 0.55, 1);
        spotR.position.set(0.8, 0.7, 2.2);
        spotR.target.position.set(0.8, 0, 20);
        carGroup.add(spotR, spotR.target);

        // Neon Underglow
        const underglow = new THREE.PointLight(0x00f2fe, 1.2, 8);
        underglow.position.set(0, 0.08, 0);
        carGroup.add(underglow);
        // Physical underglow strip
        const stripMat = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
        });
        const strip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 4.2), stripMat);
        strip.position.set(0, 0.12, 0);
        carGroup.add(strip);

        // Cyberpunk Full-Width Tail Light Bar
        const tlMatOff = new THREE.MeshBasicMaterial({ color: 0x22000a });
        const tlGeom = new THREE.BoxGeometry(2.1, 0.08, 0.05);
        const tailLightBar = new THREE.Mesh(tlGeom, tlMatOff);
        tailLightBar.position.set(0, 0.65, -2.42);
        carGroup.add(tailLightBar);

        const brakeL = new THREE.PointLight(0xff0055, 0, 12);
        brakeL.position.set(-0.8, 0.65, -2.5);
        carGroup.add(brakeL);
        const brakeR = new THREE.PointLight(0xff0055, 0, 12);
        brakeR.position.set(0.8, 0.65, -2.5);
        carGroup.add(brakeR);

        scene.add(carGroup);

        // ---- Exhaust Particle System ----
        const P_COUNT = 100;
        const pGeom = new THREE.BufferGeometry();
        const pPos = new Float32Array(P_COUNT * 3);
        const pLife = new Float32Array(P_COUNT);
        const pVel = [];
        for (let i = 0; i < P_COUNT; i++) { pLife[i] = -1;
            pVel.push(new THREE.Vector3()); }
        pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        const pMat = new THREE.PointsMaterial({
            color: 0xff0080,
            size: 0.4,
            transparent: true,
            opacity: 0.55,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const particleSystem = new THREE.Points(pGeom, pMat);
        scene.add(particleSystem);

        function updateParticles(dt, carPos, carVel, heading, boosting) {
            const arr = particleSystem.geometry.attributes.position.array;
            for (let i = 0; i < P_COUNT; i++) {
                if (pLife[i] > 0) {
                    pLife[i] -= dt;
                    arr[i * 3] += pVel[i].x * dt;
                    arr[i * 3 + 1] += pVel[i].y * dt;
                    arr[i * 3 + 2] += pVel[i].z * dt;
                    pVel[i].y += 0.25 * dt;
                    pVel[i].x *= 0.98;
                    pVel[i].z *= 0.98;
                } else if (Math.abs(carVel) > 0.3 && Math.random() < (boosting ? 0.95 : 0.45)) {
                    pLife[i] = 0.6 + Math.random() * 0.6;
                    const off = new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.2, -2.6);
                    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
                    arr[i * 3] = carPos.x + off.x;
                    arr[i * 3 + 1] = carPos.y + off.y;
                    arr[i * 3 + 2] = carPos.z + off.z;
                    const spread = 0.6;
                    pVel[i].set(
                        (Math.random() - 0.5) * spread,
                        Math.random() * 0.6,
                        (Math.random() - 0.5) * spread - carVel * 0.4
                    );
                } else {
                    arr[i * 3 + 1] = -1000;
                }
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;
        }

        // ---- Weather Particles: Rain ----
        // A cloud of falling points recentred on the car every frame (same trick
        // as the starfield dome) — cheap, robust, and reads as ambient rain
        // streaking past the windshield without a dedicated screen-space shader.
        const RAIN_COUNT = 650;
        const RAIN_VOL = { x: 70, y: 46, z: 70 };
        const rainGeom = new THREE.BufferGeometry();
        const rainPos = new Float32Array(RAIN_COUNT * 3);
        for (let i = 0; i < RAIN_COUNT; i++) {
            rainPos[i * 3] = (Math.random() - 0.5) * RAIN_VOL.x;
            rainPos[i * 3 + 1] = Math.random() * RAIN_VOL.y;
            rainPos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_VOL.z;
        }
        rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({
            color: 0xaad4ff,
            size: 0.14,
            transparent: true,
            opacity: 0.5,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
        });
        const rainMesh = new THREE.Points(rainGeom, rainMat);
        rainMesh.visible = false;
        rainMesh.frustumCulled = false;
        scene.add(rainMesh);

        function updateRain(dt, carPos, speed) {
            if (!isRaining) return;
            const arr = rainGeom.attributes.position.array;
            const fallSpeed = 50 + speed * 1.5; // rain streaks harder at speed
            for (let i = 0; i < RAIN_COUNT; i++) {
                arr[i * 3 + 1] -= fallSpeed * dt;
                if (arr[i * 3 + 1] < -2) {
                    arr[i * 3 + 1] = RAIN_VOL.y;
                    arr[i * 3] = (Math.random() - 0.5) * RAIN_VOL.x;
                    arr[i * 3 + 2] = (Math.random() - 0.5) * RAIN_VOL.z;
                }
            }
            rainGeom.attributes.position.needsUpdate = true;
            rainMesh.position.set(carPos.x, carPos.y, carPos.z);
        }

        // ---------------------------------------------------------
        // 9.6 Drift Mechanics — Skid Marks & Tire Smoke
        // ---------------------------------------------------------
        const DRIFT_LAT_THRESHOLD = 6.0; // m/s of lateral slip before we call it a "drift"

        // Skid marks: a ring-buffer InstancedMesh of small dark quads laid at the
        // rear-wheel contact points while drifting. Using one InstancedMesh (vs.
        // spawning real meshes) means zero per-mark geometry/material allocation
        // and therefore nothing to leak or dispose.
        const SKID_MAX = 500;
        const skidGeom = new THREE.PlaneGeometry(0.3, 0.7);
        skidGeom.rotateX(-Math.PI / 2);
        const skidMat = new THREE.MeshBasicMaterial({
            color: 0x080808,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
        });
        const skidMesh = new THREE.InstancedMesh(skidGeom, skidMat, SKID_MAX);
        skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        skidMesh.frustumCulled = false;
        scene.add(skidMesh);
        SHARED_GEOMETRIES.add(skidGeom);
        SHARED_MATERIALS.add(skidMat); // never chunk-owned, but harmless to register

        const skidPool = new Array(SKID_MAX).fill(null); // {life, maxLife, pos, quat}
        let skidCursor = 0;
        const _skidMatrix = new THREE.Matrix4();
        const _skidZero = new THREE.Vector3();
        const _skidIdentQuat = new THREE.Quaternion();
        const _skidScaleV = new THREE.Vector3();
        const _skidZeroScale = new THREE.Vector3(0, 0, 0);

        function spawnSkidMark(worldPos, quat) {
            const idx = skidCursor % SKID_MAX;
            skidCursor++;
            let entry = skidPool[idx];
            if (!entry) { entry = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
                skidPool[idx] = entry; }
            entry.pos.copy(worldPos);
            entry.quat.copy(quat);
            entry.life = 6.0;
            entry.maxLife = 6.0;
        }

        function updateSkidMarks(dt) {
            let anyActive = false;
            for (let i = 0; i < SKID_MAX; i++) {
                const s = skidPool[i];
                if (!s || s.life === undefined || s.life <= 0) {
                    _skidMatrix.compose(_skidZero, _skidIdentQuat, _skidZeroScale);
                } else {
                    s.life -= dt;
                    anyActive = true;
                    const t = Math.max(0, s.life / s.maxLife);
                    _skidScaleV.set(1, 1, 0.4 + t * 0.6); // eases out rather than popping
                    _skidMatrix.compose(s.pos, s.quat, s.life > 0 ? _skidScaleV : _skidZeroScale);
                }
                skidMesh.setMatrixAt(i, _skidMatrix);
            }
            if (anyActive) skidMesh.instanceMatrix.needsUpdate = true;
        }

        // Tire smoke — a small additive particle pool, same pattern as the
        // exhaust particles but grey, slower, and only active while drifting.
        const SMOKE_COUNT = 90;
        const smokeGeom = new THREE.BufferGeometry();
        const smokePos = new Float32Array(SMOKE_COUNT * 3);
        const smokeLife = new Float32Array(SMOKE_COUNT).fill(-1);
        const smokeVel = [];
        for (let i = 0; i < SMOKE_COUNT; i++) smokeVel.push(new THREE.Vector3());
        smokeGeom.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
        const smokeMat = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.55,
            transparent: true,
            opacity: 0.28,
            sizeAttenuation: true,
            depthWrite: false,
        });
        const smokeSystem = new THREE.Points(smokeGeom, smokeMat);
        scene.add(smokeSystem);
        let smokeCursor = 0;

        function emitTireSmoke(worldPos) {
            for (let n = 0; n < 3; n++) {
                const i = smokeCursor % SMOKE_COUNT;
                smokeCursor++;
                smokeLife[i] = 0.5 + Math.random() * 0.5;
                smokePos[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.3;
                smokePos[i * 3 + 1] = worldPos.y + 0.1;
                smokePos[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * 0.3;
                smokeVel[i].set((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
            }
        }

        function updateTireSmoke(dt) {
            const arr = smokeGeom.attributes.position.array;
            for (let i = 0; i < SMOKE_COUNT; i++) {
                if (smokeLife[i] > 0) {
                    smokeLife[i] -= dt;
                    arr[i * 3] += smokeVel[i].x * dt;
                    arr[i * 3 + 1] += smokeVel[i].y * dt;
                    arr[i * 3 + 2] += smokeVel[i].z * dt;
                    smokeVel[i].multiplyScalar(0.94);
                } else {
                    arr[i * 3 + 1] = -1000;
                }
            }
            smokeGeom.attributes.position.needsUpdate = true;
        }

        const _driftRearL = new THREE.Vector3();
        const _driftRearR = new THREE.Vector3();
        const _driftQuat = new THREE.Quaternion();
        let driftMarkTimer = 0;

        // Called every physics tick with the current drift state; owns spawning
        // + per-frame decay for both skid marks and tire smoke.
        function updateDrift(dt, isDrifting, cosH, sinH) {
            if (isDrifting) {
                driftMarkTimer -= dt;
                if (driftMarkTimer <= 0) {
                    driftMarkTimer = 0.03; // spawn interval, keeps the ring buffer from burning through instantly
                    _driftQuat.setFromAxisAngle(_camYAxis, car.heading);
                    const rl = wheelPositions[2], rr = wheelPositions[3]; // rear-left, rear-right
                    _driftRearL.set(
                        car.position.x + rl[0] * cosH + rl[2] * sinH,
                        0, car.position.z - rl[0] * sinH + rl[2] * cosH);
                    _driftRearL.y = getGroundUnder(_driftRearL.x, _driftRearL.z) + 0.03;
                    _driftRearR.set(
                        car.position.x + rr[0] * cosH + rr[2] * sinH,
                        0, car.position.z - rr[0] * sinH + rr[2] * cosH);
                    _driftRearR.y = getGroundUnder(_driftRearR.x, _driftRearR.z) + 0.03;
                    spawnSkidMark(_driftRearL, _driftQuat);
                    spawnSkidMark(_driftRearR, _driftQuat);
                    emitTireSmoke(_driftRearL);
                    emitTireSmoke(_driftRearR);
                }
            }
            updateSkidMarks(dt);
            updateTireSmoke(dt);
        }

        // ---------------------------------------------------------
        // 10. Vehicle Physics System & Controls
        // ---------------------------------------------------------
        const car = {
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            heading: 0,
            maxSpeed: 48,           // Slightly higher top speed to compensate for slower acceleration
            accel: 14,              // Down from 26: gives the engine a sense of load
            brake: 40,              
            friction: 0.6,          // Down from 2.2: the car will now coast and carry momentum
            offRoadFriction: 5.0,   // Down from 8.0
            lateralFriction: 4.5,   // Down from 11.0: allows a slight, natural drift in hard corners
            steerSpeed: 1.6,        // Down from 3.4: simulates the physical weight of steering the column[cite: 2]
            boost: false,
            roadDistance: 0
        };

        const keys = {};
        window.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            keys[k] = true;
            if (e.key === 'Shift') car.boost = true;
            if (!e.repeat) {
                if (k === 'c') cycleCamera();
                if (k === 'q') cycleWeather(-1);
                if (k === 'e') cycleWeather(1);
                if (k === 'l') toggleHeadlights();
                if (k === 'r') resetCar();
            }
            unlockAudio();
        });
        window.addEventListener('keyup', e => {
            const k = e.key.toLowerCase();
            keys[k] = false;
            if (e.key === 'Shift') car.boost = false;
        });
        window.addEventListener('click', unlockAudio);
        window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });

        // Mobile Touch Controls
        const touchMappings = {
            'btn-left': 'a',
            'btn-right': 'd',
            'btn-gas': 'w',
            'btn-brake': 's',
            'btn-boost': 'shift'
        };

        for (const [id, key] of Object.entries(touchMappings)) {
            const btn = document.getElementById(id);
            if (!btn) continue;

            btn.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Stop screen from scrolling/zooming
                keys[key] = true;
                if (key === 'shift') car.boost = true;

                // Unlock/resume the AudioContext synchronously inside this gesture —
                // required for iOS Safari and most mobile browsers.
                unlockAudio();
            }, { passive: false });

            const clearTouch = (e) => {
                e.preventDefault();
                keys[key] = false;
                if (key === 'shift') car.boost = false;
            };

            btn.addEventListener('touchend', clearTouch);
            btn.addEventListener('touchcancel', clearTouch);
        }
        

        function updatePhysics(dt) {
            const throttle = (keys['w'] || keys['arrowup']) ? 1 : (keys['s'] || keys['arrowdown']) ? -1 : 0;
            let steerInput = 0;
            if (keys['a'] || keys['arrowleft']) steerInput += 1;
            if (keys['d'] || keys['arrowright']) steerInput -= 1;

            const maxSpd = car.boost ? car.maxSpeed * 1.5 : car.maxSpeed;
            const acc = car.boost ? car.accel * 1.8 : car.accel;

            const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
            const right = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));

            if (throttle !== 0) car.velocity.addScaledVector(forward, acc * throttle * dt);

            const speed = car.velocity.length();
            if (speed > 0.3) {
                car.heading += steerInput * car.steerSpeed * Math.min(1, speed / 14) * dt;
            }

            const vF = car.velocity.dot(forward);
            const vR = car.velocity.dot(right);

            let fVec = forward.clone().multiplyScalar(vF);
            let rVec = right.clone().multiplyScalar(vR);

            const onRoad = getRoadDistance(car.position.x, car.position.z) < ROAD_HALF + 1.5;
            const fric = onRoad ? car.friction : car.offRoadFriction;
            fVec.multiplyScalar(Math.max(0, 1 - fric * dt));
            rVec.multiplyScalar(Math.max(0, 1 - car.lateralFriction * dt));

            car.velocity.copy(fVec).add(rVec);
            if (car.velocity.length() > maxSpd) car.velocity.normalize().multiplyScalar(maxSpd);

            car.position.addScaledVector(car.velocity, dt);

            // ---- Four pinned tires + spring-damper body dynamics ----
            // 1) Pin each tire exactly onto the ground under it (slight embed),
            //    then integrate the chassis on the four springs in substeps.
            const cosH = Math.cos(car.heading),
                sinH = Math.sin(car.heading);
            const tireTargetY = [];
            const wposXZ = [];
            for (let i = 0; i < wheelPositions.length; i++) {
                const lp = wheelPositions[i];
                const wxp = car.position.x + lp[0] * cosH + lp[2] * sinH;
                const wzp = car.position.z - lp[0] * sinH + lp[2] * cosH;
                wposXZ.push([lp[0], lp[2]]);
                // Tire centre sits embedded into the surface -> visible squish
                tireTargetY.push(getGroundUnder(wxp, wzp) + WHEEL_R - TIRE_EMBED);
            }

            // Dynamic weight-transfer biases (superposed on spring dynamics):
            
            const dhDt = (car.heading - (car.prevH !== undefined ? car.prevH : car.heading)) / Math.max(dt, 1e-4);
            car.prevH = car.heading;

            // Calculate pitch bias purely from driver input to prevent gravity-induced nose dives
            const driverAccel = throttle > 0 ? acc : throttle < 0 ? -car.brake : 0;
            const tqPitchBias = -CAR_MASS * driverAccel * 0.3;   
            const tqRollBias = -CAR_MASS * (speed * dhDt) * 0.5; // turn -> lean out

            const SUB_DT = 0.008;
            let remaining = dt;
            while (remaining > 1e-5) {
                const h = Math.min(SUB_DT, remaining);
                remaining -= h;
                let sumF = 0, sumTQ_P = tqPitchBias, sumTQ_R = tqRollBias;
                for (let i = 0; i < wheelPositions.length; i++) {
                    const lx = wposXZ[i][0], lz = wposXZ[i][1];
                    // Current mount-point world height for this corner
                    const mountY = suspY + suspPhi * lx - suspTheta * lz;
                    // Suspension drop u = tyre centre below mount (compression < rest)
                    let u = tireTargetY[i] - mountY;
                    const uRaw = u;

                    // u INCREASES when the suspension compresses.
                    if (u < SUSP_LN - SUSP_EXT_MAX) u = SUSP_LN - SUSP_EXT_MAX;   // full droop
                    if (u > SUSP_LN + SUSP_COMP_MAX) u = SUSP_LN + SUSP_COMP_MAX; // metal-on-metal stop
                    suspOffsets[i] = u;
                    // Mount vertical velocity (thousands of tiny moves add up here)
                    const mvY = suspVy + suspWPhi * lx - suspWTheta * lz;
                    // Force pushes UP (positive) when compressed (u > SUSP_LN)
                    let F = SPRING_K * (u - SUSP_LN) - SUSP_C * mvY;
                    if (uRaw > SUSP_LN + SUSP_COMP_MAX) {
                    F += BUMP_K * (uRaw - (SUSP_LN + SUSP_COMP_MAX));
                    }
                    sumF += F;
                    sumTQ_P += -F * lz;  // pitch torque about x
                    sumTQ_R += F * lx;   // roll torque about z
                }
                suspVy += (sumF / CAR_MASS - SUSP_GRAV) * h;
                suspWTheta += (sumTQ_P / I_PITCH) * h;
                suspWPhi += (sumTQ_R / I_ROLL) * h;
                suspY += suspVy * h;
                suspTheta += suspWTheta * h;
                suspPhi += suspWPhi * h;
                // Safety bounds (game never leaves the ground for long)
                suspTheta = THREE.MathUtils.clamp(suspTheta, -0.45, 0.45);
                suspPhi = THREE.MathUtils.clamp(suspPhi, -0.4, 0.4);
            }

            // 2) Body follows the integrated suspension state
            car.position.y = suspY;
            carGroup.position.copy(car.position);
            carGroup.rotation.y = car.heading;
            carGroup.rotation.x = suspTheta;
            carGroup.rotation.z = suspPhi;

            // 3) Wheels stay glued to their pinned targets regardless of pose
            for (let i = 0; i < suspensions.length; i++) {
                suspensions[i].position.y = suspOffsets[i];
            }

            // Smoothed steering animation (front wheels pivot on their mounts)
            steerVisual += (steerInput * 0.45 - steerVisual) * Math.min(1, 9 * dt);
            wheelMounts[0].rotation.y = steerVisual;
            wheelMounts[1].rotation.y = steerVisual;
            for (let i = 0; i < wheels.length; i++) {
                wheels[i].rotation.x += speed * dt * 3.8;
                rims[i].rotation.x = wheels[i].rotation.x;
            }

            // Brake lights
            const braking = keys['s'] || keys['arrowdown'];
            brakeL.intensity = braking ? 2.2 : 0.08;
            brakeR.intensity = braking ? 2.2 : 0.08;
            tailLightBar.material.color.setHex(braking ? 0xff0044 : 0x22000a);

            car.roadDistance += vF * dt;
            if (car.roadDistance < 0) car.roadDistance = 0;

            // Audio
            const ratio = speed / car.maxSpeed;
            updateEngineSound(ratio, throttle > 0 ? 1 : 0);
            updateWindSound(ratio);
            updateMusic(ratio);
            updateParticles(dt, car.position, vF, car.heading, car.boost);
            updateRain(dt, car.position, speed);

            // ---- Drift detection + skid marks + tire smoke ----
            // vR (lateral velocity component, computed above before friction was
            // applied) is the slip signal: high lateral speed relative to the
            // car's own heading means the tires are sliding, not rolling.
            const isDrifting = onRoad && Math.abs(vR) > DRIFT_LAT_THRESHOLD && speed > 4.5;
            updateDrift(dt, isDrifting, cosH, sinH);

            // ---- Traffic AI ----
            updateTraffic(dt, car);

            // HUD
            document.getElementById('speed-display').textContent = Math.round(speed * 3.6);
            document.getElementById('coord-display').textContent = `${Math.round(car.position.x)}, ${Math.round(car.position.z)}`;
        }

        // ---------------------------------------------------------
        // 10.5 Traffic AI System
        // ---------------------------------------------------------
        // Each traffic car tracks a floating road-point index `sIdx` (advanced
        // every frame by speed/SEGMENT_DIST) plus a fixed lane offset. Position
        // and orientation are re-derived from the road centerline + tangent +
        // binormal each frame, so cars automatically follow every curve, hill
        // and bank exactly like the player does — that IS the lane-following.
        const TRAFFIC_MAX = 7;
        const TRAFFIC_LANE_OFFSET = ROAD_HALF * 0.5; // sit in the middle of a lane, not on the centerline
        const trafficCars = [];

        const trafficBodyMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.4, roughness: 0.5 });
        const trafficBodyGeom = new THREE.BoxGeometry(1.9, 0.65, 4.2);
        const trafficCabinGeom = new THREE.BoxGeometry(1.5, 0.55, 2.0);
        const trafficLightMatFront = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const trafficLightMatRear = new THREE.MeshBasicMaterial({ color: 0xff2222 });
        const trafficLightGeom = new THREE.BoxGeometry(0.5, 0.12, 0.06);
        SHARED_GEOMETRIES.add(trafficBodyGeom);
        SHARED_GEOMETRIES.add(trafficCabinGeom);
        SHARED_GEOMETRIES.add(trafficLightGeom);
        SHARED_MATERIALS.add(trafficBodyMat);
        SHARED_MATERIALS.add(trafficLightMatFront);
        SHARED_MATERIALS.add(trafficLightMatRear);
        const TRAFFIC_HUES = [0x2255dd, 0xdddddd, 0xdd3333, 0xdddd33, 0x33dd88, 0x9955dd];

        function buildTrafficMesh() {
            const g = new THREE.Group();
            const bodyMatI = trafficBodyMat.clone();
            bodyMatI.color.setHex(TRAFFIC_HUES[Math.floor(Math.random() * TRAFFIC_HUES.length)]);
            const body = new THREE.Mesh(trafficBodyGeom, bodyMatI);
            body.position.y = 0.5;
            body.castShadow = true;
            body.receiveShadow = true;
            g.add(body);
            const cabin = new THREE.Mesh(trafficCabinGeom, bodyMatI);
            cabin.position.set(0, 0.95, -0.1);
            g.add(cabin);
            const hlL = new THREE.Mesh(trafficLightGeom, trafficLightMatFront);
            hlL.position.set(-0.6, 0.5, 2.1);
            g.add(hlL);
            const hlR = new THREE.Mesh(trafficLightGeom, trafficLightMatFront);
            hlR.position.set(0.6, 0.5, 2.1);
            g.add(hlR);
            const tlL = new THREE.Mesh(trafficLightGeom, trafficLightMatRear);
            tlL.position.set(-0.6, 0.5, -2.1);
            g.add(tlL);
            const tlR = new THREE.Mesh(trafficLightGeom, trafficLightMatRear);
            tlR.position.set(0.6, 0.5, -2.1);
            g.add(tlR);
            // A single soft headlight glow — kept to one light per car for perf
            const glow = new THREE.PointLight(0xffffff, 0.6, 14);
            glow.position.set(0, 0.5, 2.3);
            g.add(glow);
            // NOTE: body/cabin materials are per-instance clones (unique colour),
            // so they are intentionally NOT added to SHARED_MATERIALS — they get
            // disposed explicitly in despawnTrafficCar().
            return { group: g, bodyMatI };
        }

        function spawnTrafficCar(nearIdx) {
            const { group, bodyMatI } = buildTrafficMesh();
            const dir = Math.random() < 0.5 ? 1 : -1;          // 1 = same direction as player, -1 = oncoming
            const lane = (Math.random() < 0.5 ? -1 : 1) * TRAFFIC_LANE_OFFSET * (dir === -1 ? -1 : 1);
            const speed = 10 + Math.random() * 14;
            const ahead = 40 + Math.random() * (ROAD_VIS_RADIUS * SEGMENT_DIST - 60);
            const sIdx = Math.max(1, nearIdx + ahead / SEGMENT_DIST);
            scene.add(group);
            trafficCars.push({ group, bodyMatI, sIdx, lane, speed, dir, hitCooldown: 0 });
        }

        function despawnTrafficCar(car2) {
            scene.remove(car2.group);
            car2.group.traverse((obj) => {
                if (obj.isMesh && obj.geometry && !SHARED_GEOMETRIES.has(obj.geometry)) obj.geometry.dispose();
            });
            if (car2.bodyMatI) car2.bodyMatI.dispose();
        }

        const _trafP = new THREE.Vector3();
        const _trafT = new THREE.Vector3();

        function updateTraffic(dt, player) {
            const playerIdx = getNearestRoadIndex(player.position.x, player.position.z);

            // Spawn up to TRAFFIC_MAX cars, always ahead of the player's window
            if (trafficCars.length < TRAFFIC_MAX && roadPoints.length > playerIdx + 80) {
                spawnTrafficCar(playerIdx);
            }

            for (let n = trafficCars.length - 1; n >= 0; n--) {
                const t = trafficCars[n];
                t.sIdx += (t.speed * t.dir * dt) / SEGMENT_DIST;

                // Recycle once it falls far behind the player OR runs off the end
                // of the currently-generated road window.
                if (t.sIdx < playerIdx - 40 || t.sIdx >= roadPoints.length - 2 || t.sIdx < 1) {
                    despawnTrafficCar(t);
                    trafficCars.splice(n, 1);
                    continue;
                }

                const i0 = Math.floor(t.sIdx);
                const frac = t.sIdx - i0;
                const a = roadPoints[i0],
                    b = roadPoints[Math.min(roadPoints.length - 1, i0 + 1)];
                const bin = roadBinormals[i0];
                _trafP.set(
                    THREE.MathUtils.lerp(a.x, b.x, frac) + bin.x * t.lane,
                    THREE.MathUtils.lerp(a.y, b.y, frac) + bin.y * t.lane + ROAD_LIFT + 0.36,
                    THREE.MathUtils.lerp(a.z, b.z, frac) + bin.z * t.lane
                );
                _trafT.copy(roadTangents[i0]);
                t.group.position.copy(_trafP);
                const facing = t.dir > 0 ? Math.atan2(_trafT.x, _trafT.z) : Math.atan2(-_trafT.x, -_trafT.z);
                t.group.rotation.y = facing;

                // ---- Collision detection vs. the player car ----
                if (t.hitCooldown > 0) t.hitCooldown -= dt;
                const dx = player.position.x - _trafP.x,
                    dz = player.position.z - _trafP.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < 6.5 && t.hitCooldown <= 0) {
                    t.hitCooldown = 1.2;
                    // Simple impulse response: kill most of the player's speed and
                    // shove them away from the point of impact.
                    player.velocity.multiplyScalar(0.35);
                    const pushLen = Math.max(0.001, Math.sqrt(distSq));
                    player.position.x += (dx / pushLen) * 1.2;
                    player.position.z += (dz / pushLen) * 1.2;
                }
            }
        }

        // ---------------------------------------------------------
        // 11. Camera System — Fixed initial offset
        // ---------------------------------------------------------
        const cameraModes = [
            { name: 'Chase', offset: new THREE.Vector3(0, 4.2, -11), look: new THREE.Vector3(0, 1.4, 6), fov: 60 },
            { name: 'Cockpit', offset: new THREE.Vector3(0, 1.3, 0.2), look: new THREE.Vector3(0, 0.8, 16), fov: 76 },
            { name: 'Action', offset: new THREE.Vector3(8.5, 3.6, -7), look: new THREE.Vector3(0, 1.2, 0), fov: 56 }
        ];
        let camIdx = 0;
        let camTargetPos = new THREE.Vector3();
        let camTargetLook = new THREE.Vector3();
        let camInitialized = false;

        function cycleCamera() {
            camIdx = (camIdx + 1) % cameraModes.length;
            document.getElementById('cam-display').textContent = cameraModes[camIdx].name;
            // Snap camera on switch
            const mode = cameraModes[camIdx];
            const sf = getModeFrame(mode);
            camTargetPos.copy(car.position).add(sf.off);
            camTargetLook.copy(car.position).add(sf.look);
            camera.position.copy(camTargetPos);
            camera.lookAt(camTargetLook);
            camera.fov = mode.fov;
            camera.updateProjectionMatrix();
        }

        const _camYAxis = new THREE.Vector3(0, 1, 0);

        // Rotates a camera mode's offset & look-ahead into the car's heading frame,
        // so every camera genuinely follows where the car points — not world axes.
        function getModeFrame(mode) {
            const off = mode.offset.clone();
            const look = mode.look.clone();
            off.applyAxisAngle(_camYAxis, car.heading);
            look.applyAxisAngle(_camYAxis, car.heading);
            return { off, look };
        }

        const CAM_GROUND_CLEARANCE = 1.35; // minimum height above terrain the lens is allowed to reach

        // Clamps a camera-position vector so it can never dip inside a hilltop or
        // low terrain feature — samples the SAME height field the terrain mesh
        // itself is built from, so "above terrain" here means what it looks like.
        function clampCameraAboveTerrain(pos) {
            const groundY = sampleTerrainMeshHeight(pos.x, pos.z);
            const minY = groundY + CAM_GROUND_CLEARANCE;
            if (pos.y < minY) pos.y = minY;
            return pos;
        }

        function updateCamera(dt) {
            const mode = cameraModes[camIdx];
            const frame = getModeFrame(mode);

            // Velocity look-ahead keeps the car framed while braking/cornering
            const lead = car.velocity.clone().multiplyScalar(0.25);
            if (lead.length() > 6) lead.setLength(6);
            const desiredPos = car.position.clone().add(frame.off);
            const desiredLook = car.position.clone().add(frame.look).add(lead);
            clampCameraAboveTerrain(desiredPos);

            if (!camInitialized) {
                camTargetPos.copy(desiredPos);
                camTargetLook.copy(desiredLook);
                camera.position.copy(desiredPos);
                camera.lookAt(desiredLook);
                camera.fov = mode.fov;
                camera.updateProjectionMatrix();
                camInitialized = true;
                return;
            }

            // Frame-rate independent exponential smoothing — the camera can no
            // longer fall behind at high speed, and steering swings are damped.
            const k = camIdx === 1 ? 22 : 10;
            const alpha = 1 - Math.exp(-k * dt);
            camTargetPos.lerp(desiredPos, alpha);
            camTargetLook.lerp(desiredLook, Math.min(1, alpha * 1.6));

            // Hard safety clamp AFTER smoothing too — during fast downhill dips the
            // lerp target can still momentarily track a position that would clip
            // into a rise the smoothing hasn't caught up to yet.
            clampCameraAboveTerrain(camTargetPos);

            camera.position.copy(camTargetPos);
            camera.lookAt(camTargetLook);

            let targetFov = mode.fov + (car.boost ? 14 : 0);
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 5 * dt);
            camera.updateProjectionMatrix();
        }

        // ---------------------------------------------------------
        // 11.5 Dynamic Canvas Minimap / Radar
        // ---------------------------------------------------------
        const minimapCanvas = document.getElementById('minimap');
        const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
        const biomeLabelEl = document.getElementById('biome-display');
        const MINIMAP_RANGE = 130;      // world units of road shown ahead of the player
        const MINIMAP_SAMPLE_STEP = 4;  // road-point stride when sampling the path ahead

        // Renders upcoming curves (rotated so "forward" is always screen-up),
        // colored by elevation change (terrain gradient), plus traffic blips and
        // a centered player marker — a lightweight 2D radar, redrawn every frame.
        function drawMinimap(carIdx, roadDist) {
            if (!minimapCtx) return;
            const ctx = minimapCtx;
            const W = minimapCanvas.width,
                H = minimapCanvas.height;
            const cx = W / 2,
                cy = H * 0.72; // player sits low in the frame so more road ahead is visible
            const scale = (H * 0.62) / MINIMAP_RANGE;

            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(5,8,18,0.55)';
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
            ctx.fill();

            const cosH = Math.cos(-car.heading),
                sinH = Math.sin(-car.heading);
            const project = (wx, wz) => {
                const dx = wx - car.position.x,
                    dz = wz - car.position.z;
                const rx = dx * cosH - dz * sinH;
                const rz = dx * sinH + dz * cosH;
                return { x: cx + rx * scale, y: cy - rz * scale };
            };

            // Upcoming road, colored by grade (orange = climb, blue = descent)
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            let prevPr = null,
                prevY = null;
            for (let i = 0; i < 40; i++) {
                const idx = Math.min(roadPoints.length - 1, carIdx + i * MINIMAP_SAMPLE_STEP);
                const p = roadPoints[idx];
                const pr = project(p.x, p.z);
                if (prevPr) {
                    const grade = p.y - prevY;
                    ctx.strokeStyle = grade > 0.4 ? 'rgba(255,170,60,0.9)' :
                        grade < -0.4 ? 'rgba(120,180,255,0.9)' : 'rgba(0,242,254,0.85)';
                    ctx.beginPath();
                    ctx.moveTo(prevPr.x, prevPr.y);
                    ctx.lineTo(pr.x, pr.y);
                    ctx.stroke();
                }
                prevPr = pr;
                prevY = p.y;
            }

            // Traffic blips
            for (const t of trafficCars) {
                const pr = project(t.group.position.x, t.group.position.z);
                if (pr.x < 4 || pr.x > W - 4 || pr.y < 4 || pr.y > H - 4) continue;
                ctx.fillStyle = t.dir === 1 ? 'rgba(255,220,80,0.9)' : 'rgba(255,60,60,0.9)';
                ctx.beginPath();
                ctx.arc(pr.x, pr.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Player marker — fixed at center, always pointing "up"
            ctx.save();
            ctx.translate(cx, cy);
            ctx.fillStyle = '#00f2fe';
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(5, 6);
            ctx.lineTo(-5, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(0,242,254,0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();

            if (biomeLabelEl) {
                const bb = getBiomeBlend(roadDist);
                biomeLabelEl.textContent = bb.name;
            }
        }

        // ---------------------------------------------------------
        // 12. Dynamic Weather & Lighting Presets
        // ---------------------------------------------------------
        const weatherPresets = [{
            name: 'Sunset',
            bg: 0x120720,
            fog: 0x120720,
            fogD: 0.0022,
            sun: 0xff7744,
            sunI: 1.5,
            amb: 0.26,
            hemiI: 0.3,
            hemi: 0xff77a9,
            stars: 0.85
        }, {
            name: 'Cyber Neon',
            bg: 0x02030a,
            fog: 0x02030a,
            fogD: 0.0030,
            sun: 0x00f2fe,
            sunI: 0.65,
            amb: 0.14,
            hemiI: 0.2,
            hemi: 0x00f2fe,
            stars: 1.0
        }, {
            name: 'Daylight',
            bg: 0x6ab0f0,
            fog: 0x6ab0f0,
            fogD: 0.0010,
            sun: 0xffeedd,
            sunI: 2.0,
            amb: 0.55,
            hemiI: 0.5,
            hemi: 0x88bbff,
            stars: 0.12
        }, {
            name: 'Neon Rain',
            bg: 0x05060d,
            fog: 0x05060d,
            fogD: 0.0044,
            sun: 0x6688ff,
            sunI: 0.55,
            amb: 0.20,
            hemiI: 0.24,
            hemi: 0x3355aa,
            stars: 0.05,
            wet: true,
            rain: true,
        }];
        let weatherIdx = 0;
        let headlightsOn = true;
        let isWet = false;
        let isRaining = false;

        function cycleWeather(dir) {
            weatherIdx = (weatherIdx + dir + weatherPresets.length) % weatherPresets.length;
            applyWeather(weatherPresets[weatherIdx]);
            document.getElementById('weather-display').textContent = weatherPresets[weatherIdx].name;
        }

        function applyWeather(p) {
            scene.background.setHex(p.bg);
            scene.fog.color.setHex(p.fog);
            scene.fog.density = p.fogD;
            sunLight.color.setHex(p.sun);
            sunLight.intensity = p.sunI;
            ambientLight.intensity = p.amb;
            hemiLight.intensity = p.hemiI !== undefined ? p.hemiI : 0.5;
            hemiLight.color.setHex(p.hemi);
            if (typeof starMat !== 'undefined') starMat.opacity = p.stars !== undefined ? p.stars : 0.9;
            if (sunMesh) {
                sunMesh.material.color.setHex(p.sun);
            }

            // ---- Wet-asphalt reflections & rain ----
            isWet = !!p.wet;
            isRaining = !!p.rain;
            if (isWet) {
                sharedRoadMat.roughness = 0.32;   // glossy, wet sheen
                sharedRoadMat.metalness = 0.22;   // subtle specular reflectivity
                sharedRoadMat.envMapIntensity = 1.4;
                edgeStripMatL.opacity = 0.55;     // wet edge strips bloom harder
                bloomPass.strength = 0.62;
                bloomPass.radius = 0.55;
            } else {
                sharedRoadMat.roughness = 0.85;
                sharedRoadMat.metalness = 0.05;
                sharedRoadMat.envMapIntensity = 1.0;
                edgeStripMatL.opacity = 0.35;
                bloomPass.strength = 0.45;
                bloomPass.radius = 0.4;
            }
            if (rainMesh) rainMesh.visible = isRaining;
        }

        // ---- Biome atmosphere: layers on top of the weather preset every frame ----
        // Weather (Q/E) sets the overall time-of-day mood; biome nudges fog color
        // toward the current stretch's palette so the world visibly drifts through
        // desert / cyberpunk / forest zones without fighting the player's choice.
        const _biomeFogTarget = new THREE.Color();
        function updateBiomeAtmosphere(roadDist) {
            const bb = getBiomeBlend(roadDist);
            _biomeFogTarget.copy(bb.a.fog).lerp(bb.b.fog, bb.t);
            scene.fog.color.lerp(_biomeFogTarget, 0.02);
        }

        function toggleHeadlights() {
            headlightsOn = !headlightsOn;
            spotL.intensity = headlightsOn ? HEADLIGHT_INTENSITY : 0;
            spotR.intensity = headlightsOn ? HEADLIGHT_INTENSITY : 0;
        }

        function resetCar() {
            const idx = getNearestRoadIndex(car.position.x, car.position.z);
            const rp = roadPoints[idx];
            const t = roadTangents[idx];
            car.position.copy(rp);
            car.velocity.set(0, 0, 0);
            car.heading = Math.atan2(t.x, t.z);
            car.prevVF = 0;           // Clear historical velocity
            car.prevH = car.heading;  // Clear historical heading
            car.roadDistance = idx * SEGMENT_DIST;
            initSuspension();
            // Reset camera
            camInitialized = false;
            const mode = cameraModes[camIdx];
            const rf = getModeFrame(mode);
            camTargetPos.copy(car.position).add(rf.off);
            camTargetLook.copy(car.position).add(rf.look);
            camera.position.copy(camTargetPos);
            camera.lookAt(camTargetLook);
            camera.fov = mode.fov;
            camera.updateProjectionMatrix();
            camInitialized = true;
        }

        // ---------------------------------------------------------
        // 13. Main Render Loop
        // ---------------------------------------------------------
        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);
            const dt = Math.min(clock.getDelta(), 0.1);

            updatePhysics(dt);
            updateChunks(car.position.x, car.position.z);

            // Road window follows the car's projected position on the centerline
            // (not the accumulated odometer), keeping it in sync off-road/reversing.
            const carIdx = Math.max(0, getNearestRoadIndex(car.position.x, car.position.z));
            updateRoadMesh(carIdx);

            const roadDist = roadArcLen[carIdx] !== undefined ? roadArcLen[carIdx] : carIdx * SEGMENT_DIST;
            updateBiomeAtmosphere(roadDist);
            drawMinimap(carIdx, roadDist);

            // Keep the shadow-casting light centered on the car so shadows persist
            sunLight.position.set(car.position.x + 170, car.position.y + 190, car.position.z + 170);
            sunLight.target.position.copy(car.position);
            sunLight.target.updateMatrixWorld();

            // Keep the star dome centered on the car so it is always overhead
            starField.position.set(car.position.x, 0, car.position.z);

            updateCamera(dt);
            composer.render();
        }

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            composer.setSize(window.innerWidth, window.innerHeight);
        });

        // Init
        applyWeather(weatherPresets[0]);
        resetCar();
        // Force camera init
        camInitialized = false;
        const mode = cameraModes[0];
        const imf = getModeFrame(mode);
        camTargetPos.copy(car.position).add(imf.off);
        camTargetLook.copy(car.position).add(imf.look);
        camera.position.copy(camTargetPos);
        camera.lookAt(camTargetLook);
        camera.fov = mode.fov;
        camera.updateProjectionMatrix();
        camInitialized = true;

        animate();

        setTimeout(() => {
            const el = document.getElementById('loading');
            if (el) { el.style.opacity = '0';
                setTimeout(() => el.style.display = 'none', 800); }
        }, 800);