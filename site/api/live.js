// Bridges F1's public live timing (SignalR Core) to the browser as Server-Sent Events.
const WebSocket = require("ws");
const HOST = "livetiming.formula1.com";
const RS = "\x1e";
const TOPICS = ["SessionInfo","SessionData","TrackStatus","LapCount","ExtrapolatedClock","DriverList",
  "TimingData","TimingAppData","TimingStats","TopThree","RaceControlMessages","WeatherData","SessionStatus","TeamRadio","LapSeries","PitLaneTimeCollection"];

async function negotiate() {
  const r = await fetch(`https://${HOST}/signalrcore/negotiate?negotiateVersion=1`, { method: "POST",
    headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("negotiate " + r.status);
  const j = await r.json();
  const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(";")[0]).join("; ");
  return { token: j.connectionToken, cookies };
}

function connect(onSnapshot, onFeed, onError, onPing, topics) {
  let ws, closed = false;
  negotiate().then(({ token, cookies }) => {
    ws = new WebSocket(`wss://${HOST}/signalrcore?id=${encodeURIComponent(token)}`,
      { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } });
    ws.on("open", () => ws.send(JSON.stringify({ protocol: "json", version: 1 }) + RS));
    let subscribed = false;
    ws.on("message", (buf) => {
      for (const part of buf.toString().split(RS)) {
        if (!part) continue;
        let m; try { m = JSON.parse(part); } catch { continue; }
        if (!subscribed && !m.type) { // handshake ack
          subscribed = true;
          ws.send(JSON.stringify({ type: 1, invocationId: "1", target: "Subscribe", arguments: [topics || TOPICS] }) + RS);
        } else if (m.type === 3) {
          if (m.error) onError(new Error(m.error)); else onSnapshot(m.result || {});
        } else if (m.type === 1 && m.target === "feed") {
          onFeed(m.arguments[0], m.arguments[1], m.arguments[2]);
        } else if (m.type === 6) {
          ws.send(JSON.stringify({ type: 6 }) + RS);
          if (onPing) onPing();
        } else if (m.type === 7) {
          onError(new Error("closed by F1: " + (m.error || "")));
        }
      }
    });
    ws.on("error", onError);
    ws.on("unexpected-response", (_q, res) => onError(new Error("ws " + res.statusCode)));
  }).catch(onError);
  return () => { closed = true; try { ws && ws.close(); } catch {} };
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.searchParams.get("mode") === "snapshot") {
    let done = false;
    const tp = url.searchParams.get("topics") ? url.searchParams.get("topics").split(",") : null;
    const stop = connect(
      (snap) => { if (done) return; done = true; stop(); res.setHeader("Cache-Control", "no-store"); res.status(200).json({ ok: true, snapshot: snap }); },
      () => {},
      (e) => { if (done) return; done = true; stop(); res.status(502).json({ ok: false, error: String(e.message || e) }); }, tp);
    setTimeout(() => { if (!done) { done = true; stop(); res.status(504).json({ ok: false, error: "timeout" }); } }, 15000);
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  // Send initial 2KB SSE comment padding to disable any intermediate proxy or edge buffering
  res.write(`: ${" ".repeat(2048)}\n\n`);
  if (typeof res.flush === "function") res.flush();

  const send = (ev, data) => {
    try {
      res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === "function") res.flush();
    } catch (_) {}
  };
  let ended = false;
  const end = () => { if (ended) return; ended = true; clearInterval(hb); clearTimeout(t); stop(); res.end(); };
  const stop = connect(
    (s) => send("snapshot", s),
    (topic, data, ts) => send("feed", [topic, data, ts]),
    (e) => { send("failure", { error: String(e.message || e) }); end(); },
    () => { send("heartbeat", { t: Date.now() }); },
    null
  );
  // Send active heartbeat event every 2.5s to keep connection alive and prevent false pause triggers
  const hb = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
      if (typeof res.flush === "function") res.flush();
    } catch (_) {}
  }, 2500);
  if (hb.unref) hb.unref();

  const t = setTimeout(end, 110000); // client reconnects automatically
  if (t.unref) t.unref();

  if (req.on) req.on("close", end);
};
