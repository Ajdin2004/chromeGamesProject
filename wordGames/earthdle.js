// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    guess() {
        if (!audioCtx || !settings.sound) return;
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
        if (!audioCtx || !settings.sound) return;
        const now = audioCtx.currentTime;
        const notes = [523, 659, 783, 1046];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.15, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.3);
        });
    },
    lose() {
        if (!audioCtx || !settings.sound) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.5);
    },
    hint() {
        if (!audioCtx || !settings.sound) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.15);
    },
    achievement() {
        if (!audioCtx || !settings.sound) return;
        const now = audioCtx.currentTime;
        [660, 880, 1320].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.12, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.2);
        });
    }
};

// --- Settings ---
const DEFAULT_SETTINGS = { sound: true, rotate: true, theme: 'dark' };
let settings = { ...DEFAULT_SETTINGS };
function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('earthdle_settings'));
        if (saved) settings = { ...DEFAULT_SETTINGS, ...saved };
    } catch (e) {}
}
function saveSettings() {
    localStorage.setItem('earthdle_settings', JSON.stringify(settings));
}

// --- Stats ---
const STATS_KEY = 'earthdle_stats';
let stats = { played: 0, wins: 0, currentStreak: 0, bestStreak: 0, distribution: [0,0,0,0,0,0] };
function loadStats() {
    try {
        const saved = JSON.parse(localStorage.getItem(STATS_KEY));
        if (saved) stats = { ...stats, ...saved };
    } catch (e) {}
}
function saveStats() {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
function recordGame(won, guessesUsed) {
    stats.played++;
    if (won) {
        stats.wins++;
        stats.currentStreak++;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        stats.distribution[Math.min(guessesUsed - 1, 5)]++;
    } else {
        stats.currentStreak = 0;
    }
    saveStats();
    checkAchievements(won, guessesUsed);
}

// --- Achievements ---
const ACHIEVEMENTS_KEY = 'earthdle_achievements';
let achievements = {};
function loadAchievements() {
    try {
        achievements = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || {};
    } catch (e) { achievements = {}; }
}
function saveAchievements() {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievements));
}
function unlockAchievement(id, name) {
    if (achievements[id]) return;
    achievements[id] = true;
    saveAchievements();
    toastEl.textContent = `🏆 Achievement Unlocked: ${name}!`;
    Sound.achievement();
}
function checkAchievements(won, guessesUsed) {
    if (won && stats.wins === 1) unlockAchievement('first_win', 'First Win');
    if (won && guessesUsed === 1) unlockAchievement('sharpshooter', 'Sharpshooter');
    if (won && guessesUsed === 6) unlockAchievement('comeback', 'Comeback');
    if (stats.wins >= 10) unlockAchievement('globe_trotter', 'Globe Trotter');
    if (stats.played >= 30) unlockAchievement('explorer', 'Explorer');
}

