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
        renderer.toneMappingExposure = 1.0;
        container.appendChild(renderer.domElement);

        // Post-Processing Composer
        const composer = new THREE.EffectComposer(renderer);
        const renderPass = new THREE.RenderPass(scene, camera);
        composer.addPass(renderPass);

        // Unreal Bloom Glow Pass — tuned for neon
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.75, // Strength
            0.35, // Radius
            0.6 // Threshold
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

        // Fill light from below for cyber glow
        const fillLight = new THREE.DirectionalLight(0x00f2fe, 0.3);
        fillLight.position.set(-100, -50, -100);
        scene.add(fillLight);

        const hemiLight = new THREE.HemisphereLight(0xff77a9, 0x111428, 0.5);
        scene.add(hemiLight);

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

        function generateRoadPoints(startIdx, count) {
            for (let i = 0; i < count; i++) {
                const idx = startIdx + i;
                if (idx === 0) {
                    const y = getTerrainHeight(0, 0);
                    roadPoints[0] = new THREE.Vector3(0, y, 0);
                    roadTangents[0] = new THREE.Vector3(0, 0, 1);
                    roadNormals[0] = new THREE.Vector3(0, 1, 0);
                    roadBinormals[0] = new THREE.Vector3(1, 0, 0);
                    addToRoadGrid(0);
                    continue;
                }
                const t = idx * 0.0016;
                const angle = fbm(t * 10, 0, 0) * Math.PI * 2.8 + fbm(t * 3, 120, 0) * 2.2;
                const prev = roadPoints[idx - 1];
                const x = prev.x + Math.sin(angle) * SEGMENT_DIST;
                const z = prev.z + Math.cos(angle) * SEGMENT_DIST;
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

        // ---------------------------------------------------------
        // 6. Terrain & Detailed Asset Instancing
        // ---------------------------------------------------------
        const chunks = new Map();

        // High-Detail Low-Poly Tree (Pine Model)
        const pine1 = new THREE.ConeGeometry(2.8, 5.5, 6);
        pine1.translate(0, 4.2, 0);
        const pine2 = new THREE.ConeGeometry(2.2, 4.5, 6);
        pine2.translate(0, 6.6, 0);
        const pine3 = new THREE.ConeGeometry(1.6, 3.5, 6);
        pine3.translate(0, 8.6, 0);
        // Merge cones into one geometry for instancing
        const treeGeom = new THREE.BufferGeometry();
        const tempPositions = [];
        const tempNormals = [];
        const geoms = [pine1, pine2, pine3];
        for (const g of geoms) {
            const pos = g.attributes.position;
            const norm = g.attributes.normal;
            for (let i = 0; i < pos.count; i++) {
                tempPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
                tempNormals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
            }
        }
        treeGeom.setAttribute('position', new THREE.Float32BufferAttribute(tempPositions, 3));
        treeGeom.setAttribute('normal', new THREE.Float32BufferAttribute(tempNormals, 3));
        treeGeom.computeVertexNormals();

        const treeMat = new THREE.MeshStandardMaterial({
            color: 0x1a4a2e,
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
                const h = getTerrainHeight(wx, wz);
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
                if (getDistanceToRoad(tx, tz) < 22) continue;
                const th = getTerrainHeight(tx, tz);
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
                if (getDistanceToRoad(rx, rz) < 16) continue;
                const rh = getTerrainHeight(rx, rz);
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
                if (getDistanceToRoad(gx2, gz2) < 18) continue;
                const gh2 = getTerrainHeight(gx2, gz2);
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
                it.castShadow = true;
                it.receiveShadow = true;
                group.add(it);
            }

            if (rockMatrices.length) {
                const ir = new THREE.InstancedMesh(rockGeom, rockMat, rockMatrices.length);
                for (let i = 0; i < rockMatrices.length; i++) ir.setMatrixAt(i, rockMatrices[i]);
                ir.instanceMatrix.needsUpdate = true;
                ir.castShadow = true;
                ir.receiveShadow = true;
                group.add(ir);
            }

            if (grassMatrices.length) {
                const ig = new THREE.InstancedMesh(grassGeom, grassMat, grassMatrices.length);
                for (let i = 0; i < grassMatrices.length; i++) ig.setMatrixAt(i, grassMatrices[i]);
                ig.instanceMatrix.needsUpdate = true;
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

        const sharedRoadGeom = new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_DIST, 6, 2);
        // Adjust UVs so texture maps nicely
        const uvs = sharedRoadGeom.attributes.uv;
        for (let i = 0; i < uvs.count; i++) {
            // u: 0..1 across width, v: 0..1 along length
            // We want the texture to stretch across the full road width and repeat every segment
        }

        const roadMeshes = new Map();
        const roadMeshPool = [];
        const ROAD_VIS_RADIUS = 130;

        // Edge strip geometry
        const edgeStripGeom = new THREE.PlaneGeometry(0.4, SEGMENT_DIST, 1, 2);
        const edgeStripMatL = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
        const edgeStripMatR = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });

        function getRoadMesh() {
            if (roadMeshPool.length) {
                const m = roadMeshPool.pop();
                m.visible = true;
                return m;
            }
            const m = new THREE.Mesh(sharedRoadGeom, sharedRoadMat);
            m.receiveShadow = true;
            m.castShadow = false;
            return m;
        }

        function positionRoadMesh(mesh, idx) {
            const p1 = roadPoints[idx];
            const p2 = roadPoints[idx + 1];
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const tangent = roadTangents[idx];
            const binormal = roadBinormals[idx];
            const normal = roadNormals[idx];

            mesh.position.copy(mid).addScaledVector(normal, 0.12);
            const m = new THREE.Matrix4();
            m.makeBasis(binormal, tangent, normal);
            mesh.setRotationFromMatrix(m);
        }

        // Edge strip cache
        const edgeMeshesL = new Map();
        const edgeMeshesR = new Map();
        const edgePoolL = [];
        const edgePoolR = [];

        function getEdgeMesh(side) {
            const pool = side === 'L' ? edgePoolL : edgePoolR;
            if (pool.length) {
                const m = pool.pop();
                m.visible = true;
                return m;
            }
            const mat = side === 'L' ? edgeStripMatL : edgeStripMatR;
            const m = new THREE.Mesh(edgeStripGeom, mat);
            m.renderOrder = 1;
            return m;
        }

        function positionEdgeMesh(mesh, idx, offset) {
            const p1 = roadPoints[idx];
            const p2 = roadPoints[idx + 1];
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const tangent = roadTangents[idx];
            const binormal = roadBinormals[idx];
            const normal = roadNormals[idx];

            // offset along binormal (sideways)
            const pos = mid.clone().addScaledVector(binormal, offset).addScaledVector(normal, 0.12);
            mesh.position.copy(pos);
            const m = new THREE.Matrix4();
            m.makeBasis(binormal, tangent, normal);
            mesh.setRotationFromMatrix(m);
        }

        function updateRoadMesh(carIdx) {
            const start = Math.max(0, carIdx - ROAD_VIS_RADIUS);
            const end = carIdx + ROAD_VIS_RADIUS;
            if (end >= roadPoints.length - 1) generateRoadPoints(roadPoints.length, end - roadPoints.length + 100);

            // Main road segments
            for (let i = start; i < end && i < roadPoints.length - 1; i++) {
                if (!roadMeshes.has(i)) {
                    const mesh = getRoadMesh();
                    positionRoadMesh(mesh, i);
                    roadGroup.add(mesh);
                    roadMeshes.set(i, mesh);

                    // Edge strips
                    const eL = getEdgeMesh('L');
                    positionEdgeMesh(eL, i, -ROAD_HALF + 0.25);
                    roadGroup.add(eL);
                    edgeMeshesL.set(i, eL);

                    const eR = getEdgeMesh('R');
                    positionEdgeMesh(eR, i, ROAD_HALF - 0.25);
                    roadGroup.add(eR);
                    edgeMeshesR.set(i, eR);
                }
            }

            // Cleanup
            for (const [idx, mesh] of roadMeshes) {
                if (idx < start || idx > end) {
                    roadGroup.remove(mesh);
                    mesh.visible = false;
                    roadMeshPool.push(mesh);
                    roadMeshes.delete(idx);
                }
            }
            for (const [idx, mesh] of edgeMeshesL) {
                if (idx < start || idx > end) {
                    roadGroup.remove(mesh);
                    mesh.visible = false;
                    edgePoolL.push(mesh);
                    edgeMeshesL.delete(idx);
                }
            }
            for (const [idx, mesh] of edgeMeshesR) {
                if (idx < start || idx > end) {
                    roadGroup.remove(mesh);
                    mesh.visible = false;
                    edgePoolR.push(mesh);
                    edgeMeshesR.delete(idx);
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

        // Main Metallic Bodywork — pearlescent
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x00c8d6,
            metalness: 0.85,
            roughness: 0.18,
            envMapIntensity: 1.8,
            emissive: 0x001a2a,
            emissiveIntensity: 0.05,
        });
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 4.8), bodyMat);
        chassis.position.y = 0.58;
        chassis.castShadow = true;
        carGroup.add(chassis);

        // Body accents
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0x222233,
            metalness: 0.9,
            roughness: 0.2,
        });
        const fender = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 4.2), accentMat);
        fender.position.y = 0.35;
        carGroup.add(fender);

        // Glass Canopy
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x080818,
            metalness: 0.95,
            roughness: 0.02,
            transparent: true,
            opacity: 0.7,
            envMapIntensity: 2.0,
        });
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.2), glassMat);
        cabin.position.set(0, 1.1, -0.3);
        cabin.castShadow = true;
        carGroup.add(cabin);

        // Spoiler
        const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.8, roughness: 0.3 });
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), spoilerMat);
        spoiler.position.set(0, 1.0, -2.5);
        carGroup.add(spoiler);
        const spoilerLegs = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), spoilerMat);
        spoilerLegs.position.set(-0.6, 0.85, -2.5);
        carGroup.add(spoilerLegs);
        const spoilerLegs2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), spoilerMat);
        spoilerLegs2.position.set(0.6, 0.85, -2.5);
        carGroup.add(spoilerLegs2);

        // Wheels & Brake Calipers
        const wGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 24);
        wGeom.rotateZ(Math.PI / 2);
        const wMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a22,
            roughness: 0.4,
            metalness: 0.9,
        });
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0x8888aa,
            roughness: 0.2,
            metalness: 0.95,
        });
        const wheels = [];
        const wheelMounts = [];
        const wheelPositions = [
            [-1.2, 0.42, 1.55],
            [1.2, 0.42, 1.55],
            [-1.2, 0.42, -1.55],
            [1.2, 0.42, -1.55]
        ];
        wheelPositions.forEach((p) => {
            const mount = new THREE.Group();
            mount.position.set(...p);
            const w = new THREE.Mesh(wGeom, wMat);
            w.castShadow = true;
            mount.add(w);
            // Rim
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.39, 16), rimMat);
            rim.rotation.z = Math.PI / 2;
            mount.add(rim);
            carGroup.add(mount);
            wheels.push(w);
            wheelMounts.push(mount);
        });

        // Headlights
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const hlGeom = new THREE.BoxGeometry(0.45, 0.12, 0.06);
        const hlL = new THREE.Mesh(hlGeom, hlMat);
        hlL.position.set(-0.8, 0.7, 2.42);
        carGroup.add(hlL);
        const hlR = new THREE.Mesh(hlGeom, hlMat);
        hlR.position.set(0.8, 0.7, 2.42);
        carGroup.add(hlR);

        // Headlight glow
        const glowHlMat = new THREE.MeshBasicMaterial({
            color: 0x88ddff,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
        });
        const hlGlowL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), glowHlMat);
        hlGlowL.position.set(-0.8, 0.7, 2.45);
        carGroup.add(hlGlowL);
        const hlGlowR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), glowHlMat);
        hlGlowR.position.set(0.8, 0.7, 2.45);
        carGroup.add(hlGlowR);

        // Spotlights
        const spotL = new THREE.SpotLight(0x88ddff, 4.5, 120, Math.PI / 5, 0.4, 1);
        spotL.position.set(-0.8, 0.7, 2.2);
        spotL.target.position.set(-0.8, 0, 20);
        carGroup.add(spotL, spotL.target);
        const spotR = new THREE.SpotLight(0x88ddff, 4.5, 120, Math.PI / 5, 0.4, 1);
        spotR.position.set(0.8, 0.7, 2.2);
        spotR.target.position.set(0.8, 0, 20);
        carGroup.add(spotR, spotR.target);

        // Neon Underglow
        const underglow = new THREE.PointLight(0x00f2fe, 3.5, 9);
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

        // Brake Lights
        const tlMatOff = new THREE.MeshBasicMaterial({ color: 0x22000a });
        const tlGeom = new THREE.BoxGeometry(0.5, 0.12, 0.05);
        const tlL = new THREE.Mesh(tlGeom, tlMatOff.clone());
        tlL.position.set(-0.8, 0.75, -2.42);
        carGroup.add(tlL);
        const tlR = new THREE.Mesh(tlGeom, tlMatOff.clone());
        tlR.position.set(0.8, 0.75, -2.42);
        carGroup.add(tlR);

        const brakeL = new THREE.PointLight(0xff0055, 0, 12);
        brakeL.position.set(-0.8, 0.75, -2.5);
        carGroup.add(brakeL);
        const brakeR = new THREE.PointLight(0xff0055, 0, 12);
        brakeR.position.set(0.8, 0.75, -2.5);
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
            maxSpeed: 44,
            accel: 26,
            brake: 40,
            friction: 2.2,
            offRoadFriction: 8.0,
            lateralFriction: 11.0,
            steerSpeed: 3.4,
            boost: false,
            roadDistance: 0
        };

        const keys = {};
        window.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            keys[k] = true;
            if (e.key === 'Shift') car.boost = true;
            if (k === 'c') cycleCamera();
            if (k === 'q') cycleWeather(-1);
            if (k === 'e') cycleWeather(1);
            if (k === 'l') toggleHeadlights();
            if (k === 'r') resetCar();
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

            const onRoad = getDistanceToRoad(car.position.x, car.position.z) < ROAD_HALF + 1.5;
            const fric = onRoad ? car.friction : car.offRoadFriction;
            fVec.multiplyScalar(Math.max(0, 1 - fric * dt));
            rVec.multiplyScalar(Math.max(0, 1 - car.lateralFriction * dt));

            car.velocity.copy(fVec).add(rVec);
            if (car.velocity.length() > maxSpd) car.velocity.normalize().multiplyScalar(maxSpd);

            car.position.addScaledVector(car.velocity, dt);

            // Terrain alignment
            const gh = getTerrainHeight(car.position.x, car.position.z);
            const hFx = getTerrainHeight(car.position.x + 0.6, car.position.z);
            const hFz = getTerrainHeight(car.position.x, car.position.z + 0.6);
            const slopeX = (hFx - gh) * 1.5;
            const slopeZ = (hFz - gh) * 1.5;

            car.position.y = gh + 0.52;

            carGroup.position.copy(car.position);
            carGroup.rotation.y = car.heading;
            carGroup.rotation.z = THREE.MathUtils.lerp(carGroup.rotation.z, slopeX - vR * 0.03, 0.16);
            carGroup.rotation.x = THREE.MathUtils.lerp(carGroup.rotation.x, -slopeZ - vF * 0.015, 0.16);

            // Steering animation
            wheelMounts[0].rotation.y = steerInput * 0.45;
            wheelMounts[1].rotation.y = steerInput * 0.45;
            wheels.forEach(w => w.rotation.x += speed * dt * 3.8);

            // Brake lights
            const braking = keys['s'] || keys['arrowdown'];
            brakeL.intensity = braking ? 4.0 : 0.1;
            brakeR.intensity = braking ? 4.0 : 0.1;
            tlL.material.color.setHex(braking ? 0xff0044 : 0x22000a);
            tlR.material.color.setHex(braking ? 0xff0044 : 0x22000a);

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
            const off = mode.offset.clone();
            if (camIdx === 0) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
            camTargetPos.copy(car.position).add(off);
            camTargetLook.copy(car.position).add(mode.look);
            camera.position.copy(camTargetPos);
            camera.lookAt(camTargetLook);
            camera.fov = mode.fov;
            camera.updateProjectionMatrix();
        }

        function updateCamera(dt) {
            const mode = cameraModes[camIdx];
            let off = mode.offset.clone();
            if (camIdx === 0) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);

            const desiredPos = car.position.clone().add(off);
            const desiredLook = car.position.clone().add(mode.look);

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

            const lerpSpeed = camIdx === 1 ? 8 : 5;
            camTargetPos.lerp(desiredPos, lerpSpeed * dt);
            camTargetLook.lerp(desiredLook, lerpSpeed * dt);

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
            bg: 0x180b28,
            fog: 0x180b28,
            fogD: 0.0018,
            sun: 0xff7744,
            sunI: 2.2,
            amb: 0.4,
            hemi: 0xff77a9
        }, {
            name: 'Cyber Neon',
            bg: 0x050812,
            fog: 0x050812,
            fogD: 0.0028,
            sun: 0x00f2fe,
            sunI: 1.0,
            amb: 0.2,
            hemi: 0x00f2fe
        }, {
            name: 'Daylight',
            bg: 0x6ab0f0,
            fog: 0x6ab0f0,
            fogD: 0.0010,
            sun: 0xffeedd,
            sunI: 2.0,
            amb: 0.6,
            hemi: 0x88bbff
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
            hemiLight.color.setHex(p.hemi);
            if (sunMesh) {
                sunMesh.material.color.setHex(p.sun);
            }
        }

        function toggleHeadlights() {
            headlightsOn = !headlightsOn;
            spotL.intensity = headlightsOn ? 4.5 : 0;
            spotR.intensity = headlightsOn ? 4.5 : 0;
        }

        function resetCar() {
            const idx = getNearestRoadIndex(car.position.x, car.position.z);
            const rp = roadPoints[idx];
            const t = roadTangents[idx];
            car.position.copy(rp);
            car.position.y = getTerrainHeight(rp.x, rp.z) + 0.5;
            car.velocity.set(0, 0, 0);
            car.heading = Math.atan2(t.x, t.z);
            car.roadDistance = idx * SEGMENT_DIST;
            // Reset camera
            camInitialized = false;
            const mode = cameraModes[camIdx];
            const off = mode.offset.clone();
            if (camIdx === 0) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
            camTargetPos.copy(car.position).add(off);
            camTargetLook.copy(car.position).add(mode.look);
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

            const carIdx = Math.max(0, Math.floor(car.roadDistance / SEGMENT_DIST));
            updateRoadMesh(carIdx);

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
        const off = mode.offset.clone();
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
        camTargetPos.copy(car.position).add(off);
        camTargetLook.copy(car.position).add(mode.look);
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