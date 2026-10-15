const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 4e6 // 4MB max for custom tracks & ghost data
});

app.use(compression());
app.use(express.json());

// Serve Three.js directly from node_modules for zero external CDN dependency
app.use(
  '/vendor/three',
  express.static(path.join(__dirname, 'node_modules', 'three'), {
    maxAge: '7d'
  })
);

// Serve Kenney 3D Models
app.use(
  '/models/cars',
  express.static(path.join(__dirname, 'Models', 'car models', 'Models', 'GLB format'), {
    maxAge: '7d'
  })
);
app.use(
  '/models/props',
  express.static(path.join(__dirname, 'Models', 'Models', 'GLB format'), {
    maxAge: '7d'
  })
);
app.use(
  '/models',
  express.static(path.join(__dirname, 'Models'), {
    maxAge: '7d'
  })
);

app.get('/api/available-models', (req, res) => {
  res.json({
    cars: [
      { id: 'race', name: 'Apex Formula 1', category: 'Formula', file: 'race.glb' },
      { id: 'race-future', name: 'Cyber Hypercar', category: 'Futuristic', file: 'race-future.glb' },
      { id: 'sedan-sports', name: 'Tuner GT Drift', category: 'Sports', file: 'sedan-sports.glb' },
      { id: 'hatchback-sports', name: 'Pocket Rocket Rally', category: 'Rally', file: 'hatchback-sports.glb' },
      { id: 'kart-oobi', name: 'Super Go-Kart', category: 'Kart', file: 'kart-oobi.glb' },
      { id: 'police', name: 'Police Interceptor', category: 'Pursuit', file: 'police.glb' },
      { id: 'taxi', name: 'Crazy Taxi Cab', category: 'City', file: 'taxi.glb' },
      { id: 'suv-luxury', name: 'Apex Luxury SUV', category: 'SUV', file: 'suv-luxury.glb' },
      { id: 'firetruck', name: 'Turbo Firetruck', category: 'Heavy', file: 'firetruck.glb' },
      { id: 'van', name: 'Express Delivery Van', category: 'Van', file: 'van.glb' },
      { id: 'ambulance', name: 'Rapid Response Ambulance', category: 'Emergency', file: 'ambulance.glb' },
      { id: 'garbage-truck', name: 'Heavy Titan Hauler', category: 'Heavy', file: 'garbage-truck.glb' }
    ]
  });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Campaign Track IDs
const CAMPAIGN_TRACK_IDS = [
  'track_01',
  'track_02',
  'track_03',
  'track_04',
  'track_05',
  'track_06',
  'track_07',
  'track_08',
  'track_09',
  'track_10'
];

// ==================== PERSISTENT TRACK TOP 10 LEADERBOARDS ====================
// Stores the Top 10 fastest lap times for every track across BOTH Online & Practice modes
const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboards.json');

const trackLeaderboards = {
  track_01: [],
  track_02: [],
  track_03: [],
  track_04: [],
  track_05: [],
  track_06: [],
  track_07: [],
  track_08: [],
  track_09: [],
  track_10: []
};

function loadLeaderboardsFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const tid of Object.keys(parsed)) {
          if (Array.isArray(parsed[tid])) {
            trackLeaderboards[tid] = parsed[tid].slice(0, 10);
          }
        }
      }
    }
  } catch (err) {
    console.error('Could not load leaderboards.json:', err.message);
  }
}

function saveLeaderboardsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(trackLeaderboards, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save leaderboards.json:', err.message);
  }
}

loadLeaderboardsFromDisk();

/**
 * Records a completed lap time into the Track's Top 10 Leaderboard (counts both Online & Practice).
 * Deduplicates by player name so each player occupies their single best record.
 * Returns { madeTop10: boolean, rank: number | null, list: Array }
 */
