const STORAGE_KEY = 'blocksSettings';
const DEFAULTS = { theme: 'dark', showFps: false, sound: true };

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

const settings = loadSettings();
let fpsRafId = null;
let fpsFrameCount = 0;
let fpsLastTime = 0;

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

function startFpsLoop() {
  fpsFrameCount = 0;
  fpsLastTime = performance.now();
  const tick = (now) => {
    fpsFrameCount++;
    const elapsed = now - fpsLastTime;
    if (elapsed >= 500) {
      const fps = Math.round((fpsFrameCount * 1000) / elapsed);
      const el = document.getElementById('fpsCounter');
      if (el) el.textContent = `${fps} FPS`;
      fpsFrameCount = 0;
      fpsLastTime = now;
    }
    fpsRafId = requestAnimationFrame(tick);
  };
  fpsRafId = requestAnimationFrame(tick);
}

function stopFpsLoop() {
  if (fpsRafId) cancelAnimationFrame(fpsRafId);
  fpsRafId = null;
}

function applyFps() {
  const el = document.getElementById('fpsCounter');
  if (el) el.classList.toggle('hidden', !settings.showFps);
  if (settings.showFps && !fpsRafId) startFpsLoop();
  if (!settings.showFps && fpsRafId) stopFpsLoop();
}

export function isSoundEnabled() {
  return settings.sound;
}

export function prepareSettingsScreen() {
  const themeToggle = document.getElementById('settingThemeToggle');
  const fpsToggle = document.getElementById('settingFpsToggle');
  const soundToggle = document.getElementById('settingSoundToggle');
  if (themeToggle) themeToggle.checked = settings.theme === 'light';
  if (fpsToggle) fpsToggle.checked = settings.showFps;
  if (soundToggle) soundToggle.checked = settings.sound;
}

function bindToggles() {
  const themeToggle = document.getElementById('settingThemeToggle');
  const fpsToggle = document.getElementById('settingFpsToggle');
  const soundToggle = document.getElementById('settingSoundToggle');

  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      settings.theme = themeToggle.checked ? 'light' : 'dark';
      saveSettings();
      applyTheme();
    });
  }
  if (fpsToggle) {
    fpsToggle.addEventListener('change', () => {
      settings.showFps = fpsToggle.checked;
      saveSettings();
      applyFps();
    });
  }
  if (soundToggle) {
    soundToggle.addEventListener('change', () => {
      settings.sound = soundToggle.checked;
      saveSettings();
    });
  }
}

applyTheme();
applyFps();
bindToggles();
