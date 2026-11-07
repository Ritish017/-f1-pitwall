// Off-session data: current/last session, next race, last result, standings (all free, no auth).
async function j(u) { const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } }); if (!r.ok) throw new Error(u + " " + r.status); const t = await r.text(); return JSON.parse(t.replace(/^\uFEFF/, "")); }
module.exports = async (req, res) => {
  const out = {};
  const tasks = {
    session: j("https://livetiming.formula1.com/static/SessionInfo.json"),
    schedule: j("https://api.jolpi.ca/ergast/f1/current.json?limit=40"),
    last: j("https://api.jolpi.ca/ergast/f1/current/last/results.json"),
    drivers: j("https://api.jolpi.ca/ergast/f1/current/driverstandings.json"),
    teams: j("https://api.jolpi.ca/ergast/f1/current/constructorstandings.json"),
  };
  await Promise.all(Object.entries(tasks).map(async ([k, p]) => { try { out[k] = await p; } catch (e) { out[k + "Error"] = String(e.message); } }));
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.status(200).json(out);
};
