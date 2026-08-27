
generateRoadPoints(0, 700);
console.log('roadPoints:', roadPoints.length, 'p0:', JSON.stringify(roadPoints[0]));
console.log('terrain(0,0)=', getTerrainHeight(0,0));
for (const [tx,tz] of [[0,0],[3,8],[-5,-12],[100,-300]]) {
    console.log('sample('+tx+','+tz+')=', sampleTerrainMeshHeight(tx,tz), 'groundUnder=', getGroundUnder(tx,tz));
}


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
        console.log(`t=${t.toFixed(0)} pos=(${car.position.x.toFixed(0)},${car.position.z.toFixed(0)}) y=${car.position.y.toFixed(2)} spd=${spd.toFixed(1)} ground=${gh.toFixed(2)} th=${suspTheta.toFixed(3)} ph=${suspPhi.toFixed(3)}`);
    }
}
console.log('FINAL finite:', Number.isFinite(car.position.y), 'y=', car.position.y);
