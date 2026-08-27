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

        // True perpendicular distance + interpolated elevation of the road corridor
        function getRoadCorridor(x, z) {
            const baseIdx = getNearestRoadIndex(x, z);
            let bestD2 = Infinity, bestY = 0, found = false;
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
                    found = true;
                }
            }
            if (!found) return null;
            return { dist: Math.sqrt(bestD2), height: bestY };
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

        function getChunkKey(cx, cz) { return `${cx},${cz}`; }

        function createChunk(cx, cz) {
            const key = getChunkKey(cx, cz);
            if (chunks.has(key)) return chunks.get(key);

            const group = new THREE.Group();
            const offX = cx * CHUNK_SIZE;
            const offZ = cz * CHUNK_SIZE;
            group.position.set(offX, 0, offZ);

            // Terrain Mesh with Vertex Colors & Normal Shading
            const geom = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
            geom.rotateX(-Math.PI / 2);
            const pos = geom.attributes.position;
            const colors = [];

            for (let i = 0; i < pos.count; i++) {
                const wx = pos.getX(i) + offX;
                const wz = pos.getZ(i) + offZ;
                const h = getBlendedGroundHeight(wx, wz);
                pos.setY(i, h);

                // Richer gradient
                if (h < -1) { colors.push(0.08, 0.18, 0.30); } else if (h < 2) { colors.push(0.10, 0.28, 0.18); } else if (h < 8) {
                    colors.push(0.16, 0.42, 0.20);
                } else if (h < 16) { colors.push(0.22, 0.38, 0.22); } else if (h < 24) { colors.push(0.32, 0.30, 0.25); } else if (h <
                    32) { colors.push(0.50, 0.45, 0.38); } else { colors.push(0.78, 0.82, 0.90); }
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

        // Builds a ribbon over roadPoints[idx0 .. idx0+segCount].
        // [latA, latB] = signed lateral offsets from the centerline (along binormal).
        function buildRibbonGeometry(idx0, segCount, latA, latB, lift) {
            const sections = segCount + 1;
            const pos = new Float32Array(sections * 6);
            const nor = new Float32Array(sections * 6);
            const uva = new Float32Array(sections * 4);
            let vDist = 0;
            for (let c = 0; c < sections; c++) {
                const i = idx0 + c;
                if (c > 0) vDist += roadPoints[i].distanceTo(roadPoints[i - 1]);
                _rvPrev.copy(roadPoints[Math.max(0, i - 1)]);
                _rvNext.copy(roadPoints[Math.min(roadPoints.length - 1, i + 1)]);
                _rvT.subVectors(_rvNext, _rvPrev).normalize();
                _rvB.crossVectors(_rvT, _rvUp).normalize();
                _rvN.crossVectors(_rvB, _rvT).normalize();

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
                const v = vDist / SEGMENT_DIST; // one texture period per segment length
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
            }

            // Cleanup chunks fully outside the visible window (with margin)
            for (const key of Array.from(roadChunkMeshes.keys())) {
                if ((key + 1) * ROAD_CHUNK_SEGS < start - ROAD_CHUNK_SEGS ||
                    key * ROAD_CHUNK_SEGS > end + ROAD_CHUNK_SEGS) {
                    removeChunk(roadChunkMeshes, key);
                    removeChunk(edgeChunkMeshesL, key);
                    removeChunk(edgeChunkMeshesR, key);
                }
            }
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
            initAudio();
            createEngineSound();
            createWindSound();
        });
        window.addEventListener('keyup', e => {
            const k = e.key.toLowerCase();
            keys[k] = false;
            if (e.key === 'Shift') car.boost = false;
        });
        window.addEventListener('click', initAudio);

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
                
                // Initialize audio context on first touch
                initAudio();
                createEngineSound();
                createWindSound();
            });

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
            updateParticles(dt, car.position, vF, car.heading, car.boost);

            // HUD
            document.getElementById('speed-display').textContent = Math.round(speed * 3.6);
            document.getElementById('coord-display').textContent = `${Math.round(car.position.x)}, ${Math.round(car.position.z)}`;
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

        function updateCamera(dt) {
            const mode = cameraModes[camIdx];
            const frame = getModeFrame(mode);

            // Velocity look-ahead keeps the car framed while braking/cornering
            const lead = car.velocity.clone().multiplyScalar(0.25);
            if (lead.length() > 6) lead.setLength(6);
            const desiredPos = car.position.clone().add(frame.off);
            const desiredLook = car.position.clone().add(frame.look).add(lead);

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

            camera.position.copy(camTargetPos);
            camera.lookAt(camTargetLook);

            let targetFov = mode.fov + (car.boost ? 14 : 0);
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 5 * dt);
            camera.updateProjectionMatrix();
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
        }];
        let weatherIdx = 0;
        let headlightsOn = true;

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