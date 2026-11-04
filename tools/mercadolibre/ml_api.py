"""MercadoLibre API client: OAuth (authorization code + rotating refresh token)
and JSON requests with retries. Standard library only (no `requests`), so it
runs unchanged locally and in a GitHub Action.

Credentials live in `_credentials.json` next to this file (gitignored):
    {
      "client_id": "...",
      "client_secret": "...",
      "redirect_uri": "https://fedixcoins.com.ar/",
      "access_token": "...",      # filled by `auth`
      "refresh_token": "...",     # filled by `auth`, rotated on every refresh
      "expires_at": 1730000000,   # epoch seconds
      "user_id": 123456
    }
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://api.mercadolibre.com"
AUTH_BASE = "https://auth.mercadolibre.com.ar/authorization"
TOKEN_URL = API_BASE + "/oauth/token"

HERE = Path(__file__).resolve().parent
CRED_PATH = Path(os.environ.get("ML_CREDENTIALS", HERE / "_credentials.json"))

# Refresh the access token this many seconds before it actually expires.
REFRESH_MARGIN = 300


class MLError(Exception):
    def __init__(self, status, body, method="", url=""):
        self.status = status
        self.body = body
        super().__init__(f"{method} {url} -> HTTP {status}: {body}")


def _http(method, url, body=None, headers=None, form=False, timeout=30):
    """Single HTTP call. Returns (status, parsed_json_or_text)."""
    headers = dict(headers or {})
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
    headers.setdefault("Accept", "application/json")
    headers.setdefault("User-Agent", "fedix-coins-ml-sync/1.0")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        status = e.code
    try:
        parsed = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        parsed = raw
    return status, parsed


def load_credentials():
    if not CRED_PATH.exists():
        raise SystemExit(
            f"Falta {CRED_PATH}. Copiá credentials.example.json a _credentials.json "
            "y completá client_id / client_secret (ver SKILL.md, Fase 0)."
        )
    with open(CRED_PATH, encoding="utf-8") as f:
        creds = json.load(f)
    for k in ("client_id", "client_secret", "redirect_uri"):
        if not creds.get(k) or str(creds[k]).startswith("<"):
            raise SystemExit(f"_credentials.json: falta completar '{k}'.")
    return creds


def save_credentials(creds):
    tmp = CRED_PATH.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(creds, f, indent=2)
    os.replace(tmp, CRED_PATH)


def authorization_url(creds):
    q = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": creds["client_id"],
        "redirect_uri": creds["redirect_uri"],
    })
    return f"{AUTH_BASE}?{q}"


def _store_token_response(creds, tok):
    creds["access_token"] = tok["access_token"]
    creds["refresh_token"] = tok["refresh_token"]
    creds["expires_at"] = int(time.time()) + int(tok.get("expires_in", 21600))
    if tok.get("user_id"):
        creds["user_id"] = tok["user_id"]
    save_credentials(creds)


def exchange_code(code):
    """Trade the one-time authorization `code` for access + refresh tokens."""
    creds = load_credentials()
    # Accept the whole redirected URL as well as the bare code.
    if code.startswith("http"):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(code).query)
        code = (qs.get("code") or [""])[0]
    status, tok = _http("POST", TOKEN_URL, {
        "grant_type": "authorization_code",
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "code": code,
        "redirect_uri": creds["redirect_uri"],
    }, form=True)
    if status != 200:
        raise MLError(status, tok, "POST", TOKEN_URL)
    _store_token_response(creds, tok)
    return creds


class MLClient:
    def __init__(self):
        self.creds = load_credentials()
        if not self.creds.get("refresh_token"):
            raise SystemExit("Todavía no hay token. Corré primero: python tools/mercadolibre/ml_sync.py auth")

    @property
    def user_id(self):
        uid = self.creds.get("user_id")
        if not uid:
            uid = self.get("/users/me")["id"]
            self.creds["user_id"] = uid
            save_credentials(self.creds)
        return uid

    def _refresh(self):
        status, tok = _http("POST", TOKEN_URL, {
            "grant_type": "refresh_token",
            "client_id": self.creds["client_id"],
            "client_secret": self.creds["client_secret"],
            "refresh_token": self.creds["refresh_token"],
        }, form=True)
        if status != 200:
            raise MLError(status, tok, "POST", TOKEN_URL)
        # The refresh token is single-use: persist the new one immediately.
        _store_token_response(self.creds, tok)

    def token(self):
        if time.time() > self.creds.get("expires_at", 0) - REFRESH_MARGIN:
            self._refresh()
        return self.creds["access_token"]

    def request(self, method, path, params=None, body=None, retries=4):
        url = API_BASE + path
        if params:
            url += "?" + urllib.parse.urlencode(params, doseq=True)
        delay = 2
        refreshed = False
        for attempt in range(retries + 1):
            status, data = _http(method, url, body,
                                 headers={"Authorization": f"Bearer {self.token()}"})
            if 200 <= status < 300:
                return data
            if status == 401 and not refreshed:
                self._refresh()
                refreshed = True
                continue
            # 409 = optimistic locking right after a status change; 429 = rate limit.
            if status in (409, 429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise MLError(status, data, method, url)

    def get(self, path, **params):
        return self.request("GET", path, params=params or None)

    def post(self, path, body, params=None):
        return self.request("POST", path, params=params, body=body)

    def put(self, path, body, params=None):
        return self.request("PUT", path, params=params, body=body)

    # ── Helpers ─────────────────────────────────────────────

    def items_multiget(self, ids, attributes=None):
        """GET /items?ids=... in batches of 20. Returns list of item bodies."""
        out = []
        ids = list(ids)
        for i in range(0, len(ids), 20):
            params = {"ids": ",".join(ids[i:i + 20])}
            if attributes:
                params["attributes"] = attributes
            for entry in self.get("/items", **params):
                if entry.get("code") == 200:
                    out.append(entry["body"])
        return out

    def seller_item_ids(self, status=None):
        """All listing ids of the authenticated seller (scan mode, no 1000 cap)."""
        ids, scroll = [], None
        while True:
            params = {"search_type": "scan", "limit": 100}
            if status:
                params["status"] = status
            if scroll:
                params["scroll_id"] = scroll
            res = self.get(f"/users/{self.user_id}/items/search", **params)
            batch = res.get("results", [])
            if not batch:
                break
            ids.extend(batch)
            scroll = res.get("scroll_id")
            if not scroll:
                break
        return ids
