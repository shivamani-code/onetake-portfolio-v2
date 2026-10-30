
import sys, os, glob, numpy as np, torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation
torch.set_num_threads(int(os.environ.get("NT","14")))
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
mid = "depth-anything/Depth-Anything-V2-Small-hf"
proc = AutoImageProcessor.from_pretrained(mid); model = AutoModelForDepthEstimation.from_pretrained(mid).eval()
files = sorted(glob.glob(os.path.join(src, "*.png")) + glob.glob(os.path.join(src, "*.jpg")) + glob.glob(os.path.join(src, "*.webp")))
raw = []
for f in files:
    im = Image.open(f).convert("RGB")
    with torch.no_grad():
        inp = proc(images=im, return_tensors="pt")
        d = model(**inp).predicted_depth[0].numpy()
    raw.append(d)
    print("depth", os.path.basename(f), d.shape, flush=True)
# stable normalisation across the whole sequence (per shot): robust percentiles, EMA on bounds
lo_s = hi_s = None
for f, d in zip(files, raw):
    lo, hi = np.percentile(d, 1), np.percentile(d, 99.5)
    lo_s = lo if lo_s is None else lo_s * 0.85 + lo * 0.15
    hi_s = hi if hi_s is None else hi_s * 0.85 + hi * 0.15
    n = np.clip((d - lo_s) / max(1e-6, hi_s - lo_s), 0, 1)
    Image.fromarray((n * 255).astype(np.uint8)).save(os.path.join(out, os.path.splitext(os.path.basename(f))[0] + ".png"))
