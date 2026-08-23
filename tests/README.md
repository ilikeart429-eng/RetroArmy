# Tests

Playwright end-to-end tests for BLOCKS!, plus committed screenshot baselines.

```
npm test                        # run everything (Linux container)
npm test -- --grep leaderboard  # extra flags pass through to playwright
npm run test:update-screenshots  # regenerate baselines after an intended UI change
npm run test:local              # run against the host browsers (no screenshot parity)
```

`npm test` runs inside `mcr.microsoft.com/playwright:<version>-noble`, the same
image the GitHub Actions job uses, so `tests/screenshots/*.png` compare
byte-for-byte on any machine. Review regenerated baselines in the diff before
committing; on CI failures the report and diff images are uploaded as the
`playwright-report` artifact.

## How the app is made deterministic

- **Firebase** — every `gstatic.com/firebasejs/**` request is served
  `fixtures/firebase-stub.js`, an in-memory auth/Firestore stand-in seeded from
  `window.__RA_DATA`. No network, no real project.
- **Time** — `page.clock.install()` freezes timers, so gravity only moves when a
  test advances the clock, and the 5s loading screen is skipped instantly.
- **Pieces** — `Math.random` is replaced with a seeded PRNG, so the piece
  sequence is identical on every run.
