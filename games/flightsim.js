Cesium.Ion.defaultAccessToken = '';

        // 1. Initialize Map
        const viewer = new Cesium.Viewer('cesiumContainer', {
            baseLayer: new Cesium.ImageryLayer(
                new Cesium.UrlTemplateImageryProvider({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    maximumLevel: 19
                })
            ),
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
        viewer.scene.globe.enableLighting = true;

        // 2. Flight State & Local Orientation
        const SPAWN = { lon: 17.815, lat: 43.337, alt: 1000 };
        let position = Cesium.Cartesian3.fromDegrees(SPAWN.lon, SPAWN.lat, SPAWN.alt);
        
        // Quaternion representing rotation relative to the local East-North-Up frame
        let localOrientation = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY);
        
        let speed = 140; // Knots
        let throttle = 0.6;
        const MAX_SPEED = 450;
        const MIN_SPEED = 30;

        // 3. Aircraft Model Entity
        const planeEntity = viewer.entities.add({
            position: position,
            model: {
                uri: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumAir/glTF-Embedded/CesiumAir.gltf',
                minimumPixelSize: 64,
                maximumScale: 500
            }
        });

        // 4. Input Handling
        const keys = {};
        window.addEventListener('keydown', (e) => {
            keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'r') resetFlight();
        });
        window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

        // 5. 6DOF Physics Engine
        function updatePhysics(dt) {
            // Throttle Management
            if (keys['shift']) throttle = Math.min(1.0, throttle + 0.5 * dt);
            if (keys['control']) throttle = Math.max(0.0, throttle - 0.5 * dt);

            // Stick Inputs
            const inputPitch = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
            const inputRoll = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
            const inputYaw = (keys['e'] ? 1 : 0) - (keys['q'] ? 1 : 0);

            // Control Authority scales with speed
            const authority = Math.min(1.0, speed / 120);

            // Calculate Local Rotation Deltas (X=Right, Y=Forward, Z=Up)
            const pitchRate = inputPitch * 1.5 * authority * dt;
            const rollRate = inputRoll * 3.0 * authority * dt;
            const yawRate = -inputYaw * 1.2 * authority * dt; // Negative because right-hand rule around Z

            const pitchQ = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, pitchRate);
            const rollQ = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Y, rollRate);
            const yawQ = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, yawRate);

            // Combine deltas and apply them to the current local orientation
            let deltaQ = new Cesium.Quaternion();
            Cesium.Quaternion.multiply(yawQ, pitchQ, deltaQ);
            Cesium.Quaternion.multiply(deltaQ, rollQ, deltaQ);
            
            // Apply delta strictly relative to the plane's current rotation
            Cesium.Quaternion.multiply(localOrientation, deltaQ, localOrientation);
            Cesium.Quaternion.normalize(localOrientation, localOrientation);

            // Extract Local Forward & Up Vectors
            let localForward = new Cesium.Cartesian3();
            Cesium.Matrix3.multiplyByVector(Cesium.Matrix3.fromQuaternion(localOrientation), Cesium.Cartesian3.UNIT_Y, localForward);
            
            let localUp = new Cesium.Cartesian3();
            Cesium.Matrix3.multiplyByVector(Cesium.Matrix3.fromQuaternion(localOrientation), Cesium.Cartesian3.UNIT_Z, localUp);

            // Aerodynamics & Thrust
            const thrust = throttle * 25.0;
            const drag = 0.0003 * speed * speed;
            const gravityEffect = localForward.z * 15.0; // Gravity pulls speed down if nose is up
            
            speed += (thrust - drag - gravityEffect) * dt;
            speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));

            // Move the plane in World Space
            const speedMS = speed * 0.514444;
            const moveAmount = speedMS * dt;
            
            let enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position);
            
            // Convert local movement vector to global coordinate space
            let localMove = Cesium.Cartesian3.multiplyByScalar(localForward, moveAmount, new Cesium.Cartesian3());
            let worldMove = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, localMove, new Cesium.Cartesian3());
            
            position = Cesium.Cartesian3.add(position, worldMove, new Cesium.Cartesian3());

            // Ground Collision Clamp
            const carto = Cesium.Cartographic.fromCartesian(position);
            if (carto.height < 10) {
                carto.height = 10;
                position = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
                speed *= 0.9;
            }

            // HUD Telemetry
            document.getElementById('val-speed').textContent = Math.round(speed);
            document.getElementById('val-alt').textContent = Math.round(carto.height * 3.28084);
            document.getElementById('val-throttle').textContent = Math.round(throttle * 100) + '%';
        }

        function resetFlight() {
            position = Cesium.Cartesian3.fromDegrees(SPAWN.lon, SPAWN.lat, SPAWN.alt);
            localOrientation = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY);
            speed = 140; 
            throttle = 0.6;
        }

        // 6. Camera Rigging & Render Loop
        const clock = new Cesium.Clock({
            clockStep: Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
            shouldAnimate: true
        });

        viewer.clock.onTick.addEventListener(() => {
            const dt = 0.02; // Fixed timestep for smoother physics
            updatePhysics(dt);

            // Update 3D Model Global Orientation
            let enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position);
            let enuRotation = new Cesium.Quaternion();
            Cesium.Quaternion.fromRotationMatrix(Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3()), enuRotation);
            
            let globalOrientation = new Cesium.Quaternion();
            Cesium.Quaternion.multiply(enuRotation, localOrientation, globalOrientation);
            
            planeEntity.position = position;
            planeEntity.orientation = globalOrientation;

            // Strict 3rd Person Camera Tether
            // 1. Position camera 40m behind (-Y) and 12m above (+Z) the plane's local orientation
            let localCamOffset = new Cesium.Cartesian3(0, -40, 12);
            let rotatedCamOffset = new Cesium.Cartesian3();
            Cesium.Matrix3.multiplyByVector(Cesium.Matrix3.fromQuaternion(localOrientation), localCamOffset, rotatedCamOffset);
            
            let worldCamOffset = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, rotatedCamOffset, new Cesium.Cartesian3());
            let cameraPosition = Cesium.Cartesian3.add(position, worldCamOffset, new Cesium.Cartesian3());

            // 2. Align camera UP vector to the plane's local UP vector
            let rotatedUp = new Cesium.Cartesian3();
            Cesium.Matrix3.multiplyByVector(Cesium.Matrix3.fromQuaternion(localOrientation), Cesium.Cartesian3.UNIT_Z, rotatedUp);
            let worldUp = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, rotatedUp, new Cesium.Cartesian3());

            // 3. Apply Camera View
            viewer.camera.setView({
                destination: cameraPosition,
                orientation: {
                    direction: Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(position, cameraPosition, new Cesium.Cartesian3()), new Cesium.Cartesian3()),
                    up: worldUp
                }
            });
        });