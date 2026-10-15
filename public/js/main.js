// TurboMania Online — Main Controller: 2 Game Modes (Online 3-5 Round Multiplayer & Practice), Track Top 10 Leaderboards & 120Hz Physics
import { CAMPAIGN_TRACKS, compileTrack, getTrackDefinitionById } from './tracks.js';
import { CarPhysics } from './physics.js';
import { GameRenderer, CAR_MODELS } from './renderer.js';
import { SoundEngine } from './audio.js';

// ==================== HELPERS ====================
function formatTimeMs(ms, showSign = false) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '--:--.---';
  const sign = ms < 0 ? '-' : showSign ? '+' : '';
  const abs = Math.abs(Math.round(ms));
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const millis = abs % 1000;
  if (showSign && minutes === 0) {
    return `${sign}${seconds}.${String(millis).padStart(3, '0')}s`;
  }
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatRoundClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function getMedalForTime(timeMs, medals) {
  if (!timeMs || !medals) return null;
  if (timeMs <= medals.author) return { icon: '🟢', name: 'AUTHOR MEDAL', cls: 'author' };
  if (timeMs <= medals.gold) return { icon: '🥇', name: 'GOLD MEDAL', cls: 'gold' };
  if (timeMs <= medals.silver) return { icon: '🥈', name: 'SILVER MEDAL', cls: 'silver' };
  if (timeMs <= medals.bronze) return { icon: '🥉', name: 'BRONZE MEDAL', cls: 'bronze' };
  return { icon: '🏁', name: 'FINISHER', cls: 'finisher' };
}

function showToast(msg, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 260);
  }, duration);
}

// ==================== APPLICATION STATE ====================
const canvas = document.getElementById('game-canvas');
const renderer = new GameRenderer(canvas);
const sound = new SoundEngine();

let currentTrackDef = CAMPAIGN_TRACKS[0];
let currentTrack = compileTrack(currentTrackDef);
renderer.buildTrackScene(currentTrack);

const physics = new CarPhysics(currentTrack);

// ==================== USER PROFILE & LOCAL STORAGE MEMORY ====================
// One-time reset of legacy test records and old placeholder names
const RESET_KEY = 'tm_v2_reset_leaderboards';
if (localStorage.getItem(RESET_KEY) !== '1') {
  localStorage.removeItem('tm_player_name');
  localStorage.removeItem('tm_has_custom_name');
  localStorage.removeItem('tm_personal_bests');
  localStorage.removeItem('tm_user_id');
  localStorage.setItem(RESET_KEY, '1');
}

// Check if user has previously customized their username
const hasSavedCustomName = localStorage.getItem('tm_has_custom_name') === 'true';
let playerName = '';
let playerColor = '#00f0ff';
let playerCarModel = 'race';

if (hasSavedCustomName && localStorage.getItem('tm_player_name')) {
  playerName = localStorage.getItem('tm_player_name');
  playerColor = localStorage.getItem('tm_player_color') || '#00f0ff';
  playerCarModel = localStorage.getItem('tm_car_model') || 'race';
} else {
  // Initially assign a guest username for every new user
  let guestName = sessionStorage.getItem('tm_guest_name');
  if (!guestName) {
    guestName = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    sessionStorage.setItem('tm_guest_name', guestName);
  }
  playerName = guestName;
  playerColor = '#00f0ff';
  playerCarModel = 'race';
}

renderer.updateCarColor(renderer.localCar, playerColor);
renderer.setCarModel(renderer.localCar, playerCarModel);
renderer.setCarModel(renderer.pbGhostCar, playerCarModel);

// Game & Lobby State
let gameActive = false;
let countdownTimer = 0;
let lastCountdownInt = 0;
let selectedPracticeTrackId = CAMPAIGN_TRACKS[0].id;
let activeHudLbTab = 'round'; // 'round' | 'overall' | 'top10'

