
import sys, os, json, glob, subprocess, shutil, numpy as np, cv2, torch
from PIL import Image
cfg = json.load(open(sys.argv[1]))
OUT = cfg["out"]; W, H = 1920, 1080
shutil.rmtree(OUT, ignore_errors=True)
for d in ["master", "desk/hi", "desk/lo", "phone/hi", "phone/lo", "depth/desk", "depth/phone"]: os.makedirs(f"{OUT}/{d}", exist_ok=True)
# 1. master frames (PNG) with duplicate seam frames dropped
idx = 0; shots = []
for si, s in enumerate(cfg["shots"]):
    tmp = f"{OUT}/tmp_{si}"; os.makedirs(tmp, exist_ok=True)
    vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},hqdn3d=2.5:2.5:3:3"
    if s.get("interp"): vf += f",minterpolate=fps={24*s['interp']}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", s["path"], "-vf", vf, f"{tmp}/%05d.png"], check=True)
    fs = sorted(glob.glob(f"{tmp}/*.png"))
    if si > 0: fs = fs[1:]          # first frame == previous shot's last frame
    start = idx
    for f in fs:
        os.rename(f, f"{OUT}/master/{idx:05d}.png"); idx += 1
    shutil.rmtree(tmp)
    shots.append({"id": s["id"], "start": start, "end": idx - 1, "real": s.get("real", False), "motion": s.get("motion", [0, 0, 0]), "cropx": s.get("cropx", 0.5)})
N = idx; print("frames", N, flush=True)
def cropx_for(i):
    for s in shots:
        if s["start"] <= i <= s["end"]: return s["cropx"]
    return 0.5
PW = int(round(H * 9 / 16)); PW -= PW % 2   # 608
def ph_crop(img, i):
    cx = cropx_for(i); x0 = int(np.clip(cx * W - PW / 2, 0, W - PW)); return img.crop((x0, 0, x0 + PW, H)), x0
q = cfg.get("q", {})
jobs = []
def enc(args):
    i = args
    im = Image.open(f"{OUT}/master/{i:05d}.png").convert("RGB")
    im.resize(tuple(cfg["desk"]), Image.LANCZOS).save(f"{OUT}/desk/hi/{i:04d}.webp", "WEBP", quality=q.get("desk", 46), method=6)
    pc, _ = ph_crop(im, i)
    pc.resize(tuple(cfg["phone"]), Image.LANCZOS).save(f"{OUT}/phone/hi/{i:04d}.webp", "WEBP", quality=q.get("phone", 44), method=6)
    if i % cfg["lostep"] == 0:
        im.resize((cfg["desk"][0] // 3, cfg["desk"][1] // 3), Image.LANCZOS).save(f"{OUT}/desk/lo/{i:04d}.webp", "WEBP", quality=40, method=6)
        pc.resize((cfg["phone"][0] // 2, cfg["phone"][1] // 2), Image.LANCZOS).save(f"{OUT}/phone/lo/{i:04d}.webp", "WEBP", quality=38, method=6)
    return i
print("master ready (encoding is done by encode.py)", flush=True)
# 2. depth every dstep frames, stabilised per shot
from transformers import AutoImageProcessor, AutoModelForDepthEstimation
torch.set_num_threads(14)
mid = "depth-anything/Depth-Anything-V2-Small-hf"
proc = AutoImageProcessor.from_pretrained(mid); model = AutoModelForDepthEstimation.from_pretrained(mid).eval()
DS = cfg["dstep"]; didx = list(range(0, N, DS))
if didx[-1] != N - 1: didx.append(N - 1)
raw = {}
for i in didx:
    im = Image.open(f"{OUT}/master/{i:05d}.png").convert("RGB").resize((960, 540), Image.BILINEAR)
    with torch.no_grad():
        d = model(**proc(images=im, return_tensors="pt")).predicted_depth[0].numpy()
    raw[i] = cv2.resize(d, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
print("depth done", flush=True)
norm = {}
for s in shots:
    lo_s = hi_s = None
    prev = None
    for i in [k for k in didx if s["start"] <= k <= s["end"]]:
        d = raw[i]; lo, hi = np.percentile(d, 1), np.percentile(d, 99.5)
        lo_s = lo if lo_s is None else lo_s * 0.8 + lo * 0.2
        hi_s = hi if hi_s is None else hi_s * 0.8 + hi * 0.2
        n = np.clip((d - lo_s) / max(1e-6, hi_s - lo_s), 0, 1)
        if prev is not None: n = n * 0.75 + prev * 0.25      # temporal smoothing
        prev = n; norm[i] = n
for i in didx:
    if i not in norm: norm[i] = norm[min(norm, key=lambda k: abs(k - i))]
# 3. atlases: 4x4 tiles per atlas
TW, TH = cfg["dtile_desk"]; PTW, PTH = cfg["dtile_phone"]; G = 4
atl = []
for a0 in range(0, len(didx), G * G):
    grp = didx[a0:a0 + G * G]
    A = np.zeros((TH * G, TW * G), np.uint8); P = np.zeros((PTH * G, PTW * G), np.uint8)
    for t, i in enumerate(grp):
        n = (norm[i] * 255).astype(np.uint8)
        gx, gy = t % G, t // G
        A[gy * TH:(gy + 1) * TH, gx * TW:(gx + 1) * TW] = cv2.resize(n, (TW, TH), interpolation=cv2.INTER_AREA)
        cx = cropx_for(i); w4 = W // 4; pw4 = PW // 4; x0 = int(np.clip(cx * w4 - pw4 / 2, 0, w4 - pw4))
        P[gy * PTH:(gy + 1) * PTH, gx * PTW:(gx + 1) * PTW] = cv2.resize(n[:, x0:x0 + pw4], (PTW, PTH), interpolation=cv2.INTER_AREA)
    k = len(atl)
    Image.fromarray(A).save(f"{OUT}/depth/desk/{k:03d}.webp", "WEBP", quality=72, method=6)
    Image.fromarray(P).save(f"{OUT}/depth/phone/{k:03d}.webp", "WEBP", quality=72, method=6)
    atl.append(grp)
man = {"fps": 24 * max(s.get("interp", 1) for s in cfg["shots"]), "count": N, "lostep": cfg["lostep"], "dstep": DS, "dindex": didx, "grid": G,
       "desk": {"w": cfg["desk"][0], "h": cfg["desk"][1], "tile": [TW, TH]}, "phone": {"w": cfg["phone"][0], "h": cfg["phone"][1], "tile": [PTW, PTH]},
       "atlases": len(atl), "shots": shots}
json.dump(man, open(f"{OUT}/film.json", "w"))
def du(p): return sum(os.path.getsize(f) for f in glob.glob(p))
print(json.dumps({k: round(du(f"{OUT}/{k}/*") / 1e6, 2) for k in ["desk/hi", "desk/lo", "phone/hi", "phone/lo", "depth/desk", "depth/phone"]}))
