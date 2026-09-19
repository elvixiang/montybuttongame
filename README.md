# MONTY CUP CHALLENGE

Bazaar tap game for MONTY&Co. Press the Bluetooth button to build a Lemon Crush — ice → 3 limes → liquid — before 30 seconds run out. Fastest completion time wins.

Plain HTML/CSS/JS. No framework, no build step, no app install. Built for a tablet in landscape (1280×800), scales to other sizes.

---

## 1. Run it locally

Any static web server works. From this folder:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080`. Press **SPACE** to play.

> Don't double-click `index.html` — browsers block some features on `file://`.
> For a quick offline test there's a one-file build instead: `node tools/build-single.js` → open `dist/MontyCupChallenge.html`.

---

## 2. Project structure

| File | What it does |
|---|---|
| `js/config.js` | **All settings** (difficulty, button key, event ID, Sheets URL, admin PIN) |
| `js/progression.js` | Cup progression logic: taps → ice % / lime count / liquid % |
| `js/game.js` | Game logic: countdown, 30s timer, tap counting, win / time's up |
| `js/input.js` | Bluetooth / keyboard input — one press = one tap, key-repeat and bounce blocked |
| `js/cup-renderer.js` | Canvas drawing of the cup, ice, limes, liquid, particles |
| `js/leaderboard.js` | Leaderboard storage (localStorage + optional Google Sheets sync) |
| `js/main.js` | UI / screen flow |
| `js/admin.js` | Hidden admin panel |
| `js/audio.js`, `js/fx.js` | Sound effects, confetti |
| `apps-script/Code.gs` | Google Sheets backend |

---

## 3. Change the Bluetooth button key

The game listens for the key your button sends (default: SPACE).

**Easiest — on the tablet (no code):**
1. Open Admin (see §6) → **Learn button**.
2. Press the Bluetooth button once. Done — saved on that tablet.

**In code (applies to every device):** edit `js/config.js`

```js
BUTTON_KEY: " ",        // spacebar
// other examples: "Enter", "ArrowRight", "PageDown", "KeyB", "AudioVolumeUp"
```

Both `KeyboardEvent.key` and `.code` values work. Not sure what your button sends? Use **Learn button** — it shows the key name.

Other input settings:
- `MIN_TAP_INTERVAL_MS: 30` — ignores double-fires from a bouncy switch. Raise to 50–60 if one press ever counts twice.
- `ALLOW_SCREEN_TAPS: false` — set `true` to also count screen touches (testing only).

Holding the button counts as **one** tap. Presses only count between GO! and the end of the round.

---

## 4. Change the difficulty

In `js/config.js` (or live in Admin → Game settings):

```js
GAME_DURATION: 30,          // seconds
ICE_TAPS_REQUIRED: 100,     // stage 1
LIME_INTERVAL: 10,          // taps per lime slice (stage 2)
MAX_LIME_SLICES: 3,         // 0–4
LIQUID_TAPS_REQUIRED: 100,  // stage 3
```

**Taps to win = ICE + (LIME_INTERVAL × MAX_LIME_SLICES) + LIQUID.**
Default = 100 + 30 + 100 = **230 taps in 30 s ≈ 7.7 taps/sec** — very hard on a physical button.

Suggested starting points (test with your real button, then tune):

| Level | ICE | LIME_INTERVAL | LIQUID | Total | Taps/sec needed |
|---|---|---|---|---|---|
| Easy | 50 | 5 | 50 | 115 | 3.8 |
| Medium | 70 | 6 | 70 | 158 | 5.3 |
| Hard (default) | 100 | 10 | 100 | 230 | 7.7 |

The Admin panel shows the total and taps/sec live as you edit.

> Changing difficulty mid-event makes old times unfair to compare. Change `EVENT_ID` at the same time to start a fresh leaderboard.

---

## 5. Leaderboard — Google Sheets setup

Without setup, scores save on the tablet only (localStorage). To store them in a spreadsheet:

