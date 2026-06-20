import json, re, time, hashlib, subprocess, tempfile, urllib.request, urllib.parse, pathlib, sys

SESS = json.loads(open("../frontend/data/session.json", encoding="utf-8-sig").read())
DOMAIN = "https://music.youtube.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0"
COOKIE = SESS["cookie"]; VISITOR = SESS["visitor_data"]
HELPER = "../repos/server/music_assistant/providers/ytmusic/_cipher.mjs"
VID = sys.argv[1] if len(sys.argv) > 1 else "LcSZ-2-fwT0"

def get(url, headers):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers)).read()

def sapisidhash():
    sap = re.search(r"(?:^|;\s*)SAPISID=([^;]+)", COOKIE).group(1)
    ts = int(time.time())
    h = hashlib.sha1(f"{ts} {sap} {DOMAIN}".encode()).hexdigest()
    return f"SAPISIDHASH {ts}_{h}"

base_headers = {"User-Agent": UA, "Cookie": COOKIE, "X-Goog-Visitor-Id": VISITOR, "Accept-Language": "en"}

# 1) base.js + client version + sts from home HTML  (mirrors _ensure_player_assets)
html = get(DOMAIN + "/", base_headers).decode("utf-8", "replace")
client_version = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html).group(1)
js_url = re.search(r'"jsUrl":"([^"]+)"', html).group(1)
if js_url.startswith("/"): js_url = DOMAIN + js_url
player_id = re.search(r"/player/([^/]+)/", js_url).group(1)
base_js = get(js_url, {"User-Agent": UA}).decode("utf-8", "replace")
sts = int(re.search(r"signatureTimestamp:(\d+)", base_js).group(1))
cache_path = pathlib.Path(tempfile.gettempdir()) / f"ytm_base_{player_id}.js"
cache_path.write_text(base_js, encoding="utf-8")
print(f"player_id={player_id} client_version={client_version} sts={sts} base.js={len(base_js)}B")

# 2) WEB_REMIX player call  (mirrors _player_web_remix)
body = json.dumps({
    "context": {"client": {"clientName": "WEB_REMIX", "clientVersion": client_version,
                           "hl": "en", "gl": "US", "visitorData": VISITOR}, "user": {}},
    "videoId": VID,
    "playbackContext": {"contentPlaybackContext": {"html5Preference": "HTML5_PREF_WANTS",
                                                    "signatureTimestamp": sts}},
    "contentCheckOk": True, "racyCheckOk": True}).encode()
ph = {**base_headers, "Content-Type": "application/json", "Authorization": sapisidhash(),
      "x-origin": DOMAIN, "X-Goog-AuthUser": "0",
      "X-Youtube-Client-Name": "67", "X-Youtube-Client-Version": client_version}
pr = json.loads(urllib.request.urlopen(urllib.request.Request(
    DOMAIN + "/youtubei/v1/player?prettyPrint=false", data=body, headers=ph)).read())
print("playability:", pr["playabilityStatus"]["status"], "| title:", pr.get("videoDetails", {}).get("title"))
fmts = {f.get("itag"): f for f in pr["streamingData"]["adaptiveFormats"]
        if str(f.get("mimeType", "")).startswith("audio/")}
print("premium itags present:", [t for t in (141, 774) if t in fmts])
fmt = next(fmts[t] for t in (141, 774) if t in fmts)

# 3) descramble via node helper  (mirrors _descramble)
cipher = urllib.parse.parse_qs(fmt["signatureCipher"])
base_url = cipher["url"][0]; sig_param = cipher.get("sp", ["sig"])[0]
split = urllib.parse.urlparse(base_url)
query = urllib.parse.parse_qs(split.query, keep_blank_values=True)
n_orig = query.get("n", [None])[0]
out = subprocess.run(["node", HELPER, str(cache_path), cipher["s"][0], n_orig or ""],
                     capture_output=True, text=True)
res = json.loads(out.stdout)
print("descramble: sig.len=", len(res["sig"]), "n:", n_orig, "->", res.get("n"))

# 4) build URL  (mirrors _resolve_audio_premium) + fetch
query[sig_param] = [res["sig"]]
if res.get("n"): query["n"] = [res["n"]]
url = split._replace(query=urllib.parse.urlencode(query, doseq=True)).geturl()
clen = int(query["clen"][0]); dur = float(query["dur"][0])
req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-200000"})
r = urllib.request.urlopen(req); data = r.read()
print(f"FETCH itag {fmt['itag']}: HTTP {r.status} got {len(data)}B | {round(clen*8/dur/1000)} kbps | hdr {data[:8].hex()}")
print("RESULT:", "OK 256k native via MA code path" if r.status in (200,206) and data[4:8]==b'ftyp' else "FAIL")
