/* ============================================================
   ATELIER NO.5 · GAME SHELL — shared behaviour
   Wallpaper toggle: flat charcoal by default, opt-in per-game
   wallpaper, preference persisted in localStorage.
   Loaded before each game's own script.
   ============================================================ */
(function () {
    var KEY = 'atelier_wallpaper';

    function apply(on) {
        document.body.classList.toggle('wallpaper-on', on);
        var btn = document.getElementById('btn-wallpaper');
        if (!btn) return;
        btn.classList.toggle('active', on);
        btn.title = on ? 'Hide wallpaper' : 'Show wallpaper';
        var icon = btn.querySelector('i');
        if (icon) icon.className = on ? 'fa-solid fa-image' : 'fa-regular fa-image';
    }

    /* Preload the page's wallpaper image so the first toggle
       shows it instantly instead of a blank fade while the
       browser fetches it on demand. */
    function preloadWallpaper() {
        var raw = '';
        try {
            raw = getComputedStyle(document.documentElement).getPropertyValue('--wallpaper') || '';
        } catch (e) { return; }
        var match = raw.match(/url\(\s*['"]?([^'"]+?)['"]?\s*\)/i);
        if (match && match[1]) {
            var img = new Image();
            img.src = match[1].trim();
        }
    }

    function init() {
        preloadWallpaper();

        var on = false;
        try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
        apply(on);

        var btn = document.getElementById('btn-wallpaper');
        if (!btn) {
            return;
        }
        btn.addEventListener('click', function () {
            on = !document.body.classList.contains('wallpaper-on');
            try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
            apply(on);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
