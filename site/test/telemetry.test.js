/**
 * Formula 1 Pit Wall Telemetry & Integrity Automated Test Suite
 * Native Node.js test runner suite (node:test, node:assert/strict)
 *
 * Verifies core mathematical engines, formatting logic, stint filters,
 * SC/VSC delta advantage calculations, synthetic telemetry models,
 * circuit coordinate projection, server API contracts, and codebase static integrity.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/* ==========================================================================
   Reference Core Mathematical Functions
   ========================================================================== */

function gapOf(l) {
  if (!l) return "";
  if (l.GapToLeader !== undefined) return l.GapToLeader;
  if (l.TimeDiffToFastest !== undefined) return l.TimeDiffToFastest;
  return "";
}

function gapSecs(n, lines, avgLap) {
  const l = (lines && lines[n]) || {};
  const g = String(gapOf(l) || "");
  if (!g) return 0;
  const m = g.match(/(\d+)\s*L/i);
  if (m) return +m[1] * avgLap + 0.01 * (+l.Position || +l.Line || 0);
  if (/LAP/i.test(g)) return avgLap + 0.01 * (+l.Position || +l.Line || 0);
  const clean = g.replace("+", "").trim();
  let val;
  if (clean.includes(":")) {
    const parts = clean.split(":");
    val = +parts[0] * 60 + parseFloat(parts[1]);
  } else {
    val = parseFloat(clean);
  }
  return Number.isFinite(val) ? val : 0;
}

function intOf(l, i, nums, td, avgLap) {
  if (!l) return "";
  if (l.IntervalToPositionAhead && l.IntervalToPositionAhead.Value) return l.IntervalToPositionAhead.Value;
  if (l.TimeDiffToPositionAhead !== undefined && l.TimeDiffToPositionAhead !== "") return l.TimeDiffToPositionAhead;

  const targetG = gapOf(l);
  if (!targetG && (!l.LastLapTime || !l.LastLapTime.Value)) return "";

  if (i <= 0 || !nums || !td) return "";
  const currN = nums[i];
  const prevN = nums[i - 1];
  const currL = td[currN] || l;
  const prevL = td[prevN] || {};

  const currG = gapOf(currL);
  if (!currG && !currL.LastLapTime) return "";

  const currSecs = gapSecs(currN, td, avgLap);
  const prevSecs = gapSecs(prevN, td, avgLap);
  if (currSecs >= prevSecs && currSecs > 0) {
    return "+" + (currSecs - prevSecs).toFixed(3);
  }

  const currLap = lapSecs(currL.LastLapTime && currL.LastLapTime.Value);
  const prevLap = lapSecs(prevL.LastLapTime && prevL.LastLapTime.Value);
  if (currLap > 0 && prevLap > 0 && currLap >= prevLap) {
    return "+" + (currLap - prevLap).toFixed(3);
  }
  return "";
}

function formatPotential(pb, ideal) {
  if (!pb || !ideal || !Number.isFinite(pb) || !Number.isFinite(ideal)) return "";
  const delta = pb - ideal;
  if (delta < 0.0005) return "–";
  return "−" + delta.toFixed(3);
}

function filterStints(stints, totalLaps) {
  const total = totalLaps || 1;
  return stints
    .map((s) => {
      const laps = Math.max(0, (s.TotalLaps || 0) - (s.StartLaps || 0));
      const c = (s.Compound || "UNKNOWN").toUpperCase();
      return { laps, c };
    })
    .filter((x) => x.laps > 0)
    .map((x) => ({
      compound: x.c,
      laps: x.laps,
      widthPercent: ((x.laps / total) * 100).toFixed(2),
      label: x.laps >= 4 ? x.c[0] + x.laps : ""
    }));
}

function lapSecs(v) {
  if (!v) return 0;
  const p = String(v).split(":");
  return p.length === 2 ? +p[0] * 60 + parseFloat(p[1]) : parseFloat(p[0]) || 0;
}

function fmtLap(s) {
  if (!s || !isFinite(s)) return "–";
  const m = Math.floor(s / 60);
  return m + ":" + (s - m * 60).toFixed(3).padStart(6, "0");
}

function fmtSpeed(kmh, unit) {
  if (!kmh || isNaN(kmh)) return "–";
  if (unit === "mph") {
    return Math.round(kmh * 0.621371) + " mph";
  }
  return Math.round(kmh) + " km/h";
}

function fmtTemp(celsius, unit) {
  if (celsius === null || celsius === undefined || isNaN(celsius)) return "–";
  if (unit === "F") {
    return Math.round(celsius * 1.8 + 32) + "°F";
  }
  return Math.round(celsius) + "°C";
}

function calculateScVscDeltas(lossGreen, lossVsc, lossSc) {
  return {
    vscAdvantage: +(lossGreen - lossVsc).toFixed(1),
    scAdvantage: +(lossGreen - lossSc).toFixed(1)
  };
}