function recordTrackTop10Time(trackId, playerName, color, timeMs, mode = 'practice') {
  if (!trackId || typeof timeMs !== 'number' || timeMs < 3000 || timeMs > 3600000) {
    return { madeTop10: false, rank: null, list: trackLeaderboards[trackId] || [] };
  }

  if (!Array.isArray(trackLeaderboards[trackId])) {
    trackLeaderboards[trackId] = [];
  }

  const list = trackLeaderboards[trackId];
  const cleanName = sanitizeString(playerName, 18) || 'Racer';
  const cleanColor = sanitizeColor(color);
  const cleanTime = Math.round(timeMs);
  const cleanMode = mode === 'online' ? 'ONLINE' : 'PRACTICE';

  const existingIndex = list.findIndex((e) => e.playerName.toLowerCase() === cleanName.toLowerCase());
  let entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (existingIndex !== -1) {
    if (cleanTime < list[existingIndex].timeMs) {
      list[existingIndex].timeMs = cleanTime;
      list[existingIndex].color = cleanColor;
      list[existingIndex].mode = cleanMode;
      list[existingIndex].timestamp = Date.now();
      entryId = list[existingIndex].id;
    } else {
      // Slower than player's previous best on this track
      return { madeTop10: false, rank: existingIndex + 1, list };
    }
  } else {
    list.push({
      id: entryId,
      playerName: cleanName,
      color: cleanColor,
      timeMs: cleanTime,
      mode: cleanMode,
      timestamp: Date.now()
    });
  }

  list.sort((a, b) => a.timeMs - b.timeMs);
  if (list.length > 10) {
    list.length = 10;
  }

  const rankIndex = list.findIndex((e) => e.id === entryId || e.playerName.toLowerCase() === cleanName.toLowerCase());
  const madeTop10 = rankIndex !== -1 && rankIndex < 10;

  if (madeTop10) {
    saveLeaderboardsToDisk();
    io.emit('track_leaderboards_update', {
      trackId,
      leaderboards: trackLeaderboards
    });
  }

  return {
    madeTop10,
    rank: madeTop10 ? rankIndex + 1 : null,
    list
  };
}

/**
 * Merges external or client-cached leaderboards into the canonical server leaderboards.
 * Essential for Render free-tier: re-hydrates the server after container spin-downs!
 */
function mergeLeaderboards(incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  let changed = false;

  for (const tid of CAMPAIGN_TRACK_IDS) {
    if (!Array.isArray(trackLeaderboards[tid])) {
      trackLeaderboards[tid] = [];
    }
    const currentList = trackLeaderboards[tid];
    const incomingList = Array.isArray(incoming[tid]) ? incoming[tid] : [];

    for (const inEntry of incomingList) {
      if (!inEntry || typeof inEntry.timeMs !== 'number' || inEntry.timeMs < 3000 || inEntry.timeMs > 3600000) continue;
      const cleanName = sanitizeString(inEntry.playerName, 18) || 'Racer';
      const cleanColor = sanitizeColor(inEntry.color);
      const cleanTime = Math.round(inEntry.timeMs);
      const cleanMode = inEntry.mode === 'ONLINE' ? 'ONLINE' : 'PRACTICE';
      const cleanTimestamp = typeof inEntry.timestamp === 'number' ? inEntry.timestamp : Date.now();

      const existingIdx = currentList.findIndex((e) => e.playerName.toLowerCase() === cleanName.toLowerCase());
      if (existingIdx !== -1) {
        if (cleanTime < currentList[existingIdx].timeMs) {
          currentList[existingIdx].timeMs = cleanTime;
          currentList[existingIdx].color = cleanColor;
          currentList[existingIdx].mode = cleanMode;
          currentList[existingIdx].timestamp = cleanTimestamp;
          changed = true;
        }
      } else {
        currentList.push({
          id: inEntry.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          playerName: cleanName,
          color: cleanColor,
          timeMs: cleanTime,
          mode: cleanMode,
          timestamp: cleanTimestamp
        });
        changed = true;
      }
    }

    currentList.sort((a, b) => a.timeMs - b.timeMs);
    if (currentList.length > 10) {
      currentList.length = 10;
      changed = true;
    }
  }

  if (changed) {
    saveLeaderboardsToDisk();
    io.emit('track_leaderboards_update', {
      trackId: 'all',
      leaderboards: trackLeaderboards
    });
  }
  return changed;
}

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    rooms: rooms.size
  });
});

// Global Leaderboards REST API
app.get('/api/leaderboards', (req, res) => {
  res.json(trackLeaderboards);
});

app.post('/api/leaderboards/sync', (req, res) => {
  const changed = mergeLeaderboards(req.body);
  res.json({ ok: true, changed, leaderboards: trackLeaderboards });
});

// Reset leaderboards endpoint
app.all('/api/reset-leaderboards', (req, res) => {
  for (const tid of CAMPAIGN_TRACK_IDS) {
    trackLeaderboards[tid] = [];
  }
  saveLeaderboardsToDisk();
  io.emit('track_leaderboards_update', {
    trackId: 'all',
    leaderboards: trackLeaderboards
  });
  res.json({ success: true, message: 'All track leaderboards have been reset to empty.' });
});