// --- Country Facts Dataset (embedded, offline-friendly) ---
const COUNTRY_FACTS = {
    'Afghanistan': { flag: '🇦🇫', capital: 'Kabul', population: '38.9M', area: '652,230 km²', continent: 'Asia' },
    'Albania': { flag: '🇦🇱', capital: 'Tirana', population: '2.8M', area: '28,748 km²', continent: 'Europe' },
    'Algeria': { flag: '🇩🇿', capital: 'Algiers', population: '43.9M', area: '2,381,741 km²', continent: 'Africa' },
    'Angola': { flag: '🇦🇴', capital: 'Luanda', population: '32.9M', area: '1,246,700 km²', continent: 'Africa' },
    'Argentina': { flag: '🇦🇷', capital: 'Buenos Aires', population: '45.2M', area: '2,780,400 km²', continent: 'South America' },
    'Armenia': { flag: '🇦🇲', capital: 'Yerevan', population: '3.0M', area: '29,743 km²', continent: 'Asia' },
    'Australia': { flag: '🇦🇺', capital: 'Canberra', population: '25.7M', area: '7,692,024 km²', continent: 'Oceania' },
    'Austria': { flag: '🇦🇹', capital: 'Vienna', population: '9.0M', area: '83,871 km²', continent: 'Europe' },
    'Azerbaijan': { flag: '🇦🇿', capital: 'Baku', population: '10.1M', area: '86,600 km²', continent: 'Asia' },
    'Bahamas': { flag: '🇧🇸', capital: 'Nassau', population: '0.4M', area: '13,943 km²', continent: 'North America' },
    'Bahrain': { flag: '🇧🇭', capital: 'Manama', population: '1.7M', area: '765 km²', continent: 'Asia' },
    'Bangladesh': { flag: '🇧🇩', capital: 'Dhaka', population: '164.7M', area: '147,570 km²', continent: 'Asia' },
    'Belarus': { flag: '🇧🇾', capital: 'Minsk', population: '9.4M', area: '207,600 km²', continent: 'Europe' },
    'Belgium': { flag: '🇧🇪', capital: 'Brussels', population: '11.6M', area: '30,528 km²', continent: 'Europe' },
    'Belize': { flag: '🇧🇿', capital: 'Belmopan', population: '0.4M', area: '22,966 km²', continent: 'North America' },
    'Benin': { flag: '🇧🇯', capital: 'Porto-Novo', population: '12.1M', area: '112,622 km²', continent: 'Africa' },
    'Bhutan': { flag: '🇧🇹', capital: 'Thimphu', population: '0.8M', area: '38,394 km²', continent: 'Asia' },
    'Bolivia': { flag: '🇧🇴', capital: 'Sucre', population: '11.7M', area: '1,098,581 km²', continent: 'South America' },
    'Bosnia and Herzegovina': { flag: '🇧🇦', capital: 'Sarajevo', population: '3.3M', area: '51,197 km²', continent: 'Europe' },
    'Botswana': { flag: '🇧🇼', capital: 'Gaborone', population: '2.4M', area: '581,730 km²', continent: 'Africa' },
    'Brazil': { flag: '🇧🇷', capital: 'Brasília', population: '212.6M', area: '8,515,767 km²', continent: 'South America' },
    'Brunei': { flag: '🇧🇳', capital: 'Bandar Seri Begawan', population: '0.4M', area: '5,765 km²', continent: 'Asia' },
    'Bulgaria': { flag: '🇧🇬', capital: 'Sofia', population: '6.9M', area: '110,879 km²', continent: 'Europe' },
    'Burkina Faso': { flag: '🇧🇫', capital: 'Ouagadougou', population: '20.9M', area: '274,200 km²', continent: 'Africa' },
    'Burundi': { flag: '🇧🇮', capital: 'Gitega', population: '11.9M', area: '27,834 km²', continent: 'Africa' },
    'Cambodia': { flag: '🇰🇭', capital: 'Phnom Penh', population: '16.7M', area: '181,035 km²', continent: 'Asia' },
    'Cameroon': { flag: '🇨🇲', capital: 'Yaoundé', population: '26.5M', area: '475,442 km²', continent: 'Africa' },
    'Canada': { flag: '🇨🇦', capital: 'Ottawa', population: '37.7M', area: '9,984,670 km²', continent: 'North America' },
    'Central African Republic': { flag: '🇨🇫', capital: 'Bangui', population: '4.8M', area: '622,984 km²', continent: 'Africa' },
    'Chad': { flag: '🇹🇩', capital: "N'Djamena", population: '16.4M', area: '1,284,000 km²', continent: 'Africa' },
    'Chile': { flag: '🇨🇱', capital: 'Santiago', population: '19.1M', area: '756,102 km²', continent: 'South America' },
    'China': { flag: '🇨🇳', capital: 'Beijing', population: '1.4B', area: '9,596,961 km²', continent: 'Asia' },
    'Colombia': { flag: '🇨🇴', capital: 'Bogotá', population: '50.9M', area: '1,141,748 km²', continent: 'South America' },
    'Congo': { flag: '🇨🇬', capital: 'Brazzaville', population: '5.5M', area: '342,000 km²', continent: 'Africa' },
    'Costa Rica': { flag: '🇨🇷', capital: 'San José', population: '5.1M', area: '51,100 km²', continent: 'North America' },
    'Croatia': { flag: '🇭🇷', capital: 'Zagreb', population: '4.1M', area: '56,594 km²', continent: 'Europe' },
    'Cuba': { flag: '🇨🇺', capital: 'Havana', population: '11.3M', area: '109,884 km²', continent: 'North America' },
    'Cyprus': { flag: '🇨🇾', capital: 'Nicosia', population: '1.2M', area: '9,251 km²', continent: 'Europe' },
    'Czech Republic': { flag: '🇨🇿', capital: 'Prague', population: '10.7M', area: '78,865 km²', continent: 'Europe' },
    'Denmark': { flag: '🇩🇰', capital: 'Copenhagen', population: '5.8M', area: '43,094 km²', continent: 'Europe' },
    'Djibouti': { flag: '🇩🇯', capital: 'Djibouti', population: '1.0M', area: '23,200 km²', continent: 'Africa' },
    'Dominican Republic': { flag: '🇩🇴', capital: 'Santo Domingo', population: '10.8M', area: '48,671 km²', continent: 'North America' },
    'Ecuador': { flag: '🇪🇨', capital: 'Quito', population: '17.6M', area: '283,561 km²', continent: 'South America' },
    'Egypt': { flag: '🇪🇬', capital: 'Cairo', population: '102.3M', area: '1,001,450 km²', continent: 'Africa' },
    'El Salvador': { flag: '🇸🇻', capital: 'San Salvador', population: '6.5M', area: '21,041 km²', continent: 'North America' },
    'Estonia': { flag: '🇪🇪', capital: 'Tallinn', population: '1.3M', area: '45,228 km²', continent: 'Europe' },
    'Eswatini': { flag: '🇸🇿', capital: 'Mbabane', population: '1.2M', area: '17,364 km²', continent: 'Africa' },
    'Ethiopia': { flag: '🇪🇹', capital: 'Addis Ababa', population: '114.9M', area: '1,104,300 km²', continent: 'Africa' },
    'Fiji': { flag: '🇫🇯', capital: 'Suva', population: '0.9M', area: '18,274 km²', continent: 'Oceania' },
    'Finland': { flag: '🇫🇮', capital: 'Helsinki', population: '5.5M', area: '338,424 km²', continent: 'Europe' },
    'France': { flag: '🇫🇷', capital: 'Paris', population: '67.4M', area: '643,801 km²', continent: 'Europe' },
    'Gabon': { flag: '🇬🇦', capital: 'Libreville', population: '2.2M', area: '267,668 km²', continent: 'Africa' },
    'Gambia': { flag: '🇬🇲', capital: 'Banjul', population: '2.4M', area: '11,295 km²', continent: 'Africa' },
    'Georgia': { flag: '🇬🇪', capital: 'Tbilisi', population: '4.0M', area: '69,700 km²', continent: 'Asia' },
    'Germany': { flag: '🇩🇪', capital: 'Berlin', population: '83.2M', area: '357,022 km²', continent: 'Europe' },
    'Ghana': { flag: '🇬🇭', capital: 'Accra', population: '31.1M', area: '238,533 km²', continent: 'Africa' },
    'Greece': { flag: '🇬🇷', capital: 'Athens', population: '10.4M', area: '131,957 km²', continent: 'Europe' },
    'Guatemala': { flag: '🇬🇹', capital: 'Guatemala City', population: '17.9M', area: '108,889 km²', continent: 'North America' },
    'Guinea': { flag: '🇬🇳', capital: 'Conakry', population: '13.1M', area: '245,857 km²', continent: 'Africa' },
    'Guyana': { flag: '🇬🇾', capital: 'Georgetown', population: '0.8M', area: '214,969 km²', continent: 'South America' },
    'Haiti': { flag: '🇭🇹', capital: 'Port-au-Prince', population: '11.4M', area: '27,750 km²', continent: 'North America' },
    'Honduras': { flag: '🇭🇳', capital: 'Tegucigalpa', population: '9.9M', area: '112,492 km²', continent: 'North America' },
    'Hungary': { flag: '🇭🇺', capital: 'Budapest', population: '9.7M', area: '93,028 km²', continent: 'Europe' },
    'Iceland': { flag: '🇮🇸', capital: 'Reykjavík', population: '0.4M', area: '103,000 km²', continent: 'Europe' },
    'India': { flag: '🇮🇳', capital: 'New Delhi', population: '1.4B', area: '3,287,263 km²', continent: 'Asia' },
    'Indonesia': { flag: '🇮🇩', capital: 'Jakarta', population: '273.5M', area: '1,904,569 km²', continent: 'Asia' },
    'Iran': { flag: '🇮🇷', capital: 'Tehran', population: '83.9M', area: '1,648,195 km²', continent: 'Asia' },
    'Iraq': { flag: '🇮🇶', capital: 'Baghdad', population: '40.2M', area: '438,317 km²', continent: 'Asia' },
    'Ireland': { flag: '🇮🇪', capital: 'Dublin', population: '4.9M', area: '70,273 km²', continent: 'Europe' },
    'Israel': { flag: '🇮🇱', capital: 'Jerusalem', population: '9.2M', area: '20,770 km²', continent: 'Asia' },
    'Italy': { flag: '🇮🇹', capital: 'Rome', population: '60.4M', area: '301,340 km²', continent: 'Europe' },
    'Jamaica': { flag: '🇯🇲', capital: 'Kingston', population: '2.9M', area: '10,991 km²', continent: 'North America' },
    'Japan': { flag: '🇯🇵', capital: 'Tokyo', population: '125.8M', area: '377,930 km²', continent: 'Asia' },
    'Jordan': { flag: '🇯🇴', capital: 'Amman', population: '10.2M', area: '89,342 km²', continent: 'Asia' },
    'Kazakhstan': { flag: '🇰🇿', capital: 'Nur-Sultan', population: '18.8M', area: '2,724,900 km²', continent: 'Asia' },
    'Kenya': { flag: '🇰🇪', capital: 'Nairobi', population: '53.8M', area: '580,367 km²', continent: 'Africa' },
    'Kuwait': { flag: '🇰🇼', capital: 'Kuwait City', population: '4.3M', area: '17,818 km²', continent: 'Asia' },
    'Kyrgyzstan': { flag: '🇰🇬', capital: 'Bishkek', population: '6.5M', area: '199,951 km²', continent: 'Asia' },
    'Laos': { flag: '🇱🇦', capital: 'Vientiane', population: '7.3M', area: '236,800 km²', continent: 'Asia' },
    'Latvia': { flag: '🇱🇻', capital: 'Riga', population: '1.9M', area: '64,589 km²', continent: 'Europe' },
    'Lebanon': { flag: '🇱🇧', capital: 'Beirut', population: '6.8M', area: '10,400 km²', continent: 'Asia' },
    'Lesotho': { flag: '🇱🇸', capital: 'Maseru', population: '2.1M', area: '30,355 km²', continent: 'Africa' },
    'Liberia': { flag: '🇱🇷', capital: 'Monrovia', population: '5.1M', area: '111,369 km²', continent: 'Africa' },
    'Libya': { flag: '🇱🇾', capital: 'Tripoli', population: '6.9M', area: '1,759,540 km²', continent: 'Africa' },
    'Lithuania': { flag: '🇱🇹', capital: 'Vilnius', population: '2.8M', area: '65,300 km²', continent: 'Europe' },
    'Luxembourg': { flag: '🇱🇺', capital: 'Luxembourg', population: '0.6M', area: '2,586 km²', continent: 'Europe' },
    'Madagascar': { flag: '🇲🇬', capital: 'Antananarivo', population: '27.7M', area: '587,041 km²', continent: 'Africa' },
    'Malawi': { flag: '🇲🇼', capital: 'Lilongwe', population: '19.1M', area: '118,484 km²', continent: 'Africa' },
    'Malaysia': { flag: '🇲🇾', capital: 'Kuala Lumpur', population: '32.4M', area: '330,803 km²', continent: 'Asia' },
    'Mali': { flag: '🇲🇱', capital: 'Bamako', population: '20.3M', area: '1,240,192 km²', continent: 'Africa' },
    'Mauritania': { flag: '🇲🇷', capital: 'Nouakchott', population: '4.6M', area: '1,030,700 km²', continent: 'Africa' },
    'Mexico': { flag: '🇲🇽', capital: 'Mexico City', population: '128.9M', area: '1,964,375 km²', continent: 'North America' },
    'Moldova': { flag: '🇲🇩', capital: 'Chișinău', population: '4.0M', area: '33,846 km²', continent: 'Europe' },
    'Mongolia': { flag: '🇲🇳', capital: 'Ulaanbaatar', population: '3.3M', area: '1,564,110 km²', continent: 'Asia' },
    'Montenegro': { flag: '🇲🇪', capital: 'Podgorica', population: '0.6M', area: '13,812 km²', continent: 'Europe' },
    'Morocco': { flag: '🇲🇦', capital: 'Rabat', population: '36.9M', area: '446,550 km²', continent: 'Africa' },
    'Mozambique': { flag: '🇲🇿', capital: 'Maputo', population: '31.3M', area: '801,590 km²', continent: 'Africa' },
    'Myanmar': { flag: '🇲🇲', capital: 'Naypyidaw', population: '54.4M', area: '676,578 km²', continent: 'Asia' },
    'Namibia': { flag: '🇳🇦', capital: 'Windhoek', population: '2.5M', area: '825,615 km²', continent: 'Africa' },
    'Nepal': { flag: '🇳🇵', capital: 'Kathmandu', population: '29.1M', area: '147,181 km²', continent: 'Asia' },
    'Netherlands': { flag: '🇳🇱', capital: 'Amsterdam', population: '17.1M', area: '41,850 km²', continent: 'Europe' },
    'New Zealand': { flag: '🇳🇿', capital: 'Wellington', population: '4.8M', area: '268,838 km²', continent: 'Oceania' },
    'Nicaragua': { flag: '🇳🇮', capital: 'Managua', population: '6.6M', area: '130,373 km²', continent: 'North America' },
    'Niger': { flag: '🇳🇪', capital: 'Niamey', population: '24.2M', area: '1,267,000 km²', continent: 'Africa' },
    'Nigeria': { flag: '🇳🇬', capital: 'Abuja', population: '206.1M', area: '923,768 km²', continent: 'Africa' },
    'North Korea': { flag: '🇰🇵', capital: 'Pyongyang', population: '25.8M', area: '120,538 km²', continent: 'Asia' },
    'North Macedonia': { flag: '🇲🇰', capital: 'Skopje', population: '2.1M', area: '25,713 km²', continent: 'Europe' },
    'Norway': { flag: '🇳🇴', capital: 'Oslo', population: '5.4M', area: '323,802 km²', continent: 'Europe' },
    'Oman': { flag: '🇴🇲', capital: 'Muscat', population: '5.1M', area: '309,500 km²', continent: 'Asia' },
    'Pakistan': { flag: '🇵🇰', capital: 'Islamabad', population: '220.9M', area: '881,913 km²', continent: 'Asia' },
    'Panama': { flag: '🇵🇦', capital: 'Panama City', population: '4.3M', area: '75,417 km²', continent: 'North America' },
    'Papua New Guinea': { flag: '🇵🇬', capital: 'Port Moresby', population: '8.9M', area: '462,840 km²', continent: 'Oceania' },
    'Paraguay': { flag: '🇵🇾', capital: 'Asunción', population: '7.1M', area: '406,752 km²', continent: 'South America' },
    'Peru': { flag: '🇵🇪', capital: 'Lima', population: '33.0M', area: '1,285,216 km²', continent: 'South America' },
    'Philippines': { flag: '🇵🇭', capital: 'Manila', population: '109.6M', area: '300,000 km²', continent: 'Asia' },
    'Poland': { flag: '🇵🇱', capital: 'Warsaw', population: '37.8M', area: '312,696 km²', continent: 'Europe' },
    'Portugal': { flag: '🇵🇹', capital: 'Lisbon', population: '10.2M', area: '92,090 km²', continent: 'Europe' },
    'Qatar': { flag: '🇶🇦', capital: 'Doha', population: '2.9M', area: '11,586 km²', continent: 'Asia' },
    'Romania': { flag: '🇷🇴', capital: 'Bucharest', population: '19.2M', area: '238,391 km²', continent: 'Europe' },
    'Russia': { flag: '🇷🇺', capital: 'Moscow', population: '145.9M', area: '17,098,242 km²', continent: 'Europe/Asia' },
    'Rwanda': { flag: '🇷🇼', capital: 'Kigali', population: '12.9M', area: '26,338 km²', continent: 'Africa' },
    'Saudi Arabia': { flag: '🇸🇦', capital: 'Riyadh', population: '34.8M', area: '2,149,690 km²', continent: 'Asia' },
    'Senegal': { flag: '🇸🇳', capital: 'Dakar', population: '16.7M', area: '196,722 km²', continent: 'Africa' },
    'Serbia': { flag: '🇷🇸', capital: 'Belgrade', population: '8.7M', area: '88,361 km²', continent: 'Europe' },
    'Sierra Leone': { flag: '🇸🇱', capital: 'Freetown', population: '8.0M', area: '71,740 km²', continent: 'Africa' },
    'Singapore': { flag: '🇸🇬', capital: 'Singapore', population: '5.9M', area: '728 km²', continent: 'Asia' },
    'Slovakia': { flag: '🇸🇰', capital: 'Bratislava', population: '5.5M', area: '49,035 km²', continent: 'Europe' },
    'Slovenia': { flag: '🇸🇮', capital: 'Ljubljana', population: '2.1M', area: '20,273 km²', continent: 'Europe' },
    'Somalia': { flag: '🇸🇴', capital: 'Mogadishu', population: '15.9M', area: '637,657 km²', continent: 'Africa' },
    'South Africa': { flag: '🇿🇦', capital: 'Pretoria', population: '59.3M', area: '1,221,037 km²', continent: 'Africa' },
    'South Korea': { flag: '🇰🇷', capital: 'Seoul', population: '51.8M', area: '100,210 km²', continent: 'Asia' },
    'South Sudan': { flag: '🇸🇸', capital: 'Juba', population: '11.2M', area: '644,329 km²', continent: 'Africa' },
    'Spain': { flag: '🇪🇸', capital: 'Madrid', population: '46.8M', area: '505,990 km²', continent: 'Europe' },
    'Sri Lanka': { flag: '🇱🇰', capital: 'Colombo', population: '21.4M', area: '65,610 km²', continent: 'Asia' },
    'Sudan': { flag: '🇸🇩', capital: 'Khartoum', population: '43.8M', area: '1,861,484 km²', continent: 'Africa' },
    'Suriname': { flag: '🇸🇷', capital: 'Paramaribo', population: '0.6M', area: '163,821 km²', continent: 'South America' },
    'Sweden': { flag: '🇸🇪', capital: 'Stockholm', population: '10.4M', area: '450,295 km²', continent: 'Europe' },
    'Switzerland': { flag: '🇨🇭', capital: 'Bern', population: '8.6M', area: '41,285 km²', continent: 'Europe' },
    'Syria': { flag: '🇸🇾', capital: 'Damascus', population: '17.5M', area: '185,180 km²', continent: 'Asia' },
    'Taiwan': { flag: '🇹🇼', capital: 'Taipei', population: '23.8M', area: '36,193 km²', continent: 'Asia' },
    'Tajikistan': { flag: '🇹🇯', capital: 'Dushanbe', population: '9.5M', area: '143,100 km²', continent: 'Asia' },
    'Tanzania': { flag: '🇹🇿', capital: 'Dodoma', population: '59.7M', area: '947,300 km²', continent: 'Africa' },
    'Thailand': { flag: '🇹🇭', capital: 'Bangkok', population: '69.8M', area: '513,120 km²', continent: 'Asia' },
    'Togo': { flag: '🇹🇬', capital: 'Lomé', population: '8.3M', area: '56,785 km²', continent: 'Africa' },
    'Trinidad and Tobago': { flag: '🇹🇹', capital: 'Port of Spain', population: '1.4M', area: '5,130 km²', continent: 'North America' },
    'Tunisia': { flag: '🇹🇳', capital: 'Tunis', population: '11.8M', area: '163,610 km²', continent: 'Africa' },
    'Turkey': { flag: '🇹🇷', capital: 'Ankara', population: '84.3M', area: '783,356 km²', continent: 'Europe/Asia' },
    'Turkmenistan': { flag: '🇹🇲', capital: 'Ashgabat', population: '6.0M', area: '488,100 km²', continent: 'Asia' },
    'Uganda': { flag: '🇺🇬', capital: 'Kampala', population: '45.7M', area: '241,550 km²', continent: 'Africa' },
    'Ukraine': { flag: '🇺🇦', capital: 'Kyiv', population: '43.7M', area: '603,550 km²', continent: 'Europe' },
    'United Arab Emirates': { flag: '🇦🇪', capital: 'Abu Dhabi', population: '9.9M', area: '83,600 km²', continent: 'Asia' },
    'United Kingdom': { flag: '🇬🇧', capital: 'London', population: '67.9M', area: '243,610 km²', continent: 'Europe' },
    'United States': { flag: '🇺🇸', capital: 'Washington, D.C.', population: '331.4M', area: '9,833,517 km²', continent: 'North America' },
    'Uruguay': { flag: '🇺🇾', capital: 'Montevideo', population: '3.5M', area: '176,215 km²', continent: 'South America' },
    'Uzbekistan': { flag: '🇺🇿', capital: 'Tashkent', population: '33.5M', area: '447,400 km²', continent: 'Asia' },
    'Venezuela': { flag: '🇻🇪', capital: 'Caracas', population: '28.4M', area: '916,445 km²', continent: 'South America' },
    'Vietnam': { flag: '🇻🇳', capital: 'Hanoi', population: '97.3M', area: '331,212 km²', continent: 'Asia' },
    'Yemen': { flag: '🇾🇪', capital: "Sana'a", population: '29.8M', area: '527,968 km²', continent: 'Asia' },
    'Zambia': { flag: '🇿🇲', capital: 'Lusaka', population: '18.4M', area: '752,612 km²', continent: 'Africa' },
    'Zimbabwe': { flag: '🇿🇼', capital: 'Harare', population: '14.9M', area: '390,757 km²', continent: 'Africa' }
};

