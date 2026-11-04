"""Fedix Coins <-> MercadoLibre sync.

Every command that changes something previews by default; add --apply to do it.
After changing items.json / ml_state.json with --apply, the tool commits and
pushes (that is what deploys the site). Use --no-push or --no-commit to skip.

    python tools/mercadolibre/ml_sync.py auth [--code <code-or-redirect-url>]
    python tools/mercadolibre/ml_sync.py reconcile [--apply] [--close-sold]
    python tools/mercadolibre/ml_sync.py price <idx...>
    python tools/mercadolibre/ml_sync.py publish (<idx...> | --new) [--apply]
    python tools/mercadolibre/ml_sync.py sold-web <idx> [--qty N] [--apply]
    python tools/mercadolibre/ml_sync.py sync-orders [--since YYYY-MM-DD] [--apply]
    python tools/mercadolibre/ml_sync.py update <idx> [--fields price,description,pictures,title] [--apply]
    python tools/mercadolibre/ml_sync.py reprice [--min-change 5] [--apply]
    python tools/mercadolibre/ml_sync.py status [--online]

Rules:
  * Sale on the website: quantity -1. At 0 -> sold/soldon on the site and the
    ML listing is closed. Above 0 -> ML is not touched.
  * Sale on ML: quantity -1. Above 0 -> the listing is relisted (used, stock 1)
    at today's price. At 0 -> sold/soldon (order date) on the site.
  * items.json is append-only: the array index is the coin's identity (and its
    SELLER_SKU on ML). Never reorder or delete entries.
"""

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import ml_api  # noqa: E402
import ml_policy as pol  # noqa: E402

ROOT = HERE.parent.parent
ITEMS_PATH = ROOT / "items.json"
STATE_PATH = HERE / "ml_state.json"
REPORT_PATH = HERE / "_reconcile_report.json"

AR_TZ = timezone(timedelta(hours=-3))
CO_AUTHOR = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"


# ── Files ───────────────────────────────────────────────────