// Global Track Top 10 Leaderboards (shared across Online + Practice)
let trackLeaderboards = {
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

// Immediately restore cached global track leaderboards from localStorage if present
try {
  const cachedLb = localStorage.getItem('tm_cached_leaderboards');
  if (cachedLb) {
    const parsedLb = JSON.parse(cachedLb);
    if (parsedLb && typeof parsedLb === 'object') {
      for (const tid of Object.keys(parsedLb)) {
        if (Array.isArray(parsedLb[tid])) {
          trackLeaderboards[tid] = parsedLb[tid];
        }
      }
    }
  }
} catch (e) {
  console.warn('Could not load cached leaderboards:', e);
}

function persistLeaderboardsToLocalStorage() {
  try {
    localStorage.setItem('tm_cached_leaderboards', JSON.stringify(trackLeaderboards));
  } catch (e) {
    console.warn('Could not persist leaderboards to localStorage:', e);
  }
}

/**
 * Merges server or incoming leaderboards into local state with deduplication.
 * Returns true if any records improved or changed.
 */
function mergeClientLeaderboards(incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  let changed = false;

  for (const tid of Object.keys(trackLeaderboards)) {
    if (!Array.isArray(trackLeaderboards[tid])) {
      trackLeaderboards[tid] = [];
    }
    const currentList = trackLeaderboards[tid];
    const incomingList = Array.isArray(incoming[tid]) ? incoming[tid] : [];

    for (const inEntry of incomingList) {
      if (!inEntry || typeof inEntry.timeMs !== 'number' || inEntry.timeMs < 3000 || inEntry.timeMs > 3600000) continue;
      const cleanName = (inEntry.playerName || 'Racer').trim().slice(0, 18);
      const cleanColor = inEntry.color || '#00f0ff';
      const cleanTime = Math.round(inEntry.timeMs);
      const cleanMode = inEntry.mode === 'ONLINE' ? 'ONLINE' : 'PRACTICE';
      const cleanTimestamp = typeof inEntry.timestamp === 'number' ? inEntry.timestamp : Date.now();

      const existingIdx = currentList.findIndex(
        (e) => (e.playerName || '').toLowerCase() === cleanName.toLowerCase()
      );

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
    persistLeaderboardsToLocalStorage();
  }
  return changed;
}

/**
 * Immediately records a lap time locally into Track Top 10 with deduplication,
 * guaranteeing zero UI delay and instantaneous HUD / leaderboard updates.
 */
function recordLocalTrackTop10(trackId, pName, color, timeMs, mode = 'PRACTICE') {
  if (!trackId || typeof timeMs !== 'number' || timeMs < 3000 || timeMs > 3600000) {
    return { madeTop10: false, rank: null, list: trackLeaderboards[trackId] || [] };
  }

  if (!Array.isArray(trackLeaderboards[trackId])) {
    trackLeaderboards[trackId] = [];
  }

  const list = trackLeaderboards[trackId];
  const cleanName = (pName || 'Racer').trim().slice(0, 18);
  const cleanColor = color || '#00f0ff';
  const cleanTime = Math.round(timeMs);
  const cleanMode = mode === 'ONLINE' ? 'ONLINE' : 'PRACTICE';

  const existingIdx = list.findIndex(
    (e) => (e.playerName || '').toLowerCase() === cleanName.toLowerCase()
  );
  let entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (existingIdx !== -1) {
    if (cleanTime < list[existingIdx].timeMs) {
      list[existingIdx].timeMs = cleanTime;
      list[existingIdx].color = cleanColor;
      list[existingIdx].mode = cleanMode;
      list[existingIdx].timestamp = Date.now();
      entryId = list[existingIdx].id;
    } else {
      return { madeTop10: false, rank: existingIdx + 1, list };
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

  const rankIdx = list.findIndex(
    (e) => e.id === entryId || (e.playerName || '').toLowerCase() === cleanName.toLowerCase()
  );
  const madeTop10 = rankIdx !== -1 && rankIdx < 10;

  persistLeaderboardsToLocalStorage();

  return {
    madeTop10,
    rank: madeTop10 ? rankIdx + 1 : null,
    list
  };
}

/**
 * Offline & network resilience: queues lap submissions locally if disconnected
 */
function queuePendingLap(trackId, pName, color, timeMs, mode = 'PRACTICE') {
  try {
    const raw = localStorage.getItem('tm_pending_laps');
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({
      trackId,
      playerName: pName,
      color,
      timeMs,
      mode,
      timestamp: Date.now()
    });
    localStorage.setItem('tm_pending_laps', JSON.stringify(queue.slice(-50)));
  } catch (e) {
    console.warn('Could not queue pending lap:', e);
  }
}

function flushPendingLaps() {
  try {
    const raw = localStorage.getItem('tm_pending_laps');
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return;

    localStorage.removeItem('tm_pending_laps');

    for (const lap of queue) {
      if (socket && socket.connected) {
        socket.emit('submit_practice_lap', lap, (res) => {
          if (res && res.leaderboard) {
            mergeClientLeaderboards({ [lap.trackId]: res.leaderboard });
            renderCampaignTrackLists();
            updateTop1RecordDisplay();
            renderLeaderboard();
          }
        });
      }
    }
  } catch (e) {
    console.warn('Could not flush pending laps:', e);
  }
}

/**
 * Synchronizes client-cached global track leaderboards with the server.
 * Both socket and REST fallback are employed to guarantee persistence across Render container sleep/restarts.
 */
function syncLeaderboardWithServer() {
  if (socket && socket.connected) {
    socket.emit('sync_client_leaderboard', trackLeaderboards, (res) => {
      if (res && res.leaderboards) {
        if (mergeClientLeaderboards(res.leaderboards)) {
          renderCampaignTrackLists();
          updateTop1RecordDisplay();
          renderLeaderboard();
        }
      }
    });
  }

  fetch('/api/leaderboards/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trackLeaderboards)
  })
    .then((r) => r.json())
    .then((data) => {
      if (data && data.leaderboards) {
        if (mergeClientLeaderboards(data.leaderboards)) {
          renderCampaignTrackLists();
          updateTop1RecordDisplay();
          renderLeaderboard();
        }
      }
    })
    .catch((err) => {
      console.warn('Leaderboard sync HTTP note:', err.message);
    });
}

window.addEventListener('online', () => {
  syncLeaderboardWithServer();
  flushPendingLaps();
});


// Party / Multiplayer State (3-5 Rounds + Pre-Game Waiting Lobby)
let socket = null;
let serverClockOffset = 0;
let lastPingMs = 0;
let partyState = {
  inParty: false,
  code: null,
  hostId: null,
  trackId: 'track_01',
  currentRound: 1,
  totalRounds: 3,
  playlist: ['track_01', 'track_02', 'track_03'],
  roundDurationSec: 240,
  roundStartTime: Date.now(),
  intermissionEndTime: null,
  state: 'lobby', // 'lobby' | 'racing' | 'round_over' | 'match_over'
  leaderboard: [],
  overallLeaderboard: [],
  roundHistory: []
};

// Remote Players Interpolation State
const remotePlayers = new Map();
let spectateTargetId = null;

// Personal Best & Ghost Recording (20Hz keyframes)
const localPersonalBests = new Map(); // trackId -> { timeMs, splits, ghostFrames, date }

// Load remembered personal bests if user has a saved profile
if (hasSavedCustomName) {
  try {
    const rawPbs = localStorage.getItem('tm_personal_bests');
    if (rawPbs) {
      const parsed = JSON.parse(rawPbs);
      for (const tid of Object.keys(parsed)) {
        localPersonalBests.set(tid, {
          timeMs: parsed[tid].timeMs,
          splits: parsed[tid].splits || [],
          ghostFrames: [],
          date: parsed[tid].date
        });
      }
    }
  } catch (e) {
    console.warn('Could not parse stored PBs:', e);
  }
}

let roomRecordGhost = null;
let currentRunGhostFrames = [];
let ghostSampleAccum = 0;
let showGhosts = true;

function saveUserDataToLocalStorage() {
  if (localStorage.getItem('tm_has_custom_name') !== 'true') return;
  try {
    localStorage.setItem('tm_player_name', playerName);
    localStorage.setItem('tm_player_color', playerColor);
    localStorage.setItem('tm_car_model', playerCarModel);

    const pbs = {};
    for (const [tid, pb] of localPersonalBests.entries()) {
      pbs[tid] = { timeMs: pb.timeMs, splits: pb.splits || [], date: pb.date || Date.now() };
    }
    localStorage.setItem('tm_personal_bests', JSON.stringify(pbs));
  } catch (err) {
    console.warn('Could not save user data to localStorage:', err);
  }
}

function updateProfileBadgeUI() {
  const badge = document.getElementById('player-profile-badge');
  const hint = document.getElementById('player-profile-hint');
  const isSaved = localStorage.getItem('tm_has_custom_name') === 'true';
  if (badge) {
    badge.textContent = isSaved ? '⭐ Saved' : '👤 Guest';
    badge.className = `profile-status-pill ${isSaved ? 'saved' : 'guest'}`;
  }
  if (hint) {
    if (isSaved) {
      hint.textContent = `Saved User: ${playerName}. Profile and track lap records remembered in local storage.`;
      hint.className = 'profile-hint saved';
    } else {
      hint.textContent = 'Change nickname once to permanently save your user profile & records.';
      hint.className = 'profile-hint';
    }
  }
}

function handleUsernameChange(val, explicit = false) {
  const clean = (val || nameInput.value).trim().slice(0, 16);
  if (!clean) {
    nameInput.value = playerName;
    return;
  }
  const isGuest = localStorage.getItem('tm_has_custom_name') !== 'true';
  const initialGuest = sessionStorage.getItem('tm_guest_name');

  // If user changes their username once, permanently remember user and their data in local storage
  if (isGuest && (clean !== initialGuest || explicit)) {
    saveCustomUser(clean);
  } else if (!isGuest && clean !== playerName) {
    saveCustomUser(clean);
  } else {
    playerName = clean;
    nameInput.value = playerName;
  }
}

function saveCustomUser(name) {
  playerName = name;
  nameInput.value = playerName;
  localStorage.setItem('tm_has_custom_name', 'true');
  localStorage.setItem('tm_player_name', playerName);
  if (!localStorage.getItem('tm_user_id')) {
    localStorage.setItem('tm_user_id', `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
  }
  saveUserDataToLocalStorage();
  updateProfileBadgeUI();
  showToast(`⭐ Welcome ${playerName}! Your username & data are now remembered in local storage.`);
  if (socket && partyState.inParty) {
    socket.emit('update_profile', { name: playerName, color: playerColor, carModel: playerCarModel });
  }
}

// Input State
const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  brake: false,
  space: false
};

// Custom Track Builder Blocks
let builderBlocks = [
  { length: 70, turn: 0, pitch: 0, bank: 0, surface: 'asphalt' },
  { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
  { length: 140, turn: 90, pitch: 8, bank: 18, surface: 'asphalt', checkpoint: true },
  { length: 50, turn: 0, pitch: 8, bank: 0, surface: 'boost', walls: 'none' },
  { length: 24, turn: 0, pitch: -5, bank: 0, isGap: true },
  { length: 95, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 17, checkpoint: true },
  { length: 140, turn: -90, pitch: -6, bank: -22, surface: 'ice', width: 16 },
  { length: 110, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 14 }
];

// ==================== INITIALIZE PROFILE & MODE TABS ====================
const nameInput = document.getElementById('player-name-input');
nameInput.value = playerName;
updateProfileBadgeUI();

document.querySelectorAll('.color-swatch').forEach((btn) => {
  if (btn.dataset.color === playerColor) {
    document.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  }
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    playerColor = btn.dataset.color;
    if (localStorage.getItem('tm_has_custom_name') === 'true') {
      localStorage.setItem('tm_player_color', playerColor);
    }
    renderer.updateCarColor(renderer.localCar, playerColor);
    if (socket && partyState.inParty) {
      socket.emit('update_profile', { name: playerName, color: playerColor, carModel: playerCarModel });
    }
  });
});

nameInput.addEventListener('change', () => {
  handleUsernameChange(nameInput.value, true);
});

nameInput.addEventListener('blur', () => {
  if (nameInput.value.trim() && nameInput.value.trim() !== playerName) {
    handleUsernameChange(nameInput.value, true);
  }
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    nameInput.blur();
  }
});

// ==================== 3D VEHICLE GARAGE CONTROLLER ====================
const garageModal = document.getElementById('garage-modal');
const garageGrid = document.getElementById('garage-grid');
const profileCarBtn = document.getElementById('btn-profile-garage');
const topGarageBtn = document.getElementById('btn-top-garage');
const waitingGarageBtn = document.getElementById('btn-waiting-garage');
const closeGarageBtn = document.getElementById('btn-close-garage');
const confirmGarageBtn = document.getElementById('btn-confirm-garage');
const profileSelectedCarName = document.getElementById('profile-selected-car-name');
const garageSelectedSummary = document.getElementById('garage-selected-summary');

function updateGarageUI() {
  const currentModel = CAR_MODELS.find((m) => m.id === playerCarModel) || CAR_MODELS[0];
  if (profileSelectedCarName) {
    profileSelectedCarName.textContent = `🏎️ ${currentModel.name}`;
  }
  if (garageSelectedSummary) {
    garageSelectedSummary.innerHTML = `Active: <b>${currentModel.name}</b> (${currentModel.category})`;
  }

  if (garageGrid) {
    garageGrid.innerHTML = '';
    CAR_MODELS.forEach((m) => {
      const card = document.createElement('div');
      const isActive = m.id === playerCarModel;
      card.className = `garage-card-item ${isActive ? 'active' : ''}`;

      card.innerHTML = `
        <div class="garage-item-header">
          <span class="garage-category-badge">${m.category}</span>
          ${isActive ? '<span class="garage-active-badge">✓ ACTIVE</span>' : ''}
        </div>
        <div class="garage-item-body">
          <div class="garage-item-title">${m.name}</div>
          <div class="garage-item-desc">${m.desc}</div>
        </div>
        <div class="garage-item-footer">
          <button type="button" class="garage-select-btn ${isActive ? 'selected' : ''}">
            ${isActive ? 'Selected' : 'Select Vehicle'}
          </button>
        </div>
      `;

      card.addEventListener('click', () => {
        selectVehicleModel(m.id);
      });

      garageGrid.appendChild(card);
    });
  }
}

function selectVehicleModel(modelId) {
  playerCarModel = modelId;
  if (localStorage.getItem('tm_has_custom_name') === 'true') {
    localStorage.setItem('tm_car_model', playerCarModel);
  }
  renderer.setCarModel(renderer.localCar, playerCarModel);
  renderer.setCarModel(renderer.pbGhostCar, playerCarModel);

  if (socket && partyState.inParty) {
    socket.emit('update_profile', {
      name: playerName,
      color: playerColor,
      carModel: playerCarModel
    });
  }

  const modelInfo = CAR_MODELS.find((m) => m.id === modelId) || CAR_MODELS[0];
  showToast(`🏎️ Switched to ${modelInfo.name}!`);
  updateGarageUI();
}

function openGarageModal() {
  updateGarageUI();
  if (garageModal) garageModal.classList.remove('hidden');
}

function closeGarageModal() {
  if (garageModal) garageModal.classList.add('hidden');
}

if (profileCarBtn) profileCarBtn.addEventListener('click', openGarageModal);
if (topGarageBtn) topGarageBtn.addEventListener('click', openGarageModal);
if (waitingGarageBtn) waitingGarageBtn.addEventListener('click', openGarageModal);
if (closeGarageBtn) closeGarageBtn.addEventListener('click', closeGarageModal);
if (confirmGarageBtn) confirmGarageBtn.addEventListener('click', closeGarageModal);

updateGarageUI();

// Lobby Mode Switch Tabs: 1) Online Multiplayer  2) Practice & Track Top 10
const modeTabOnline = document.getElementById('mode-tab-online');
const modeTabPractice = document.getElementById('mode-tab-practice');
const lobbyViewOnline = document.getElementById('lobby-view-online');
const lobbyViewPractice = document.getElementById('lobby-view-practice');

modeTabOnline.addEventListener('click', () => {
  modeTabOnline.classList.add('active');
  modeTabPractice.classList.remove('active');
  lobbyViewOnline.classList.remove('hidden');
  lobbyViewPractice.classList.add('hidden');
});

modeTabPractice.addEventListener('click', () => {
  modeTabPractice.classList.add('active');
  modeTabOnline.classList.remove('active');
  lobbyViewPractice.classList.remove('hidden');
  lobbyViewOnline.classList.add('hidden');
  renderPracticeTrackSelector();
  renderPracticeTop10Preview(selectedPracticeTrackId);
});

// HUD Left Panel Leaderboard Tabs (Round | Overall | Track Top 10)
document.querySelectorAll('.lb-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeHudLbTab = btn.dataset.tab;
    document.querySelectorAll('.lb-tab').forEach((b) => b.classList.toggle('active', b === btn));
    renderLeaderboard();
  });
});

function setHudLeaderboardTab(tabName) {
  activeHudLbTab = tabName;
  document.querySelectorAll('.lb-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  renderLeaderboard();
}

// ==================== TRACK SELECTORS & TOP 10 PREVIEWS ====================
const createTrackSelect = document.getElementById('create-track-select');
const campaignCardsContainer = document.getElementById('campaign-track-cards');
const practiceTrackListEl = document.getElementById('practice-track-list');

function renderPracticeTop10Preview(trackId) {
  const def = getTrackDefinitionById(trackId);
  document.getElementById('practice-top10-trackname').textContent = def.name;
  const container = document.getElementById('practice-top10-list');
  const list = trackLeaderboards[trackId] || [];

  if (list.length === 0) {
    container.innerHTML = `
      <div style="color:#94a3b8;font-size:0.8rem;padding:18px 8px;text-align:center;">
        No lap records set on this track yet.<br/>Drive a lap in <b>Practice</b> or <b>Online</b> to claim <b>#1</b>!
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  list.slice(0, 10).forEach((entry, idx) => {
    const medal = getMedalForTime(entry.timeMs, def.medals);
    const row = document.createElement('div');
    row.className = 'top10-row';
    const isPractice = entry.mode === 'PRACTICE';
    row.innerHTML = `
      <span class="lb-rank">#${idx + 1}</span>
      <span class="lb-dot" style="background:${entry.color || '#00f0ff'}"></span>
      <span class="lb-name">${entry.playerName}</span>
      <span class="top10-mode-tag ${isPractice ? 'practice' : ''}">${entry.mode || 'ONLINE'}</span>
      <span class="lb-time">${medal ? medal.icon : ''} ${formatTimeMs(entry.timeMs)}</span>
    `;
    container.appendChild(row);
  });
}

function renderModalTop10Preview(trackId) {
  const def = getTrackDefinitionById(trackId);
  document.getElementById('modal-top10-title').textContent = def.name;
  const container = document.getElementById('modal-top10-list');
  const list = trackLeaderboards[trackId] || [];

  if (list.length === 0) {
    container.innerHTML = `<div style="color:#94a3b8;font-size:0.78rem;grid-column:1/-1;">No laps recorded yet on ${def.name}.</div>`;
    return;
  }

  container.innerHTML = '';
  list.slice(0, 10).forEach((entry, idx) => {
    const medal = getMedalForTime(entry.timeMs, def.medals);
    const row = document.createElement('div');
    row.className = 'top10-row';
    const isPractice = entry.mode === 'PRACTICE';
    row.innerHTML = `
      <span class="lb-rank">#${idx + 1}</span>
      <span class="lb-dot" style="background:${entry.color || '#00f0ff'}"></span>
      <span class="lb-name">${entry.playerName}</span>
      <span class="top10-mode-tag ${isPractice ? 'practice' : ''}">${entry.mode || 'ONLINE'}</span>
      <span class="lb-time">${medal ? medal.icon : ''} ${formatTimeMs(entry.timeMs)}</span>
    `;
    container.appendChild(row);
  });
}

function renderPracticeTrackSelector() {
  practiceTrackListEl.innerHTML = '';
  for (const t of CAMPAIGN_TRACKS) {
    const top1 = (trackLeaderboards[t.id] || [])[0];
    const item = document.createElement('div');
    item.className = `practice-track-item ${selectedPracticeTrackId === t.id ? 'active' : ''}`;
    item.innerHTML = `
      <h4>
        <span>${t.name}</span>
        <span class="diff-badge">${t.difficulty}</span>
      </h4>
      <p>${t.subtitle}</p>
      <div style="margin-top:5px;font-size:0.71rem;font-family:monospace;color:#00f0ff;display:flex;justify-content:space-between;">
        <span>🟢 Author: ${formatTimeMs(t.medals.author)}</span>
        <span>🏆 #1: ${top1 ? `${top1.playerName} (${formatTimeMs(top1.timeMs)})` : 'Unclaimed'}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      selectedPracticeTrackId = t.id;
      renderPracticeTrackSelector();
      renderPracticeTop10Preview(t.id);
    });
    practiceTrackListEl.appendChild(item);
  }
}

const waitingTrackSelect = document.getElementById('waiting-track-select');

function renderCampaignTrackLists() {
  const prevCreateVal = createTrackSelect.value;
  createTrackSelect.innerHTML = '';
  if (waitingTrackSelect) waitingTrackSelect.innerHTML = '';
  campaignCardsContainer.innerHTML = '';

  for (const t of CAMPAIGN_TRACKS) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.difficulty})`;
    createTrackSelect.appendChild(opt);

    if (waitingTrackSelect) {
      const wOpt = document.createElement('option');
      wOpt.value = t.id;
      wOpt.textContent = `${t.name} (${t.difficulty})`;
      waitingTrackSelect.appendChild(wOpt);
    }

    const top1 = (trackLeaderboards[t.id] || [])[0];
    const card = document.createElement('div');
    card.className = `track-card-item ${currentTrackDef.id === t.id ? 'active' : ''}`;
    card.innerHTML = `
      <h4>${t.name}</h4>
      <p>${t.subtitle}</p>
      <div style="margin-top:6px;font-size:0.7rem;color:#00f0ff;font-family:monospace;display:flex;justify-content:space-between;">
        <span>🟢 ${formatTimeMs(t.medals.author)} &bull; 🥇 ${formatTimeMs(t.medals.gold)}</span>
        <span>🌎 #1: ${top1 ? formatTimeMs(top1.timeMs) : '--:--.---'}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      renderModalTop10Preview(t.id);
      if (partyState.inParty && socket) {
        const dur = Number(document.getElementById('host-duration-select').value);
        const rounds = Number(document.getElementById('host-rounds-select').value);
        socket.emit(
          'host_change_track',
          { trackId: t.id, totalRounds: rounds, roundDurationSec: dur },
          (res) => {
            if (res && !res.ok) showToast(res.error);
          }
        );
        document.getElementById('host-modal').classList.add('hidden');
      } else {
        loadTrack(t, true);
        document.getElementById('host-modal').classList.add('hidden');
      }
    });
    campaignCardsContainer.appendChild(card);
  }

  if (prevCreateVal && CAMPAIGN_TRACKS.some((t) => t.id === prevCreateVal)) {
    createTrackSelect.value = prevCreateVal;
  }
  if (waitingTrackSelect && partyState.trackId) {
    waitingTrackSelect.value = partyState.trackId;
  }

  renderPracticeTrackSelector();
  renderPracticeTop10Preview(selectedPracticeTrackId);
  renderModalTop10Preview(currentTrackDef.id);
}
renderCampaignTrackLists();

// Check URL for `?room=XXXXX` invite link
const urlParams = new URLSearchParams(window.location.search);
const inviteRoomCode = urlParams.get('room');
if (inviteRoomCode) {
  const joinInput = document.getElementById('join-code-input');
  joinInput.value = inviteRoomCode.toUpperCase().slice(0, 6);
}

// ==================== TRACK LOADING & RUN START ====================
function updateTop1RecordDisplay() {
  const top1 = (trackLeaderboards[currentTrack.id] || [])[0];
  const pb = localPersonalBests.get(currentTrack.id);
  document.getElementById('hud-pb-time').textContent = pb ? formatTimeMs(pb.timeMs) : '--:--.---';

  if (roomRecordGhost && !partyState.inParty) {
    document.getElementById('hud-room-best').textContent = formatTimeMs(roomRecordGhost.timeMs);
  } else if (top1) {
    document.getElementById('hud-room-best').textContent = formatTimeMs(top1.timeMs);
  } else if (pb) {
    document.getElementById('hud-room-best').textContent = formatTimeMs(pb.timeMs);
  } else {
    document.getElementById('hud-room-best').textContent = '--:--.---';
  }
}

function loadTrack(trackDef, resetRoomGhost = true) {
  currentTrackDef = trackDef;
  currentTrack = compileTrack(trackDef);
  renderer.buildTrackScene(currentTrack);
  physics.setTrack(currentTrack);

  if (resetRoomGhost || partyState.inParty) {
    roomRecordGhost = null;
    renderer.recordGhostCar.group.visible = false;
  }
  if (partyState.inParty) {
    renderer.pbGhostCar.group.visible = false;
  }

  document.getElementById('hud-track-name').textContent = currentTrack.name;
  document.getElementById('hud-track-diff').textContent = currentTrack.difficulty;
  document.getElementById('medal-author').textContent = formatTimeMs(currentTrack.medals.author);
  document.getElementById('medal-gold').textContent = formatTimeMs(currentTrack.medals.gold);
  document.getElementById('medal-silver').textContent = formatTimeMs(currentTrack.medals.silver);
  document.getElementById('medal-bronze').textContent = formatTimeMs(currentTrack.medals.bronze);

  updateTop1RecordDisplay();
  renderCampaignTrackLists();
  renderLeaderboard();
  startNewRun(true);
}

function startNewRun(withCountdown = true) {
  sound.init();
  physics.resetToStart();
  renderer.resetCheckpointBanners();
  renderer.clearSkidmarks();

  currentRunGhostFrames = [];
  ghostSampleAccum = 0;

  document.getElementById('finish-banner').classList.add('hidden');
  document.getElementById('split-popup').classList.add('hidden');

  if (withCountdown && gameActive && !renderer.overviewMode) {
    countdownTimer = 1.65;
    lastCountdownInt = 4;
    physics.controlsLocked = true;
  } else {
    countdownTimer = 0;
    physics.controlsLocked = false;
    document.getElementById('countdown-banner').classList.add('hidden');
  }

  const st = physics.getInterpolatedState(1.0);
  renderer.camPos.set(st.x - st.forward.x * 9, st.y + 3.8, st.z - st.forward.z * 9);
  renderer.camTarget.set(st.x + st.forward.x * 10, st.y + 1.0, st.z + st.forward.z * 10);
}

// ==================== SOCKET.IO MULTIPLAYER & TOP 10 SYNC ====================
function initSocket() {
  if (socket) return;
  if (typeof window.io !== 'function') return;

  socket = window.io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    document.getElementById('conn-dot').classList.remove('offline');
    document.getElementById('conn-dot').classList.add('online');
    syncLeaderboardWithServer();
    flushPendingLaps();
  });

  socket.on('disconnect', () => {
    document.getElementById('conn-dot').classList.remove('online');
    document.getElementById('conn-dot').classList.add('offline');
  });

  // Receive Global Track Top 10 Leaderboards on Connect & Updates
  socket.on('track_leaderboards_init', (allBoards) => {
    if (allBoards && typeof allBoards === 'object') {
      mergeClientLeaderboards(allBoards);
      renderCampaignTrackLists();
      updateTop1RecordDisplay();
      renderLeaderboard();
    }
  });

  socket.on('track_leaderboards_update', (payload) => {
    if (payload && payload.leaderboards) {
      mergeClientLeaderboards(payload.leaderboards);
      renderCampaignTrackLists();
      updateTop1RecordDisplay();
      renderLeaderboard();
    }
  });

  // Periodic Clock Sync & Ping check
  setInterval(() => {
    if (!socket || !socket.connected) return;
    const t0 = performance.now();
    socket.emit('ping_check', { lastPing: lastPingMs }, (res) => {
      const rtt = performance.now() - t0;
      lastPingMs = Math.round(rtt);
      if (res && typeof res.serverTime === 'number') {
        serverClockOffset = res.serverTime - (Date.now() - rtt * 0.5);
      }
    });
  }, 3500);

  socket.on('player_joined', (data) => {
    if (data.player) {
      addChatLine(`👋 ${data.player.name} joined the party!`, null, true);
      showToast(`👋 ${data.player.name} joined the party!`);
    }
    if (data.leaderboard) partyState.leaderboard = data.leaderboard;
    if (data.overallLeaderboard) partyState.overallLeaderboard = data.overallLeaderboard;
    renderLeaderboard();
    if (partyState.state === 'lobby') {
      renderPartyWaitingLobby();
    }
  });

  socket.on('player_left', (data) => {
    if (data.playerId) {
      removeRemoteCar(data.playerId);
      if (spectateTargetId === data.playerId) {
        stopSpectating();
      }
    }
    if (data.playerName) {
      addChatLine(`🚪 ${data.playerName} left the party.`, null, true);
    }
    if (data.hostId) partyState.hostId = data.hostId;
    if (data.leaderboard) partyState.leaderboard = data.leaderboard;
    if (data.overallLeaderboard) partyState.overallLeaderboard = data.overallLeaderboard;
    renderLeaderboard();
    if (partyState.state === 'lobby') {
      renderPartyWaitingLobby();
    }
  });

  socket.on('leaderboard_update', (data) => {
    if (data.leaderboard) partyState.leaderboard = data.leaderboard;
    if (data.overallLeaderboard) partyState.overallLeaderboard = data.overallLeaderboard;
    renderLeaderboard();
    if (partyState.state === 'lobby') {
      renderPartyWaitingLobby();
    }
  });

  socket.on('remote_car_update', (data) => {
    if (!data || !data.id || data.id === socket.id) return;
    let rp = remotePlayers.get(data.id);
    if (!rp) {
      const carMesh = renderer.createCarMesh(data.color || '#00f0ff', false, data.name || 'Racer', data.carModel || 'race');
      carMesh.bodyMat.transparent = true;
      carMesh.bodyMat.opacity = 0.78;
      renderer.actorsGroup.add(carMesh.group);

      rp = {
        id: data.id,
        name: data.name || 'Racer',
        color: data.color || '#00f0ff',
        carModel: data.carModel || 'race',
        carMesh,
        curr: { ...data },
        target: { ...data },
        lastUpdateTime: performance.now()
      };
      remotePlayers.set(data.id, rp);
    } else {
      if (data.color && data.color !== rp.color) {
        rp.color = data.color;
        renderer.updateCarColor(rp.carMesh, data.color, data.name);
      }
      if (data.carModel && data.carModel !== rp.carMesh.currentModelId) {
        rp.carModel = data.carModel;
        renderer.setCarModel(rp.carMesh, data.carModel);
      }
      rp.target = { ...data };
      rp.lastUpdateTime = performance.now();
    }
  });

  socket.on('player_cp', (data) => {
    if (data.leaderboard) {
      partyState.leaderboard = data.leaderboard;
      renderLeaderboard();
    }
  });

  socket.on('run_finished', (data) => {
    if (data.leaderboard) partyState.leaderboard = data.leaderboard;
    if (data.overallLeaderboard) partyState.overallLeaderboard = data.overallLeaderboard;
    renderLeaderboard();

    if (data.madeTrackTop10) {
      addChatLine(
        `🌎 ${data.playerName} set #${data.trackTop10Rank} on the Track Top 10 (${formatTimeMs(data.timeMs)})!`,
        null,
        true
      );
      showToast(`🌎 ${data.playerName} claimed #${data.trackTop10Rank} on Track Top 10!`);
    } else if (data.isRoomRecord) {
      addChatLine(
        `🏆 ROUND RECORD! ${data.playerName} drove ${formatTimeMs(data.timeMs)}!`,
        null,
        true
      );
      showToast(`🏆 ${data.playerName} set the Round Record: ${formatTimeMs(data.timeMs)}!`);
    } else if (data.isPersonalBest) {
      addChatLine(`⏱️ ${data.playerName} set a round PB: ${formatTimeMs(data.timeMs)}`, null, true);
    }
    updateTop1RecordDisplay();
  });

  socket.on('lobby_settings_updated', (roomState) => {
    const trackChanged = roomState.trackId !== currentTrackDef.id;
    applyRoomState(roomState, trackChanged);
    if (partyState.state === 'lobby') {
      gameActive = false;
      renderer.overviewMode = true;
      renderPartyWaitingLobby();
    }
  });

  socket.on('returned_to_lobby', (roomState) => {
    applyRoomState(roomState, false);
    openPartyWaitingLobby();
    showToast('⏳ Host returned the party to the Waiting Room Lobby.');
    addChatLine('⏳ Returned to the Party Waiting Room Lobby.', null, true);
  });

  socket.on('track_changed', (roomState) => {
    document.getElementById('party-waiting-modal').classList.add('hidden');
    document.getElementById('podium-modal').classList.add('hidden');
    applyRoomState(roomState, true);
    if (!gameActive) {
      enterGameView();
    }
    showToast(`🏁 Round ${roomState.currentRound}/${roomState.totalRounds}: ${currentTrack.name}`);
    addChatLine(
      `🏁 Round ${roomState.currentRound} of ${roomState.totalRounds} started on ${currentTrack.name}!`,
      null,
      true
    );
  });

  socket.on('match_started', (roomState) => {
    document.getElementById('party-waiting-modal').classList.add('hidden');
    document.getElementById('podium-modal').classList.add('hidden');
    document.getElementById('host-modal').classList.add('hidden');
    applyRoomState(roomState, true);
    enterGameView();
    showToast(`🚀 ${roomState.totalRounds}-Round Championship Started!`);
    addChatLine(
      `🚀 ${roomState.totalRounds}-Round Championship started! Round 1: ${currentTrack.name}`,
      null,
      true
    );
  });

  socket.on('round_ended', (roomState) => {
    applyRoomState(roomState, false);
    showChampionshipModal(false);
  });

  socket.on('match_ended', (roomState) => {
    applyRoomState(roomState, false);
    showChampionshipModal(true);
  });

  socket.on('chat_message', (msg) => {
    addChatLine(msg.text, { name: msg.playerName, color: msg.color }, false);
  });
}

function removeRemoteCar(playerId) {
  const rp = remotePlayers.get(playerId);
  if (rp) {
    renderer.actorsGroup.remove(rp.carMesh.group);
    remotePlayers.delete(playerId);
  }
}

function clearAllRemoteCars() {
  for (const id of remotePlayers.keys()) {
    removeRemoteCar(id);
  }
}

function applyRoomState(room, reloadTrack = true) {
  partyState.inParty = true;
  partyState.code = room.code;
  partyState.hostId = room.hostId;
  partyState.trackId = room.trackId;
  partyState.currentRound = room.currentRound || 1;
  partyState.totalRounds = room.totalRounds || 3;
  partyState.playlist = room.playlist || [];
  partyState.roundDurationSec = room.roundDurationSec;
  partyState.roundStartTime = room.roundStartTime;
  partyState.intermissionEndTime = room.intermissionEndTime;
  partyState.state = room.state;
  partyState.leaderboard = room.leaderboard || [];
  partyState.overallLeaderboard = room.overallLeaderboard || [];
  partyState.roundHistory = room.roundHistory || [];

  if (typeof room.serverTime === 'number') {
    serverClockOffset = room.serverTime - Date.now();
  }

  // Disable ghost cars completely in Online Multiplayer
  roomRecordGhost = null;
  renderer.pbGhostCar.group.visible = false;
  renderer.recordGhostCar.group.visible = false;
  document.getElementById('btn-ghost-toggle').classList.add('hidden');

  // Update Top Bar Party & Round Indicator
  document.getElementById('party-code-label').textContent = `PARTY: ${room.code}`;
  document.getElementById('modal-mode-sublabel').textContent = `ONLINE PARTY (${partyState.totalRounds}-ROUND MATCH)`;
  document.getElementById('modal-room-code').textContent = room.code;
  document.getElementById('btn-copy-code').classList.remove('hidden');
  document.getElementById('btn-copy-link').classList.remove('hidden');
  document.getElementById('modal-share-btns').classList.remove('hidden');
  document.getElementById('host-online-controls').classList.remove('hidden');

  document.getElementById('hud-round-label').textContent =
    `ROUND ${partyState.currentRound} OF ${partyState.totalRounds}`;

  // Show Round & Overall tabs in Online Party mode
  document.getElementById('tab-lb-round').classList.remove('hidden');
  document.getElementById('tab-lb-overall').classList.remove('hidden');

  const newUrl = `${window.location.pathname}?room=${room.code}`;
  window.history.replaceState({ path: newUrl }, '', newUrl);

  if (reloadTrack) {
    const def = getTrackDefinitionById(room.trackId, room.customTrack);
    loadTrack(def, true);
  }

  updateTop1RecordDisplay();
  renderLeaderboard();
  if (partyState.state === 'lobby') {
    renderPartyWaitingLobby();
  }
}

// ==================== PARTY WAITING ROOM LOBBY ====================
function openPartyWaitingLobby() {
  gameActive = false;
  renderer.overviewMode = true;
  physics.controlsLocked = true;

  document.getElementById('lobby-modal').classList.add('hidden');
  document.getElementById('podium-modal').classList.add('hidden');
  document.getElementById('host-modal').classList.add('hidden');
  document.getElementById('countdown-banner').classList.add('hidden');
  document.getElementById('finish-banner').classList.add('hidden');

  document.getElementById('top-bar').classList.add('hud-hidden');
  document.getElementById('leaderboard-panel').classList.add('hud-hidden');
  document.getElementById('controls-card').classList.add('hud-hidden');
  document.getElementById('chat-panel').classList.add('hud-hidden');
  document.getElementById('bottom-hud').classList.add('hud-hidden');

  renderCampaignTrackLists();
  renderPartyWaitingLobby();
  document.getElementById('party-waiting-modal').classList.remove('hidden');
}

function renderPartyWaitingLobby() {
  const modal = document.getElementById('party-waiting-modal');
  if (!modal) return;

  document.getElementById('waiting-room-code').textContent = partyState.code || '-----';

  const isHost = Boolean(socket && partyState.hostId === socket.id);
  const players = partyState.leaderboard || [];

  document.getElementById('waiting-player-count').textContent = `${players.length} / 16 Connected`;

  const playersListEl = document.getElementById('waiting-players-list');
  playersListEl.innerHTML = '';
  players.forEach((p) => {
    const isMe = Boolean(socket && p.id === socket.id);
    const card = document.createElement('div');
    card.className = `waiting-player-card ${p.isHost ? 'is-host' : ''}`;
    card.innerHTML = `
      <div class="waiting-player-info">
        <span class="waiting-player-dot" style="background:${p.color || '#00f0ff'};color:${p.color || '#00f0ff'}"></span>
        <span class="waiting-player-name">${p.name}</span>
        ${isMe ? '<span style="font-size:0.68rem;color:#00f0ff;font-weight:800;">(YOU)</span>' : ''}
      </div>
      <span class="waiting-player-role ${p.isHost ? 'host' : 'ready'}">
        ${p.isHost ? '👑 HOST' : '✅ READY'}
      </span>
    `;
    playersListEl.appendChild(card);
  });

  const hostBadge = document.getElementById('waiting-host-badge');
  hostBadge.textContent = isHost ? '👑 YOU ARE HOST (EDITABLE)' : '🔒 HOST CONTROLS SETTINGS';

  const roundsSel = document.getElementById('waiting-rounds-select');
  const durSel = document.getElementById('waiting-duration-select');
  const trackSel = document.getElementById('waiting-track-select');

  if (roundsSel) {
    roundsSel.value = String(partyState.totalRounds || 3);
    roundsSel.disabled = !isHost;
  }
  if (durSel) {
    durSel.value = String(partyState.roundDurationSec ?? 240);
    durSel.disabled = !isHost;
  }
  if (trackSel) {
    trackSel.value = partyState.trackId || 'track_01';
    trackSel.disabled = !isHost;
  }

  // Render Map Rotation Preview for all rounds
  const playlistEl = document.getElementById('waiting-playlist-preview');
  if (playlistEl) {
    playlistEl.innerHTML = '';
    const playlist = partyState.playlist || [];
    playlist.forEach((tid, idx) => {
      const tDef = getTrackDefinitionById(tid);
      const item = document.createElement('div');
      item.className = 'waiting-playlist-item';
      item.innerHTML = `
        <span><b>Round ${idx + 1}:</b> ${tDef.name}</span>
        <span class="diff-badge">${tDef.difficulty}</span>
      `;
      playlistEl.appendChild(item);
    });
  }

  const startBtn = document.getElementById('btn-waiting-start-game');
  const nonHostMsg = document.getElementById('waiting-nonhost-msg');
  const hintEl = document.getElementById('waiting-settings-hint');

  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.textContent = `🚀 START GAME (${players.length} ${players.length === 1 ? 'RACER' : 'RACERS'} READY)`;
    nonHostMsg.classList.add('hidden');
    hintEl.textContent =
      'You are the Party Host. Change any settings above and click Start Game when all your friends have joined!';
  } else {
    startBtn.classList.add('hidden');
    nonHostMsg.classList.remove('hidden');
    hintEl.textContent =
      'Only the Party Host can change match settings and start the game.';
  }
}

function emitLobbySettingsChange() {
  if (!partyState.inParty || !socket) return;
  const isHost = Boolean(socket && partyState.hostId === socket.id);
  if (!isHost) return;

  const totalRounds = Number(document.getElementById('waiting-rounds-select').value) || 3;
  const roundDurationSec = Number(document.getElementById('waiting-duration-select').value) || 240;
  const trackId = document.getElementById('waiting-track-select').value || 'track_01';

  socket.emit(
    'host_update_lobby_settings',
    { trackId, totalRounds, roundDurationSec },
    (res) => {
      if (res && !res.ok) showToast(res.error);
    }
  );
}

document.getElementById('waiting-rounds-select')?.addEventListener('change', emitLobbySettingsChange);
document.getElementById('waiting-duration-select')?.addEventListener('change', emitLobbySettingsChange);
document.getElementById('waiting-track-select')?.addEventListener('change', emitLobbySettingsChange);

document.getElementById('btn-waiting-start-game')?.addEventListener('click', () => {
  if (!partyState.inParty || !socket) return;
  const totalRounds = Number(document.getElementById('waiting-rounds-select').value) || partyState.totalRounds || 3;
  const roundDurationSec =
    Number(document.getElementById('waiting-duration-select').value) || partyState.roundDurationSec || 240;
  const trackId = document.getElementById('waiting-track-select').value || partyState.trackId || 'track_01';

  socket.emit(
    'host_start_new_match',
    { trackId, totalRounds, roundDurationSec },
    (res) => {
      if (res && !res.ok) showToast(res.error);
    }
  );
});

document.getElementById('btn-waiting-leave')?.addEventListener('click', () => {
  if (socket && partyState.inParty) {
    socket.emit('leave_party');
  }
  clearAllRemoteCars();
  partyState.inParty = false;
  partyState.code = null;
  partyState.state = 'lobby';
  window.history.replaceState({}, '', window.location.pathname);

  document.getElementById('party-waiting-modal').classList.add('hidden');
  document.getElementById('lobby-modal').classList.remove('hidden');
  showToast('🚪 Left the online party.');
});

// ==================== LOBBY ACTIONS: ONLINE vs PRACTICE ====================
function enterGameView() {
  gameActive = true;
  renderer.overviewMode = false;
  document.getElementById('lobby-modal').classList.add('hidden');
  document.getElementById('party-waiting-modal').classList.add('hidden');
  document.getElementById('btn-resume-game').classList.remove('hidden');

  document.getElementById('top-bar').classList.remove('hud-hidden');
  document.getElementById('leaderboard-panel').classList.remove('hud-hidden');
  document.getElementById('controls-card').classList.remove('hud-hidden');
  document.getElementById('chat-panel').classList.remove('hud-hidden');
  document.getElementById('bottom-hud').classList.remove('hud-hidden');

  startNewRun(true);
}

function showLobbyError(msg) {
  const errEl = document.getElementById('lobby-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}

// 1. Create Online Party (Opens Waiting Room Lobby first so friends can join before starting)
document.getElementById('btn-create-party').addEventListener('click', () => {
  sound.init();
  initSocket();
  const inputVal = nameInput.value.trim().slice(0, 16);
  if (inputVal && inputVal !== playerName) {
    handleUsernameChange(inputVal, true);
  }

  const trackId = createTrackSelect.value || 'track_01';
  const totalRounds = Number(document.getElementById('create-rounds-select').value) || 3;
  const roundDurationSec = Number(document.getElementById('create-duration-select').value) || 240;

  socket.emit(
    'create_party',
    { name: playerName, color: playerColor, carModel: playerCarModel, trackId, totalRounds, roundDurationSec },
    (res) => {
      if (res && res.ok) {
        clearAllRemoteCars();
        setHudLeaderboardTab('round');
        applyRoomState(res.room, true);
        openPartyWaitingLobby();
        showToast(`🎉 Party ${res.room.code} Lobby Created! Share code & start when friends join.`);
        addChatLine(
          `🎉 Party ${res.room.code} Lobby created! Waiting for friends to join before starting...`,
          null,
          true
        );
      } else {
        showLobbyError('Could not create party. Please check your connection.');
      }
    }
  );
});

// 2. Join Friend's Online Party (Enters Waiting Room Lobby if in 'lobby', or joins live race if already started)
document.getElementById('btn-join-party').addEventListener('click', () => {
  sound.init();
  initSocket();
  const inputVal = nameInput.value.trim().slice(0, 16);
  if (inputVal && inputVal !== playerName) {
    handleUsernameChange(inputVal, true);
  }

  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) {
    showLobbyError('Please enter a 5-letter Party Room Code!');
    return;
  }

  socket.emit('join_party', { code, name: playerName, color: playerColor, carModel: playerCarModel }, (res) => {
    if (res && res.ok) {
      clearAllRemoteCars();
      setHudLeaderboardTab('round');
      applyRoomState(res.room, true);
      if (res.room.state === 'lobby') {
        openPartyWaitingLobby();
        showToast(`👋 Joined Party ${res.room.code} Lobby! Waiting for host to start the game.`);
        addChatLine(`👋 Joined Party ${res.room.code} Waiting Room Lobby!`, null, true);
      } else {
        enterGameView();
        showToast(`🏁 Joined Party ${res.room.code} (Round ${res.room.currentRound}/${res.room.totalRounds})!`);
        addChatLine(`🏁 Joined Party ${res.room.code}!`, null, true);
      }
    } else {
      showLobbyError(res?.error || 'Party not found.');
    }
  });
});

// 3. Start Practice Mode on Selected Track
function startPracticeMode(trackId) {
  sound.init();
  initSocket();
  const inputVal = nameInput.value.trim().slice(0, 16);
  if (inputVal && inputVal !== playerName) {
    handleUsernameChange(inputVal, true);
  }

  if (socket && partyState.inParty) {
    socket.emit('leave_party');
  }
  clearAllRemoteCars();

  partyState.inParty = false;
  partyState.code = null;
  partyState.roundDurationSec = 0; // Unlimited time in Practice
  partyState.roundStartTime = Date.now();

  // Re-enable ghost button in Solo Practice Mode
  const ghostBtn = document.getElementById('btn-ghost-toggle');
  ghostBtn.classList.remove('hidden');
  ghostBtn.classList.toggle('active', showGhosts);

  document.getElementById('party-code-label').textContent = 'PRACTICE MODE';
  document.getElementById('modal-mode-sublabel').textContent = 'SOLO PRACTICE MODE';
  document.getElementById('modal-room-code').textContent = 'PRACTICE';
  document.getElementById('btn-copy-code').classList.add('hidden');
  document.getElementById('btn-copy-link').classList.add('hidden');
  document.getElementById('modal-share-btns').classList.add('hidden');
  document.getElementById('host-online-controls').classList.add('hidden');

  document.getElementById('hud-round-label').textContent = 'PRACTICE TIME ATTACK';

  // In Practice Mode, default the left leaderboard directly to the Track Top 10!
  document.getElementById('tab-lb-round').classList.add('hidden');
  document.getElementById('tab-lb-overall').classList.add('hidden');
  setHudLeaderboardTab('top10');

  const def = getTrackDefinitionById(trackId || selectedPracticeTrackId);
  loadTrack(def, true);
  enterGameView();
  showToast(`🏎️ Practice Mode: ${def.name} — Laps count toward Track Top 10!`);
}

document.getElementById('btn-start-practice').addEventListener('click', () => {
  startPracticeMode(selectedPracticeTrackId);
});

document.getElementById('btn-resume-game').addEventListener('click', () => {
  document.getElementById('lobby-modal').classList.add('hidden');
});

// Copy Code & Invite Link Buttons
function copyRoomCode() {
  if (!partyState.inParty || !partyState.code) {
    document.getElementById('lobby-modal').classList.remove('hidden');
    return;
  }
  navigator.clipboard.writeText(partyState.code).then(() => {
    showToast(`📋 Copied Party Code: ${partyState.code}`);
  });
}

function copyInviteLink() {
  if (!partyState.inParty || !partyState.code) {
    document.getElementById('lobby-modal').classList.remove('hidden');
    return;
  }
  const link = `${window.location.origin}/?room=${partyState.code}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('🔗 Invite Link copied to clipboard! Send it to your friends.');
  });
}

document.getElementById('btn-copy-code').addEventListener('click', copyRoomCode);
document.getElementById('btn-copy-link').addEventListener('click', copyInviteLink);
document.getElementById('btn-modal-copy-code').addEventListener('click', copyRoomCode);
document.getElementById('btn-modal-copy-link').addEventListener('click', copyInviteLink);
document.getElementById('btn-waiting-copy-code')?.addEventListener('click', copyRoomCode);
document.getElementById('btn-waiting-copy-link')?.addEventListener('click', copyInviteLink);

// ==================== TOP BAR & HOST CONTROLS ====================
document.getElementById('btn-host-maps').addEventListener('click', () => {
  renderCampaignTrackLists();
  renderModalTop10Preview(currentTrackDef.id);
  document.getElementById('host-modal').classList.remove('hidden');
});

document.getElementById('btn-close-host').addEventListener('click', () => {
  document.getElementById('host-modal').classList.add('hidden');
});

document.getElementById('btn-return-party-lobby')?.addEventListener('click', () => {
  if (partyState.inParty && socket) {
    socket.emit('host_return_to_lobby', {}, (res) => {
      if (res && !res.ok) showToast(res.error);
    });
  }
  document.getElementById('host-modal').classList.add('hidden');
});

document.getElementById('btn-restart-round').addEventListener('click', () => {
  if (partyState.inParty && socket) {
    const dur = Number(document.getElementById('host-duration-select').value) || 240;
    const rounds = Number(document.getElementById('host-rounds-select').value) || 3;
    socket.emit('host_start_new_match', {
      trackId: currentTrackDef.id,
      totalRounds: rounds,
      roundDurationSec: dur
    });
  } else {
    startNewRun(true);
  }
  document.getElementById('host-modal').classList.add('hidden');
});

document.getElementById('btn-end-round').addEventListener('click', () => {
  if (partyState.inParty && socket) {
    socket.emit('host_end_round');
  }
  document.getElementById('host-modal').classList.add('hidden');
});

document.getElementById('btn-open-lobby').addEventListener('click', () => {
  if (partyState.inParty && partyState.state === 'lobby') {
    openPartyWaitingLobby();
    return;
  }
  document.getElementById('lobby-error').classList.add('hidden');
  renderCampaignTrackLists();
  document.getElementById('lobby-modal').classList.remove('hidden');
});

document.getElementById('btn-cam-toggle').addEventListener('click', () => {
  const camName = renderer.cycleCameraMode();
  showToast(`🎥 ${camName}`);
});

document.getElementById('btn-ghost-toggle').addEventListener('click', (e) => {
  if (partyState.inParty) return;
  showGhosts = !showGhosts;
  e.currentTarget.classList.toggle('active', showGhosts);
  if (!showGhosts) {
    renderer.pbGhostCar.group.visible = false;
    renderer.recordGhostCar.group.visible = false;
  }
  showToast(showGhosts ? '👻 Ghosts Enabled' : '👻 Ghosts Hidden');
});

const muteBtn = document.getElementById('btn-mute-toggle');
muteBtn.textContent = sound.muted ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => {
  const m = sound.toggleMute();
  muteBtn.textContent = m ? '🔇' : '🔊';
  showToast(m ? '🔇 Audio Muted' : '🔊 Audio Enabled');
});

document.getElementById('btn-respawn-cp').addEventListener('click', () => {
  if (!physics.controlsLocked && !physics.finished) {
    physics.respawnAtCheckpoint();
  }
});

document.getElementById('btn-restart-run').addEventListener('click', () => {
  startNewRun(true);
});

// ==================== HUD LEADERBOARD PANEL (ROUND | OVERALL | TOP 10) ====================
function renderLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  const countBadge = document.getElementById('player-count-badge');
  const titleEl = document.getElementById('lb-panel-title');
  listEl.innerHTML = '';

  const effectiveTab = !partyState.inParty ? 'top10' : activeHudLbTab;

  // TAB 3 (or Practice Default): TRACK TOP 10 LEADERBOARD
  if (effectiveTab === 'top10') {
    titleEl.textContent = '🌎 TRACK TOP 10';
    const top10 = trackLeaderboards[currentTrack.id] || [];
    countBadge.textContent = `${top10.length} / 10`;

    if (top10.length === 0) {
      listEl.innerHTML = `
        <div style="color:#94a3b8;font-size:0.76rem;padding:12px 6px;text-align:center;">
          No Top 10 times set on this track yet.<br/>Finish a lap to claim <b>#1</b>!
        </div>
      `;
      return;
    }

    top10.slice(0, 10).forEach((entry, idx) => {
      const medal = getMedalForTime(entry.timeMs, currentTrack.medals);
      const isMe = entry.playerName === playerName;
      const row = document.createElement('div');
      row.className = `lb-row ${isMe ? 'is-me' : ''}`;
      row.innerHTML = `
        <span class="lb-rank">#${idx + 1}</span>
        <span class="lb-dot" style="background:${entry.color || '#00f0ff'}"></span>
        <span class="lb-name">${entry.playerName}</span>
        <span class="lb-cp">${entry.mode === 'PRACTICE' ? 'PRAC' : 'ONL'}</span>
        <span class="lb-time">${medal ? medal.icon : ''} ${formatTimeMs(entry.timeMs)}</span>
      `;
      listEl.appendChild(row);
    });
    return;
  }

  // TAB 2: OVERALL MATCH LEADERBOARD (Cumulative across 3-5 Rounds)
  if (effectiveTab === 'overall') {
    titleEl.textContent = `🏆 OVERALL (R${partyState.currentRound}/${partyState.totalRounds})`;
    const rows = partyState.overallLeaderboard || [];
    countBadge.textContent = `${rows.length} ${rows.length === 1 ? 'Driver' : 'Drivers'}`;

    rows.forEach((p, idx) => {
      const isMe = socket && p.id === socket.id;
      const row = document.createElement('div');
      row.className = `lb-row ${isMe ? 'is-me' : ''}`;
      row.innerHTML = `
        <span class="lb-rank">#${idx + 1}</span>
        <span class="lb-dot" style="background:${p.color}"></span>
        <span class="lb-name">${p.name} ${p.isHost ? '👑' : ''}</span>
        <span class="lb-cp">${p.roundWins || 0}W</span>
        <span class="lb-time">${p.overallPoints || 0} PTS</span>
      `;
      listEl.appendChild(row);
    });
    return;
  }

  // TAB 1: CURRENT ROUND LIVE STANDINGS
  titleEl.textContent = `🏁 ROUND ${partyState.currentRound}/${partyState.totalRounds}`;
  const rows = partyState.leaderboard || [];
  countBadge.textContent = `${rows.length} ${rows.length === 1 ? 'Driver' : 'Drivers'}`;

  rows.forEach((p, idx) => {
    const isMe = socket && p.id === socket.id;
    const medal = p.bestTime ? getMedalForTime(p.bestTime, currentTrack.medals) : null;
    const row = document.createElement('div');
    row.className = `lb-row ${isMe ? 'is-me' : ''}`;
    row.title = isMe ? 'You' : `Click to Spectate ${p.name}`;

    const cpText =
      p.currentCp > 0 ? `CP ${p.currentCp}/${currentTrack.checkpoints.length}` : '';

    row.innerHTML = `
      <span class="lb-rank">#${idx + 1}</span>
      <span class="lb-dot" style="background:${p.color}"></span>
      <span class="lb-name">${p.name} ${p.isHost ? '👑' : ''}</span>
      <span class="lb-cp">${cpText}</span>
      <span class="lb-time">${medal ? medal.icon : ''} ${formatTimeMs(p.bestTime)}</span>
    `;

    if (!isMe) {
      row.addEventListener('click', () => {
        startSpectating(p.id, p.name);
      });
    }
    listEl.appendChild(row);
  });
}

function startSpectating(targetId, targetName) {
  if (!remotePlayers.has(targetId)) {
    showToast(`${targetName} is not currently on track.`);
    return;
  }
  spectateTargetId = targetId;
  document.getElementById('spectate-name').textContent = targetName;
  document.getElementById('spectate-banner').classList.remove('hidden');
}

function stopSpectating() {
  spectateTargetId = null;
  document.getElementById('spectate-banner').classList.add('hidden');
}

document.getElementById('btn-stop-spectate').addEventListener('click', stopSpectating);

// ==================== CHAT & QUICK EMOTES ====================
function appendChatLineToContainer(container, text, sender = null, isSystem = false) {
  if (!container) return;
  const line = document.createElement('div');
  line.className = `chat-line ${isSystem ? 'system' : ''}`;

  if (sender) {
    const nameSpan = document.createElement('b');
    nameSpan.style.color = sender.color || '#00f0ff';
    nameSpan.textContent = `${sender.name}: `;
    line.appendChild(nameSpan);
    line.appendChild(document.createTextNode(text));
  } else {
    line.textContent = text;
  }

  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function addChatLine(text, sender = null, isSystem = false) {
  appendChatLineToContainer(document.getElementById('chat-messages'), text, sender, isSystem);
  appendChatLineToContainer(document.getElementById('waiting-chat-messages'), text, sender, isSystem);
}

document.getElementById('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const inputEl = document.getElementById('chat-input');
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  inputEl.blur();

  if (partyState.inParty && socket) {
    socket.emit('chat_message', { text, isEmote: false });
  } else {
    addChatLine(text, { name: playerName, color: playerColor }, false);
  }
});

document.getElementById('waiting-chat-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const inputEl = document.getElementById('waiting-chat-input');
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';

  if (partyState.inParty && socket) {
    socket.emit('chat_message', { text, isEmote: false });
  } else {
    addChatLine(text, { name: playerName, color: playerColor }, false);
  }
});

document.querySelectorAll('.emote-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const text = btn.dataset.emote;
    if (partyState.inParty && socket) {
      socket.emit('chat_message', { text, isEmote: true });
    } else {
      addChatLine(text, { name: playerName, color: playerColor }, false);
    }
  });
});

// ==================== CUSTOM 3D TRACK BUILDER ====================
const BLOCK_PRESETS = {
  straight: { label: 'Straight (80m)', length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt' },
  boost: { label: 'Turbo Boost (50m)', length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
  super_boost: { label: 'Reactor Super Boost (50m)', length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost' },
  left90: { label: 'Left Turn 90°', length: 130, turn: 90, pitch: 0, bank: 10, surface: 'asphalt', width: 14 },
  right90: { label: 'Right Turn 90°', length: 130, turn: -90, pitch: 0, bank: -10, surface: 'asphalt', width: 14 },
  bankLeft: { label: 'Banked Left 90°', length: 145, turn: 90, pitch: 0, bank: 24, surface: 'asphalt', width: 14.5 },
  bankRight: { label: 'Banked Right 90°', length: 145, turn: -90, pitch: 0, bank: -24, surface: 'asphalt', width: 14.5 },
  hairpin: { label: 'Drift Hairpin 180°', length: 170, turn: 180, pitch: 0, bank: 16, surface: 'asphalt', width: 15.5 },
  climb: { label: 'Steep Uphill Climb', length: 105, turn: 0, pitch: 16, bank: 0, surface: 'asphalt' },
  drop: { label: 'Downhill Plunge', length: 105, turn: 0, pitch: -14, bank: 0, surface: 'asphalt' },
  jump: [
    { label: 'Jump Takeoff Ramp', length: 45, turn: 0, pitch: 8, bank: 0, surface: 'boost', walls: 'none' },
    { label: 'Mid-Air Canyon Gap', length: 24, turn: 0, pitch: -5, bank: 0, isGap: true },
    { label: 'Wide Landing Runway', length: 90, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 17 }
  ],
  ice: { label: 'Ice Bobsled Turn', length: 150, turn: -90, pitch: -4, bank: -28, surface: 'ice', width: 16 },
  dirt: { label: 'Dirt Rally Sector', length: 110, turn: 45, pitch: 0, bank: 8, surface: 'dirt', width: 15 },
  checkpoint: { label: 'Checkpoint Straight', length: 75, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true }
};

function renderBuilderList() {
  const list = document.getElementById('builder-blocks-list');
  list.innerHTML = '';

  builderBlocks.forEach((b, idx) => {
    const item = document.createElement('div');
    item.className = 'builder-block-item';
    const desc = b.isGap
      ? `🦅 Canyon Jump Gap (${b.length}m)`
      : `${b.checkpoint ? '🚩 CP + ' : ''}${b.surface.toUpperCase()} — ${b.length}m ${b.turn ? `| Turn ${b.turn}°` : ''} ${b.pitch ? `| Pitch ${b.pitch}°` : ''}`;
    item.innerHTML = `
      <span><b>#${idx + 1}</b> ${desc}</span>
      <button class="close-x" style="width:24px;height:24px;font-size:0.75rem;">✕</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      if (builderBlocks.length <= 2) {
        showToast('Track needs at least 2 blocks!');
        return;
      }
      builderBlocks.splice(idx, 1);
      renderBuilderList();
      previewBuilderTrack();
    });
    list.appendChild(item);
  });
}

