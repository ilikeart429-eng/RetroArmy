let session = null;

export function setSession(data) {
  session = data;
}

export function getSession() {
  return session;
}

export function updateSessionHighScore(newHighScore) {
  if (session) session.highScore = newHighScore;
}
