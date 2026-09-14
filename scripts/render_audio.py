"""Render every voiced segment (original + fixed) with WellSaid's preview model via the
word-timing endpoint, so each clip ships with word-level timing. Idempotent; --force re-renders.
Outputs: audio/raw/<key>.wav, audio/timing/<key>.json, audio/mp3/<key>.mp3, audio/manifest.json"""
import concurrent.futures as cf, difflib, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import wellsaid_api as ws

ROOT = os.path.join(os.path.dirname(__file__), "..")
CONTENT = json.load(open(os.path.join(ROOT, "src", "content.json")))
RAW, TIM, MP3 = (os.path.join(ROOT, "audio", d) for d in ("raw", "timing", "mp3"))
FORCE = "--force" in sys.argv
TTS_SUBS = [("AI", "A I"), ("ClaimsCore", "Claims Core"), ("HomeShield", "Home Shield"), ("ChatGPT", "Chat G P T"),
            ("CEO", "C E O"), ("Dr. ", "Doctor "), ("401(k)", "four oh one K")]
ONLY = set()
for a in sys.argv:
    if a.startswith("--only="):
        ONLY = set(a.split("=", 1)[1].split(","))

def tts_text(s):
    for a, b in TTS_SUBS:
        s = s.replace(a, b)
    return s

def jobs():
    fixes = {f["segment"]: f for f in CONTENT["findings"] if f.get("fixed")}
    for c in CONTENT["courses"]:
        for s in c["segments"]:
            if not s.get("voice"):
                continue
            spk = c["voice"]["speaker_id"]
            yield (s["id"] + "_orig", spk, s.get("tts") or s["script"], s["script"])
            f = fixes.get(s["id"])
            if f:
                fspk = (f.get("voice_override") or {}).get("speaker_id", spk)
                yield (s["id"] + "_fix", fspk, f.get("tts_fixed") or f["fixed"], f["fixed"])
                if f.get("alt"):
                    yield (s["id"] + "_alt", spk, f["alt"].get("tts") or f["alt"]["text"], f["alt"]["text"])

def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())

def align(display, timing_json):
    """Map each whitespace token of `display` to [start, end] using STT word timings."""
    stt = []
    for r in timing_json.get("results", []):
        alt = (r.get("alternatives") or [{}])[0]
        for w in alt.get("words", []):
            st = float(str(w.get("startOffset", "0s")).rstrip("s") or 0)
            en = float(str(w.get("endOffset", "0s")).rstrip("s") or st)
            stt.append((w.get("word", ""), st, en))
    toks = display.split()
    if not stt:
        return [[0, 0] for _ in toks]
    a = [norm(t) for t in toks]; b = [norm(w) for w, _, _ in stt]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    out = [None] * len(toks)
    blocks = sm.get_matching_blocks()
    for i, j, n in blocks:
        for k in range(n):
            out[i + k] = [stt[j + k][1], stt[j + k][2]]
    # fill gaps: distribute the time between neighbors by character length
    i = 0
    while i < len(out):
        if out[i] is not None:
            i += 1; continue
        j = i
        while j < len(out) and out[j] is None:
            j += 1
        t0 = out[i - 1][1] if i > 0 else stt[0][1]
        t1 = out[j][0] if j < len(out) else stt[-1][2]
        if t1 <= t0:
            t1 = t0 + 0.25 * (j - i)
        total = sum(max(len(a[k]), 1) for k in range(i, j)) or 1
        t = t0
        for k in range(i, j):
            span = (t1 - t0) * max(len(a[k]), 1) / total
            out[k] = [round(t, 3), round(t + span, 3)]; t += span
        i = j
    return [[round(s, 3), round(e, 3)] for s, e in out]

def render(job):
    key, spk, text, display = job
    wav = os.path.join(RAW, key + ".wav"); tim = os.path.join(TIM, key + ".json"); mp3 = os.path.join(MP3, key + ".mp3")
    if not FORCE and key not in ONLY and os.path.exists(wav) and os.path.exists(tim):
        pass
    else:
        t0 = time.time()
        files = ws.tts_timing(tts_text(text), spk, "preview", "wav")
        audio = next(b for n, b in files.items() if n.startswith("audio"))
        timing = next(b for n, b in files.items() if n.endswith(".json"))
        # the zip's "audio.mp3" is PCM WAV when wav was requested; keep the real container
        open(wav if audio[:4] == b"RIFF" else wav.replace(".wav", ".mp3.src"), "wb").write(audio)
        open(tim, "wb").write(timing)
        print(f"  rendered {key} ({spk}) in {time.time()-t0:.1f}s", flush=True)
    src = wav if os.path.exists(wav) else wav.replace(".wav", ".mp3.src")
    ws.to_mp3(src, mp3, "128k")
    dur = ws.duration_seconds(mp3)
    words = align(display, json.load(open(tim)))
    return key, {"file": "audio/mp3/" + key + ".mp3", "duration": round(dur, 3), "speaker_id": spk, "words": words,
                 "text": display}

if __name__ == "__main__":
    for d in (RAW, TIM, MP3):
        os.makedirs(d, exist_ok=True)
    all_jobs = list(jobs())
    print(f"{len(all_jobs)} clips to render (workers=4)", flush=True)
    manifest = {}
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for key, entry in ex.map(render, all_jobs):
            manifest[key] = entry
    json.dump(manifest, open(os.path.join(ROOT, "audio", "manifest.json"), "w"), indent=1)
    total = sum(e["duration"] for e in manifest.values())
    print(f"done: {len(manifest)} clips, {total:.1f}s of audio, {time.time()-t0:.0f}s wall", flush=True)
