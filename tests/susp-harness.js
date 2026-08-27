// Debug harness: extracts exact numeric pipeline from games/3ddrive.js and simulates.
const fs = require('fs');
const src = fs.readFileSync('games/3ddrive.js', 'utf8');

function slice(startMarker, endMarker) {
    const a = src.indexOf(startMarker);
    const b = src.indexOf(endMarker);
    if (a === -1 || b === -1 || b <= a) throw new Error('marker fail: ' + startMarker.slice(0, 40));
    return src.substring(a, b);
}

const noiseBlock = slice('const NOISE_PERM', '// 2. Audio Engine');
const paramsBlock = slice('const CHUNK_SIZE = 180;', '// 5. Procedural Road');
const roadBlock = slice('const roadPoints = [];', '// 6. Terrain');

// Minimal THREE shim for what these blocks use
const clampShim = (v, a, b) => Math.min(b, Math.max(a, v));
class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    crossVectors(a, b) {
        this.x = a.y * b.z - a.z * b.y;
        this.y = a.z * b.x - a.x * b.z;
        this.z = a.x * b.y - a.y * b.x;
        return this;
    }
    clone() { return new V3(this.x, this.y, this.z); }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() { const l = this.length(); if (l > 1e-9) { this.x /= l; this.y /= l; this.z /= l; } return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}
global.THREE = { MathUtils: { clamp: clampShim }, Vector3: V3 };

let code = noiseBlock + '\n' + paramsBlock + '\n' + roadBlock + '\n';
code += "const wheelPositions = [[-1.2,0,1.55],[1.2,0,1.55],[-1.2,0,-1.55],[1.2,0,-1.55]];\n";
code += "const ROAD_LIFT = 0.12; // stub: real value lives in section 7\n";
code += "const suspensions = [{ position: { y: 0 } }, { position: { y: 0 } }, { position: { y: 0 } }, { position: { y: 0 } }];\n";

// Suspension model block straight from source
code += slice('const WHEEL_R = 0.42;', '// Headlights') + '\n';
fs.writeFileSync('tests/_pipeline.js', code);

const sim = `
generateRoadPoints(0, 700);
console.log('roadPoints:', roadPoints.length, 'p0:', JSON.stringify(roadPoints[0]));
console.log('terrain(0,0)=', getTerrainHeight(0,0));
for (const [tx,tz] of [[0,0],[3,8],[-5,-12],[100,-300]]) {
    console.log('sample('+tx+','+tz+')=', sampleTerrainMeshHeight(tx,tz), 'groundUnder=', getGroundUnder(tx,tz));
}

${'' /* car + physics simulation copied from source formulas */}
const car = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: 0,
    friction: .6, offRoadFriction: 2.2, lateralFriction: 1.4, maxSpeed: 36, accel: 22,
    boost: false, steerSpeed: 3.4, roadDistance: 0 };

function resetToSpawn() {
    const idx = getNearestRoadIndex(car.position.x, car.position.z);
    const rp = roadPoints[idx], t = roadTangents[idx];
    car.position.copy(rp);
    car.velocity.set(0,0,0);
    car.heading = Math.atan2(t.x, t.z);
    initSuspension();
    console.log('spawn y=', rp.y.toFixed(2), 'suspY=', suspY.toFixed(3),
        'theta=', suspTheta.toFixed(3), 'phi=', suspPhi.toFixed(3),
        'offsets=', suspOffsets.map(v=>v.toFixed(3)).join(','));
}
resetToSpawn();

function step(dt) {
    const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    car.velocity.addScaledVector(forward, 14 * dt);
    const speed = car.velocity.length();
    const vF = car.velocity.dot(forward);
    car.velocity.multiplyScalar(Math.max(0, 1 - 0.35 * dt));
    car.position.addScaledVector(car.velocity, dt);
    const cosH = Math.cos(car.heading), sinH = Math.sin(car.heading);
    const tireTargetY = [], wposXZ = [];
    for (let i = 0; i < wheelPositions.length; i++) {
        const lp = wheelPositions[i];
        wposXZ.push([lp[0], lp[2]]);
        tireTargetY.push(getGroundUnder(
            car.position.x + lp[0]*cosH + lp[2]*sinH,
            car.position.z - lp[0]*sinH + lp[2]*cosH) + WHEEL_R - TIRE_EMBED);
    }
    if (tireTargetY.some(v => !Number.isFinite(v))) throw new Error('NaN tire target at ' + car.position.x.toFixed(1) + ',' + car.position.z.toFixed(1));
    let remaining = dt;
    while (remaining > 1e-5) {
        const h = Math.min(0.008, remaining); remaining -= h;
        let sumF = 0, tqP = 0, tqR = 0;
        for (let i = 0; i < 4; i++) {
            const lx = wposXZ[i][0], lz = wposXZ[i][1];
            const mountY = suspY + suspPhi*lx - suspTheta*lz;
            let u = tireTargetY[i] - mountY;
            const uRaw = u;
            if (u > SUSP_LN + SUSP_EXT_MAX) u = SUSP_LN + SUSP_EXT_MAX;
            if (u < SUSP_LN - SUSP_COMP_MAX) u = SUSP_LN - SUSP_COMP_MAX;
            const mvY = suspVy + suspWPhi*lx - suspWTheta*lz;
            let F = SPRING_K*(SUSP_LN-u) - SUSP_C*mvY;
            if (uRaw < SUSP_LN - SUSP_COMP_MAX) F += BUMP_K*((SUSP_LN-SUSP_COMP_MAX)-uRaw);
            F = THREE.MathUtils.clamp(F, F_MIN, F_MAX);
            sumF += F; tqP += -F*lz; tqR += F*lx;
        }
        suspVy += (sumF/CAR_MASS - SUSP_GRAV)*h;
        suspWTheta += (tqP/I_PITCH)*h;
        suspWPhi += (tqR/I_ROLL)*h;
        suspY += suspVy*h; suspTheta += suspWTheta*h; suspPhi += suspWPhi*h;
        suspTheta = THREE.MathUtils.clamp(suspTheta,-0.45,0.45);
        suspPhi = THREE.MathUtils.clamp(suspPhi,-0.4,0.4);
    }
    car.position.y = suspY;
    return speed;
}

for (let t=0;t<3;t+=1/60) step(1/60);
console.log('idle3s: y=', car.position.y.toFixed(3), 'vy=', suspVy.toFixed(3));

let lastLog = -10;
for (let t=0;t<15;t+=1/60) {
    const spd = step(1/60);
    if (t-lastLog >= 3 || lastLog<0) { lastLog=t;
        const gh = getGroundUnder(car.position.x, car.position.z);
        console.log(\`t=\${t.toFixed(0)} pos=(\${car.position.x.toFixed(0)},\${car.position.z.toFixed(0)}) y=\${car.position.y.toFixed(2)} spd=\${spd.toFixed(1)} ground=\${gh.toFixed(2)} th=\${suspTheta.toFixed(3)} ph=\${suspPhi.toFixed(3)}\`);
    }
}
console.log('FINAL finite:', Number.isFinite(car.position.y), 'y=', car.position.y);
`;
fs.writeFileSync('tests/_sim.js', sim);
eval(code + '\n' + sim);