1. Create a new Google Sheet.
2. **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`.
3. Change `ADMIN_TOKEN` to your own secret (needed only to reset a leaderboard from the tablet).
4. **Deploy → New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   Authorize when asked.
5. Copy the Web app URL (ends in `/exec`).
6. Paste it into `SHEETS_URL` in `js/config.js` (and redeploy the site), **or** paste it in Admin → Google Sheets Web App URL on the tablet.
7. Admin → **Test Sheets connection** should say OK.

The sheet gets a `Scores` tab (every round, completed and not completed) and an `Archive` tab (rows moved there when you reset an event).

How it behaves:
- Every result is saved to the tablet first, then synced. If Wi-Fi drops, results queue and retry every 20 s — nothing is lost.
- Ranking: fastest completion time; ties → the earlier result ranks higher. Not-completed rounds are recorded but never ranked.
- Multiple tablets with the same `EVENT_ID` share one leaderboard.
- If you edit `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version** (the URL stays the same).

**Swapping to Firebase / Supabase later:** only `js/leaderboard.js` changes. Write an adapter with the same three methods as `SheetsAdapter` (`list`, `submit`, `reset`) and plug it in. Game code is untouched.

---

## 6. Admin / test mode

Open with any of:
- Tap the **top-left corner 5 times** quickly
- **Ctrl + Shift + A**
- Go to `/admin` or add `?admin` to the URL

Default PIN: **2525** (change `ADMIN_PIN` in config or in Admin).

Admin lets you: view total / completed / not-completed players and best time · learn the button key · change all game settings · play a test round (not saved) · run an auto-play demo · test the Sheets connection · add 10 test scores · export CSV · reset the leaderboard for this event · clear all local data · go fullscreen.

Settings changed in Admin are saved **on that tablet only** and override `config.js`. Use **Reset settings to defaults** to go back.

---

## 7. Deploy online (GitHub → Vercel)

1. Create a new GitHub repository (e.g. `monty-cup-challenge`).
2. Upload the contents of this folder (so `index.html` is at the repo root):
   ```bash
   git init
   git add .
   git commit -m "MONTY Cup Challenge"
   git branch -M main
   git remote add origin https://github.com/<you>/monty-cup-challenge.git
   git push -u origin main
   ```
   (Or drag the files into GitHub's "Upload files" page.)
3. Go to vercel.com → **Add New → Project** → import the repo.
4. Framework preset: **Other**. Build command: leave empty. Output directory: leave empty (root).
5. **Deploy.** You get a URL like `https://monty-cup-challenge.vercel.app`.

Every push to `main` redeploys automatically. `/admin` works thanks to `vercel.json`.

---

## 8. Bazaar-day checklist

**Setup**
- [ ] Pair the Bluetooth button with the tablet (Settings → Bluetooth). It appears as a keyboard.
- [ ] Open the Vercel URL in Chrome. Menu → **Add to Home screen** → launch from the icon (opens fullscreen, landscape).
- [ ] Admin → **Learn button** → press the button once.
- [ ] Admin → set difficulty, `EVENT_ID` for the day, test Sheets connection.
- [ ] Play 2–3 test rounds. Then Admin → **Reset leaderboard** (or use a new Event ID).
- [ ] Tablet: disable auto-lock / screen timeout, turn on Do Not Disturb, brightness high, plug in charger. (The game also requests a screen wake lock.)
- [ ] Android: **Screen pinning** / iPad: **Guided Access** so visitors can't leave the app.
- [ ] Sound on + tablet volume up if the booth isn't too loud. Mute button is top-right.

**During the event**
- Press the button on the attract screen to start. After a round, pressing the button again submits / plays again — staff rarely need to touch the screen.
- Win: name keyboard appears; leave blank → saved as **MONTY FAN**. Name screen auto-submits after 45 s.
- Result/leaderboard screens return to the attract screen after 30 s idle.
- If the button stops responding: Bluetooth likely slept — press it a few times or re-pair. Keyboard SPACE always works as a backup.
- Wi-Fi drops are fine — results sync when it returns (leaderboard footer shows sync status).

**Tips**
- While the name box is being typed in, a SPACE button just types a space — tap **SUBMIT** (or Enter). If nobody touches the name box, one button press saves the score.
- A bouncy/cheap button sometimes double-counts. If testers score suspiciously fast, raise `MIN_TAP_INTERVAL_MS`.
