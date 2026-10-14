# TurboMania Online — Multiplayer Party Racing Game

A high-performance 3D browser-based arcade time-trial racing game inspired by **Trackmania**, built with **Three.js**, a custom **120Hz Spline-Ribbon 3D Physics Engine**, and **Node.js + Socket.io** for real-time online party lobbies.

## ✨ Features

- **Online Party & Lobby System**:
  - **Create Party**: Generates a 5-letter room code (e.g., `TRK42`) and a direct shareable invite link (`/?room=TRK42`).
  - **Join Friend's Party**: Enter the 5-letter code or click the invite link to jump straight into the same track and synchronized round timer.
  - **Host Controls**: Switch between 5 hand-crafted Campaign Tracks, adjust match round duration (3m / 5m / 8m / Unlimited), reset round timers, or trigger the Podium celebration.
- **120Hz Deterministic-Feel Trackmania Physics**:
  - Zero-snag continuous 3D spline-ribbon surface collision (smoothly handles steep ramps, banked turns, overpasses, and canyon jump gaps at 370+ km/h).
  - **Brake-Tap Drifting**: Hold `Space` / `S` + Steer at high speed to initiate a Trackmania powerslide with live 3D tire skidmarks and smoke.
  - **Mid-Air Control & Air-Brake**: Tap `Space` in mid-air to level your car's pitch and roll for flat landings.
  - **Special Surfaces**: Asphalt, Turbo Boost pads, Reactor Super-Boosters, Banked Ice Bobsled turns, Dirt rally sectors, and Freewheel (`No Engine`) sections.
  - **Instant Respawn**: Press `Backspace` / `E` to respawn at your last checkpoint, or `R` / `Delete` to restart from the start line.
- **Live Ghosts & Spectate Mode**:
  - See all players in your party driving live on the track as semi-transparent cars.
  - Automatic **Personal Best (PB) Ghost** & **Party Record Ghost** recording and playback.
  - Click any player on the live leaderboard (or press `Tab`) to spectate them in real time.
- **Built-in 3D Custom Track Builder**:
  - Snap together straights, banked turns, hairpins, steep climbs, canyon jumps, ice turns, and boost pads in real-time 3D and broadcast your custom track to your entire party room!

---

## 🚀 Run Locally

```bash
cd trackmania-online
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

---

## ☁️ Deploy to Render

1. Push the `trackmania-online` folder to a GitHub repository (or set **Root Directory** to `trackmania-online` in Render).
2. In your Render Dashboard, click **New +** -> **Web Service**.
3. Use the following settings (or use the included `render.yaml` Blueprint):
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Once deployed, share your Render URL or party invite link with your friends!