function getBuilderTrackDef() {
  const name = document.getElementById('custom-track-name').value.trim() || 'Custom Party Circuit';
  const theme = document.getElementById('custom-track-theme').value || 'stadium_day';
  return {
    id: `custom_${Date.now()}`,
    name,
    subtitle: `Custom Built Track by ${playerName}`,
    difficulty: 'Custom',
    theme,
    blocks: builderBlocks
  };
}

function previewBuilderTrack() {
  const def = getBuilderTrackDef();
  currentTrack = compileTrack(def);
  renderer.buildTrackScene(currentTrack);
  renderer.overviewMode = true;
}

document.getElementById('btn-open-builder').addEventListener('click', () => {
  renderBuilderList();
  previewBuilderTrack();
  document.getElementById('builder-modal').classList.remove('hidden');
});

document.getElementById('btn-close-builder').addEventListener('click', () => {
  renderer.overviewMode = false;
  document.getElementById('builder-modal').classList.add('hidden');
  loadTrack(currentTrackDef, false);
});

document.getElementById('custom-track-theme').addEventListener('change', previewBuilderTrack);

document.querySelectorAll('.block-add-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = BLOCK_PRESETS[btn.dataset.preset];
    if (!preset) return;
    if (Array.isArray(preset)) {
      builderBlocks.push(...preset.map((p) => ({ ...p })));
    } else {
      builderBlocks.push({ ...preset });
    }
    renderBuilderList();
    previewBuilderTrack();
  });
});

