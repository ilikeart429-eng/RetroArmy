import { isSoundEnabled } from "./settings.js";

const winSound = new Audio("sounds/win.mp3");
winSound.volume = 0.6;

export function playWinSound() {
  if (!isSoundEnabled()) return;
  winSound.currentTime = 0;
  winSound.play().catch(() => {});
}
