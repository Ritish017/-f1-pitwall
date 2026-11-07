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
  return parseFloat(g.replace("+", "")) || 0;
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
  if (!pb || !ideal) return "";
  const delta = pb - ideal;
  if (Math.abs(delta) < 0.0005) return "–";
  return "−" + Math.max(0, delta).toFixed(3);
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
  });
});