document.getElementById('btn-builder-clear').addEventListener('click', () => {
  builderBlocks = [
    { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt' },
    { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', checkpoint: true },
    { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt' }
  ];
  renderBuilderList();
  previewBuilderTrack();
});

document.getElementById('btn-builder-play').addEventListener('click', () => {
  const customDef = getBuilderTrackDef();
  renderer.overviewMode = false;
  document.getElementById('builder-modal').classList.add('hidden');

  if (partyState.inParty && socket) {
    socket.emit(
      'host_change_track',
      {
        trackId: 'custom',
        customTrack: customDef,
        allowNonHostCustom: true
      },
      (res) => {
        if (res && !res.ok) showToast(res.error);
      }
    );
  } else {
    loadTrack(customDef, true);
    enterGameView();
  }
});

// ==================== ROUND-WISE & FINAL OVERALL CHAMPIONSHIP MODAL ====================
function showChampionshipModal(isMatchOver = false) {
  const badgeEl = document.getElementById('podium-badge-label');
  const titleEl = document.getElementById('podium-track-title');
  const stage = document.getElementById('podium-columns');
  const roundTable = document.getElementById('round-results-table');
  const overallTable = document.getElementById('overall-results-table');
  const historyBox = document.getElementById('round-history-breakdown');
  const nextBtn = document.getElementById('btn-podium-next');
  const newMatchBtn = document.getElementById('btn-podium-new-match');
  const lobbyBtn = document.getElementById('btn-podium-lobby');
  const countdownText = document.getElementById('podium-countdown-text');

  const lastRoundReport =
    partyState.roundHistory[partyState.roundHistory.length - 1] || {
      roundNumber: partyState.currentRound,
      trackId: currentTrack.id,
      standings: partyState.leaderboard
    };

  if (isMatchOver) {
    badgeEl.textContent = `🏆 ${partyState.totalRounds}-ROUND CHAMPIONSHIP COMPLETED`;
    titleEl.textContent = 'FINAL OVERALL STANDINGS';
    nextBtn.classList.add('hidden');
    newMatchBtn.classList.remove('hidden');
    lobbyBtn?.classList.remove('hidden');
    countdownText.textContent = 'All rounds finished! Final Championship results:';
  } else {
    badgeEl.textContent = `ROUND ${lastRoundReport.roundNumber} OF ${partyState.totalRounds} COMPLETED`;
    titleEl.textContent = currentTrack.name;
    nextBtn.classList.remove('hidden');
    newMatchBtn.classList.add('hidden');
    lobbyBtn?.classList.add('hidden');
    countdownText.textContent = `Next round map starting automatically in 15s...`;
  }

  // Render Top 3 Podium (Overall if Match Over, Round if Round Over)
  stage.innerHTML = '';
  const podiumSource = isMatchOver
    ? partyState.overallLeaderboard
    : lastRoundReport.standings || [];

  const order = [1, 0, 2];
  const trophies = ['🥇 1ST', '🥈 2ND', '🥉 3RD'];
  for (const idx of order) {
    const p = podiumSource[idx];
    if (!p) continue;
    const box = document.createElement('div');
    box.className = `podium-box place-${idx + 1}`;
    const subMetric = isMatchOver
      ? `${p.overallPoints || 0} PTS (${p.roundWins || 0} Wins)`
      : `${formatTimeMs(p.bestTime)} (+${p.pointsEarned || 0} PTS)`;
    box.innerHTML = `
      <div style="font-size:1.3rem;font-weight:900;margin-bottom:4px;">${trophies[idx]}</div>
      <div style="font-weight:800;color:${p.color};font-size:1.05rem;">${p.name}</div>
      <div style="font-family:monospace;font-size:0.88rem;margin-top:6px;color:#00f0ff;">
        ${subMetric}
      </div>
    `;
    stage.appendChild(box);
  }

  // Render Left Table: Round Standings
  document.getElementById('round-table-heading').textContent =
    `🏁 ROUND ${lastRoundReport.roundNumber} LEADERBOARD (${currentTrack.name})`;
  roundTable.innerHTML = '';
  (lastRoundReport.standings || []).forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML = `
      <span class="lb-rank">#${idx + 1}</span>
      <span class="lb-dot" style="background:${s.color}"></span>
      <span class="lb-name">${s.name}</span>
      <span class="lb-cp" style="color:#10b981;">+${s.pointsEarned || 0} PTS</span>
      <span class="lb-time">${formatTimeMs(s.bestTime)}</span>
    `;
    roundTable.appendChild(row);
  });

  // Render Right Table: Overall Championship Standings
  document.getElementById('overall-table-heading').textContent =
    `🏆 OVERALL STANDINGS (${partyState.roundHistory.length}/${partyState.totalRounds} ROUNDS)`;
  overallTable.innerHTML = '';
  (partyState.overallLeaderboard || []).forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML = `
      <span class="lb-rank">#${idx + 1}</span>
      <span class="lb-dot" style="background:${p.color}"></span>
      <span class="lb-name">${p.name}</span>
      <span class="lb-cp">${p.roundWins || 0} Wins</span>
      <span class="lb-time" style="color:#fbbf24;">${p.overallPoints || 0} PTS</span>
    `;
    overallTable.appendChild(row);
  });

  // Render Round-by-Round History Breakdown
  if (partyState.roundHistory.length > 0) {
    historyBox.classList.remove('hidden');
    historyBox.innerHTML = `<div style="font-weight:800;color:#94a3b8;margin-bottom:6px;font-size:0.72rem;">📊 ROUND-BY-ROUND SUMMARY</div>`;
    for (const rh of partyState.roundHistory) {
      const tDef = getTrackDefinitionById(rh.trackId);
      const winner = rh.standings && rh.standings[0] && rh.standings[0].bestTime
        ? `🥇 ${rh.standings[0].name} (${formatTimeMs(rh.standings[0].bestTime)})`
        : 'No finishers';
      const line = document.createElement('div');
      line.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06);';
      line.innerHTML = `
        <span><b>Round ${rh.roundNumber}:</b> ${tDef.name}</span>
        <span style="color:#00f0ff;font-family:monospace;">${winner}</span>
      `;
      historyBox.appendChild(line);
    }
  } else {
    historyBox.classList.add('hidden');
  }

  document.getElementById('podium-modal').classList.remove('hidden');
}

