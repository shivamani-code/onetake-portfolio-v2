
import sys, json, time
from playwright.sync_api import sync_playwright
url, mode = sys.argv[1], sys.argv[2]
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width":412,"height":915}, device_scale_factor=2.625, is_mobile=True, has_touch=True, user_agent=UA) if mode=="phone" else b.new_context(viewport={"width":1600,"height":900})
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); cdp.send("Network.enable")
    kb=[0.0]; n=[0]; kinds={}
    def fin(e):
        kb[0]+=e["encodedDataLength"]/1024; n[0]+=1
    cdp.on("Network.loadingFinished", fin)
    t0=time.time(); pg.goto(url, wait_until="load"); pg.wait_for_selector("#loader.ready", timeout=120000); t_ready=time.time()-t0; kb_ready=kb[0]
    pg.click("[data-enter=silent]")
    for k in range(0, 101, 4):
        pg.evaluate(f"oneTake.seek({k/100})"); pg.wait_for_timeout(500)
    for _ in range(60):
        st = pg.evaluate("(() => { const f = oneTake.frames(); return [f.loaded, (oneTake.M()[%r].avail||[]).length, f.active]; })()" % ('phone' if mode=='phone' else 'desk'))
        if st[0] >= st[1] and st[2]==0: break
        pg.wait_for_timeout(1000)
    print(json.dumps({"ready_s": round(t_ready,1), "kb_at_ready": round(kb_ready), "kb_total": round(kb[0]), "requests": n[0], "frames": st}))
    b.close()
