// Track outline (free MultiViewer circuit data), proxied for CORS and cached.
module.exports = async (req, res) => {
  const u = new URL(req.url, "http://x");
  const key = parseInt(u.searchParams.get("key"), 10), year = parseInt(u.searchParams.get("year"), 10) || new Date().getFullYear();
  if (!key) return res.status(400).json({ error: "key required" });
  for (const y of [year, year - 1, year - 2]) {
    try {
      const r = await fetch(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const d = await r.json();
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
      return res.status(200).json({ x: d.x, y: d.y, rotation: d.rotation || 0, corners: (d.corners || []).map(c => ({ n: c.number, x: c.trackPosition.x, y: c.trackPosition.y })) });
    } catch {}
  }
  res.status(404).json({ error: "circuit not found" });
};
