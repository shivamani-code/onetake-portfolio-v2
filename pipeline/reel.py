
import math, os, shutil, subprocess, sys, tempfile, json
from playwright.sync_api import sync_playwright
URL, OUT = sys.argv[1], sys.argv[2]; SECS = float(sys.argv[3]); FPS = 30
W, H = 412, 915
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
tmp = tempfile.mkdtemp(prefix="reel-")
HOLD0, HOLD1 = 0.07, 0.06
def ease(t):
    t = min(1, max(0, (t - HOLD0) / (1 - HOLD0 - HOLD1)))
    return t * t * (3 - 2 * t) * 0.35 + t * 0.65   # mostly linear so every chapter gets screen time
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA)
    pg = ctx.new_page()
    pg.goto(URL, wait_until="load", timeout=120000)
    for _ in range(240):
        if pg.evaluate("!!document.querySelector('#loader.ready')"): break
        pg.wait_for_timeout(100)
    # load every frame before recording (decoding is real time)
    for k in range(0, 101, 5):
        pg.evaluate(f"oneTake.seek({k/100})"); pg.wait_for_timeout(250)
    for _ in range(120):
        st = pg.evaluate("(() => { const f = oneTake.frames(); return [f.loaded, (oneTake.M()['phone'].avail||[]).length]; })()")
        if st[0] >= st[1]: break
        pg.wait_for_timeout(500)
    pg.evaluate("oneTake.seek(0)"); pg.wait_for_timeout(300)
    pg.click("[data-enter=silent]")
    pg.evaluate("oneTake.manual(true)")
    total = pg.evaluate("document.documentElement.scrollHeight - innerHeight")
    n = int(SECS * FPS)
    for i in range(n):
        y = total * ease(i / (n - 1))
        pg.evaluate(f"window.scrollTo(0, {y:.1f}); oneTake.tick({1000/FPS:.3f})")
        pg.screenshot(path=f"{tmp}/f{i:05d}.png")
    b.close()
AUD = sys.argv[4] if len(sys.argv) > 4 else None
cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", f"{tmp}/f%05d.png"] + (["-i", AUD] if AUD else []) + [
    "-vf", "scale=-2:1920:flags=lanczos,pad=1080:1920:(ow-iw)/2:0:color=0x05060a", "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-pix_fmt", "yuv420p"] + (["-c:a", "aac", "-b:a", "160k", "-shortest"] if AUD else []) + ["-movflags", "+faststart", OUT]
subprocess.run(cmd, check=True)
shutil.rmtree(tmp)
print(json.dumps({"frames": n}))