document.getElementById('btn-podium-next').addEventListener('click', () => {
  if (partyState.inParty && socket) {
    socket.emit('host_next_round');
  } else {
    document.getElementById('podium-modal').classList.add('hidden');
  }
});

document.getElementById('btn-podium-lobby')?.addEventListener('click', () => {
  if (partyState.inParty && socket) {
    socket.emit('host_return_to_lobby', {}, (res) => {
      if (res && !res.ok) showToast(res.error);
    });
  } else {
    document.getElementById('podium-modal').classList.add('hidden');
  }
});

document.getElementById('btn-podium-new-match').addEventListener('click', () => {
  if (partyState.inParty && socket) {
    socket.emit('host_start_new_match', {
      trackId: partyState.trackId || 'track_01',
      totalRounds: partyState.totalRounds,
      roundDurationSec: partyState.roundDurationSec
    });
  } else {
    document.getElementById('podium-modal').classList.add('hidden');
  }
});

// ==================== KEYBOARD & TOUCH INPUTS ====================
function isTypingInInput() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

window.addEventListener('keydown', (e) => {
  if (isTypingInInput()) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }

  sound.init();
  const code = e.code;

  if (code === 'KeyW' || code === 'ArrowUp') input.forward = true;
  if (code === 'KeyS' || code === 'ArrowDown') input.backward = true;
  if (code === 'KeyA' || code === 'ArrowLeft') input.left = true;
  if (code === 'KeyD' || code === 'ArrowRight') input.right = true;
  if (code === 'Space') {
    input.space = true;
    input.brake = true;
  }

  if (code === 'KeyR' || code === 'Delete') {
    e.preventDefault();
    startNewRun(true);
  } else if (code === 'Backspace' || code === 'KeyE') {
    e.preventDefault();
    if (!physics.controlsLocked && !physics.finished) {
      physics.respawnAtCheckpoint();
    }
  } else if (code === 'KeyC') {
    const camName = renderer.cycleCameraMode();
    showToast(`🎥 ${camName}`);
  } else if (code === 'KeyG') {
    if (!partyState.inParty) {
      document.getElementById('btn-ghost-toggle').click();
    }
  } else if (code === 'KeyM') {
    document.getElementById('btn-mute-toggle').click();
  } else if (code === 'Tab') {
    e.preventDefault();
    if (spectateTargetId) {
      stopSpectating();
    } else if (remotePlayers.size > 0) {
      const first = remotePlayers.values().next().value;
      startSpectating(first.id, first.name);
    }
  } else if (code === 'Escape') {
    const lobby = document.getElementById('lobby-modal');
    if (gameActive) {
      renderCampaignTrackLists();
      lobby.classList.toggle('hidden');
    }
  } else if (code === 'Enter') {
    const chatInput = document.getElementById('chat-input');
    if (chatInput && gameActive) {
      e.preventDefault();
      chatInput.focus();
    }
  }
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  if (code === 'KeyW' || code === 'ArrowUp') input.forward = false;
  if (code === 'KeyS' || code === 'ArrowDown') input.backward = false;
  if (code === 'KeyA' || code === 'ArrowLeft') input.left = false;
  if (code === 'KeyD' || code === 'ArrowRight') input.right = false;
  if (code === 'Space') {
    input.space = false;
    input.brake = false;
  }
});

