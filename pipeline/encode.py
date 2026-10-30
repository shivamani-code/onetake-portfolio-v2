
import sys, os, json, glob, shutil, numpy as np
from PIL import Image
from concurrent.futures import ProcessPoolExecutor
cfg = json.load(open(sys.argv[1])); OUT = cfg["out"]; man = json.load(open(f"{OUT}/film.json"))
W, H = 1920, 1080; PW = 608; N = man["count"]
for d in ["desk/hi", "desk/lo", "phone/hi", "phone/lo"]:
    shutil.rmtree(f"{OUT}/{d}", ignore_errors=True); os.makedirs(f"{OUT}/{d}", exist_ok=True)
def cropx_for(i):
    for s in man["shots"]:
        if s["start"] <= i <= s["end"]: return s["cropx"]
    return .5
def pick(step, n):
    if step == 1: return list(range(n))
    L = list(range(0, n, step))
    if L[-1] != n - 1: L.append(n - 1)
    return L
E = cfg["enc"]
def dense_set(step):
    s = set()
    for sid, t0, t1 in E.get("dense", []):
        sh = next((x for x in man["shots"] if x["id"] == sid), None)
        if not sh: continue
        a = int(sh["start"] + (sh["end"] - sh["start"]) * t0); b = int(sh["start"] + (sh["end"] - sh["start"]) * t1)
        s.update(range(a, b + 1, step))
    return s
dk = sorted(set(pick(E["desk_step"], N)) | dense_set(E.get("desk_step_dense", E["desk_step"])))
pk = sorted(set(pick(E["phone_step"], N)) | dense_set(E.get("phone_step_dense", E["phone_step"])))
lo = pick(E["lostep"], N)
sd, sp, sl = set(dk), set(pk), set(lo)
def job(i):
    im = Image.open(f"{OUT}/master/{i:05d}.png").convert("RGB")
    cx = cropx_for(i); x0 = int(np.clip(cx * W - PW / 2, 0, W - PW)); pc = im.crop((x0, 0, x0 + PW, H))
    if i in sd: im.resize(tuple(E["desk"]), Image.LANCZOS).save(f"{OUT}/desk/hi/{i:04d}.avif", "AVIF", quality=E["desk_q"], speed=6)
    if i in sp: pc.resize(tuple(E["phone"]), Image.LANCZOS).save(f"{OUT}/phone/hi/{i:04d}.avif", "AVIF", quality=E["phone_q"], speed=6)
    if i in sl:
        im.resize((E["desk"][0] // 3, E["desk"][1] // 3), Image.LANCZOS).save(f"{OUT}/desk/lo/{i:04d}.avif", "AVIF", quality=E["lo_q"], speed=6)
        pc.resize((E["phone"][0] // 2, E["phone"][1] // 2), Image.LANCZOS).save(f"{OUT}/phone/lo/{i:04d}.avif", "AVIF", quality=E["lo_q"], speed=6)
    return i
todo = sorted(sd | sp | sl)
with ProcessPoolExecutor(14) as ex:
    for _ in ex.map(job, todo, chunksize=6): pass
man.update({"ext": "avif", "lostep": E["lostep"], "lo": lo, "desk": {**man["desk"], "w": E["desk"][0], "h": E["desk"][1], "avail": dk}, "phone": {**man["phone"], "w": E["phone"][0], "h": E["phone"][1], "avail": pk}})
json.dump(man, open(f"{OUT}/film.json", "w"))
def du(p): return sum(os.path.getsize(f) for f in glob.glob(p))
print(json.dumps({k: round(du(f"{OUT}/{k}/*") / 1e6, 2) for k in ["desk/hi", "desk/lo", "phone/hi", "phone/lo", "depth/desk", "depth/phone"]}), len(dk), len(pk), len(lo))