// Fallback to index.html for SPA / invite links
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== ONLINE MULTIPLAYER ROOMS (3-5 ROUNDS) ====================
const rooms = new Map();
const socketRoomMap = new Map();

const ROUND_POINTS_TABLE = [100, 80, 65, 55, 45, 38, 32, 26, 20, 15, 12, 10];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function sanitizeString(str, maxLen = 24) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function sanitizeColor(color) {
  if (typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }
  return '#00f0ff';
}

function buildMatchPlaylist(startTrackId, totalRounds) {
  const count = Math.max(1, Math.min(10, Number(totalRounds) || 3));
  const startIdx = Math.max(0, CAMPAIGN_TRACK_IDS.indexOf(startTrackId));
  const playlist = [];
  for (let i = 0; i < count; i++) {
    playlist.push(CAMPAIGN_TRACK_IDS[(startIdx + i) % CAMPAIGN_TRACK_IDS.length]);
  }
  return playlist;
}

function getSortedRoundLeaderboard(room) {
  const list = [];
  for (const p of room.players.values()) {
    list.push({
      id: p.id,
      name: p.name,
      color: p.color,
      carModel: p.carModel || 'race',
      bestTime: p.bestTime,
      bestSplits: p.bestSplits,
      currentCp: p.currentCp,
      runCount: p.runCount,
      overallPoints: p.overallPoints || 0,
      ping: p.ping || 0,
      isHost: p.id === room.hostId
    });
  }
  list.sort((a, b) => {
    if (a.bestTime !== null && b.bestTime !== null) {
      return a.bestTime - b.bestTime;
    }
    if (a.bestTime !== null) return -1;
    if (b.bestTime !== null) return 1;
    if (b.currentCp !== a.currentCp) return b.currentCp - a.currentCp;
    return a.name.localeCompare(b.name);
  });
  return list;
}

function getSortedOverallLeaderboard(room) {
  const list = [];
  for (const p of room.players.values()) {
    list.push({
      id: p.id,
      name: p.name,
      color: p.color,
      carModel: p.carModel || 'race',
      overallPoints: p.overallPoints || 0,
      roundWins: p.roundWins || 0,
      roundsCompleted: p.roundsCompleted || 0,
      totalTimeMs: p.totalTimeMs || 0,
      roundTimes: p.roundTimes || {},
      isHost: p.id === room.hostId
    });
  }
  list.sort((a, b) => {
    if (b.overallPoints !== a.overallPoints) {
      return b.overallPoints - a.overallPoints;
    }
    if (b.roundsCompleted !== a.roundsCompleted) {
      return b.roundsCompleted - a.roundsCompleted;
    }
    if (a.totalTimeMs > 0 && b.totalTimeMs > 0 && a.totalTimeMs !== b.totalTimeMs) {
      return a.totalTimeMs - b.totalTimeMs;
    }
    return a.name.localeCompare(b.name);
  });
  return list;
}

function serializeRoomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    trackId: room.trackId,
    customTrack: room.customTrack,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    playlist: room.playlist,
    roundDurationSec: room.roundDurationSec,
    roundStartTime: room.roundStartTime,
    intermissionEndTime: room.intermissionEndTime,
    state: room.state, // 'lobby' | 'racing' | 'round_over' | 'match_over'
    serverTime: Date.now(),
    leaderboard: getSortedRoundLeaderboard(room),
    overallLeaderboard: getSortedOverallLeaderboard(room),
    roundHistory: room.roundHistory,
    roomRecordSummary: room.roomRecord
      ? {
          playerId: room.roomRecord.playerId,
          playerName: room.roomRecord.playerName,
          color: room.roomRecord.color,
          timeMs: room.roomRecord.timeMs
        }
      : null
  };
}

/**
 * Tallies points for the current round, saves the round leaderboard into `room.roundHistory`,
 * and transitions either to `round_over` (intermission before next map) or `match_over` (final championship standings).
 */