function bindTouchButton(id, field) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sound.init();
    input[field] = true;
  });
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    input[field] = false;
  });
}
bindTouchButton('touch-left', 'left');
bindTouchButton('touch-right', 'right');
bindTouchButton('touch-gas', 'forward');
bindTouchButton('touch-brake', 'brake');

// ==================== GHOST RECORDING & INTERPOLATION ====================
function recordGhostKeyframe(timeMs, state) {
  currentRunGhostFrames.push([
    Math.round(timeMs),
    Number(state.x.toFixed(2)),
    Number(state.y.toFixed(2)),
    Number(state.z.toFixed(2)),
    Number(state.yaw.toFixed(3)),
    Number(state.pitch.toFixed(3)),
    Number(state.roll.toFixed(3)),
    Number((state.driftAngle || 0).toFixed(3))
  ]);
}

function sampleGhostAtTime(frames, timeMs) {
  if (!frames || frames.length === 0) return null;
  if (timeMs <= frames[0][0]) {
    const f = frames[0];
    return { x: f[1], y: f[2], z: f[3], yaw: f[4], pitch: f[5], roll: f[6], driftAngle: f[7] };
  }
  const last = frames[frames.length - 1];
  if (timeMs >= last[0]) return null;

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid][0] <= timeMs) lo = mid;
    else hi = mid;
  }

  const f0 = frames[lo];
  const f1 = frames[hi];
  const span = f1[0] - f0[0] || 1;
  const t = Math.max(0, Math.min(1, (timeMs - f0[0]) / span));

  let dyaw = f1[4] - f0[4];
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;

  return {
    x: f0[1] + (f1[1] - f0[1]) * t,
    y: f0[2] + (f1[2] - f0[2]) * t,
    z: f0[3] + (f1[3] - f0[3]) * t,
    yaw: f0[4] + dyaw * t,
    pitch: f0[5] + (f1[5] - f0[5]) * t,
    roll: f0[6] + (f1[6] - f0[6]) * t,
    driftAngle: f0[7] + (f1[7] - f0[7]) * t,
    wheelRotation: timeMs * 0.04
  };
}

