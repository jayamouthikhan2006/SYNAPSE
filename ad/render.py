#!/usr/bin/env python3
"""Frame-accurate renderer for motiondesign scenes.
usage: python3 render.py scene.html out.mp4 [--dur 15] [--fps 60] [--mb 4] [--shutter .5] [--audio track.wav] [--workers 4] [--from 0 --to 15] [--stills 1.0,3.2]
--mb N      motion-blur subframes per frame (1 = draft, 4 = final). Real accumulation blur.
--stills    only export PNG stills at these times (for fast checking)."""
import argparse, os, subprocess, sys, numpy as np, cv2, math, tempfile, shutil
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
from playwright.sync_api import sync_playwright

def open_page(p, html):
    b = p.chromium.launch(args=["--disable-gpu-vsync", "--force-color-profile=srgb"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    pg.goto(Path(html).resolve().as_uri())  # as_uri() so Windows paths become valid file:/// URLs
    pg.wait_for_function("window.MD_READY===true", timeout=20000)
    pg.evaluate("window.render(0)")
    pg.wait_for_timeout(200)
    return b, pg

def grab(pg, t, tc=None):
    tc = t if tc is None else tc
    pg.evaluate(f"window.render({t:.6f},{tc:.6f})")
    buf = pg.screenshot(type="png", clip={"x": 0, "y": 0, "width": 1920, "height": 1080})
    return cv2.imdecode(np.frombuffer(buf, np.uint8), cv2.IMREAD_COLOR)

def work(args):
    # retry a chunk if the browser driver dies (memory pressure with many parallel Chromium instances)
    for attempt in range(4):
        try:
            return _work(args)
        except Exception as e:
            print(f"chunk {os.path.basename(args[-1])} attempt {attempt + 1} failed: {e}", flush=True)
            if os.path.exists(args[-1]):
                os.remove(args[-1])
    raise RuntimeError("chunk failed 4 times: " + args[-1])

def _work(args):
    html, f0, f1, fps, mb, shutter, out = args
    if os.path.exists(out + ".done"):
        return out
    with sync_playwright() as p:
        b, pg = open_page(p, html)
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "1920x1080",
                                "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
                                "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
        for f in range(f0, f1):
            if mb <= 1:
                img = grab(pg, f / fps)
            else:
                acc = np.zeros((1080, 1920, 3), np.float32)
                for s in range(mb):
                    acc += grab(pg, (f + s / mb * shutter) / fps, f / fps)
                img = (acc / mb).round().astype(np.uint8)
            enc.stdin.write(img.tobytes())
        enc.stdin.close(); enc.wait(); b.close()
    open(out + ".done", "w").close()
    return out

def main():
    a = argparse.ArgumentParser()
    a.add_argument("html"); a.add_argument("out")
    a.add_argument("--dur", type=float, default=15); a.add_argument("--fps", type=int, default=60)
    a.add_argument("--mb", type=int, default=4); a.add_argument("--shutter", type=float, default=.5)
    a.add_argument("--audio"); a.add_argument("--workers", type=int, default=min(4, os.cpu_count() or 1))
    a.add_argument("--from", dest="t0", type=float, default=0); a.add_argument("--to", dest="t1", type=float)
    a.add_argument("--stills"); a.add_argument("--chunk", type=int, default=240)
    o = a.parse_args()
    if o.stills:
        with sync_playwright() as p:
            b, pg = open_page(p, o.html)
            os.makedirs(o.out, exist_ok=True)
            for t in [float(x) for x in o.stills.split(",")]:
                cv2.imwrite(os.path.join(o.out, f"still_{t:07.3f}.png"), grab(pg, t))
            b.close()
        return
    t1 = o.t1 if o.t1 is not None else o.dur
    F0, F1 = round(o.t0 * o.fps), round(t1 * o.fps)
    # small chunks in a persistent folder: a crash only costs one chunk, and a rerun resumes
    step = o.chunk
    tmp = os.path.abspath(o.out + ".parts"); os.makedirs(tmp, exist_ok=True)
    jobs = [(o.html, f, min(F1, f + step), o.fps, o.mb, o.shutter, os.path.join(tmp, f"seg{i:03d}.mp4"))
            for i, f in enumerate(range(F0, F1, step))]
    with ProcessPoolExecutor(max(1, o.workers)) as ex:
        segs = list(ex.map(work, jobs))
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join(f"file '{Path(s).as_posix()}'\n" for s in segs))
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst]
    if o.audio:
        cmd += ["-ss", str(o.t0), "-i", o.audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k", "-shortest"]
    cmd += ["-c:v", "copy", "-movflags", "+faststart", o.out]
    subprocess.run(cmd, check=True); shutil.rmtree(tmp)
    print("wrote", o.out)

if __name__ == "__main__":
    main()