function concludeCurrentRound(room) {
  if (room.state !== 'racing') return;

  const roundStandingsRaw = getSortedRoundLeaderboard(room);
  const roundStandings = [];

  roundStandingsRaw.forEach((entry, idx) => {
    const p = room.players.get(entry.id);
    const rank = idx + 1;
    const finishedLap = entry.bestTime !== null;
    const pointsEarned = finishedLap
      ? ROUND_POINTS_TABLE[idx] || 10
      : 0;

    if (p) {
      p.overallPoints = (p.overallPoints || 0) + pointsEarned;
      if (finishedLap) {
        p.roundsCompleted = (p.roundsCompleted || 0) + 1;
        p.totalTimeMs = (p.totalTimeMs || 0) + entry.bestTime;
        if (rank === 1) {
          p.roundWins = (p.roundWins || 0) + 1;
        }
      }
      if (!p.roundTimes) p.roundTimes = {};
      p.roundTimes[room.currentRound] = {
        timeMs: entry.bestTime,
        rank: finishedLap ? rank : null,
        points: pointsEarned
      };
    }

    roundStandings.push({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      bestTime: entry.bestTime,
      rank: finishedLap ? rank : null,
      pointsEarned,
      overallPoints: p ? p.overallPoints : pointsEarned
    });
  });

  room.roundHistory.push({
    roundNumber: room.currentRound,
    trackId: room.trackId,
    standings: roundStandings
  });

  if (room.currentRound < room.totalRounds) {
    room.state = 'round_over';
    room.intermissionEndTime = Date.now() + 15000; // 15s between rounds
    io.to(room.code).emit('round_ended', serializeRoomState(room));
  } else {
    room.state = 'match_over';
    room.intermissionEndTime = null;
    io.to(room.code).emit('match_ended', serializeRoomState(room));
  }
}

/**
 * Advances room to `currentRound + 1` on the next track in `room.playlist`.
 */
function advanceToNextRound(room) {
  if (room.currentRound >= room.totalRounds) {
    room.state = 'match_over';
    room.intermissionEndTime = null;
    io.to(room.code).emit('match_ended', serializeRoomState(room));
    return;
  }

  room.currentRound += 1;
  const nextTrackId =
    room.playlist[room.currentRound - 1] ||
    CAMPAIGN_TRACK_IDS[(room.currentRound - 1) % CAMPAIGN_TRACK_IDS.length];

  room.trackId = nextTrackId;
  room.customTrack = null;
  room.state = 'racing';
  room.roundStartTime = Date.now();
  room.intermissionEndTime = null;
  room.roomRecord = null;

  for (const p of room.players.values()) {
    p.bestTime = null;
    p.bestSplits = [];
    p.currentCp = 0;
    p.runCount = 0;
  }

  io.to(room.code).emit('track_changed', serializeRoomState(room));
}

/**
 * Resets the entire multi-round match for a new championship.
 */
function startNewMatchInRoom(room, startTrackId, totalRounds, roundDurationSec) {
  const rounds = Math.max(1, Math.min(10, Number(totalRounds) || room.totalRounds || 3));
  const firstTrack = CAMPAIGN_TRACK_IDS.includes(startTrackId)
    ? startTrackId
    : room.trackId && CAMPAIGN_TRACK_IDS.includes(room.trackId)
      ? room.trackId
      : CAMPAIGN_TRACK_IDS[0];

  room.totalRounds = rounds;
  room.currentRound = 1;
  room.playlist = buildMatchPlaylist(firstTrack, rounds);
  room.trackId = room.playlist[0];
  room.customTrack = null;

  if (typeof roundDurationSec === 'number' && roundDurationSec >= 60 && roundDurationSec <= 3600) {
    room.roundDurationSec = roundDurationSec;
  }

  room.state = 'racing';
  room.roundStartTime = Date.now();
  room.intermissionEndTime = null;
  room.roomRecord = null;
  room.roundHistory = [];

  for (const p of room.players.values()) {
    p.bestTime = null;
    p.bestSplits = [];
    p.currentCp = 0;
    p.runCount = 0;
    p.overallPoints = 0;
    p.roundWins = 0;
    p.roundsCompleted = 0;
    p.totalTimeMs = 0;
    p.roundTimes = {};
  }

  io.to(room.code).emit('match_started', serializeRoomState(room));
}