// --- Global State ---
let worldGlobe;
let geoJsonFeatures = [];
let COUNTRIES = [];
let TARGET_COUNTRY = null;
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const MAX_GUESSES = 6;
let guessesHistory = [];
let gameOver = false;
let hintsUsed = 0;
let currentMode = 'daily';
let currentDifficulty = 'normal';
let endlessRound = 1;
let endlessWins = 0;
let endlessStreak = 0;
let endlessUsedCountries = new Set();
let shareText = '';

// --- DOM ---
const inputEl = document.getElementById('country-input');
const btnGuess = document.getElementById('btn-guess');
const suggestionsEl = document.getElementById('suggestions');
const guessesContainer = document.getElementById('guesses-container');
const toastEl = document.getElementById('toast');
const helpModal = document.getElementById('help-modal');
const btnHelp = document.getElementById('btn-help');
const btnCloseHelp = document.getElementById('btn-close-help');
const btnHint = document.getElementById('btn-hint');
const hintCountEl = document.getElementById('hint-count');
const hintDisplayEl = document.getElementById('hint-display');
const btnStats = document.getElementById('btn-stats');
const statsModal = document.getElementById('stats-modal');
const btnCloseStats = document.getElementById('btn-close-stats');
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnResetStats = document.getElementById('btn-reset-stats');
const settingSound = document.getElementById('setting-sound');
const settingRotate = document.getElementById('setting-rotate');
const settingTheme = document.getElementById('setting-theme');
const btnShare = document.getElementById('btn-share');
const btnFacts = document.getElementById('btn-facts');
const btnNextRound = document.getElementById('btn-next-round');
const factsModal = document.getElementById('facts-modal');
const factsTitle = document.getElementById('facts-title');
const factsContent = document.getElementById('facts-content');
const btnCloseFacts = document.getElementById('btn-close-facts');
const gameTitle = document.getElementById('game-title');
const endlessScoreEl = document.getElementById('endless-score');
const endlessRoundNum = document.getElementById('endless-round-num');
const endlessWinsNum = document.getElementById('endless-wins-num');
const endlessStreakNum = document.getElementById('endless-streak-num');
const confettiCanvas = document.getElementById('confetti-canvas');
let currentMatches = [];
let suggestionActiveIndex = -1;

