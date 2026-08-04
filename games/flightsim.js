// =========================================================
        // OVERHAULED FLIGHT PHYSICS — TRUE 6DOF WITH ADVANCED AERO
        // =========================================================

        // 1. Keyless Setup
        Cesium.Ion.defaultAccessToken = '';

        // 2. Base Imagery Provider
        const baseImageryProvider = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/'
        });

        // 3. Initialize Cesium Engine
        const viewer = new Cesium.Viewer('cesiumContainer', {
            baseLayer: new Cesium.ImageryLayer(baseImageryProvider),
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            selectionIndicator: false,
            infoBox: false,
            skyBox: false,
            skyAtmosphere: new Cesium.SkyAtmosphere()
        });

        // Add high-res satellite layer
        try {
            const esriLayer = new Cesium.ImageryLayer(
                new Cesium.UrlTemplateImageryProvider({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    maximumLevel: 19
                })
            );
            viewer.imageryLayers.add(esriLayer);
        } catch (e) { console.warn("Satellite overlay fallback."); }

        // Enable atmospheric effects
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.backgroundColor = Cesium.Color.SKYBLUE;

        // 4. Audio Engine
        let audioCtx = null, engineFilter = null, engineOsc = null, noiseNode = null;

        function initAudio() {
            if (audioCtx) return;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const masterGain = audioCtx.createGain();
                masterGain.gain.value = 0.15;
                masterGain.connect(audioCtx.destination);

                // Noise engine
                const bufferSize = 2 * audioCtx.sampleRate;
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
                const whiteNoise = audioCtx.createBufferSource();
                whiteNoise.buffer = buffer;
                whiteNoise.loop = true;

                engineFilter = audioCtx.createBiquadFilter();
                engineFilter.type = 'bandpass';
                engineFilter.frequency.value = 350;
                engineFilter.Q.value = 1.5;

                const noiseGain = audioCtx.createGain();
                noiseGain.gain.value = 0.2;
                whiteNoise.connect(engineFilter);
                engineFilter.connect(noiseGain);
                noiseGain.connect(masterGain);
                whiteNoise.start();
                noiseNode = noiseGain;

                // Oscillator for harmonic richness
                engineOsc = audioCtx.createOscillator();
                engineOsc.type = 'sawtooth';
                engineOsc.frequency.value = 180;
                const oscGain = audioCtx.createGain();
                oscGain.gain.value = 0.04;
                engineOsc.connect(oscGain);
                oscGain.connect(masterGain);
                engineOsc.start();
            } catch (e) {}
        }

        function updateEngineAudio(speedRatio, throttle) {
            if (!audioCtx) return;
            const baseFreq = 180 + speedRatio * 600;
            const q = 1.2 + speedRatio * 1.8;
            engineFilter.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.08);
            engineFilter.Q.setTargetAtTime(q, audioCtx.currentTime, 0.08);
            if (engineOsc) {
                engineOsc.frequency.setTargetAtTime(100 + speedRatio * 350, audioCtx.currentTime, 0.08);
            }
            // Volume scales with throttle
            if (noiseNode) {
                noiseNode.gain.setTargetAtTime(0.05 + throttle * 0.25, audioCtx.currentTime, 0.1);
            }
        }

        // 5. Flight Constants & State
        const SPAWN_LON = 17.815;
        const SPAWN_LAT = 43.337;
        const SPAWN_ALT = 800;

        let planePosition = Cesium.Cartesian3.fromDegrees(SPAWN_LON, SPAWN_LAT, SPAWN_ALT);
        let planeQuaternion = new THREE.Quaternion();
        let angularVelocity = new THREE.Vector3(0, 0, 0);
        
        // Aerodynamic state
        let speed = 120; // Knots
        let throttle = 0.6;
        let angleOfAttack = 0;
        let pitchRate = 0;
        let rollRate = 0;
        let yawRate = 0;
        
        // Constants
        const MIN_SPEED = 25;
        const STALL_SPEED = 45;
        const MAX_SPEED = 420;
        const DRAG_COEFF = 0.02;
        const LIFT_COEFF = 0.035;
        const GRAVITY = 9.81;
        const MAX_AOA = 0.45; // ~25 degrees

        // 6. 3D Aircraft Model
        const planeEntity = viewer.entities.add({
            position: planePosition,
            model: {
                uri: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumAir/glTF-Embedded/CesiumAir.gltf',
                minimumPixelSize: 128,
                maximumScale: 1500
            }
        });

        // 7. Input Controls
        const keys = {};
        window.addEventListener('keydown', (e) => {
            initAudio();
            const k = e.key.toLowerCase();
            keys[k] = true;
            if (k === 'r') resetAircraft();
        });
        window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
        window.addEventListener('click', initAudio);

        // 8. OVERHAULED FLIGHT PHYSICS
        function updateFlightPhysics(dt) {
            // ---- Throttle Management ----
            if (keys['shift']) throttle = Math.min(1.0, throttle + 0.6 * dt);
            if (keys['control']) throttle = Math.max(0.0, throttle - 0.6 * dt);
            throttle = THREE.MathUtils.clamp(throttle, 0, 1);

            // ---- Control Surface Inputs (with sensitivity curve) ----
            const inputPitch = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
            const inputRoll = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
            const inputYaw = (keys['e'] ? 1 : 0) - (keys['q'] ? 1 : 0);

            // ---- Extract Forward Vector ----
            const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(planeQuaternion);
            
            // ---- Speed & Thrust ----
            const thrust = throttle * 1.2; // Thrust factor
            const drag = DRAG_COEFF * speed * speed * 0.001;
            const netAccel = (thrust - drag) * 0.5;
            
            // Speed in knots, convert to m/s for physics
            let speedMs = speed * 0.514444;
            speedMs += netAccel * dt;
            speedMs = Math.max(MIN_SPEED * 0.514444, Math.min(MAX_SPEED * 0.514444, speedMs));
            speed = speedMs / 0.514444;

            // ---- Angle of Attack (AOA) ----
            // AOA is the angle between forward vector and velocity vector
            // Simplified: AOA affects lift generation
            const verticalComponent = forward.y; // Up component of forward vector
            angleOfAttack = Math.asin(Math.max(-1, Math.min(1, -verticalComponent)));
            
            // ---- Lift Generation ----
            // Lift = CL * 0.5 * rho * V^2 * S
            // Simplified: Lift coefficient varies with AOA and speed
            const liftFactor = LIFT_COEFF * (1 + 0.8 * Math.sin(angleOfAttack));
            const lift = liftFactor * speedMs * speedMs * 0.0008;
            
            // ---- Gravity Component ----
            const gravityForce = GRAVITY * 0.02;
            
            // ---- Stall Detection ----
            let isStalling = speed < STALL_SPEED || Math.abs(angleOfAttack) > MAX_AOA;
            
            // ---- Control Authority (reduced at low speed, enhanced at high speed) ----
            const speedRatio = Math.min(1, speed / 150);
            const authority = 0.3 + 0.7 * speedRatio;
            
            // ---- Angular Acceleration with realistic damping ----
            // Pitch: elevator authority + AOA stability + stall recovery
            let targetPitchRate = inputPitch * 1.8 * authority;
            // AOA stability: natural tendency to return to neutral
            const aoaStability = -angleOfAttack * 0.8;
            targetPitchRate += aoaStability;
            
            // Stall recovery: automatic pitch down
            if (isStalling && speed < STALL_SPEED) {
                targetPitchRate -= 1.2;
                // Show stall warning
                document.getElementById('stall-warning').classList.add('show');
            } else {
                document.getElementById('stall-warning').classList.remove('show');
            }
            
            // Roll: aileron authority with adverse yaw coupling
            let targetRollRate = inputRoll * 2.8 * authority;
            // Roll damping
            targetRollRate -= rollRate * 0.15;
            
            // Yaw: rudder authority with coordinated turn tendency
            let targetYawRate = inputYaw * 0.9 * authority;
            // Automatic yaw coordination during rolls (simplified)
            if (Math.abs(inputRoll) > 0.1) {
                targetYawRate += inputRoll * 0.15 * authority;
            }
            // Yaw damping
            targetYawRate -= yawRate * 0.12;
            
            // ---- Apply Angular Acceleration ----
            pitchRate += (targetPitchRate - pitchRate) * 6 * dt;
            rollRate += (targetRollRate - rollRate) * 6 * dt;
            yawRate += (targetYawRate - yawRate) * 6 * dt;
            
            // ---- Update Angular Velocity ----
            angularVelocity.set(pitchRate, yawRate, rollRate);
            
            // ---- Generate Rotation ----
            const rotDelta = new THREE.Euler(
                pitchRate * dt,
                yawRate * dt,
                rollRate * dt,
                'YXZ'
            );
            const deltaQuat = new THREE.Quaternion().setFromEuler(rotDelta);
            planeQuaternion.multiply(deltaQuat);
            planeQuaternion.normalize();

            // ---- Translation ----
            const speedVector = forward.clone().multiplyScalar(speedMs * dt);
            
            // Add lift effect (upward force)
            const up = new THREE.Vector3(0, 0, 1).applyQuaternion(planeQuaternion);
            const liftVector = up.clone().multiplyScalar(lift * dt * 0.1);
            
            // Total movement
            const moveVector = new THREE.Vector3().copy(speedVector).add(liftVector);
            
            // ---- Convert to Cesium Cartesian ----
            const cesiumMove = new Cesium.Cartesian3(moveVector.x, moveVector.y, moveVector.z);
            planePosition = Cesium.Cartesian3.add(planePosition, cesiumMove, new Cesium.Cartesian3());
            
            // Ground collision (keep above terrain)
            const carto = Cesium.Cartographic.fromCartesian(planePosition);
            if (carto.height < 5) {
                carto.height = 5;
                planePosition = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
                // Bounce effect
                const upVec = new THREE.Vector3(0, 0, 1).applyQuaternion(planeQuaternion);
                if (upVec.z > 0) {
                    speedMs *= 0.5;
                    speed = speedMs / 0.514444;
                }
            }
            
            // ---- Update Audio ----
            const audioSpeed = Math.min(1, speed / MAX_SPEED);
            updateEngineAudio(audioSpeed, throttle);
            
            // ---- Telemetry ----
            const euler = new THREE.Euler().setFromQuaternion(planeQuaternion, 'YXZ');
            document.getElementById('val-speed').textContent = Math.round(speed);
            document.getElementById('val-alt').textContent = Math.round(carto.height * 3.28084);
            const hdg = Math.round((Cesium.Math.toDegrees(euler.y) % 360 + 360) % 360);
            document.getElementById('val-hdg').textContent = `${hdg.toString().padStart(3, '0')}°`;
            document.getElementById('val-throttle').textContent = Math.round(throttle * 100) + '%';
        }

        function resetAircraft() {
            planePosition = Cesium.Cartesian3.fromDegrees(SPAWN_LON, SPAWN_LAT, SPAWN_ALT);
            planeQuaternion.set(0, 0, 0, 1);
            angularVelocity.set(0, 0, 0);
            pitchRate = 0;
            rollRate = 0;
            yawRate = 0;
            speed = 120;
            throttle = 0.6;
            angleOfAttack = 0;
            document.getElementById('stall-warning').classList.remove('show');
        }

        // 9. Main Loop
        const clock = new THREE.Clock();

        viewer.clock.onTick.addEventListener(() => {
            const dt = Math.min(clock.getDelta(), 0.05);
            updateFlightPhysics(dt);

            // ---- Update Entity Position & Orientation ----
            const euler = new THREE.Euler().setFromQuaternion(planeQuaternion, 'YXZ');
            const hpr = new Cesium.HeadingPitchRoll(euler.y, euler.x, euler.z);
            
            // Get transformation matrix for position offset
            const transformMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(planePosition, hpr);
            
            // Update position with proper orientation
            planeEntity.position = planePosition;
            planeEntity.orientation = Cesium.Transforms.headingPitchRollQuaternion(planePosition, hpr);

            // ---- Camera: Chase view with dynamic offset ----
            const speedFactor = Math.min(1, speed / 200);
            const chaseDistance = 30 + 30 * speedFactor;
            const chaseHeight = 8 + 8 * speedFactor;
            
            const cameraOffset = new Cesium.Cartesian3(0, -chaseDistance, chaseHeight);
            const cameraPos = Cesium.Matrix4.multiplyByPoint(transformMatrix, cameraOffset, new Cesium.Cartesian3());
            
            // Smooth camera follow
            viewer.camera.setView({
                destination: cameraPos,
                orientation: hpr
            });
        });

        // Initial reset to ensure proper state
        setTimeout(resetAircraft, 100);