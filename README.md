# 🏎️ Pit Wall · Live Formula 1 Race Intelligence

[![Test Suite](https://img.shields.io/badge/tests-58%20passing-brightgreen.svg)](site/test/telemetry.test.js)
[![Architecture](https://img.shields.io/badge/architecture-zero--dependency%20SPA-blue.svg)](site/public/index.html)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-ritish--pitwall.vercel.app-ff3b4a.svg)](https://ritish-pitwall.vercel.app/)

A high-performance, real-time Formula 1 pit wall dashboard built on F1's public live timing feed (SignalR Core), MultiViewer circuit geometry, and Jolpica / Ergast telemetry APIs. Engineered for race strategists, engineers, and passionate fans.

---

## 🌟 Key Features

### 1. ⏱️ Live Timing Tower
- **Real-Time Intervals & Gaps**: Sub-second refresh with interval mode, gap to leader, and lapped car delta computation.
- **Keyed DOM Caching**: Zero-flicker 4Hz updates via stateful DOM row caches.
- **Interactive Driver Focus**: Click any driver row to synchronize focus across the Telemetry, Strategy, and Analysis views.
- **Micro-Sector Breakdown**: Live S1, S2, and S3 segment status with personal best (green) and session best (purple) indicators.

### 2. 🗺️ Dead-Reckoned Circuit Telemetry
- **2D Vector Track Map**: Accurate SVG track coordinates, turn apex markers, and sector boundary geometry.
- **Smooth Vehicle Simulation**: Mini-sector dead-reckoning engine running at 60 FPS using `requestAnimationFrame` with collision avoidance label placement.

### 3. 📈 Multi-Channel Telemetry Canvas *(Telemetry Tab)*
- **Head-to-Head Comparison**: Compare any two drivers across Speed, Running Delta ($\Delta t$), Throttle, and Brake.
- **Apex & Mini-Sector Speed Matrix**: Turn-by-turn minimum apex speeds, speed trap rankings, and scrubable cursor overlays.
- **Track Evolution & Weather Radar**: Time-series sparklines tracking track surface temperature, ambient air temperature, wind vector, and rain probability.

### 4. 🛞 Race Strategy & Degradation Engine *(Strategy Tab)*
- **Tyre Degradation Slope Model**: Empirical compound degradation curves (Soft, Medium, Hard) adjusted dynamically for track temperature.
- **Safety Car / VSC Delta Estimator**: Quantifies pit stop time savings under Safety Car and Virtual Safety Car conditions compared to green-flag stops.
- **Pit Lane Performance Leaderboard**: Benchmarks total pit lane durations and estimated stationary service times across constructors.
- **Pit Stop Rejoin Simulator & Undercut Watch**: Simulates track position upon rejoin and alerts on potential undercut/overcut windows.

### 5. 📺 Live Video & Stream Sync Console
- **Universal Player with HLS.js**: Input any authorized `.m3u8` HLS, MP4, or WebM stream.
- **Telemetry Latency Synchronization**: Fine-tune stream delay (`-5s` to `+5s`, slider up to 60s) to align video perfectly with the live timing feed.
- **Picture-in-Picture (PiP)**: Detachable floating video player while browsing across dashboard views.

### 6. 📻 Team Radio Console
- Real-time team-to-driver audio captures with animated waveforms.
- Dedicated volume slider, instant mute, audio scrub bar, and track replay controls.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :---: | :--- |
| <kbd>1</kbd> | Switch to **Overview** |
| <kbd>2</kbd> | Switch to **Telemetry** |
| <kbd>3</kbd> | Switch to **Strategy** |
| <kbd>4</kbd> | Switch to **Analysis** |
| <kbd>5</kbd> | Switch to **Season & Standings** |
| <kbd>V</kbd> | Toggle **Live Video / Stream Sync Console** |
| <kbd>F</kbd> | Toggle **Fullscreen** mode |
| <kbd>M</kbd> | Toggle **Team Radio Mute** |
| <kbd>?</kbd> | Open / Close **Keyboard Shortcuts Cheat Sheet** |
| <kbd>Esc</kbd> | Close open panels and modals |

---

## 🏗️ Architecture & Directory Structure

```
c:\F1\
├── site\
│   ├── api\
│   │   ├── circuit.js         # MultiViewer circuit geometry proxy & cache
│   │   ├── info.js            # Jolpica / Ergast F1 standings & schedule API
│   │   └── live.js            # Server-Sent Events (SSE) bridge to F1 SignalR
│   ├── public\
│   │   ├── favicon.svg        # Native vector telemetry favicon
│   │   └── index.html         # High-density, single-page dashboard application
│   ├── test\
│   │   └── telemetry.test.js  # 58 unit and integration tests (Node.js test runner)
│   ├── package.json           # Scripts (start, dev, build, lint, test)
│   ├── server.js              # Zero-dependency local Node.js development server
│   └── vercel.json            # Vercel serverless functions configuration
├── deploy.py                  # Automated direct-upload Vercel deployment script
└── README.md                  # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Local Installation & Startup
```bash
# Navigate to the site directory
cd site

# Install dependencies (ws for WebSocket bridge)
npm install

# Start the local development server
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 🧪 Testing & Code Quality

Run the test suite using Node's native test runner:
```bash
cd site

# Run all 58 automated tests
npm test

# Run syntax check across server and API handlers
npm run lint

# Validate static bundle readiness
npm run build
```

---

## 🌐 Deployment to Vercel

### Option 1: Automatic GitHub Integration (Recommended)
Connect your repository (`https://github.com/Ritish017/-f1-pitwall.git`) to Vercel with root directory set to `site`. Every push to `main` will build and deploy automatically.

### Option 2: Direct API Deployer (`deploy.py`)
Run the bundled deployment script:
```bash
python deploy.py ritish-pitwall
```

---

## ⚖️ Disclaimer
Pit Wall is an independent, non-commercial fan project built on publicly accessible data streams. Not affiliated with, endorsed by, or associated with Formula 1, FIA, or Formula One Licensing B.V. All Formula 1 trademarks and logos belong to their respective owners.