// --- Init Globe with stars ---
function initGlobe() {
    const container = document.getElementById('globe-container');

    worldGlobe = Globe()
        (container)
        .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
        .backgroundColor('rgba(0,0,0,0)')
        .globeImageUrl(getGlobeTexture())
        .polygonSideColor(() => 'rgba(0, 242, 254, 0.15)')
        .polygonStrokeColor(() => '#00f2fe')
        .polygonCapColor(d => d.properties.customColor || 'rgba(15, 23, 42, 0.6)')
        .polygonAltitude(d => d.properties.customAltitude || 0.01);

    if (typeof worldGlobe.stars === 'function') {
        worldGlobe.stars(true);
    }

    worldGlobe.controls().autoRotate = settings.rotate;
    worldGlobe.controls().autoRotateSpeed = 0.6;
}

function getGlobeTexture() {
    switch (settings.theme) {
        case 'satellite':
        case 'blue':
            return 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
        default:
            return 'https://unpkg.com/three-globe/example/img/earth-dark.jpg';
    }
}

function applyGlobeTheme() {
    if (!worldGlobe) return;
    worldGlobe.globeImageUrl(getGlobeTexture());
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

        setupDailyTarget();
        toastEl.textContent = "Guess today's mystery country!";
        restoreProgress();
    } catch (err) {
        toastEl.textContent = "Error loading 3D map data.";
    }
}