def load_items():
    with open(ITEMS_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_items(items):
    text = json.dumps(items, ensure_ascii=False, indent=2) + "\n"
    json.loads(text)  # sanity
    with open(ITEMS_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def load_state():
    if STATE_PATH.exists():
        with open(STATE_PATH, encoding="utf-8") as f:
            st = json.load(f)
    else:
        st = {}
    st.setdefault("listings", {})
    st.setdefault("processed_orders", [])
    st.setdefault("unmatched_orders", [])
    st.setdefault("last_order_check", None)
    return st


def save_state(st):
    with open(STATE_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(st, f, ensure_ascii=False, indent=2)
        f.write("\n")


def git_commit_push(message, args):
    if getattr(args, "no_commit", False):
        print("(sin commit: --no-commit)")
        return
    paths = ["items.json", "tools/mercadolibre/ml_state.json", "tools/mercadolibre/ml_config.json"]
    run = lambda *c: subprocess.run(["git", *c], cwd=ROOT, capture_output=True, text=True)
    run("add", "--", *paths)
    if run("diff", "--cached", "--quiet").returncode == 0:
        print("(nada para commitear)")
        return
    r = run("commit", "-m", f"{message}\n\n{CO_AUTHOR}")
    if r.returncode != 0:
        print("git commit falló:\n" + r.stdout + r.stderr)
        return
    print(f"commit: {message}")
    if getattr(args, "no_push", False):
        print("(sin push: --no-push)")
        return
    r = run("push")
    print("push OK" if r.returncode == 0 else "git push falló:\n" + r.stdout + r.stderr)


# ── Helpers ─────────────────────────────────────────────────

def today_str():
    return datetime.now(AR_TZ).strftime("%d-%m-%Y")


def ml_date_to_soldon(iso):
    return datetime.fromisoformat(iso).astimezone(AR_TZ).strftime("%d-%m-%Y")


def qty_of(item):
    q = item.get("quantity")
    return 1 if q is None else int(q)


def is_available(item):
    return not item.get("sold") and qty_of(item) > 0


def current_ml_id(st, idx):
    return st["listings"].get(str(idx), {}).get("ml_id")


def set_ml_id(st, idx, ml_id):
    entry = st["listings"].setdefault(str(idx), {"ml_id": None, "history": []})
    entry["ml_id"] = ml_id
    if ml_id and ml_id not in entry["history"]:
        entry["history"].append(ml_id)


def index_for_ml_id(st, ml_id):
    for k, v in st["listings"].items():
        if v.get("ml_id") == ml_id or ml_id in v.get("history", []):
            return int(k)
    return None


def sku_of(ml_item):
    for a in ml_item.get("attributes", []) or []:
        if a.get("id") == "SELLER_SKU" and a.get("value_name"):
            return a["value_name"].strip()
    return (ml_item.get("seller_custom_field") or "").strip() or None


def require_listing_setup(cfg):
    if not cfg.get("category_id") or not cfg.get("listing_type_id") or not cfg.get("attributes"):
        sys.exit("Falta category_id / listing_type_id / attributes en ml_config.json. "
                 "Corré primero: ml_sync.py reconcile --apply")


def get_rate(cfg):
    try:
        rate, when = pol.blue_rate(cfg)
    except Exception as e:
        sys.exit(f"No pude obtener el dólar blue ({e}). No se publica con cotización vieja.")
    print(f"Dólar blue venta: {rate:,.0f} ARS  (actualizado {when})")
    return rate


def price_for(item, idx, rate, cfg, client):
    pkg = pol.package_for(idx, cfg, item)
    cond = pol.type_cfg(cfg, item)["condition"]
    fn = (lambda p: pol.free_shipping_cost(client, cfg, pkg, p, cond)) if client else None
    return pol.compute_price(item, rate, cfg, fn)


def fmt_price(pi):
    s = f"USD {pi['usd']} × {pi['rate']:,.0f} = {pi['ars_base']:,}"
    if pi["free_shipping"]:
        s += f" + envío {pi['surcharge']:,} ({pi['surcharge_source']})"
    s += f" × {pi['mult']}"
    if pi["low_add"]:
        s += f" + {pi['low_add']:,}"
    s += f" → ${pi['price']:,}  " + ("[envío gratis]" if pi["free_shipping"] else "[envío a cargo del comprador]")
    return s


def relist_or_reactivate(client, ml_id, price, free_shipping, cfg, quantity=1):
    """Make sure the listing is on sale with `quantity` units. Returns the (possibly new) ML id."""
    it = client.get(f"/items/{ml_id}")
    status = it.get("status")
    if status == "active" and it.get("available_quantity", 0) >= 1:
        if it.get("available_quantity") != quantity:
            client.put(f"/items/{ml_id}", {"available_quantity": quantity})
        return ml_id
    if status == "paused":
        client.put(f"/items/{ml_id}", {"available_quantity": quantity, "price": price})
        client.put(f"/items/{ml_id}", {"status": "active"})
        return ml_id
    if status == "active":  # active with 0 stock: close, then relist
        client.put(f"/items/{ml_id}", {"status": "closed"})
    new = client.post(f"/items/{ml_id}/relist", {
        "price": price,
        "quantity": quantity,
        "listing_type_id": it.get("listing_type_id") or cfg["listing_type_id"],
    })
    new_id = new["id"]
    if bool(it.get("shipping", {}).get("free_shipping")) != free_shipping:
        client.put(f"/items/{new_id}", {"shipping": {"free_shipping": free_shipping}})
    return new_id


# ── Commands ────────────────────────────────────────────────

def cmd_auth(args):
    if args.code:
        creds = ml_api.exchange_code(args.code)
        me = ml_api.MLClient().get("/users/me")
        print(f"OK. Token guardado para {me.get('nickname')} (user_id {creds.get('user_id')}).")
        return
    creds = ml_api.load_credentials()
    print("1) Abrí esta URL, ingresá con tu cuenta de MercadoLibre y autorizá la app:\n")
    print("   " + ml_api.authorization_url(creds) + "\n")
    print("2) Te redirige a fedixcoins.com.ar con ?code=... en la URL. Copiá esa URL completa y corré:")
    print('   python tools/mercadolibre/ml_sync.py auth --code "<URL o code>"')


MIN_SCORE = 0.5


def is_live(ml_item):
    return ml_item.get("status") in ("active", "paused")


def match_listings(items, ml_items):
    """Assign each ML listing to an items.json index by title similarity.

    Returns ({ml_id: (index, score)}, [unmatched ml_items]). One live listing
    per coin; sold listings up to the coin's stock; closed-unsold listings are
    attached as history. Among equally good candidates (identical coins), the
    one whose state agrees wins, then the closest SKU.
    """
    toks = [pol.item_tokens(it) for it in items]
    pairs = []
    for ml in ml_items:
        sku = sku_of(ml)
        sku = int(sku) if sku and sku.isdigit() else None
        sold_ml = ml.get("sold_quantity", 0) > 0
        for i, it in enumerate(items):
            s = pol.match_score(ml["title"], it, toks[i])
            if s < MIN_SCORE:
                continue
            agrees = bool((is_live(ml) and is_available(it)) or
                          (not is_live(ml) and sold_ml and it.get("sold")))
            dist = abs(sku - i) if sku is not None else 10 ** 6
            pairs.append((s, agrees, -dist, ml["id"], i))
    pairs.sort(reverse=True)
    by_id = {m["id"]: m for m in ml_items}
    live_used, sold_used, assigned = set(), Counter(), {}
    for s, _, _, mid, i in pairs:
        if mid in assigned:
            continue
        ml = by_id[mid]
        if is_live(ml):
            if i in live_used:
                continue
            live_used.add(i)
        elif ml.get("sold_quantity", 0) > 0:
            cap = max(qty_of(items[i]), 1) + (1 if "quantity" in items[i] else 0)
            if sold_used[i] >= cap:
                continue
            sold_used[i] += 1
        assigned[mid] = (i, s)
    unmatched = [m for m in ml_items if m["id"] not in assigned]
    return assigned, unmatched


def cmd_reconcile(args):
    client = ml_api.MLClient()
    cfg = pol.load_config()
    st = load_state()
    items = load_items()

    ids = set()
    for status in ("active", "paused", "closed"):
        ids.update(client.seller_item_ids(status))
    print(f"Publicaciones en ML: {len(ids)}")
    fields = ("id,title,status,sub_status,price,sold_quantity,available_quantity,seller_custom_field,"
              "attributes,category_id,listing_type_id,date_created,last_updated,permalink,condition,shipping")
    ml_items = client.items_multiget(sorted(ids), attributes=fields)
    by_id = {m["id"]: m for m in ml_items}

    assigned, unmatched = match_listings(items, ml_items)
    per_item = defaultdict(list)
    for mid, (i, s) in assigned.items():
        per_item[i].append(by_id[mid])

    mapping = {}
    for i, lst in per_item.items():
        lst.sort(key=lambda x: x.get("date_created", ""))
        live = [x for x in lst if is_live(x)]
        mapping[i] = (live[0] if live else lst[-1], lst)

    sold_web_live, sold_ml_available, available_unlisted, doubtful, wrong_sku = [], [], [], [], []
    for i, item in enumerate(items):
        cur, lst = mapping.get(i, (None, []))
        live = cur is not None and is_live(cur)
        if item.get("sold") and live:
            sold_web_live.append((i, pol.label(item), f"vendida {item.get('soldon')}", cur["id"], cur["status"]))
        if is_available(item) and not live:
            if any(x.get("sold_quantity", 0) > 0 for x in lst):
                sold_ml_available.append((i, pol.label(item), cur["id"]))
            else:
                available_unlisted.append((i, pol.label(item)))
        for x in lst:
            if sku_of(x) != str(i):
                wrong_sku.append(x["id"])
    for mid, (i, s) in assigned.items():
        if s < 0.75:
            doubtful.append((f"{s:.2f}", mid, repr(by_id[mid]["title"]), "->", f"[{i}]", pol.label(items[i])))

    def section(title, rows):
        print(f"\n{title}: {len(rows)}")
        for r in rows:
            print("  " + "  ".join(str(x) for x in r))

    print(f"Asignadas por título: {len(assigned)}  (con SKU distinto al índice actual: {len(wrong_sku)})")
    section("Vendidas en la web pero VIVAS en ML (se cierran con --close-sold)", sold_web_live)
    section("Vendidas en ML pero DISPONIBLES en la web (procesar con sync-orders --since)", sold_ml_available)
    section("Disponibles en la web SIN publicación viva en ML (candidatas a publish)", available_unlisted)
    section("Publicaciones sin match (no se tocan)",
            [(x["id"], x["status"], repr(x["title"])) for x in unmatched])
    section("Matches con puntaje bajo (revisar)", doubtful)

    coin_maps = [c for i, (c, _) in mapping.items() if not items[i].get("book")]
    cats = Counter(c["category_id"] for c in coin_maps)
    ltypes = Counter(c["listing_type_id"] for c in coin_maps)
    print(f"\nCategorías: {dict(cats)}\nTipos de publicación: {dict(ltypes)}")

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "assigned": {mid: v[0] for mid, v in assigned.items()},
            "sold_web_live": sold_web_live, "sold_ml_available": sold_ml_available,
            "available_unlisted": available_unlisted, "doubtful": doubtful,
            "unmatched": [(x["id"], x["status"], x["title"]) for x in unmatched],
        }, f, ensure_ascii=False, indent=2)
    print(f"Reporte completo: {REPORT_PATH}")

    if not args.apply:
        print("\n(vista previa — nada guardado. Usá --apply para guardar el mapeo y la config)")
        return

    if cats:
        cfg["category_id"] = cats.most_common(1)[0][0]
        cfg["listing_type_id"] = ltypes.most_common(1)[0][0]
        cat_attrs = client.get(f"/categories/{cfg['category_id']}/attributes")
        cfg["attributes"] = pol.discover_attribute_ids(cat_attrs)
        pol.save_config(cfg)
        print(f"\nConfig: category {cfg['category_id']}, listing_type {cfg['listing_type_id']}, "
              f"atributos {cfg['attributes']}")
        missing = set(pol.ATTRIBUTE_NAMES) - set(cfg["attributes"])
        if missing:
            print(f"ATENCIÓN: no encontré en la categoría los atributos {missing}.")

    st["listings"] = {}
    for i, (cur, lst) in mapping.items():
        st["listings"][str(i)] = {"ml_id": cur["id"], "history": [x["id"] for x in lst]}
    if not st["last_order_check"]:
        st["last_order_check"] = datetime.now(AR_TZ).isoformat(timespec="seconds")

    save_state(st)
    print(f"Mapeo guardado: {len(mapping)} monedas.")

    closed_now = set()
    if args.close_sold:
        for i, lbl, _, ml_id, status in sold_web_live:
            if status == "closed":
                continue
            try:
                client.put(f"/items/{ml_id}", {"status": "closed"})
                print(f"Cerrada en ML: [{i}] {lbl} ({ml_id})")
            except ml_api.MLError as e:
                print(f"No pude cerrar {ml_id}: {e.body}")
            closed_now.add(ml_id)
    if args.fix_sku:
        n, failed = 0, []
        for i, (cur, lst) in mapping.items():
            for x in lst:
                if is_live(x) and x["id"] not in closed_now and sku_of(x) != str(i):
                    try:
                        client.put(f"/items/{x['id']}",
                                   {"attributes": [{"id": "SELLER_SKU", "value_name": str(i)}]})
                        n += 1
                    except ml_api.MLError as e:
                        failed.append((x["id"], e.status, str(e.body)[:120]))
        print(f"SKU corregido en {n} publicaciones vivas.")
        for f_ in failed:
            print("  falló:", *f_)
    git_commit_push("ML sync: conciliación con MercadoLibre", args)


def cmd_price(args):
    cfg = pol.load_config()
    items = load_items()
    rate = get_rate(cfg)
    client = None
    if ml_api.CRED_PATH.exists() and not args.offline:
        try:
            client = ml_api.MLClient()
        except SystemExit:
            client = None
    if not client:
        print(f"(sin API: recargo de envío = fallback {cfg['pricing']['fallback_surcharge']:,})")
    for idx in args.indices:
        item = items[idx]
        title, trunc = pol.build_title(item)
        print(f"\n[{idx}] {pol.label(item)}\n  título ML: {title}{'  (TRUNCADO)' if trunc else ''}")
        try:
            print("  " + fmt_price(price_for(item, idx, rate, cfg, client)))
        except ValueError as e:
            print(f"  ERROR: {e}")


def cmd_publish(args):
    client = ml_api.MLClient()
    cfg = pol.load_config()
    require_listing_setup(cfg)
    st = load_state()
    items = load_items()

    if args.new:
        targets = [i for i, it in enumerate(items) if is_available(it) and not current_ml_id(st, i)]
    else:
        targets = args.indices
    if not targets:
        print("No hay monedas para publicar.")
        return
    rate = get_rate(cfg)

    ready, skipped = [], []
    for idx in targets:
        item = items[idx]
        if not is_available(item):
            skipped.append((idx, pol.label(item), "vendida/libro/sin stock"))
            continue
        if current_ml_id(st, idx) and not args.force:
            skipped.append((idx, pol.label(item), f"ya publicada ({current_ml_id(st, idx)}) — usá update"))
            continue
        try:
            pi = price_for(item, idx, rate, cfg, client)
        except ValueError as e:
            skipped.append((idx, pol.label(item), str(e)))
            continue
        payload, trunc, missing = pol.build_item_payload(item, idx, cfg, pi)
        if missing and not args.force:
            skipped.append((idx, pol.label(item), "faltan: " + ", ".join(missing)))
            continue
        ready.append((idx, item, payload, pi))
        print(f"\n[{idx}] {payload['family_name']}{'  (TÍTULO TRUNCADO)' if trunc else ''}")
        print("  " + fmt_price(pi))
        print(f"  {payload['condition']} ×{payload['available_quantity']}  cat {payload['category_id']}  "
              f"paquete {pol.dimensions_str(pol.package_for(idx, cfg, item))}  fotos {len(payload['pictures'])}")

    if skipped:
        print(f"\nSalteadas: {len(skipped)}")
        for r in skipped:
            print("  [{}] {} — {}".format(*r))
    print(f"\nA publicar: {len(ready)}")
    if not args.apply:
        print("(vista previa — usá --apply para publicar)")
        return

    for idx, item, payload, pi in ready:
        try:
            res = client.post("/items", payload)
        except ml_api.MLError as e:
            print(f"[{idx}] ERROR al publicar: {e.body}")
            continue
        ml_id = res["id"]
        desc = item.get("description")
        if desc:
            try:
                client.post(f"/items/{ml_id}/description", {"plain_text": desc})
            except ml_api.MLError as e:
                print(f"[{idx}] publicada pero falló la descripción: {e.body}")
        set_ml_id(st, idx, ml_id)
        save_state(st)
        print(f"[{idx}] publicada: {ml_id}  {res.get('permalink', '')}")
    git_commit_push(f"ML sync: publicadas {len(ready)} monedas", args)


def cmd_sold_web(args):
    cfg = pol.load_config()
    st = load_state()
    items = load_items()
    idx = args.index
    item = items[idx]
    if item.get("sold"):
        sys.exit(f"[{idx}] {pol.label(item)} ya figura vendida.")
    qty = qty_of(item)
    new = qty - args.qty
    if new < 0:
        sys.exit(f"[{idx}] {pol.label(item)}: stock {qty}, no se pueden vender {args.qty}.")

    ml_id = current_ml_id(st, idx)
    print(f"[{idx}] {pol.label(item)}: stock {qty} → {new}")
    if new > 0 and pol.type_cfg(cfg, item)["condition"] == "new":
        print(f"  Sigue disponible. En ML (nuevo) el stock pasa a {new}.")
    elif new > 0:
        print("  Sigue disponible. ML no se toca.")
    else:
        print(f"  Se marca VENDIDA en la web (soldon {today_str()}).")
        print(f"  ML: {'se cierra ' + ml_id if ml_id else 'no tiene publicación registrada'}")
    if not args.apply:
        print("(vista previa — usá --apply)")
        return

    if "quantity" in item or new > 0:
        item["quantity"] = new
    if new > 0 and ml_id and pol.type_cfg(cfg, item)["condition"] == "new":
        client = ml_api.MLClient()
        cur = client.get(f"/items/{ml_id}")
        if cur.get("status") == "active" and cur.get("available_quantity") != new:
            client.put(f"/items/{ml_id}", {"available_quantity": new})
            print(f"  Stock en ML actualizado a {new}")
    if new == 0:
        item["sold"] = True
        item["soldon"] = today_str()
        if ml_id:
            client = ml_api.MLClient()
            status = client.get(f"/items/{ml_id}").get("status")
            if status in ("active", "paused"):
                client.put(f"/items/{ml_id}", {"status": "closed"})
                print(f"  Cerrada en ML: {ml_id}")
            else:
                print(f"  ML ya estaba {status}.")
    save_items(items)
    save_state(st)
    git_commit_push(f"Vendida en la web: [{idx}] {pol.label(item)}", args)


def cmd_sync_orders(args):
    client = ml_api.MLClient()
    cfg = pol.load_config()
    st = load_state()
    items = load_items()
    run_started = datetime.now(AR_TZ)

    if args.since:
        since = datetime.fromisoformat(args.since).replace(tzinfo=AR_TZ)
    elif st["last_order_check"]:
        since = datetime.fromisoformat(st["last_order_check"]) - timedelta(days=2)
    else:
        since = run_started - timedelta(days=7)
    since_s = since.strftime("%Y-%m-%dT%H:%M:%S.000-03:00")
    print(f"Órdenes pagas desde {since_s}")

    def search(status):
        out, offset = [], 0
        while True:
            res = client.get("/orders/search", seller=client.user_id, **{
                "order.status": status, "order.date_created.from": since_s,
                "sort": "date_asc", "limit": 50, "offset": offset})
            out += res.get("results", [])
            offset += 50
            if offset >= res.get("paging", {}).get("total", 0):
                return out

    processed = set(str(x) for x in st["processed_orders"])
    orders = [o for o in search("paid") if str(o["id"]) not in processed]
    print(f"Órdenes nuevas: {len(orders)}")

    rate = None
    changed = False
    for o in orders:
        when = o.get("date_closed") or o.get("date_created")
        for oi in o.get("order_items", []):
            ml_id = oi["item"]["id"]
            sold_n = int(oi.get("quantity", 1))
            idx = index_for_ml_id(st, ml_id)
            sku = (oi["item"].get("seller_sku") or "").strip()
            if (idx is None and sku.isdigit() and int(sku) < len(items)
                    and pol.match_score(oi["item"].get("title", ""), items[int(sku)]) >= MIN_SCORE):
                idx = int(sku)
            if idx is None:
                # Unknown (old) listing: a title match is only trusted to recognise a coin
                # that is already sold. It never marks an available coin as sold.
                title = oi["item"].get("title", "")
                cands = [(pol.match_score(title, it), i) for i, it in enumerate(items)
                         if not it.get("book") and pol.match_score(title, it) >= 0.75]
                sold_c = [c for c in cands if items[c[1]].get("sold")]
                if sold_c:
                    print(f"  orden {o['id']}: '{title}' (publicación vieja) → [{max(sold_c)[1]}] ya vendida, no se toca")
                    continue
                hint = f" — posible [{max(cands)[1]}] {pol.label(items[max(cands)[1]])}, REVISAR A MANO" if cands else ""
                print(f"  orden {o['id']}: {ml_id} '{title}' NO matchea ninguna publicación conocida{hint}")
                if args.apply:
                    st["unmatched_orders"].append({"order": o["id"], "ml_id": ml_id,
                                                   "title": oi["item"].get("title")})
                continue
            item = items[idx]
            qty = qty_of(item)
            new = max(qty - sold_n, 0)
            print(f"  orden {o['id']} ({ml_date_to_soldon(when)}): [{idx}] {pol.label(item)} stock {qty} → {new}")
            if item.get("sold"):
                # Already handled by hand (e.g. before the API sync existed): just mark the order processed.
                print("    ya figuraba vendida en la web — no se toca")
                continue
            if not args.apply:
                print("    → " + ("republicar en ML" if new > 0 else "marcar VENDIDA en la web"))
                continue
            if "quantity" in item or new > 0:
                item["quantity"] = new
            if new == 0:
                item["sold"] = True
                item["soldon"] = ml_date_to_soldon(when)
                print("    marcada vendida en la web")
            else:
                if rate is None:
                    rate = get_rate(cfg)
                pi = price_for(item, idx, rate, cfg, client)
                new_id = relist_or_reactivate(client, ml_id, pi["price"], pi["free_shipping"], cfg,
                                              quantity=pol.ml_quantity(item, cfg))
                set_ml_id(st, idx, new_id)
                print(f"    republicada: {new_id} a ${pi['price']:,}")
            changed = True
        if args.apply:
            st["processed_orders"].append(o["id"])
            save_items(items)
            save_state(st)

    # Orders we already processed that were later cancelled: report only.
    cancelled = [o for o in search("cancelled") if str(o["id"]) in processed]
    for o in cancelled:
        titles = ", ".join(oi["item"].get("title", "") for oi in o.get("order_items", []))
        print(f"ATENCIÓN: la orden {o['id']} ({titles}) ya procesada fue CANCELADA. Revisar a mano.")

    if not args.apply:
        print("(vista previa — usá --apply)")
        return
    st["last_order_check"] = run_started.isoformat(timespec="seconds")
    save_state(st)
    git_commit_push(f"ML sync: {len(orders)} órdenes procesadas" if changed else "ML sync: chequeo de órdenes", args)


def cmd_update(args):
    client = ml_api.MLClient()
    cfg = pol.load_config()
    st = load_state()
    items = load_items()
    idx = args.index
    item = items[idx]
    ml_id = current_ml_id(st, idx)
    if not ml_id:
        sys.exit(f"[{idx}] no tiene publicación registrada. Usá publish.")
    cur = client.get(f"/items/{ml_id}")
    fields = set(args.fields.split(","))
    body = {}
    if "price" in fields:
        pi = price_for(item, idx, get_rate(cfg), cfg, client)
        print("precio: " + fmt_price(pi) + f"  (hoy en ML: ${cur.get('price'):,})")
        body["price"] = pi["price"]
        if bool(cur.get("shipping", {}).get("free_shipping")) != pi["free_shipping"]:
            body["shipping"] = {"free_shipping": pi["free_shipping"]}
    if "pictures" in fields:
        body["pictures"] = pol.build_pictures(item, cfg)
    if "title" in fields:
        if cur.get("sold_quantity", 0) > 0:
            print("título: ML no permite cambiarlo en una publicación con ventas — se omite")
        else:
            body["title"] = pol.build_title(item)[0]
            print(f"título: {cur['title']!r} → {body['title']!r}")
    print(f"[{idx}] {ml_id} cambios: {list(body)}" + (" + descripción" if "description" in fields else ""))
    if not args.apply:
        print("(vista previa — usá --apply)")
        return
    if body:
        client.put(f"/items/{ml_id}", body)
    if "description" in fields and item.get("description"):
        client.put(f"/items/{ml_id}/description", {"plain_text": item["description"]})
    print("Actualizada.")


def cmd_reprice(args):
    client = ml_api.MLClient()
    cfg = pol.load_config()
    st = load_state()
    items = load_items()
    rate = get_rate(cfg)
    ids = {v["ml_id"]: int(k) for k, v in st["listings"].items() if v.get("ml_id")}
    live = [x for x in client.items_multiget(list(ids), "id,status,price,shipping") if x["status"] == "active"]
    changes = []
    for x in live:
        idx = ids[x["id"]]
        try:
            pi = price_for(items[idx], idx, rate, cfg, client)
        except ValueError:
            continue
        pct = (pi["price"] - x["price"]) / x["price"] * 100 if x["price"] else 100
        if abs(pct) >= args.min_change:
            changes.append((idx, x, pi, pct))
            print(f"[{idx}] {pol.label(items[idx])}: ${x['price']:,.0f} → ${pi['price']:,} ({pct:+.1f}%)")
    print(f"\n{len(changes)} de {len(live)} activas cambian ≥ {args.min_change}%")
    if not args.apply:
        print("(vista previa — usá --apply)")
        return
    for idx, x, pi, _ in changes:
        body = {"price": pi["price"]}
        if bool(x.get("shipping", {}).get("free_shipping")) != pi["free_shipping"]:
            body["shipping"] = {"free_shipping": pi["free_shipping"]}
        client.put(f"/items/{x['id']}", body)
    print("Precios actualizados.")


def cmd_status(args):
    st = load_state()
    items = load_items()
    avail = [i for i, it in enumerate(items) if is_available(it)]
    sold = [i for i, it in enumerate(items) if it.get("sold")]
    unlisted = [i for i in avail if not current_ml_id(st, i)]
    print(f"items.json: {len(items)}  disponibles {len(avail)}  vendidas {len(sold)}")
    print(f"Con publicación registrada: {sum(1 for v in st['listings'].values() if v.get('ml_id'))}")
    print(f"Disponibles sin publicación: {len(unlisted)} {unlisted[:30]}{' …' if len(unlisted) > 30 else ''}")
    print(f"Órdenes procesadas: {len(st['processed_orders'])}  sin matchear: {len(st['unmatched_orders'])}")
    print(f"Último chequeo de órdenes: {st['last_order_check']}")
    multi = [(i, pol.label(items[i]), qty_of(items[i])) for i in avail if qty_of(items[i]) > 1]
    if multi:
        print("Stock > 1: " + ", ".join(f"[{i}] {l} ×{q}" for i, l, q in multi))
    if args.online:
        client = ml_api.MLClient()
        ids = {v["ml_id"]: int(k) for k, v in st["listings"].items() if v.get("ml_id")}
        for x in client.items_multiget(list(ids), "id,status"):
            idx = ids[x["id"]]
            live = x["status"] in ("active", "paused")
            if items[idx].get("sold") and live:
                print(f"DESINCRONIZADA: [{idx}] vendida en la web pero {x['status']} en ML ({x['id']})")
            elif is_available(items[idx]) and not live:
                print(f"DESINCRONIZADA: [{idx}] disponible en la web pero {x['status']} en ML ({x['id']})")


def main():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add(name, fn, mutating=True):
        p = sub.add_parser(name)
        p.set_defaults(fn=fn)
        if mutating:
            p.add_argument("--apply", action="store_true", help="ejecutar (sin esto es vista previa)")
            p.add_argument("--no-commit", action="store_true")
            p.add_argument("--no-push", action="store_true")
        return p

    add("auth", cmd_auth, mutating=False).add_argument("--code")
    p = add("reconcile", cmd_reconcile)
    p.add_argument("--close-sold", action="store_true", help="cerrar en ML las vendidas en la web")
    p.add_argument("--fix-sku", action="store_true", help="corregir SELLER_SKU de las publicaciones vivas al índice actual")
    p = add("price", cmd_price, mutating=False)
    p.add_argument("indices", type=int, nargs="+")
    p.add_argument("--offline", action="store_true", help="no consultar el costo de envío a ML")
    p = add("publish", cmd_publish)
    p.add_argument("indices", type=int, nargs="*")
    p.add_argument("--new", action="store_true", help="todas las disponibles sin publicación")
    p.add_argument("--force", action="store_true", help="publicar aunque falten datos o ya exista")
    p = add("sold-web", cmd_sold_web)
    p.add_argument("index", type=int)
    p.add_argument("--qty", type=int, default=1)
    p = add("sync-orders", cmd_sync_orders)
    p.add_argument("--since", help="YYYY-MM-DD (por defecto: último chequeo − 2 días)")
    p = add("update", cmd_update)
    p.add_argument("index", type=int)
    p.add_argument("--fields", default="price,description,pictures")
    p = add("reprice", cmd_reprice)
    p.add_argument("--min-change", type=float, default=5)
    p = add("status", cmd_status, mutating=False)
    p.add_argument("--online", action="store_true")

    args = ap.parse_args()
    if args.cmd == "publish" and not args.new and not args.indices:
        ap.error("publish: indicá índices o --new")
    try:
        args.fn(args)
    except ml_api.MLError as e:
        sys.exit(f"Error de la API de MercadoLibre: {e}")


if __name__ == "__main__":
    main()
