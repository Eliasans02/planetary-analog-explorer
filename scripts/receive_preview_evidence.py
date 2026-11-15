"""One-shot loopback form for saving a CUA JPEG screenshot with an exact hash."""
import argparse
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import secrets
from urllib.parse import parse_qs

parser = argparse.ArgumentParser()
parser.add_argument('--sha256', required=True)
parser.add_argument('--view', choices=['sol-preview', 'real-moon', 'real-earth', 'planet-split', 'planet-walk', 'navigation-orbit', 'navigation-ground', 'expansion-pins', 'imagery-moon', 'imagery-mars', 'imagery-local', 'relief-mars', 'relief-ground', 'relief-moon'], default='sol-preview')
args = parser.parse_args()
if len(args.sha256) != 64 or any(c not in '0123456789abcdef' for c in args.sha256):
    parser.error('Expected lowercase SHA-256')
root = Path(__file__).resolve().parents[1]
destination = (root / 'evidence/local_b04_checks/preview/sol-preview.jpg' if args.view == 'sol-preview'
               else root / f'evidence/display_relief/{args.view}.jpg' if args.view.startswith('relief-')
               else root / f'evidence/surface_imagery/{args.view}.jpg' if args.view.startswith('imagery-')
               else root / f'evidence/surface_expansion/{args.view}.jpg' if args.view.startswith('expansion-')
               else root / f'evidence/navigation_improvements/{args.view}.jpg' if args.view.startswith('navigation-')
               else root / f'evidence/planet_explorer/{args.view}.jpg' if args.view.startswith('planet-')
               else root / f'evidence/real_surface_ui/{args.view}.jpg')
destination.parent.mkdir(parents=True, exist_ok=True)
token = secrets.token_urlsafe(24)
origin = 'http://127.0.0.1:8771'

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, text):
        body = text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != '/' or self.headers.get('Host') != '127.0.0.1:8771':
            return self.respond(404, 'Not found')
        self.respond(200, f'<h1>Local preview evidence</h1><form method="post"><input type="hidden" name="token" value="{token}"><label>Screenshot base64<textarea name="image"></textarea></label><button>Save verified screenshot</button></form>')

    def do_POST(self):
        try:
            if self.path != '/' or self.headers.get('Host') != '127.0.0.1:8771' or self.headers.get('Origin') != origin:
                raise ValueError('origin')
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 2 * 1024 * 1024:
                raise ValueError('size')
            fields = parse_qs(self.rfile.read(size).decode('utf-8'), strict_parsing=True)
            if any(len(v) != 1 for v in fields.values()) or not hmac.compare_digest(fields.get('token', [''])[0], token):
                raise ValueError('token')
            raw = base64.b64decode(fields['image'][0], validate=True)
            if not raw.startswith(b'\xff\xd8\xff') or hashlib.sha256(raw).hexdigest() != args.sha256:
                raise ValueError('image identity')
            with destination.open('xb') as handle:
                handle.write(raw)
            self.respond(200, f'<h1>Verified screenshot saved</h1><p>{destination.relative_to(root).as_posix()}</p>')
            self.server.saved = True
        except (ValueError, KeyError, OSError):
            self.respond(400, 'Screenshot was not saved')

    def log_message(self, *_):
        pass

server = HTTPServer(('127.0.0.1', 8771), Handler)
server.saved = False
server.timeout = 300
print(origin, flush=True)
while not server.saved:
    server.handle_request()
server.server_close()