// ==================== PHYSICS EVENTS HANDLER ====================
let splitHideTimeout = null;

function handlePhysicsEvents(events) {
  for (const ev of events) {
    if (ev.type === 'boost') {
      sound.playBoost(ev.level);
    } else if (ev.type === 'wall_hit') {
      sound.playWallHit(ev.intensity);
      if (renderer && renderer.triggerCameraShake) {
        renderer.triggerCameraShake(ev.intensity * 0.42);
      }
      const st = physics.getInterpolatedState(1.0);
      for (let i = 0; i < 6; i++) {
        renderer.spawnParticle(
          {
            x: st.x + st.right.x * ev.side * 1.1,
            y: st.y + 0.2,
            z: st.z + st.right.z * ev.side * 1.1
          },
          {
            x: (Math.random() - 0.5) * 10,
            y: 2 + Math.random() * 6,
            z: (Math.random() - 0.5) * 10
          },
          0xfbbf24,
          0.35,
          0.28
        );
      }
      if (renderer && renderer.spawnCrashDebris) {
        renderer.spawnCrashDebris(st, ev.intensity, ev.side);
      }
    } else if (ev.type === 'checkpoint') {
      renderer.markCheckpointPassed(ev.cpIndex);

      const pb = localPersonalBests.get(currentTrack.id);
      const prevSplit = pb && pb.splits ? pb.splits[ev.cpIndex - 1] : null;
      const deltaMs = prevSplit !== null && prevSplit !== undefined ? ev.timeMs - prevSplit : null;
      const isAhead = deltaMs === null || deltaMs <= 0;

      sound.playCheckpoint(isAhead);

      const popup = document.getElementById('split-popup');
      document.getElementById('split-cp-label').textContent = `CHECKPOINT ${ev.cpIndex} / ${ev.totalCps}`;
      document.getElementById('split-time-val').textContent = formatTimeMs(ev.timeMs);

      const deltaEl = document.getElementById('split-delta-val');
      if (deltaMs !== null) {
        deltaEl.textContent = formatTimeMs(deltaMs, true);
        deltaEl.className = `split-delta ${deltaMs <= 0 ? 'ahead' : 'behind'}`;
        deltaEl.classList.remove('hidden');
      } else {
        deltaEl.textContent = 'FIRST SPLIT';
        deltaEl.className = 'split-delta ahead';
      }

      document.getElementById('split-speed-val').textContent = `${ev.speedKmh} KM/H`;
      popup.classList.remove('hidden');

      clearTimeout(splitHideTimeout);
      splitHideTimeout = setTimeout(() => popup.classList.add('hidden'), 2300);

      if (partyState.inParty && socket) {
        socket.emit('checkpoint_pass', {
          cpIndex: ev.cpIndex,
          timeMs: ev.timeMs,
          speedKmh: ev.speedKmh
        });
      }
    } else if (ev.type === 'finish') {
      const state = physics.getInterpolatedState(1.0);
      recordGhostKeyframe(ev.timeMs, state);

      const pb = localPersonalBests.get(currentTrack.id);
      const isNewPb = !pb || ev.timeMs < pb.timeMs;
      const oldPbTime = pb ? pb.timeMs : null;

      if (isNewPb) {
        localPersonalBests.set(currentTrack.id, {
          timeMs: ev.timeMs,
          splits: ev.splits,
          ghostFrames: currentRunGhostFrames.slice(),
          date: Date.now()
        });
        saveUserDataToLocalStorage();
      }

      sound.playFinish(isNewPb);

      const medal = getMedalForTime(ev.timeMs, currentTrack.medals);
      const banner = document.getElementById('finish-banner');
      document.getElementById('finish-time-val').textContent = formatTimeMs(ev.timeMs);

      const deltaEl = document.getElementById('finish-delta-val');
      if (isNewPb && oldPbTime !== null) {
        deltaEl.textContent = `🔥 NEW PERSONAL BEST! (${formatTimeMs(ev.timeMs - oldPbTime, true)})`;
        deltaEl.style.color = '#10b981';
      } else if (isNewPb) {
        deltaEl.textContent = '🔥 PERSONAL BEST RECORD SET!';
        deltaEl.style.color = '#10b981';
      } else {
        deltaEl.textContent = `PB Delta: ${formatTimeMs(ev.timeMs - oldPbTime, true)}`;
        deltaEl.style.color = '#fb7185';
      }

      const medalBadge = document.getElementById('finish-medal-badge');
      medalBadge.textContent = `${medal.icon} ${medal.name}`;
      banner.classList.remove('hidden');

      if (partyState.inParty && socket) {
        // Submit to Online Multiplayer Round + Global Track Top 10 (no ghost car in online multiplayer)
        socket.emit('finish_run', {
          timeMs: ev.timeMs,
          splits: ev.splits
        });
        recordLocalTrackTop10(currentTrack.id, playerName, playerColor, ev.timeMs, 'ONLINE');
      } else {
        // Submit Practice Lap to Global Track Top 10 Leaderboard!
        const localRes = recordLocalTrackTop10(currentTrack.id, playerName, playerColor, ev.timeMs, 'PRACTICE');
        if (localRes.madeTop10) {
          showToast(`🌎 #${localRes.rank} on ${currentTrack.name} Top 10 Leaderboard!`);
          addChatLine(
            `🌎 Claimed #${localRes.rank} on ${currentTrack.name} Top 10 (${formatTimeMs(ev.timeMs)})!`,
            null,
            true
          );
        }

        if (socket && socket.connected) {
          socket.emit(
            'submit_practice_lap',
            {
              trackId: currentTrack.id,
              playerName,
              color: playerColor,
              timeMs: ev.timeMs
            },
            (res) => {
              if (res && res.leaderboard) {
                mergeClientLeaderboards({ [currentTrack.id]: res.leaderboard });
                renderCampaignTrackLists();
                updateTop1RecordDisplay();
                renderLeaderboard();
              }
            }
          );
        } else {
          // Resilient offline queuing and REST backup sync
          queuePendingLap(currentTrack.id, playerName, playerColor, ev.timeMs, 'PRACTICE');
          syncLeaderboardWithServer();
        }
      }

      updateTop1RecordDisplay();
      renderLeaderboard();
      renderPracticeTrackSelector();
      if (selectedPracticeTrackId === currentTrack.id) {
        renderPracticeTop10Preview(currentTrack.id);
      }
    }
  }
}

