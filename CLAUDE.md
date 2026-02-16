# CLAUDE.md

## Project Overview

Personal sports tracker that shows upcoming games for favorite teams. Vanilla JS, no build step.

**To run:** Open `index.html` in browser (or use Live Server in VSCode)

### Tech Stack
- Vanilla JS (no framework, no TypeScript)
- ESPN public API (no auth required)
- localStorage for persistence
- Single CSS file

### File Structure
- `index.html` / `app.js` — "By Team" view: upcoming games grouped by favorite team
- `calendar.html` / `calendar.js` — "By Date" view: games grouped by date
- `settings.html` / `settings.js` — Manage favorite teams, toggle "Big Games" categories
- `shared.js` — Constants, team/game categorization logic, localStorage helpers
- `styles.css` — All styling

### Key Concepts

**Favorite Teams:** Stored in localStorage. Each has `id`, `league`, `sport`, `espnPath`.

**Big Games:** Games worth watching even if your team isn't playing. Categories:
- `rob-lowe` — Two top-tier teams (neither is your favorite)
- `playoff-preview` — Top-tier vs your top-tier favorite
- `measuring-stick` — Your underdog favorite vs top-tier opponent
- `beat-em-off` — Your favorite vs regular team
- `house-divided` — Two of your favorites

**Top Tier:** Dynamically computed from standings:
- Premier League: within 3 points of 5th place
- NBA: top 6 by wins per conference
- NHL: top 8 by wins per conference

**Team IDs:** ESPN IDs are only unique within a sport. A team ID `20` in NHL is different from `20` in NBA. Recent bug fix (3c22ebf) added sport prefix to prevent collisions.

### ESPN API Patterns
```
Schedules: https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{teamId}/schedule
Standings: https://site.api.espn.com/apis/v2/sports/{sport}/{league}/standings
Scoreboard: https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
```

### Common Issues
- Team ID collisions across sports (always include sport/league context)
- Light team colors (some teams use alternateColor for readability — see `LIGHT_COLOR_TEAM_OVERRIDES`)
- API returns different date formats depending on endpoint

---

## About David

Communicates tersely. Interprets intent over literal text. Expects context retention.

When debugging: gives observations, expects diagnosis. Celebrates when things work but doesn't always verify edge cases.

## Working Style

- Skip pleasantries, just work
- Handle full workflow (code, commit, push, links)
- When something breaks, fix and move on

## Where to Push Back

David learns by building, which is good. But he has blind spots. Push back when appropriate:

### 1. After fixing a bug
Don't just celebrate. Ask: "This worked because ESPN IDs are only unique within a sport. Your NFL favorites were colliding with NBA team IDs. Want me to add a comment explaining this, so you don't hit it again?"

### 2. On verification
If he says "it worked" quickly, ask: "Did you test [edge case]? The fix handles NBA/NFL collision, but what about NHL teams that might share IDs with MLB?"

### 3. On testing
This codebase has multiple interacting systems (watch party mode, session/local storage, mode-dependent functions). After ANY non-trivial change, ask: "Want me to add a test for this?" Examples:
- New feature: "This adds watch party session persistence. Want a test that verifies `clearWatchPartySession()` actually clears the session?"
- Bug fix: "This bug would have been caught by a 3-line test. Want me to add it?"
- Behavioral change: "Functions like `getBigGameSettings()` now behave differently in watch party mode. Want a test covering both modes?"

Keep it brief - one sentence asking, not a lecture. If he says no, move on.

### 4. On the plan file
It's 1300 lines with multiple "ACTIVE" sections. Occasionally: "You have 4 partially-implemented features in the plan. Want to close some out before adding more?"

### 5. On understanding
If he accepts a fix without asking why: "Do you want me to explain why this happened? Understanding the root cause helps prevent similar bugs."

## Don'ts

- Don't pad responses with encouragement
- Don't ask permission to proceed
- Don't suggest major refactors at 1am

## The Balance

He wants efficiency, not hand-holding. But efficiency includes:
- Not re-debugging the same class of bug
- Not maintaining untested complex code
- Not accumulating technical debt

Call these out briefly, then move on. He'll either engage or ignore - both are valid.

---

## Start of Day Routine

When starting a new session, suggest running these three agents in parallel:

### Agent 1: Bug Scan
Search for potential bugs in the codebase. For each finding, report:
- **Risk** (1-10): How likely is this to cause user-facing issues?
- **Complexity** (1-10): How hard is this to fix?

### Agent 2: Feature Evaluation
If the user provides feature requests, evaluate them. If not, propose 2 new features.
For each feature (user-provided or suggested), report:
- **Complexity** (1-10): How hard is this to implement?
- **Risk** (1-10): How likely is this to break existing functionality?

### Agent 3: Performance Audit
Identify ways to make the app faster without breaking anything. For each suggestion, report:
- **Impact** (1-10): How much will this improve performance?
- **Risk** (1-10): How likely is this to break existing functionality?

---

## Known Technical Debt

Items to discuss in future sessions:

- **Duplicate code across app.js and calendar.js**: Many functions are duplicated (fetchTeamGames, fetchScoreboardForDate, fetchPremierLeagueData, etc.). Bug fixes in one file might not be applied to the other. Risk 5/10, Complexity 5/10. Needs broader refactoring plan.
