"""Minimal WellSaid REST helper (direct API, supports the `preview` model).
Reads WELLSAID_API_KEY from env or from ../../wellsaid-connector/.env. Never prints the key."""
import io, json, os, re, subprocess, sys, time, zipfile, urllib.request, urllib.error

BASE = "https://api.wellsaidlabs.com/v1"

def api_key():
    k = os.environ.get("WELLSAID_API_KEY")
    if k:
        return k.strip()
    env = os.path.join(os.path.dirname(__file__), "..", "..", "wellsaid-connector", ".env")
    with open(env) as f:
        for line in f:
            m = re.match(r"\s*WELLSAID_API_KEY\s*=\s*(.+)", line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("no WELLSAID_API_KEY found")

def _post(path, body, accept, retries=4):
    data = json.dumps(body).encode()
    for attempt in range(retries):
        req = urllib.request.Request(BASE + path, data=data, method="POST", headers={
            "X-Api-Key": api_key(), "Content-Type": "application/json", "Accept": accept})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read(), r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:400]
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 + attempt * 2)
                continue
            raise SystemExit(f"HTTP {e.code} on {path}: {msg}")

def tts(text, speaker_id, model="preview", fmt="wav", sample_rate=None):
    body = {"speaker_id": int(speaker_id), "text": text, "model": model,
            "audio_configs": {"file_format": fmt}}
    if sample_rate:
        body["audio_configs"]["sample_rate"] = sample_rate
    audio, _ = _post("/tts/stream", body, "audio/" + ("mpeg" if fmt == "mp3" else fmt))
    return audio

def tts_timing(text, speaker_id, model="preview", fmt="wav"):
    body = {"speaker_id": int(speaker_id), "text": text, "model": model,
            "audio_configs": {"file_format": fmt}}
    blob, ctype = _post("/tts/word-timing", body, "application/zip")
    out = {}
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for name in z.namelist():
            out[name] = z.read(name)
    return out

def ffmpeg():
    p = os.environ.get("FFMPEG_PATH")
    if p:
        return p
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def duration_seconds(path):
    """Decode to raw s16le mono 24k and count samples (streamed WAV headers are unreliable)."""
    raw = subprocess.run([ffmpeg(), "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "24000", "-"],
                         capture_output=True).stdout
    return len(raw) / 2 / 24000.0

def to_mp3(src, dst, bitrate="96k"):
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", src, "-codec:a", "libmp3lame", "-b:a", bitrate,
                    "-ar", "44100", "-ac", "1", dst], check=True)

if __name__ == "__main__":
    # smoke test: one preview render + one word-timing render
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    text = "To report a suspected privacy incident, contact the Privacy Office within forty-eight hours."
    t0 = time.time(); wav = tts(text, 30, "preview", "wav"); t1 = time.time()
    p = os.path.join(out, "smoke_preview_wade30.wav"); open(p, "wb").write(wav)
    print(f"stream preview: {len(wav)} bytes in {t1-t0:.1f}s, duration {duration_seconds(p):.2f}s")
    try:
        t0 = time.time(); files = tts_timing(text, 30, "preview", "wav"); t1 = time.time()
        print(f"word-timing preview OK in {t1-t0:.1f}s: files={list(files)}")
        for n, b in files.items():
            open(os.path.join(out, "smoke_timing_" + os.path.basename(n)), "wb").write(b)
            if n.endswith(".json"):
                j = json.loads(b); s = json.dumps(j)[:900]; print("timing json head:", s)
    except SystemExit as e:
        print("word-timing with preview FAILED:", e)
        try:
            files = tts_timing(text, 30, "caruso", "wav")
            print("word-timing caruso OK:", list(files))
            for n, b in files.items():
                if n.endswith(".json"):
                    print("timing json head:", json.dumps(json.loads(b))[:900])
        except SystemExit as e2:
            print("word-timing caruso FAILED:", e2)
