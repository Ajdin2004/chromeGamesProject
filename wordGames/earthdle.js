// --- Web Audio Synthesizer ---
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }

        const Sound = {
            guess() {
                if (!audioCtx) return;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.08);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(); osc.stop(audioCtx.currentTime + 0.08);
            },
            win() {
                if (!audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523, now);
                osc.frequency.setValueAtTime(659, now + 0.1);
                osc.frequency.setValueAtTime(783, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.35);
            }
        };

        // Global State
        let worldGlobe;
        let geoJsonFeatures = [];
        let COUNTRIES = [];
        let TARGET_COUNTRY = null;
        const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
        const MAX_GUESSES = 6;
        let guessesHistory = [];
        let gameOver = false;

        // DOM
        const inputEl = document.getElementById('country-input');
        const btnGuess = document.getElementById('btn-guess');
        const suggestionsEl = document.getElementById('suggestions');
        const guessesContainer = document.getElementById('guesses-container');
        const toastEl = document.getElementById('toast');
        const helpModal = document.getElementById('help-modal');
        const btnHelp = document.getElementById('btn-help');
        const btnCloseHelp = document.getElementById('btn-close-help');
        let currentMatches = [];
        let suggestionActiveIndex = -1;

        // --- Init Globe with stars ---
        function initGlobe() {
            const container = document.getElementById('globe-container');

            worldGlobe = Globe()
                (container)
                .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
                .backgroundColor('rgba(0,0,0,0)')
                .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
                .polygonSideColor(() => 'rgba(0, 242, 254, 0.15)')
                .polygonStrokeColor(() => '#00f2fe')
                .polygonCapColor(d => d.properties.customColor || 'rgba(15, 23, 42, 0.6)')
                .polygonAltitude(d => d.properties.customAltitude || 0.01);

            // Enable stars (realistic starfield)
            if (typeof worldGlobe.stars === 'function') {
                worldGlobe.stars(true);
            }

            worldGlobe.controls().autoRotate = true;
            worldGlobe.controls().autoRotateSpeed = 0.6;
        }

        // --- Fetch GeoJSON ---
        async function fetchGeoJsonDataset() {
            try {
                const response = await fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson');
                const data = await response.json();

                geoJsonFeatures = data.features;
                worldGlobe.polygonsData(geoJsonFeatures);

                COUNTRIES = geoJsonFeatures.map(f => {
                    const props = f.properties;
                    const bbox = f.bbox || [0,0,0,0];
                    const lon = (bbox[0] + bbox[2]) / 2 || 0;
                    const lat = (bbox[1] + bbox[3]) / 2 || 0;
                    return {
                        name: props.NAME || props.ADMIN,
                        lat: lat,
                        lon: lon,
                        feature: f
                    };
                }).sort((a, b) => a.name.localeCompare(b.name));

                const now = new Date();
                const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
                TARGET_COUNTRY = COUNTRIES[seed % COUNTRIES.length];

                toastEl.textContent = "Guess today's mystery country!";
                restoreProgress();
            } catch (err) {
                toastEl.textContent = "Error loading 3D map data.";
            }
        }

        // --- Helpers ---
        function calculateDistanceKM(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return Math.round(R * c);
        }

        function calculateBearingArrow(lat1, lon1, lat2, lon2) {
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
            const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
            let brng = Math.atan2(y, x) * 180 / Math.PI;
            brng = (brng + 360) % 360;
            const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
            return arrows[Math.round(brng / 45) % 8];
        }

        function highlightCountryOnGlobe(country, isCorrect) {
            if (!country || !country.feature) return;
            country.feature.properties.customColor = isCorrect 
                ? 'rgba(34, 197, 94, 0.85)'
                : 'rgba(239, 68, 68, 0.75)';
            country.feature.properties.customAltitude = 0.05;
            worldGlobe.polygonsData([...geoJsonFeatures]);
            worldGlobe.controls().autoRotate = false;
            worldGlobe.pointOfView({ lat: country.lat, lng: country.lon, altitude: 1.8 }, 1200);
        }

        function updateActiveSuggestion() {
            const items = suggestionsEl.querySelectorAll('.suggestion-item');
            items.forEach((item, idx) => {
                item.classList.toggle('active', idx === suggestionActiveIndex);
            });
            if (suggestionActiveIndex >= 0 && items[suggestionActiveIndex]) {
                items[suggestionActiveIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        function selectCountrySuggestion(country) {
            inputEl.value = country.name;
            suggestionsEl.style.display = 'none';
            inputEl.focus();
        }

        function handleAutocomplete() {
            const val = inputEl.value.toLowerCase().trim();
            suggestionsEl.innerHTML = '';
            suggestionActiveIndex = -1;
            currentMatches = [];

            if (!val || COUNTRIES.length === 0) {
                suggestionsEl.style.display = 'none';
                return;
            }
            const matches = COUNTRIES.filter(c => c.name.toLowerCase().includes(val)).slice(0, 8);
            if (matches.length > 0) {
                currentMatches = matches;
                suggestionActiveIndex = 0;
                suggestionsEl.style.display = 'block';
                matches.forEach((c, idx) => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = c.name;
                    if (idx === suggestionActiveIndex) div.classList.add('active');
                    div.addEventListener('click', () => selectCountrySuggestion(c));
                    suggestionsEl.appendChild(div);
                });
            } else {
                suggestionsEl.style.display = 'none';
            }
        }

        function submitGuess() {
            if (gameOver || !TARGET_COUNTRY) return;
            initAudio();

            const val = inputEl.value.trim();
            const guessedCountry = COUNTRIES.find(c => c.name.toLowerCase() === val.toLowerCase());

            if (!guessedCountry) {
                toastEl.textContent = "Unknown Country!";
                return;
            }
            if (guessesHistory.some(g => g.name === guessedCountry.name)) {
                toastEl.textContent = "Already Guessed!";
                return;
            }

            const dist = calculateDistanceKM(guessedCountry.lat, guessedCountry.lon, TARGET_COUNTRY.lat, TARGET_COUNTRY.lon);
            const arrow = dist === 0 ? "🎉" : calculateBearingArrow(guessedCountry.lat, guessedCountry.lon, TARGET_COUNTRY.lat, TARGET_COUNTRY.lon);
            const isCorrect = guessedCountry.name === TARGET_COUNTRY.name;
            const guessData = { name: guessedCountry.name, dist, arrow, isCorrect };

            guessesHistory.push(guessData);
            renderRowUI(guessData);
            highlightCountryOnGlobe(guessedCountry, isCorrect);
            Sound.guess();

            inputEl.value = '';
            suggestionsEl.style.display = 'none';

            if (isCorrect) {
                gameOver = true;
                Sound.win();
                toastEl.textContent = "Splendid! Earthdle Solved!";
                inputEl.disabled = true;
                btnGuess.disabled = true;
                saveProgress(true);
            } else if (guessesHistory.length >= MAX_GUESSES) {
                gameOver = true;
                toastEl.textContent = `Game Over! Country was: ${TARGET_COUNTRY.name}`;
                highlightCountryOnGlobe(TARGET_COUNTRY, true);
                inputEl.disabled = true;
                btnGuess.disabled = true;
                saveProgress(false);
            } else {
                saveProgress(false);
            }
        }

        function renderRowUI(guess) {
            const row = document.createElement('div');
            row.className = `guess-row ${guess.isCorrect ? 'correct' : ''}`;
            row.innerHTML = `
                <span class="country-name">${guess.name}</span>
                <span class="distance">${guess.dist.toLocaleString()} km</span>
                <span class="direction">${guess.arrow}</span>
                <span>${guess.isCorrect ? '100%' : Math.max(0, Math.round(100 - (guess.dist / 20000) * 100)) + '%'}</span>
            `;
            guessesContainer.appendChild(row);
        }

        function restoreProgress() {
            const saved = JSON.parse(localStorage.getItem(`earthdle_3d_save_${TODAY_DATE_STR}`));
            if (!saved) return;
            guessesHistory = saved.history || [];
            gameOver = saved.gameOver;
            guessesHistory.forEach(guess => {
                renderRowUI(guess);
                const country = COUNTRIES.find(c => c.name === guess.name);
                if (country) highlightCountryOnGlobe(country, guess.isCorrect);
            });
            if (gameOver) {
                inputEl.disabled = true;
                btnGuess.disabled = true;
                toastEl.textContent = saved.passed ? "Daily Earthdle Solved!" : `Mystery Country was: ${TARGET_COUNTRY.name}`;
            }
        }

        function saveProgress(passed) {
            localStorage.setItem(`earthdle_3d_save_${TODAY_DATE_STR}`, JSON.stringify({
                date: TODAY_DATE_STR,
                history: guessesHistory,
                gameOver: gameOver,
                passed: passed
            }));
        }

        function setupDynamicResize() {
            const container = document.getElementById('globe-container');
            const resizeObserver = new ResizeObserver(() => {
                if (worldGlobe) {
                    worldGlobe.width(container.clientWidth);
                    worldGlobe.height(container.clientHeight);
                }
            });
            resizeObserver.observe(container);
        }

        // Modal
        btnHelp.addEventListener('click', () => helpModal.classList.add('active'));
        btnCloseHelp.addEventListener('click', () => helpModal.classList.remove('active'));

        // Init
        initGlobe();
        setupDynamicResize();
        fetchGeoJsonDataset();

        inputEl.addEventListener('input', handleAutocomplete);
        btnGuess.addEventListener('click', submitGuess);
        inputEl.addEventListener('keydown', e => {
            const isSuggestionsVisible = suggestionsEl.style.display === 'block' && currentMatches.length > 0;
            if (e.key === 'Tab' && isSuggestionsVisible) {
                e.preventDefault();
                const idx = suggestionActiveIndex >= 0 ? suggestionActiveIndex : 0;
                selectCountrySuggestion(currentMatches[idx]);
            } else if (e.key === 'ArrowDown' && isSuggestionsVisible) {
                e.preventDefault();
                suggestionActiveIndex = (suggestionActiveIndex + 1) % currentMatches.length;
                updateActiveSuggestion();
            } else if (e.key === 'ArrowUp' && isSuggestionsVisible) {
                e.preventDefault();
                suggestionActiveIndex = (suggestionActiveIndex - 1 + currentMatches.length) % currentMatches.length;
                updateActiveSuggestion();
            } else if (e.key === 'Enter') {
                if (isSuggestionsVisible && suggestionActiveIndex >= 0) {
                    e.preventDefault();
                    selectCountrySuggestion(currentMatches[suggestionActiveIndex]);
                } else {
                    submitGuess();
                }
            }
        });
   