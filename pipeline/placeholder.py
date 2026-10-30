
import cv2, numpy as np, subprocess, sys
kf, dp, out = sys.argv[1], sys.argv[2], sys.argv[3]
a, b = sys.argv[4], sys.argv[5]
N = int(sys.argv[6]) if len(sys.argv) > 6 else 120
A = cv2.imread(f"{kf}/{a}.png"); B = cv2.imread(f"{kf}/{b}.png")
H, W = 1080, 1920
A = cv2.resize(A, (W, H), interpolation=cv2.INTER_AREA); B = cv2.resize(B, (W, H), interpolation=cv2.INTER_AREA)
D = cv2.resize(cv2.imread(f"{dp}/{a}.png", 0), (W, H)).astype(np.float32) / 255.0
D = cv2.GaussianBlur(D, (0, 0), 6)
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
cx, cy = W / 2, H * 0.5
p = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "24", "-i", "-",
                      "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
cut = int(N * 0.78)
for i in range(N):
    t = i / (N - 1)
    e = t * t * (3 - 2 * t)
    s = 1.0 + e * 0.16 * (0.35 + 0.65 * D)          # nearer pixels grow faster = depth push
    sway = np.sin(t * 3.1) * 6 * (D - 0.4)
    mx = cx + (xs - cx) / s + sway; my = cy + (ys - cy) / s
    fa = cv2.remap(A, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    if i >= cut:
        k = (i - cut) / (N - 1 - cut); k = k * k * (3 - 2 * k)
        fr = (fa.astype(np.float32) * (1 - k) + B.astype(np.float32) * k)
        fr = np.clip(fr + 40 * np.sin(np.pi * k), 0, 255).astype(np.uint8)   # light-burn through the blend
    else:
        fr = fa
    if i == N - 1: fr = B
    p.stdin.write(fr.tobytes())
p.stdin.close(); p.wait()