function setupDailyTarget() {
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    TARGET_COUNTRY = COUNTRIES[seed % COUNTRIES.length];
}

function setupEndlessTarget() {
    const available = COUNTRIES.filter(c => !endlessUsedCountries.has(c.name));
    if (available.length === 0) {
        endlessUsedCountries.clear();
        TARGET_COUNTRY = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    } else {
        TARGET_COUNTRY = available[Math.floor(Math.random() * available.length)];
    }
    endlessUsedCountries.add(TARGET_COUNTRY.name);
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

function getProximity(dist) {
    return Math.max(0, Math.round(100 - (dist / 20000) * 100));
}

function getProximityColor(dist) {
    const prox = getProximity(dist);
    if (prox >= 90) return '#22c55e';
    if (prox >= 70) return '#84cc16';
    if (prox >= 50) return '#eab308';
    if (prox >= 30) return '#f97316';
    return '#ef4444';
}

function getContinent(countryName) {
    const facts = COUNTRY_FACTS[countryName];
    if (facts) return facts.continent;
    const c = COUNTRIES.find(x => x.name === countryName);
    if (!c) return 'Unknown';
    if (c.lat > 0 && c.lon > -30 && c.lon < 60) return 'Europe';
    if (c.lat < 0 && c.lon > -30 && c.lon < 60) return 'Africa';
    if (c.lon > 60 && c.lon < 150) return 'Asia';
    if (c.lon < -30 && c.lon > -170) return 'Americas';
    return 'Oceania';
}

// --- Multi-Guess Globe Visualization ---
function updateAllGuessesOnGlobe() {
    geoJsonFeatures.forEach(f => {
        f.properties.customColor = 'rgba(15, 23, 42, 0.6)';
        f.properties.customAltitude = 0.01;
    });

    guessesHistory.forEach(guess => {
        const country = COUNTRIES.find(c => c.name === guess.name);
        if (!country || !country.feature) return;
        if (guess.isCorrect) {
            country.feature.properties.customColor = 'rgba(34, 197, 94, 0.85)';
            country.feature.properties.customAltitude = 0.05;
        } else {
            country.feature.properties.customColor = getProximityColor(guess.dist);
            country.feature.properties.customAltitude = 0.04;
        }
    });

    if (gameOver && TARGET_COUNTRY) {
        const target = COUNTRIES.find(c => c.name === TARGET_COUNTRY.name);
        if (target && target.feature) {
            target.feature.properties.customColor = 'rgba(34, 197, 94, 0.85)';
            target.feature.properties.customAltitude = 0.06;
        }
    }

    worldGlobe.polygonsData([...geoJsonFeatures]);
}

function highlightCountryOnGlobe(country, isCorrect) {
    if (!country || !country.feature) return;
    country.feature.properties.customColor = isCorrect 
        ? 'rgba(34, 197, 94, 0.85)'
        : getProximityColor(calculateDistanceKM(country.lat, country.lon, TARGET_COUNTRY.lat, TARGET_COUNTRY.lon));
    country.feature.properties.customAltitude = 0.05;
    worldGlobe.polygonsData([...geoJsonFeatures]);
    worldGlobe.controls().autoRotate = false;
    worldGlobe.pointOfView({ lat: country.lat, lng: country.lon, altitude: 1.8 }, 1200);
}

// --- Confetti ---
let confettiParticles = [];
let confettiAnimating = false;

function launchConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    const colors = ['#00f2fe', '#22c55e', '#eab308', '#f97316', '#8b5cf6', '#ef4444', '#ffffff'];
    
    for (let i = 0; i < 150; i++) {
        confettiParticles.push({
            x: Math.random() * confettiCanvas.width,
            y: -20 - Math.random() * confettiCanvas.height * 0.5,
            w: 6 + Math.random() * 8,
            h: 8 + Math.random() * 10,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: 2 + Math.random() * 4,
            vx: -1 + Math.random() * 2,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: -0.1 + Math.random() * 0.2,
            opacity: 0.7 + Math.random() * 0.3
        });
    }
    
    if (!confettiAnimating) {
        confettiAnimating = true;
        animateConfetti();
    }
}

function animateConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    
    confettiParticles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.rotation += p.rotationSpeed;
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    });
    
    confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 20);
    
    if (confettiParticles.length > 0) {
        requestAnimationFrame(animateConfetti);
    } else {
        confettiAnimating = false;
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
}

// --- Autocomplete ---
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

// --- Hints ---
function useHint() {
    if (gameOver || !TARGET_COUNTRY) return;
    if (hintsUsed >= 2) {
        toastEl.textContent = "No hints remaining!";
        return;
    }
    initAudio();
    hintsUsed++;
    hintCountEl.textContent = 2 - hintsUsed;
    Sound.hint();

    if (hintsUsed === 1) {
        const continent = getContinent(TARGET_COUNTRY.name);
        hintDisplayEl.textContent = `💡 Hint 1: The country is in ${continent}`;
    } else if (hintsUsed === 2) {
        const firstLetter = TARGET_COUNTRY.name[0];
        hintDisplayEl.textContent = `💡 Hint 2: The country starts with "${firstLetter}"`;
    }
    if (currentMode === 'daily') saveProgress(false);
}

// --- Share ---
function buildShareText(won) {
    const modeLabel = currentMode === 'daily' ? 'Daily' : 'Endless';
    const diffLabel = currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1);
    const roundNum = currentMode === 'daily' 
        ? Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
        : endlessRound;
    
    let text = `🌍 Earthdle ${modeLabel} #${roundNum} (${diffLabel}) ${won ? guessesHistory.length : 'X'}/6`;
    if (hintsUsed > 0) text += ` 💡${hintsUsed}`;
    text += '\n';
    
    guessesHistory.forEach(guess => {
        if (guess.isCorrect) {
            text += '🟩';
        } else {
            const prox = getProximity(guess.dist);
            if (prox >= 70) text += '🟨';
            else if (prox >= 40) text += '🟧';
            else text += '⬛';
        }
    });
    return text;
}