// ==================== MAIN 120HZ PHYSICS + RENDER LOOP ====================
const FIXED_DT = 1 / 120;
let accumulator = 0;
let lastFrameTime = performance.now();
let netSendAccum = 0;

function updateHUD(renderState) {
  const displayMs = physics.finished ? physics.finishTimeMs : physics.raceElapsedMs;
  document.getElementById('hud-race-timer').textContent = formatTimeMs(displayMs);

  document.getElementById('cp-counter-badge').textContent =
    `CP ${physics.passedCheckpoints.size} / ${currentTrack.checkpoints.length}`;
  document.getElementById('surface-badge').textContent = physics.surface.toUpperCase().replace('_', ' ');

  document.getElementById('hud-speed').textContent = renderState.speedKmh;
  document.getElementById('hud-gear').textContent = physics.forwardSpeedMs < -1 ? 'R' : physics.gear;
  document.getElementById('hud-rpm-fill').style.width = `${Math.round(physics.rpm * 100)}%`;

  document.getElementById('tag-drift').classList.toggle('on', physics.drifting);
  document.getElementById('tag-boost').classList.toggle('on', physics.boostLevel > 0);
  document.getElementById('tag-air').classList.toggle('on', !physics.grounded);
  document.getElementById('tag-freewheel').classList.toggle('on', physics.engineOff);

  const roundClockEl = document.getElementById('hud-round-timer');
  if (!partyState.inParty || partyState.roundDurationSec <= 0) {
    roundClockEl.textContent = '∞ FREE';
  } else {
    const nowServer = Date.now() + serverClockOffset;
    const elapsedSec = (nowServer - partyState.roundStartTime) / 1000;
    const remainingSec = Math.max(0, partyState.roundDurationSec - elapsedSec);
    roundClockEl.textContent = formatRoundClock(remainingSec);
  }
}

function animate(now) {
  requestAnimationFrame(animate);

  const frameDt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (countdownTimer > 0) {
    countdownTimer -= frameDt;
    const cdBanner = document.getElementById('countdown-banner');
    if (countdownTimer > 0) {
      const countNum = Math.ceil(countdownTimer * 1.85);
      if (countNum !== lastCountdownInt && countNum >= 1 && countNum <= 3) {
        lastCountdownInt = countNum;
        cdBanner.textContent = String(countNum);
        cdBanner.classList.remove('hidden', 'go');
        sound.playCountdownBeep(false);
      }
    } else {
      countdownTimer = 0;
      physics.controlsLocked = false;
      cdBanner.textContent = 'GO!';
      cdBanner.classList.remove('hidden');
      cdBanner.classList.add('go');
      sound.playCountdownBeep(true);
      setTimeout(() => cdBanner.classList.add('hidden'), 650);
    }
  }

  accumulator += frameDt;
  while (accumulator >= FIXED_DT) {
    physics.step(FIXED_DT, input);
    accumulator -= FIXED_DT;
  }

  const events = physics.consumeEvents();
  if (events.length > 0) {
    handlePhysicsEvents(events);
  }

  const alpha = accumulator / FIXED_DT;
  const localState = physics.getInterpolatedState(alpha);

  if (!partyState.inParty && !physics.controlsLocked && !physics.finished) {
    ghostSampleAccum += frameDt;
    if (ghostSampleAccum >= 0.05) {
      ghostSampleAccum -= 0.05;
      recordGhostKeyframe(physics.raceElapsedMs, localState);
    }
  }

  renderer.applyCarTransform(renderer.localCar, localState, true);

  // Ghost cars are ONLY rendered in Solo Practice mode (!partyState.inParty)
  if (showGhosts && !partyState.inParty && !physics.controlsLocked) {
    const pb = localPersonalBests.get(currentTrack.id);
    const pbState = pb ? sampleGhostAtTime(pb.ghostFrames, physics.raceElapsedMs) : null;
    if (pbState) {
      renderer.pbGhostCar.group.visible = true;
      renderer.applyCarTransform(renderer.pbGhostCar, pbState, false);
    } else {
      renderer.pbGhostCar.group.visible = false;
    }
    renderer.recordGhostCar.group.visible = false;
  } else {
    renderer.pbGhostCar.group.visible = false;
    renderer.recordGhostCar.group.visible = false;
  }

  const blend = Math.min(1, 14 * frameDt);
  for (const rp of remotePlayers.values()) {
    const c = rp.curr;
    const t = rp.target;
    c.x += (t.x - c.x) * blend;
    c.y += (t.y - c.y) * blend;
    c.z += (t.z - c.z) * blend;

    let dyaw = (t.yaw || 0) - (c.yaw || 0);
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    c.yaw = (c.yaw || 0) + dyaw * blend;
    c.pitch = (c.pitch || 0) + ((t.pitch || 0) - (c.pitch || 0)) * blend;
    c.roll = (c.roll || 0) + ((t.roll || 0) - (c.roll || 0)) * blend;
    c.driftAngle = (c.driftAngle || 0) + ((t.driftAngle || 0) - (c.driftAngle || 0)) * blend;
    c.steerAngle = t.steerAngle || 0;
    c.speedKmh = t.speedKmh || 0;
    c.boostLevel = t.boostLevel || 0;
    c.wheelRotation = (c.wheelRotation || 0) + (c.speedKmh / 3.6) * frameDt * 2.2;

    renderer.applyCarTransform(rp.carMesh, c, false);
  }

  if (partyState.inParty && gameActive && socket && socket.connected) {
    netSendAccum += frameDt;
    if (netSendAccum >= 0.04) {
      netSendAccum = 0;
      socket.emit('car_update', {
        x: Number(localState.x.toFixed(2)),
        y: Number(localState.y.toFixed(2)),
        z: Number(localState.z.toFixed(2)),
        yaw: Number(localState.yaw.toFixed(3)),
        pitch: Number(localState.pitch.toFixed(3)),
        roll: Number(localState.roll.toFixed(3)),
        driftAngle: Number(localState.driftAngle.toFixed(3)),
        steerAngle: Number(localState.steerAngle.toFixed(2)),
        speedKmh: localState.speedKmh,
        boostLevel: localState.boostLevel,
        carModel: playerCarModel
      });
    }
  }

  let camTargetState = localState;
  if (spectateTargetId && remotePlayers.has(spectateTargetId)) {
    const spec = remotePlayers.get(spectateTargetId).curr;
    camTargetState = {
      ...spec,
      forward: {
        x: -Math.sin(spec.yaw || 0) * Math.cos(spec.pitch || 0),
        y: Math.sin(spec.pitch || 0),
        z: -Math.cos(spec.yaw || 0) * Math.cos(spec.pitch || 0)
      },
      up: { x: 0, y: 1, z: 0 }
    };
  }

  renderer.updateCamera(camTargetState, frameDt);
  renderer.updateParticles(frameDt);
  renderer.render();

  sound.updateEngine(
    physics.rpm,
    localState.speedKmh,
    localState.drifting,
    localState.grounded,
    localState.boostLevel,
    physics.engineOff,
    !gameActive
  );

  if (gameActive) {
    updateHUD(localState);
  }
}

renderer.overviewMode = true;
initSocket();
syncLeaderboardWithServer();
requestAnimationFrame(animate);

