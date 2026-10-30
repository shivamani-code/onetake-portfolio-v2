
import sys, json, time
from playwright.sync_api import sync_playwright
url, mode, out = sys.argv[1], sys.argv[2], sys.argv[3]
ps = [float(x) for x in sys.argv[4].split(',')]
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
    if mode == "phone":
        ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True, user_agent=UA)
    else:
        ctx = b.new_context(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
    pg = ctx.new_page(); errs = []
    pg.on("console", lambda m: m.type in ("error", "warning") and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    t0 = time.time(); pg.goto(url, wait_until="load", timeout=120000)
    pg.wait_for_selector("#loader.ready", timeout=120000); tl = time.time() - t0
    pg.screenshot(path=f"{out}-loader.png")
    pg.click("[data-enter=silent]"); pg.wait_for_timeout(3200)
    for p_ in ps:
        pg.evaluate(f"oneTake.seek({p_})")
        pg.wait_for_timeout(400)
        for _ in range(40):
            ok = pg.evaluate("(() => { const fr = oneTake.frames(); const S = oneTake.S; const f = Math.round(S.f); let best = 1e9; return fr.has(f) || fr.has(f+1) || fr.has(f-1); })()")
            if ok: break
            pg.wait_for_timeout(250)
        pg.wait_for_timeout(700)
        pg.screenshot(path=f"{out}-{p_:.3f}.png")
    print(json.dumps({"loader_s": round(tl, 1), "errors": errs[:20]}))
    b.close()