async function shareResult() {
    try {
        await navigator.clipboard.writeText(shareText);
        toastEl.textContent = "Result copied to clipboard!";
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = shareText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toastEl.textContent = "Result copied to clipboard!";
    }
}

// --- Facts ---
function showFacts(countryName) {
    const facts = COUNTRY_FACTS[countryName];
    if (!facts) {
        factsTitle.textContent = countryName;
        factsContent.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No detailed facts available for this country.</p>';
    } else {
        factsTitle.textContent = `${facts.flag} ${countryName}`;
        factsContent.innerHTML = `
            <div class="fact-flag">${facts.flag}</div>
            <div class="fact-row"><span class="fact-label">Capital</span><span class="fact-value">${facts.capital}</span></div>
            <div class="fact-row"><span class="fact-label">Population</span><span class="fact-value">${facts.population}</span></div>
            <div class="fact-row"><span class="fact-label">Area</span><span class="fact-value">${facts.area}</span></div>
            <div class="fact-row"><span class="fact-label">Continent</span><span class="fact-value">${facts.continent}</span></div>
        `;
    }
    factsModal.classList.add('active');
}

// --- Game Flow ---
function resetGameState() {
    guessesHistory = [];
    gameOver = false;
    hintsUsed = 0;
    hintCountEl.textContent = '2';
    hintDisplayEl.textContent = '';
    guessesContainer.innerHTML = '';
    inputEl.disabled = false;
    btnGuess.disabled = false;
    inputEl.value = '';
    btnShare.style.display = 'none';
    btnFacts.style.display = 'none';
    btnNextRound.style.display = 'none';
    updateAllGuessesOnGlobe();
    worldGlobe.controls().autoRotate = settings.rotate;
    worldGlobe.controls().autoRotateSpeed = 0.6;
}

function startEndlessRound() {
    resetGameState();
    setupEndlessTarget();
    endlessRoundNum.textContent = endlessRound;
    endlessWinsNum.textContent = endlessWins;
    endlessStreakNum.textContent = endlessStreak;
    toastEl.textContent = `Round ${endlessRound}: Guess the mystery country!`;
}

function switchMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });
    
    if (mode === 'daily') {
        gameTitle.textContent = 'Daily 3D Earthdle';
        endlessScoreEl.style.display = 'none';
        resetGameState();
        setupDailyTarget();
        restoreProgress();
    } else {
        gameTitle.textContent = 'Endless Earthdle';
        endlessScoreEl.style.display = 'flex';
        endlessRound = 1;
        endlessWins = 0;
        endlessStreak = 0;
        endlessUsedCountries.clear();
        startEndlessRound();
    }
}

function switchDifficulty(diff) {
    if (diff === currentDifficulty) return;
    currentDifficulty = diff;
    
    document.querySelectorAll('.diff-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.diff === diff);
    });
    
    if (currentMode === 'daily') {
        resetGameState();
        setupDailyTarget();
        restoreProgress();
    } else {
        startEndlessRound();
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
        launchConfetti();
        worldGlobe.controls().autoRotate = true;
        worldGlobe.controls().autoRotateSpeed = 1.5;
        worldGlobe.pointOfView({ lat: TARGET_COUNTRY.lat, lng: TARGET_COUNTRY.lon, altitude: 1.5 }, 1500);
        
        if (currentMode === 'daily') {
            saveProgress(true);
            recordGame(true, guessesHistory.length);
        } else {
            endlessWins++;
            endlessStreak++;
            endlessWinsNum.textContent = endlessWins;
            endlessStreakNum.textContent = endlessStreak;
            recordGame(true, guessesHistory.length);
        }
        
        shareText = buildShareText(true);
        btnShare.style.display = 'block';
        btnFacts.style.display = 'block';
        if (currentMode === 'endless') btnNextRound.style.display = 'block';
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        Sound.lose();
        toastEl.textContent = `Game Over! Country was: ${TARGET_COUNTRY.name}`;
        updateAllGuessesOnGlobe();
        worldGlobe.pointOfView({ lat: TARGET_COUNTRY.lat, lng: TARGET_COUNTRY.lon, altitude: 1.5 }, 1500);
        inputEl.disabled = true;
        btnGuess.disabled = true;
        
        if (currentMode === 'daily') {
            saveProgress(false);
            recordGame(false, 0);
        } else {
            endlessStreak = 0;
            endlessStreakNum.textContent = 0;
            recordGame(false, 0);
        }
        
        shareText = buildShareText(false);
        btnShare.style.display = 'block';
        btnFacts.style.display = 'block';
        if (currentMode === 'endless') btnNextRound.style.display = 'block';
    } else {
        if (currentMode === 'daily') saveProgress(false);
    }
}

