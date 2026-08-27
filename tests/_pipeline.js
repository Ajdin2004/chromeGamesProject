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
        
const CHUNK_SIZE = 180;
        const CHUNK_RES = 52;
        const LOAD_RADIUS = 2;
        const ROAD_WIDTH = 14;
        const ROAD_HALF = ROAD_WIDTH / 2;
        const SEGMENT_DIST = 5;
        const GRID_CELL = 60;

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
        
const wheelPositions = [[-1.2,0,1.55],[1.2,0,1.55],[-1.2,0,-1.55],[1.2,0,-1.55]];
const ROAD_LIFT = 0.12; // stub: real value lives in section 7
const suspensions = [{ position: { y: 0 } }, { position: { y: 0 } }, { position: { y: 0 } }, { position: { y: 0 } }];
const WHEEL_R = 0.42;          // tire radius
        const TIRE_EMBED = 0.05;       // deliberate clip into ground = squish
        const SUSP_LN = 0.38;          // relaxed mount->tire-centre length
        const SUSP_COMP_MAX = 0.24;    // max compression below rest
        const SUSP_EXT_MAX = 0.16;     // max droop beyond rest
        const SPRING_K = 90;           // N/m per corner
        const BUMP_K = 320;            // bump-stop stiffness past travel
        const SUSP_C = 6.0;            // damping per corner (~0.6 ratio)
        const CAR_MASS = 1;
        const SUSP_GRAV = 20;          // world gravity
        const I_PITCH = 2.4;           // m * lever^2 point-mass inertia about x
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
            suspY = (frontY + rearY) / 2 + 0.05; // nominal loaded ride height
            suspTheta = Math.atan2(rearY - frontY, 3.1);
            suspPhi = Math.atan2(rightY - leftY, 2.4);
            suspVy = suspWTheta = suspWPhi = 0;
            for (let i = 0; i < suspensions.length; i++) {
                suspOffsets[i] = SUSP_LN - CAR_MASS * SUSP_GRAV / (4 * SPRING_K); // static sag
                suspensions[i].position.y = suspOffsets[i];
            }
            car.position.y = suspY;
        }

        
