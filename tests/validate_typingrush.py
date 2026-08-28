# Validation for the Typing Rush feature (no Node required).
# 1) JSON data is valid & structured correctly
# 2) JS has balanced brackets/braces/parens (with comments+strings stripped)
# 3) Every element id referenced in JS exists in the HTML
# 4) Serves the site locally and confirms 200s for the new files
import http.server
import json
import re
import socketserver
import threading
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
failures = []


def check(name, cond, detail=''):
    if cond:
        print(f'  PASS  {name}')
    else:
        failures.append((name, detail))
        print(f'  FAIL  {name}  ->  {detail}')


print('=== 1. Data file ===')
data = json.load(open(ROOT / 'data' / 'typingrush_words.json', encoding='utf-8'))
check('meta present', 'meta' in data and 'tiers' in data)
tiers = data['tiers']
check('12 tiers', len(tiers) == 12)
for i, tier in enumerate(tiers, 1):
    all_upper = all(isinstance(w, str) and w.isalpha() and w.isupper() for w in tier)
    check(f'tier {i} non-empty uppercase words', len(tier) > 50 and all_upper)
    if len(tier) < 50:
        break

print('=== 2. JS syntax heuristic ===')
js = (ROOT / 'wordGames' / 'typingrush.js').read_text(encoding='utf-8')
# strip comments and string literals
cleaned = []
i = 0
while i < len(js):
    c = js[i]
    if c == '/' and i + 1 < len(js) and js[i + 1] == '/':
        i = js.find('\n', i)
        if i < 0:
            break
        continue
    if c == '/' and i + 1 < len(js) and js[i + 1] == '*':
        end = js.find('*/', i + 2)
        i = len(js) if end < 0 else end + 2
        continue
    if c in ('"', "'"):
        quote = c
        i += 1
        while i < len(js):
            if js[i] == '\\':
                i += 2
                continue
            if js[i] == quote:
                break
            i += 1
        continue
    cleaned.append(c)
    i += 1

stack = []
pairs = {')': '(', ']': '[', '}': '{'}
ok = True
for c in cleaned:
    if c in '([{':
        stack.append(c)
    elif c in ')]}':
        if not stack or stack[-1] != pairs[c]:
            ok = False
            break
        stack.pop()
check('balanced brackets/parens/braces', ok and not stack,
      f'unbalanced around char idx={max(0, i - 40)}' if (not ok or stack) else '')

print('=== 3. HTML ids referenced by JS ===')
html = (ROOT / 'wordGames' / 'typingrush.html').read_text(encoding='utf-8')
js_ids = set(re.findall(r"getElementById\('([^']+)'\)", js))
missing = [i for i in sorted(js_ids) if f'id="{i}"' not in html]
check('all getElementById ids exist in HTML', not missing, str(missing))

print('=== 4. Local serve smoke test ===')
PORT = 8931


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


handler = lambda *a, **kw: QuietHandler(*a, directory=str(ROOT), **kw)
with Server(('127.0.0.1', PORT), handler) as httpd:
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    for path in ['/wordGames/typingrush.html',
                 '/wordGames/typingrush.js',
                 '/data/typingrush_words.json',
                 '/index.html']:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}{path}', timeout=10) as r:
                body = r.read().decode('utf-8', 'replace')
                check(f'GET {path} -> {r.status}', r.status == 200)
        except Exception as e:
            check(f'GET {path}', False, str(e))
    httpd.shutdown()

print('=== 5. Hub references data file exists ===')
check('index.html mentions typingrush', 'wordGames/typingrush.html' in
      (ROOT / 'index.html').read_text(encoding='utf-8'))
check('index.html leaderboard has key', 'typingrush_highscore' in
      (ROOT / 'index.html').read_text(encoding='utf-8'))

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED')
    raise SystemExit(1)
print('ALL CHECKS PASSED')