function renderRowUI(guess) {
    const row = document.createElement('div');
    row.className = `guess-row ${guess.isCorrect ? 'correct' : ''}`;
    
    let proximityCell = '';
    if (guess.isCorrect) {
        proximityCell = '100%';
    } else if (currentDifficulty === 'hard') {
        proximityCell = '—';
    } else {
        proximityCell = getProximity(guess.dist) + '%';
    }
    
    let directionCell = '';
    if (currentDifficulty === 'hard' && !guess.isCorrect) {
        directionCell = '—';
    } else {
        directionCell = guess.arrow;
    }
    
    row.innerHTML = `
        <span class="country-name">${guess.name}</span>
        <span class="distance">${guess.dist.toLocaleString()} km</span>
        <span class="direction">${directionCell}</span>
        <span>${proximityCell}</span>
    `;
    guessesContainer.appendChild(row);
}

// --- Save / Restore ---
function restoreProgress() {
    if (currentMode !== 'daily') return;
    const saved = JSON.parse(localStorage.getItem(`earthdle_3d_save_${TODAY_DATE_STR}`));
    if (!saved) return;
    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;
    hintsUsed = saved.hintsUsed || 0;
    hintCountEl.textContent = 2 - hintsUsed;
    if (saved.hintText) hintDisplayEl.textContent = saved.hintText;
    
    guessesHistory.forEach(guess => {
        renderRowUI(guess);
    });
    updateAllGuessesOnGlobe();
    
    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        toastEl.textContent = saved.passed ? "Daily Earthdle Solved!" : `Mystery Country was: ${TARGET_COUNTRY.name}`;
        shareText = buildShareText(saved.passed);
        btnShare.style.display = 'block';
        btnFacts.style.display = 'block';
    }
}

function saveProgress(passed) {
    if (currentMode !== 'daily') return;
    localStorage.setItem(`earthdle_3d_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        gameOver: gameOver,
        passed: passed,
        hintsUsed: hintsUsed,
        hintText: hintDisplayEl.textContent
    }));
}

// --- Stats Modal ---
function updateStatsModal() {
    document.getElementById('stat-games').textContent = stats.played;
    document.getElementById('stat-winrate').textContent = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) + '%' : '0%';
    document.getElementById('stat-streak').textContent = stats.currentStreak;
    document.getElementById('stat-best').textContent = stats.bestStreak;
    
    const distEl = document.getElementById('guess-distribution');
    distEl.innerHTML = '';
    const maxCount = Math.max(...stats.distribution, 1);
    stats.distribution.forEach((count, idx) => {
        const row = document.createElement('div');
        row.className = 'dist-row';
        const pct = (count / maxCount) * 100;
        row.innerHTML = `
            <span class="dist-label">${idx + 1}</span>
            <div class="dist-bar"><div class="dist-fill" style="width: ${pct}%"></div></div>
            <span class="dist-count">${count}</span>
        `;
        distEl.appendChild(row);
    });
}

// --- Settings ---
function updateSettingsUI() {
    settingSound.checked = settings.sound;
    settingRotate.checked = settings.rotate;
    settingTheme.value = settings.theme;
}

// --- Resize ---
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

// --- Event Listeners ---
btnHelp.addEventListener('click', () => helpModal.classList.add('active'));
btnCloseHelp.addEventListener('click', () => helpModal.classList.remove('active'));

btnHint.addEventListener('click', useHint);

btnStats.addEventListener('click', () => {
    updateStatsModal();
    statsModal.classList.add('active');
});
btnCloseStats.addEventListener('click', () => statsModal.classList.remove('active'));

btnSettings.addEventListener('click', () => {
    updateSettingsUI();
    settingsModal.classList.add('active');
});
btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

btnResetStats.addEventListener('click', () => {
    if (confirm('Reset all statistics?')) {
        stats = { played: 0, wins: 0, currentStreak: 0, bestStreak: 0, distribution: [0,0,0,0,0,0] };
        saveStats();
        updateStatsModal();
        toastEl.textContent = "Statistics reset!";
    }
});

settingSound.addEventListener('change', () => {
    settings.sound = settingSound.checked;
    saveSettings();
});
settingRotate.addEventListener('change', () => {
    settings.rotate = settingRotate.checked;
    saveSettings();
    if (worldGlobe) worldGlobe.controls().autoRotate = settings.rotate;
});
settingTheme.addEventListener('change', () => {
    settings.theme = settingTheme.value;
    saveSettings();
    applyGlobeTheme();
});

btnShare.addEventListener('click', shareResult);
btnFacts.addEventListener('click', () => showFacts(TARGET_COUNTRY.name));
btnNextRound.addEventListener('click', () => {
    endlessRound++;
    startEndlessRound();
});
btnCloseFacts.addEventListener('click', () => factsModal.classList.remove('active'));

// Mode & Difficulty buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDifficulty(btn.dataset.diff));
});

// --- Init ---
loadSettings();
loadStats();
loadAchievements();
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