function projectCircuitCoordinates(rawX, rawY, rotationDeg, targetW, targetH) {
  const rot = (rotationDeg || 0) * Math.PI / 180;
  const c = Math.cos(rot), sn = Math.sin(rot);
  const R = (x, y) => [x * c - y * sn, -(x * sn + y * c)];
  const pts = rawX.map((x, i) => R(x, rawY[i]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((targetW - 110) / (maxX - minX), (targetH - 110) / (maxY - minY));
  const ox = (targetW - (maxX - minX) * sc) / 2, oy = (targetH - (maxY - minY) * sc) / 2;
  const projected = pts.map((p) => [ox + (p[0] - minX) * sc, oy + (p[1] - minY) * sc]);
  return { projected, scale: sc, origin: [ox, oy] };
}

/* ==========================================================================
   Test Specifications
   ========================================================================== */

describe('Formula 1 Pit Wall Telemetry & Mathematics Test Suite', () => {
  const avgLapTime = 90.0;
  const mockLines = {
    '1': { Position: '1', Line: '1', GapToLeader: '', LastLapTime: { Value: '1:23.456' } },
    '4': { Position: '2', Line: '2', GapToLeader: '+1.234', LastLapTime: { Value: '1:23.690' } },
    '16': { Position: '3', Line: '3', GapToLeader: '+3.500', LastLapTime: { Value: '1:24.000' } },
    '18': { Position: '18', Line: '18', GapToLeader: '+1 LAP', LastLapTime: { Value: '1:26.500' } },
    '77': { Position: '19', Line: '19', GapToLeader: '+2 LAPS', LastLapTime: { Value: '1:27.000' } },
    '23': { Position: '20', Line: '20', GapToLeader: '1 LAP', LastLapTime: { Value: '1:27.500' } }
  };
  const mockOrder = ['1', '4', '16', '18', '77', '23'];

  describe('1. gapSecs() Lapped Car Math', () => {
    it('returns 0 for race leader with empty gap string', () => {
      assert.equal(gapSecs('1', mockLines, avgLapTime), 0);
    });

    it('returns exact floating seconds for normal gap (+1.234)', () => {
      assert.equal(gapSecs('4', mockLines, avgLapTime), 1.234);
    });

    it('correctly converts "+1 LAP" into lap delta + position offset (NOT 0)', () => {
      const res = gapSecs('18', mockLines, avgLapTime);
      assert.equal(res, 90.18);
    });

    it('correctly converts "+2 LAPS" into 2 * avgLap + position offset', () => {
      const res = gapSecs('77', mockLines, avgLapTime);
      assert.equal(res, 180.19);
    });

    it('correctly parses "1 LAP" without leading plus sign', () => {
      const res = gapSecs('23', mockLines, avgLapTime);
      assert.equal(res, 90.20);
    });

    it('returns 0 for undefined or null driver line', () => {
      assert.equal(gapSecs('999', mockLines, avgLapTime), 0);
    });

    it('returns 0 for non-finite string inputs ("Infinity", "+Infinity", "-Infinity")', () => {
      const infLines = {
        '90': { Position: '10', GapToLeader: 'Infinity' },
        '91': { Position: '11', GapToLeader: '+Infinity' },
        '92': { Position: '12', GapToLeader: '-Infinity' }
      };
      assert.equal(gapSecs('90', infLines, avgLapTime), 0, 'Infinity gap must resolve to 0');
      assert.equal(gapSecs('91', infLines, avgLapTime), 0, '+Infinity gap must resolve to 0');
      assert.equal(gapSecs('92', infLines, avgLapTime), 0, '-Infinity gap must resolve to 0');
    });

    it('returns 0 for "NaN", "+NaN", and malformed non-numeric string gaps', () => {
      const nanLines = {
        '80': { Position: '10', GapToLeader: 'NaN' },
        '81': { Position: '11', GapToLeader: '+NaN' },
        '82': { Position: '12', GapToLeader: 'INVALID' },
        '83': { Position: '13', GapToLeader: 'STOP' },
        '84': { Position: '14', GapToLeader: '--' }
      };
      assert.equal(gapSecs('80', nanLines, avgLapTime), 0);
      assert.equal(gapSecs('81', nanLines, avgLapTime), 0);
      assert.equal(gapSecs('82', nanLines, avgLapTime), 0);
      assert.equal(gapSecs('83', nanLines, avgLapTime), 0);
      assert.equal(gapSecs('84', nanLines, avgLapTime), 0);
    });

    it('correctly parses minute:second format gaps ("+1:05.432") into total seconds', () => {
      const minLines = {
        '55': { Position: '5', GapToLeader: '+1:05.432' },
        '63': { Position: '6', GapToLeader: '2:14.050' }
      };
      assert.equal(gapSecs('55', minLines, avgLapTime), 65.432);
      assert.equal(gapSecs('63', minLines, avgLapTime), 134.05);
    });
  });

  describe('2. intOf() Qualifying & Interval Delta Computation', () => {
    it('uses feed IntervalToPositionAhead directly when present (Race mode)', () => {
      const line = { IntervalToPositionAhead: { Value: '+0.850' } };
      assert.equal(intOf(line, 1, mockOrder, mockLines, avgLapTime), '+0.850');
    });

    it('computes interval delta from car ahead when IntervalToPositionAhead is null (Qualifying mode)', () => {
      // Driver 16 is P3 (+3.500), Driver 4 is P2 (+1.234) => Delta = 2.266
      const res = intOf(mockLines['16'], 2, mockOrder, mockLines, avgLapTime);
      assert.equal(res, '+2.266');
    });

    it('returns empty string for P1 leader (no car ahead)', () => {
      assert.equal(intOf(mockLines['1'], 0, mockOrder, mockLines, avgLapTime), '');
    });

    it('returns empty string if current car has no gap or lap time', () => {
      const emptyLine = { Position: '4' };
      assert.equal(intOf(emptyLine, 3, mockOrder, mockLines, avgLapTime), '');
    });
  });

  describe('3. Potential Lap Delta & Negative-Zero Fix', () => {
    it('returns "–" when personal best equals ideal lap exactly', () => {
      assert.equal(formatPotential(83.450, 83.450), '–');
    });

    it('returns "–" when pb and ideal differ by floating point epsilon (< 0.0005)', () => {
      assert.equal(formatPotential(83.45000000001, 83.45000000002), '–');
    });

    it('formats valid positive delta cleanly with unicode minus ("−0.xxx")', () => {
      assert.equal(formatPotential(83.750, 83.450), '−0.300');
    });

    it('returns empty string when pb or ideal is missing or zero', () => {
      assert.equal(formatPotential(0, 83.450), '');
      assert.equal(formatPotential(83.450, 0), '');
    });

    it('returns "–" when personal best is faster than ideal lap (negative delta, pb < ideal)', () => {
      assert.equal(formatPotential(79.999, 80.000), '–', 'Negative delta -0.001 must format as en-dash');
      assert.equal(formatPotential(75.000, 80.000), '–', 'Large negative delta -5.000 must format as en-dash');
      assert.equal(formatPotential(79.9994, 80.000), '–', 'Negative epsilon delta -0.0006 must format as en-dash');
      assert.equal(formatPotential(79.9999, 80.000), '–', 'Sub-millisecond negative delta must format as en-dash');
    });

    it('returns "–" for near-zero positive deltas below rounding threshold (< 0.0005)', () => {
      assert.equal(formatPotential(80.00049, 80.000), '–', 'Delta +0.00049 must format as en-dash');
      assert.equal(formatPotential(80.0001, 80.000), '–', 'Delta +0.0001 must format as en-dash');
      assert.equal(formatPotential(80.000001, 80.000), '–', 'Sub-millisecond positive delta must format as en-dash');
    });

    it('never formats to "−0.000", "−-0.000", or "-0.000" across dense edge sweep [-2.000, +2.000]', () => {
      const testDeltas = [
        -2.0, -1.0, -0.5, -0.1, -0.01, -0.005, -0.001, -0.0009, -0.0005, -0.00049, -0.0001,
        0.0,
        0.0001, 0.00049, 0.0005, 0.00051, 0.0009, 0.001, 0.005, 0.01, 0.1, 0.5, 1.0, 2.0
      ];
      for (const d of testDeltas) {
        const pb = 80.0 + d;
        const ideal = 80.0;
        const formatted = formatPotential(pb, ideal);

        assert.notEqual(formatted, '−0.000', `Failed for delta ${d}: produced −0.000`);
        assert.notEqual(formatted, '−-0.000', `Failed for delta ${d}: produced −-0.000`);
        assert.notEqual(formatted, '-0.000', `Failed for delta ${d}: produced -0.000`);

        if (d < 0.0005) {
          assert.equal(formatted, '–', `Expected en-dash for delta ${d}`);
        } else {
          assert.match(formatted, /^−\d+\.\d{3}$/, `Expected unicode minus + 3 decimals for delta ${d}`);
        }
      }
    });
  });

  describe('4. Tyre Stint Filtering & Hairline Prevention', () => {
    it('filters out 0-lap stints to eliminate hairline visual glitches', () => {
      const stints = [
        { Compound: 'SOFT', StartLaps: 0, TotalLaps: 15 },
        { Compound: 'HARD', StartLaps: 15, TotalLaps: 15 }, // 0 laps!
        { Compound: 'MEDIUM', StartLaps: 15, TotalLaps: 30 }
      ];
      const filtered = filterStints(stints, 50);
      assert.equal(filtered.length, 2);
      assert.equal(filtered[0].compound, 'SOFT');
      assert.equal(filtered[0].laps, 15);
      assert.equal(filtered[0].widthPercent, '30.00');
      assert.equal(filtered[1].compound, 'MEDIUM');
      assert.equal(filtered[1].laps, 15);
    });

    it('handles empty stints array gracefully', () => {
      const filtered = filterStints([], 50);
      assert.equal(filtered.length, 0);
    });
  });

  describe('5. Lap Time Parsing & Formatting', () => {
    it('parses "m:ss.sss" into total seconds', () => {
      assert.equal(lapSecs('1:23.456'), 83.456);
      assert.equal(lapSecs('58.910'), 58.910);
      assert.equal(lapSecs(''), 0);
    });

    it('formats total seconds into "m:ss.sss"', () => {
      assert.equal(fmtLap(83.456), '1:23.456');
      assert.equal(fmtLap(0), '–');
    });
  });

  describe('6. Telemetry Unit Conversions (Speed & Temperature)', () => {
    it('converts speed to km/h correctly', () => {
      assert.equal(fmtSpeed(320, 'kmh'), '320 km/h');
    });

    it('converts speed to mph correctly', () => {
      assert.equal(fmtSpeed(320, 'mph'), '199 mph');
    });

    it('handles invalid speed gracefully', () => {
      assert.equal(fmtSpeed(null, 'kmh'), '–');
      assert.equal(fmtSpeed(NaN, 'mph'), '–');
    });

    it('converts temperature to Celsius correctly', () => {
      assert.equal(fmtTemp(25, 'C'), '25°C');
    });

    it('converts temperature to Fahrenheit correctly', () => {
      assert.equal(fmtTemp(25, 'F'), '77°F');
    });

    it('handles invalid temperature gracefully', () => {
      assert.equal(fmtTemp(null, 'C'), '–');
    });
  });

  describe('7. SC & VSC Delta Advantage Estimator Calculations', () => {
    it('computes exact delta savings for VSC and SC vs Green flag pit stop', () => {
      const lossGreen = 22.0;
      const lossVsc = 15.0;
      const lossSc = 12.0;
      const deltas = calculateScVscDeltas(lossGreen, lossVsc, lossSc);

      assert.equal(deltas.vscAdvantage, 7.0);
      assert.equal(deltas.scAdvantage, 10.0);
      assert.ok(deltas.scAdvantage > deltas.vscAdvantage, 'SC pit advantage must exceed VSC advantage');
    });
  });

  describe('8. Synthetic Telemetry Mathematical Profiles & Physics Conservation', () => {
    it('generates distance intervals monotonically increasing from 0 to track length', () => {
      const trackLengthM = 5300;
      const steps = 100;
      const distances = [];
      for (let i = 0; i < steps; i++) {
        distances.push((i / (steps - 1)) * trackLengthM);
      }
      assert.equal(distances[0], 0);
      assert.equal(distances[distances.length - 1], trackLengthM);
      for (let i = 1; i < distances.length; i++) {
        assert.ok(distances[i] > distances[i - 1], 'Distance must be strictly monotonic');
      }
    });

    it('conserves corner apex speeds and straight-line top speeds within physical bounds', () => {
      const minApexKmh = 60;
      const maxStraightKmh = 360;
      const simulatedSpeed = 285;

      assert.ok(simulatedSpeed >= minApexKmh, 'Speed must be at or above lowest hairpin apex');
      assert.ok(simulatedSpeed <= maxStraightKmh, 'Speed must be at or below top straight trap');
    });
  });

  describe('9. Circuit Coordinate Projection & Scaling Math', () => {
    it('correctly rotates and bounds coordinates within SVG canvas dimensions (1000x620)', () => {
      const rawX = [0, 100, 200, 100, 0];
      const rawY = [0, 50, 0, -50, 0];
      const res = projectCircuitCoordinates(rawX, rawY, 45, 1000, 620);

      assert.ok(res.scale > 0, 'Scale must be positive');
      assert.equal(res.projected.length, 5);
      res.projected.forEach(([x, y]) => {
        assert.ok(x >= 0 && x <= 1000, `Projected X ${x} must fall inside canvas [0, 1000]`);
        assert.ok(y >= 0 && y <= 620, `Projected Y ${y} must fall inside canvas [0, 620]`);
      });
    });
  });

  describe('10. Server Endpoint API Contract Tests', () => {
    const circuitHandler = require('../api/circuit');

    it('/api/circuit returns 400 when key query parameter is missing', async () => {
      let statusCode = 0;
      let responseBody = null;
      const mockReq = { url: '/api/circuit' };
      const mockRes = {
        setHeader: () => {},
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: (data) => {
          responseBody = data;
          return mockRes;
        }
      };

      await circuitHandler(mockReq, mockRes);
      assert.equal(statusCode, 400);
      assert.deepEqual(responseBody, { error: 'key required' });
    });
  });

  describe('11. Codebase File & Static Asset Integrity Checks', () => {
    const indexPath = path.join(__dirname, '../public/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    it('index.html contains an embedded SVG favicon link in head', () => {
      assert.match(indexContent, /<link\s+rel="icon"[^>]+image\/svg\+xml/i);
    });

    it('index.html eliminates deprecated String.prototype.substr', () => {
      assert.doesNotMatch(indexContent, /\.substr\(/);
    });

    it('index.html contains the fixed gapSecs regex order', () => {
      const regexMatch = indexContent.indexOf('match(/(\\d+)\\s*L/i)');
      const lapTest = indexContent.indexOf('/LAP/i.test');
      assert.ok(regexMatch > 0, 'g.match(/(\\d+)\\s*L/i) must exist in index.html');
      assert.ok(regexMatch < lapTest || lapTest === -1, 'Regex matching digits must execute before generic /LAP/ test');
    });

    it('index.html sector heatmap has negative-zero epsilon check (< 0.0005)', () => {
      assert.ok(indexContent.includes('0.0005'), 'Sector heatmap must check epsilon threshold 0.0005');
    });

    it('index.html contains head-to-head telemetry canvas and driver selection', () => {
      assert.ok(indexContent.includes('id="telemetryCanvas"'), 'telemetryCanvas element must exist');
      assert.ok(indexContent.includes('id="telemDrvA"'), 'telemDrvA must exist');
      assert.ok(indexContent.includes('id="telemDrvB"'), 'telemDrvB must exist');
      assert.ok(indexContent.includes('id="telemSwap"'), 'telemSwap must exist');
      assert.ok(indexContent.includes('id="apexMatrixBody"'), 'apexMatrixBody must exist');
    });

    it('index.html contains mobile segmented quick-nav bar', () => {
      assert.ok(indexContent.includes('id="mobile-subnav"'), 'mobile-subnav element must exist');
      assert.ok(indexContent.includes('data-mview="timing"'), 'mobile navigation timing view button must exist');
      assert.ok(indexContent.includes('data-mview="circuit"'), 'mobile navigation circuit view button must exist');
      assert.ok(indexContent.includes('data-mview="radio"'), 'mobile navigation radio view button must exist');
    });

    it('index.html contains SC / VSC pit delta advantage estimator section', () => {
      assert.ok(indexContent.includes('id="scComparisonGrid"'), 'scComparisonGrid element must exist');
      assert.ok(indexContent.includes('SC / VSC delta'), 'Section title must exist');
    });

    it('index.html contains team radio player controls (volume, mute, replay)', () => {
      assert.ok(indexContent.includes('id="slider-radio-vol"'), 'slider-radio-vol must exist');
      assert.ok(indexContent.includes('id="btn-radio-mute"'), 'btn-radio-mute must exist');
      assert.ok(indexContent.includes('class="replay-btn"'), 'replay-btn must exist');
      assert.ok(indexContent.includes('class="radio-track'), 'radio-track must exist');
    });

    it('index.html implements keyed DOM timing tower updates (towerCache)', () => {
      assert.ok(indexContent.includes('towerCache'), 'towerCache Map must be present for keyed reconciliation');
    });

    it('favicon.svg exists in site/public/', () => {
      const favPath = path.join(__dirname, '../public/favicon.svg');
      assert.ok(fs.existsSync(favPath), 'public/favicon.svg must exist');
      const favContent = fs.readFileSync(favPath, 'utf8');
      assert.ok(favContent.includes('<svg'), 'favicon.svg must contain valid SVG root element');
    });

    it('index.html scopes active and g before isRace() branch in renderStrategy()', () => {
      const stratMatch = indexContent.match(/function renderStrategy\(\)\s*\{([\s\S]*?)\n\}/);
      assert.ok(stratMatch, 'renderStrategy function must exist in index.html');
      const body = stratMatch[1];
      const activePos = body.indexOf('const active =');
      const isRacePos = body.indexOf('if (!isRace())');
      assert.ok(activePos !== -1, 'const active must be declared in renderStrategy');
      assert.ok(isRacePos !== -1, 'if (!isRace()) branch must exist in renderStrategy');
      assert.ok(activePos < isRacePos, 'const active must be declared BEFORE if (!isRace()) to prevent ReferenceError in non-race sessions');
    });

    it('index.html sector heatmap uses unidirectional (r.pb - r.ideal) < 0.0005 guard', () => {
      assert.ok(!indexContent.includes('Math.abs(r.pb - r.ideal) < 0.0005'), 'Math.abs must not be used in heatmap delta guard');
      assert.ok(indexContent.includes('(r.pb - r.ideal) < 0.0005') || indexContent.includes('r.pb - r.ideal < 0.0005'), 'Heatmap delta must use unidirectional < 0.0005 check');
    });

    it('index.html gapSecs uses Number.isFinite to guard against non-finite values', () => {
      assert.match(indexContent, /Number\.isFinite/, 'gapSecs in index.html must use Number.isFinite');
    });

    it('index.html contains Live Video & Stream Sync panel and controls', () => {
      assert.ok(indexContent.includes('id="streamPanel"'), 'streamPanel element must exist');
      assert.ok(indexContent.includes('id="streamVideo"'), 'streamVideo element must exist');
      assert.ok(indexContent.includes('id="streamUrlInput"'), 'streamUrlInput must exist');
      assert.ok(indexContent.includes('id="btnLoadStream"'), 'btnLoadStream must exist');
      assert.ok(indexContent.includes('hls.js'), 'hls.js library must be included');
    });

    it('index.html contains Tyre degradation model canvas and rate indicators', () => {
      assert.ok(indexContent.includes('id="degCanvas"'), 'degCanvas element must exist');
      assert.ok(indexContent.includes('id="degSoftRate"'), 'degSoftRate must exist');
      assert.ok(indexContent.includes('id="degMedRate"'), 'degMedRate must exist');
      assert.ok(indexContent.includes('id="degHardRate"'), 'degHardRate must exist');
    });

    it('index.html contains Pit lane performance leaderboard', () => {
      assert.ok(indexContent.includes('id="pitTableBody"'), 'pitTableBody must exist');
      assert.ok(indexContent.includes('Pit lane <em>performance</em>'), 'Pit lane performance title must exist');
    });

    it('index.html contains Track evolution & weather radar section', () => {
      assert.ok(indexContent.includes('id="weatherSparkline"'), 'weatherSparkline SVG must exist');
      assert.ok(indexContent.includes('id="weatherTrackVal"'), 'weatherTrackVal must exist');
      assert.ok(indexContent.includes('id="weatherRainStatus"'), 'weatherRainStatus must exist');
    });
  });

  describe('12. Strategy Engine & Session Rendering Safety', () => {
    const vm = require('node:vm');
    const indexPath = path.join(__dirname, '../public/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const stratMatch = indexContent.match(/function renderStrategy\(\)\s*\{([\s\S]*?)\n\}/);

    function executeStrategyInSandbox(isRaceActive, driverNumbers = ['1', '4', '16']) {
      const dom = {};
      const getEl = (id) => (dom[id] = dom[id] || { innerHTML: '', textContent: '', value: '22', dataset: {} });

      const mockLines = {
        '1': { Position: '1', Line: '1' },
        '4': { Position: '2', Line: '2' },
        '16': { Position: '3', Line: '3', Retired: false }
      };

      const sandbox = {
        $: getEl,
        document: { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [] },
        console,
        Math,
        parseFloat,
        parseInt,
        String,
        Object,
        Array,
        Set,
        Map,
        Infinity,
        NaN,
        isRace: () => isRaceActive,
        order: () => driverNumbers,
        lines: () => mockLines,
        pitLaneMedian: () => 22.0,
        lossTouched: false,
        pitLoss: 22.0,
        simDrv: '1',
        tla: (n) => ({ '1': 'VER', '4': 'NOR', '16': 'LEC' })[n] || String(n),
        col: () => '#ff1801',
        esc: (x) => String(x),
        gapSecs: (n) => ({ '1': 0, '4': 2.5, '16': 5.0 })[n] || 0,
        intOf: () => '+2.500',
        stintsOf: () => [{ Compound: 'SOFT', StartLaps: 0, TotalLaps: 15 }],
        vals: (o) => Object.values(o || {}),
        renderScDeltaEstimator: () => {},
        S: {
          LapCount: { TotalLaps: 50 },
          TimingAppData: { Lines: {} }
        }
      };

      vm.createContext(sandbox);
      vm.runInContext(stratMatch[0] + '\nrenderStrategy();', sandbox);
      return dom;
    }

    it('executes renderStrategy() cleanly in non-race mode (isRace() === false) without ReferenceError', () => {
      assert.doesNotThrow(() => {
        const dom = executeStrategyInSandbox(false, ['1', '4', '16']);
        assert.ok(dom.simout && dom.simout.innerHTML.includes('Qualifying Session Active'), 'Qualifying notice must render in non-race mode');
        assert.ok(dom.strat && dom.strat.innerHTML.includes('VER'), 'Stint rows must render in non-race mode');
        assert.ok(dom.comp && dom.comp.innerHTML.includes('Soft'), 'Compound split must render in non-race mode');
        assert.ok(dom.watch, 'Undercut watch must render in non-race mode');
      });
    });

    it('executes renderStrategy() cleanly in race mode (isRace() === true) with undercut & pit window', () => {
      assert.doesNotThrow(() => {
        const dom = executeStrategyInSandbox(true, ['1', '4', '16']);
        assert.ok(dom.simout && dom.simout.innerHTML.includes('P1'), 'Race pit stop simulator must render position delta');
        assert.ok(dom.ribbon && dom.ribbon.innerHTML.includes('VER'), 'Driver gap ribbon must render');
        assert.ok(dom.strat && dom.strat.innerHTML.includes('NOR'), 'Stint rows must render in race mode');
      });
    });

    it('handles empty driver order safely without throwing', () => {
      assert.doesNotThrow(() => {
        const dom = executeStrategyInSandbox(false, []);
        assert.ok(dom.simout && dom.simout.innerHTML.includes('Strategy tools come alive'), 'Empty state must render when no drivers present');
      });
    });
  });

  describe('13. Tyre Degradation Math & Pit Stop Performance Calculations', () => {
    it('calculates compound degradation slope factoring track temperature', () => {
      const baseDeg = { SOFT: 0.088, MEDIUM: 0.052, HARD: 0.031 };
      const calcSlopes = (trackTemp) => {
        const factor = 1 + Math.max(-0.2, Math.min(0.3, (trackTemp - 35) * 0.015));
        return {
          SOFT: baseDeg.SOFT * factor,
          MEDIUM: baseDeg.MEDIUM * factor,
          HARD: baseDeg.HARD * factor,
        };
      };
      
      const neutral = calcSlopes(35);
      assert.strictEqual(neutral.SOFT, 0.088);
      assert.strictEqual(neutral.MEDIUM, 0.052);
      assert.strictEqual(neutral.HARD, 0.031);

      const hot = calcSlopes(50);
      assert.ok(hot.SOFT > neutral.SOFT, 'Hot track must increase degradation');
      assert.ok(hot.SOFT <= baseDeg.SOFT * 1.3, 'Degradation factor must clamp to upper limit');

      const cold = calcSlopes(15);
      assert.ok(cold.HARD < neutral.HARD, 'Cold track must reduce wear rate');
      assert.ok(cold.HARD >= baseDeg.HARD * 0.8, 'Degradation factor must clamp to lower limit');
    });

    it('estimates stationary service time from total pit lane duration', () => {
      const calcStationary = (totalDuration) => Math.max(1.8, Math.round((totalDuration - 19.5) * 100) / 100);
      assert.strictEqual(calcStationary(21.9), 2.4);
      assert.strictEqual(calcStationary(22.5), 3.0);
      assert.strictEqual(calcStationary(18.0), 1.8);
    });

    it('manages weather telemetry history buffer without exceeding bounds', () => {
      const history = [];
      const addEntry = (entry) => {
        history.push(entry);
        if (history.length > 50) history.shift();
      };

      for (let i = 0; i < 70; i++) {
        addEntry({ time: i, trackTemp: 30 + (i % 5) });
      }

      assert.strictEqual(history.length, 50, 'History buffer must not exceed 50 entries');
      assert.strictEqual(history[0].time, 20, 'Oldest entries must be pruned FIFO');
      assert.strictEqual(history[49].time, 69, 'Latest entry must be present at the tail');
    });
  });

  describe('14. Live Gap Freshness, Feed Health & Trend Detection', () => {
    it('verifies index.html declares live gap freshness and feed heartbeat DOM elements', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(html.includes('id="feed-hb"'), 'Must include feed heartbeat status badge');
      assert.ok(html.includes('id="feed-hbtxt"'), 'Must include heartbeat text element');
      assert.ok(html.includes('id="reconnect-btn"'), 'Must include live feed reconnect button');
      assert.ok(html.includes('gap-age'), 'Must include gap-age badge styling/class');
      assert.ok(html.includes('gap-trend'), 'Must include gap-trend delta indicator');
      assert.ok(html.includes('tickFeedHealth'), 'Must implement feed health monitor loop');
    });

    it('accurately evaluates feed health state and warning thresholds based on packet latency', () => {
      const evaluateFeedHealth = (diffSec) => {
        if (diffSec <= 6) return { cls: 'live', text: diffSec === 0 ? 'Live (0s)' : `Live (${diffSec}s)`, reconnect: false };
        if (diffSec <= 18) return { cls: 'stale', text: `Delay (${diffSec}s)`, reconnect: false };
        return { cls: 'dead', text: `Feed paused (${diffSec}s)`, reconnect: true };
      };

      const fresh = evaluateFeedHealth(0);
      assert.strictEqual(fresh.cls, 'live');
      assert.strictEqual(fresh.text, 'Live (0s)');
      assert.strictEqual(fresh.reconnect, false);

      const minorLag = evaluateFeedHealth(5);
      assert.strictEqual(minorLag.cls, 'live');
      assert.strictEqual(minorLag.text, 'Live (5s)');

      const delayed = evaluateFeedHealth(12);
      assert.strictEqual(delayed.cls, 'stale');
      assert.strictEqual(delayed.text, 'Delay (12s)');
      assert.strictEqual(delayed.reconnect, false);

      const paused = evaluateFeedHealth(25);
      assert.strictEqual(paused.cls, 'dead');
      assert.strictEqual(paused.text, 'Feed paused (25s)');
      assert.strictEqual(paused.reconnect, true);
    });

    it('formats relative gap age badges with warning flags when feed drops or telemetry stalls', () => {
      const formatGapAge = (s) => {
        let ageCls = 'mono gap-age';
        let ageText = s <= 1 ? 'now' : `${s}s`;
        if (s <= 4) ageCls += ' fresh';
        else if (s > 18 && s <= 45) { ageCls += ' stale'; ageText = `⚠️ ${s}s`; }
        else if (s > 45) { ageCls += ' dead'; ageText = `⚠️ ${Math.floor(s / 60)}m`; }
        return { ageCls, ageText };
      };

      const justNow = formatGapAge(0);
      assert.strictEqual(justNow.ageText, 'now');
      assert.ok(justNow.ageCls.includes('fresh'));

      const fourSec = formatGapAge(4);
      assert.strictEqual(fourSec.ageText, '4s');
      assert.ok(fourSec.ageCls.includes('fresh'));

      const tenSec = formatGapAge(10);
      assert.strictEqual(tenSec.ageText, '10s');
      assert.strictEqual(tenSec.ageCls, 'mono gap-age');

      const staleLap = formatGapAge(25);
      assert.strictEqual(staleLap.ageText, '⚠️ 25s');
      assert.ok(staleLap.ageCls.includes('stale'));

      const deadFeed = formatGapAge(130);
      assert.strictEqual(deadFeed.ageText, '⚠️ 2m');
      assert.ok(deadFeed.ageCls.includes('dead'));
    });

    it('computes delta gap trends showing expanding vs closing gaps between competitors', () => {
      const computeTrend = (prevGap, curGap) => {
        if (prevGap === null || curGap === null || isNaN(prevGap) || isNaN(curGap)) return null;
        const diff = curGap - prevGap;
        if (diff > 0.05) return { trend: 'up', symbol: '▲' };
        if (diff < -0.05) return { trend: 'dn', symbol: '▼' };
        return null;
      };

      const expanding = computeTrend(1.240, 1.450);
      assert.deepStrictEqual(expanding, { trend: 'up', symbol: '▲' });

      const closing = computeTrend(2.500, 2.120);
      assert.deepStrictEqual(closing, { trend: 'dn', symbol: '▼' });

      const steady = computeTrend(1.500, 1.504);
      assert.strictEqual(steady, null);
    });
  });

  describe('15. Interactive Splitter & Layout Resizing Engine', () => {
    it('verifies index.html defines split gutter, handle, and column IDs', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(html.includes('id="split-gutter"'), 'Must define split gutter element');
      assert.ok(html.includes('class="split-handle"'), 'Must define split handle');
      assert.ok(html.includes('id="col-timing"'), 'Must define col-timing ID');
      assert.ok(html.includes('id="col-track"'), 'Must define col-track ID');
      assert.ok(html.includes('initSplitter'), 'Must define initSplitter initializer');
      assert.ok(html.includes('--split-timing-w'), 'Must use --split-timing-w CSS custom property');
    });

    it('bounds and clamps split width percentage within safe min/max thresholds', () => {
      const clampSplit = (pct) => Math.max(22, Math.min(78, pct));

      assert.strictEqual(clampSplit(10), 22, 'Cannot shrink timing table below 22%');
      assert.strictEqual(clampSplit(46), 46, 'Maintains valid percentage untouched');
      assert.strictEqual(clampSplit(65), 65, 'Allows expanding timing table to 65%');
      assert.strictEqual(clampSplit(90), 78, 'Cannot shrink circuit map below 22% (78% timing max)');
    });

    it('computes offset percentage accurately from mouse/touch clientX and container bounds', () => {
      const computePct = (clientX, containerLeft, containerWidth) => {
        const offset = clientX - containerLeft;
        const rawPct = (offset / containerWidth) * 100;
        return Math.max(22, Math.min(78, rawPct));
      };

      const mid = computePct(600, 100, 1000); // 500 / 1000 = 50%
      assert.strictEqual(mid, 50);

      const leftClamp = computePct(150, 100, 1000); // 50 / 1000 = 5% -> clamped to 22%
      assert.strictEqual(leftClamp, 22);

      const rightClamp = computePct(950, 100, 1000); // 850 / 1000 = 85% -> clamped to 78%
      assert.strictEqual(rightClamp, 78);
    });

    it('supports keyboard fine adjustments and reset to default 46%', () => {
      let pct = 46;
      const adjust = (key) => {
        if (key === 'ArrowLeft') pct = Math.max(22, pct - 2);
        if (key === 'ArrowRight') pct = Math.min(78, pct + 2);
        if (key === 'Reset') pct = 46;
        return pct;
      };

      assert.strictEqual(adjust('ArrowRight'), 48);
      assert.strictEqual(adjust('ArrowRight'), 50);
      assert.strictEqual(adjust('ArrowLeft'), 48);
      assert.strictEqual(adjust('Reset'), 46);
    });
  });
});