function removePlayerFromRoom(socket) {
  const code = socketRoomMap.get(socket.id);
  if (!code) return;
  socketRoomMap.delete(socket.id);
  socket.leave(code);

  const room = rooms.get(code);
  if (!room) return;

  const leavingPlayer = room.players.get(socket.id);
  room.players.delete(socket.id);

  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }

  let hostChanged = false;
  if (room.hostId === socket.id) {
    const nextHost = room.players.keys().next().value;
    room.hostId = nextHost;
    hostChanged = true;
  }

  io.to(code).emit('player_left', {
    playerId: socket.id,
    playerName: leavingPlayer ? leavingPlayer.name : 'Driver',
    hostId: room.hostId,
    hostChanged,
    leaderboard: getSortedRoundLeaderboard(room),
    overallLeaderboard: getSortedOverallLeaderboard(room)
  });
}

io.on('connection', (socket) => {
  // Send all Track Top 10 Leaderboards immediately on connect
  socket.emit('track_leaderboards_init', trackLeaderboards);

  socket.on('get_track_leaderboards', (ack) => {
    if (typeof ack === 'function') {
      ack(trackLeaderboards);
    }
  });

  // Client sync on connect: if client has cached leaderboards or PBs, merge with server
  socket.on('sync_client_leaderboard', (clientBoards, ack) => {
    mergeLeaderboards(clientBoards);
    if (typeof ack === 'function') {
      ack({ ok: true, leaderboards: trackLeaderboards });
    }
  });

  // Submit a lap completed in Practice Mode to the Track's Top 10 Leaderboard
  socket.on('submit_practice_lap', (data = {}, ack) => {
    const trackId = sanitizeString(data.trackId, 32) || 'track_01';
    const name = sanitizeString(data.playerName, 18) || 'Racer';
    const color = sanitizeColor(data.color);
    const timeMs = typeof data.timeMs === 'number' ? Math.round(data.timeMs) : 0;

    const result = recordTrackTop10Time(trackId, name, color, timeMs, 'practice');
    if (typeof ack === 'function') {
      ack({
        ok: true,
        madeTop10: result.madeTop10,
        rank: result.rank,
        leaderboard: result.list
      });
    }
  });

  // Clock sync & ping measurement
  socket.on('ping_check', (clientTime, ack) => {
    const code = socketRoomMap.get(socket.id);
    if (code && typeof clientTime === 'object' && typeof clientTime.lastPing === 'number') {
      const room = rooms.get(code);
      if (room && room.players.has(socket.id)) {
        room.players.get(socket.id).ping = Math.max(0, Math.min(999, Math.round(clientTime.lastPing)));
      }
    }
    if (typeof ack === 'function') {
      ack({ serverTime: Date.now() });
    }
  });

  // Create a new Online Party Championship (starts in Party Waiting Lobby!)
  socket.on('create_party', (payload = {}, ack) => {
    removePlayerFromRoom(socket);

    const code = generateRoomCode();
    const name = sanitizeString(payload.name, 18) || 'Racer';
    const color = sanitizeColor(payload.color);
    const carModel = sanitizeString(payload.carModel, 30) || 'race';
    const startTrackId = CAMPAIGN_TRACK_IDS.includes(payload.trackId) ? payload.trackId : 'track_01';
    const totalRounds = Math.max(1, Math.min(10, Number(payload.totalRounds) || 3));
    const roundDurationSec =
      typeof payload.roundDurationSec === 'number' && payload.roundDurationSec >= 60
        ? Math.min(3600, payload.roundDurationSec)
        : 240;

    const playlist = buildMatchPlaylist(startTrackId, totalRounds);

    const room = {
      code,
      hostId: socket.id,
      trackId: playlist[0],
      customTrack: null,
      currentRound: 1,
      totalRounds,
      playlist,
      roundDurationSec,
      roundStartTime: null,
      intermissionEndTime: null,
      state: 'lobby', // Wait in lobby until host clicks Start Game!
      players: new Map(),
      roomRecord: null,
      roundHistory: []
    };

    room.players.set(socket.id, {
      id: socket.id,
      name,
      color,
      carModel,
      bestTime: null,
      bestSplits: [],
      currentCp: 0,
      runCount: 0,
      overallPoints: 0,
      roundWins: 0,
      roundsCompleted: 0,
      totalTimeMs: 0,
      roundTimes: {},
      ping: 0,
      lastState: null
    });

    rooms.set(code, room);
    socketRoomMap.set(socket.id, code);
    socket.join(code);

    const state = serializeRoomState(room);
    if (typeof ack === 'function') {
      ack({ ok: true, room: state });
    } else {
      socket.emit('party_joined', state);
    }
  });

  // Join an existing Party Room
  socket.on('join_party', (payload = {}, ack) => {
    const rawCode = sanitizeString(payload.code, 10).toUpperCase();
    const room = rooms.get(rawCode);

    if (!room) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: `Party "${rawCode || '?'}" not found. Check the room code!` });
      }
      return;
    }

    if (room.players.size >= 24) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'This party is full (max 24 drivers).' });
      }
      return;
    }

    removePlayerFromRoom(socket);

    const name = sanitizeString(payload.name, 18) || 'Racer';
    const color = sanitizeColor(payload.color);
    const carModel = sanitizeString(payload.carModel, 30) || 'race';

    const player = {
      id: socket.id,
      name,
      color,
      carModel,
      bestTime: null,
      bestSplits: [],
      currentCp: 0,
      runCount: 0,
      overallPoints: 0,
      roundWins: 0,
      roundsCompleted: 0,
      totalTimeMs: 0,
      roundTimes: {},
      ping: 0,
      lastState: null
    };

    room.players.set(socket.id, player);
    socketRoomMap.set(socket.id, room.code);
    socket.join(room.code);

    const state = serializeRoomState(room);
    if (typeof ack === 'function') {
      ack({ ok: true, room: state });
    }

    socket.to(room.code).emit('player_joined', {
      player: {
        id: player.id,
        name: player.name,
        color: player.color,
        carModel: player.carModel,
        bestTime: null,
        currentCp: 0
      },
      leaderboard: state.leaderboard,
      overallLeaderboard: state.overallLeaderboard
    });
  });

  // Host updates match settings inside the Party Waiting Lobby before starting
  socket.on('host_update_lobby_settings', (data = {}, ack) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only the host can change lobby settings.' });
      return;
    }

    const totalRounds = Math.max(1, Math.min(10, Number(data.totalRounds) || room.totalRounds || 3));
    const startTrackId = CAMPAIGN_TRACK_IDS.includes(data.trackId)
      ? data.trackId
      : room.trackId || 'track_01';
    const roundDurationSec =
      typeof data.roundDurationSec === 'number' && data.roundDurationSec >= 60
        ? Math.min(3600, data.roundDurationSec)
        : room.roundDurationSec;

    room.totalRounds = totalRounds;
    room.roundDurationSec = roundDurationSec;
    room.playlist = buildMatchPlaylist(startTrackId, totalRounds);
    room.trackId = room.playlist[0];
    room.customTrack = null;

    const state = serializeRoomState(room);
    io.to(room.code).emit('lobby_settings_updated', state);
    if (typeof ack === 'function') ack({ ok: true, room: state });
  });

  // Host returns the party to the Waiting Room Lobby
  socket.on('host_return_to_lobby', () => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    room.state = 'lobby';
    room.roundStartTime = null;
    room.intermissionEndTime = null;
    io.to(room.code).emit('returned_to_lobby', serializeRoomState(room));
  });

  // Update player profile (name / car color / car model)
  socket.on('update_profile', (payload = {}) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || !room.players.has(socket.id)) return;

    const p = room.players.get(socket.id);
    if (payload.name) p.name = sanitizeString(payload.name, 18) || p.name;
    if (payload.color) p.color = sanitizeColor(payload.color);
    if (payload.carModel) p.carModel = sanitizeString(payload.carModel, 30) || p.carModel;

    io.to(code).emit('leaderboard_update', {
      leaderboard: getSortedRoundLeaderboard(room),
      overallLeaderboard: getSortedOverallLeaderboard(room)
    });
  });

  // Leave party explicitly
  socket.on('leave_party', () => {
    removePlayerFromRoom(socket);
  });

  // High-frequency car transform telemetry
  socket.on('car_update', (data) => {
    const code = socketRoomMap.get(socket.id);
    if (!code || !data) return;
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;

    p.lastState = data;
    socket.to(code).volatile.emit('remote_car_update', {
      id: socket.id,
      name: p.name,
      color: p.color,
      carModel: p.carModel || data.carModel || 'race',
      ...data
    });
  });

  // Checkpoint progress notification
  socket.on('checkpoint_pass', (data = {}) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.state !== 'racing') return;
    const p = room.players.get(socket.id);
    if (!p) return;

    const cpIndex = typeof data.cpIndex === 'number' ? Math.max(0, Math.floor(data.cpIndex)) : 0;
    p.currentCp = cpIndex;

    io.to(code).emit('player_cp', {
      playerId: socket.id,
      playerName: p.name,
      cpIndex,
      timeMs: data.timeMs,
      speedKmh: data.speedKmh,
      leaderboard: getSortedRoundLeaderboard(room)
    });
  });

  // Run Finished notification in Online Multiplayer
  socket.on('finish_run', (data = {}) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.state !== 'racing') return;
    const p = room.players.get(socket.id);
    if (!p) return;

    const timeMs = typeof data.timeMs === 'number' ? Math.round(data.timeMs) : 0;
    if (timeMs < 3000 || timeMs > 3600000) return;

    p.runCount = (p.runCount || 0) + 1;
    p.currentCp = 0;

    // Also record this lap into the global Track Top 10 Leaderboard!
    const top10Result = recordTrackTop10Time(room.trackId, p.name, p.color, timeMs, 'online');

    const isPersonalBest = p.bestTime === null || timeMs < p.bestTime;
    const previousBest = p.bestTime;

    if (isPersonalBest) {
      p.bestTime = timeMs;
      if (Array.isArray(data.splits)) {
        p.bestSplits = data.splits.slice(0, 32).map((n) => Math.round(Number(n) || 0));
      }
    }

    const isRoomRecord = !room.roomRecord || timeMs < room.roomRecord.timeMs;
    if (isRoomRecord) {
      room.roomRecord = {
        playerId: p.id,
        playerName: p.name,
        color: p.color,
        timeMs
      };
    }

    io.to(code).emit('run_finished', {
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      timeMs,
      previousBest,
      isPersonalBest,
      isRoomRecord,
      madeTrackTop10: top10Result.madeTop10,
      trackTop10Rank: top10Result.rank,
      leaderboard: getSortedRoundLeaderboard(room),
      overallLeaderboard: getSortedOverallLeaderboard(room)
    });
  });

  // Host starts the Championship Match (from Party Waiting Lobby or after Match Over)
  socket.on('host_start_new_match', (data = {}, ack) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only the host can start the match.' });
      return;
    }

    startNewMatchInRoom(room, data.trackId, data.totalRounds, data.roundDurationSec);
    if (typeof ack === 'function') ack({ ok: true });
  });

  // Host ends current round early (tallies points & shows Round Leaderboard)
  socket.on('host_end_round', () => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    if (room.state === 'racing') {
      concludeCurrentRound(room);
    }
  });

  // Host advances from Round Summary directly to the Next Round
  socket.on('host_next_round', () => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    if (room.state === 'round_over') {
      advanceToNextRound(room);
    }
  });

  // Host changes track or loads custom track
  socket.on('host_change_track', (data = {}, ack) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    if (room.hostId !== socket.id && !data.allowNonHostCustom) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'Only the party host can change the map.' });
      }
      return;
    }

    if (data.customTrack && typeof data.customTrack === 'object') {
      room.trackId = data.customTrack.id || 'custom';
      room.customTrack = data.customTrack;
      room.state = 'racing';
      room.roundStartTime = Date.now();
      room.intermissionEndTime = null;
      room.roomRecord = null;
      for (const p of room.players.values()) {
        p.bestTime = null;
        p.bestSplits = [];
        p.currentCp = 0;
        p.runCount = 0;
      }
      io.to(room.code).emit('track_changed', serializeRoomState(room));
    } else {
      startNewMatchInRoom(room, data.trackId, data.totalRounds || room.totalRounds, data.roundDurationSec);
    }

    if (typeof ack === 'function') {
      ack({ ok: true });
    }
  });

  // Party Chat & Quick Emotes
  socket.on('chat_message', (data = {}) => {
    const code = socketRoomMap.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;

    const text = sanitizeString(data.text, 120);
    if (!text) return;

    io.to(code).emit('chat_message', {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      text,
      isEmote: Boolean(data.isEmote),
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    removePlayerFromRoom(socket);
  });
});

// Server 1Hz tick for Round Timer & Multi-Round Auto-Progression
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.state === 'racing' && room.roundDurationSec > 0) {
      const elapsedSec = (now - room.roundStartTime) / 1000;
      if (elapsedSec >= room.roundDurationSec) {
        concludeCurrentRound(room);
      }
    } else if (room.state === 'round_over' && room.intermissionEndTime && now >= room.intermissionEndTime) {
      advanceToNextRound(room);
    }
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TurboMania Online Server running on http://localhost:${PORT}`);
});
