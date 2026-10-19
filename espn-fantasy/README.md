# ESPN fantasy football: average weekly points

Pulls your league from ESPN's fantasy API and ranks every team by average weekly points, with
the week-by-week scores saved as CSV for whatever analysis comes next.

No dependencies beyond Node 18+ (it uses the built-in `fetch`).

```bash
# Paste the league URL straight from your browser (quotes matter: it contains &)
node espn-fantasy/cli.mjs "https://fantasy.espn.com/football/team?leagueId=1744376062&teamId=3&seasonId=2026"

# or give the ids
node espn-fantasy/cli.mjs --league 1744376062 --season 2026 --team 3
```

```
Your League — 2026 season
Average weekly points, weeks 1–6 (completed matchups only)

   #  Team             Owner      Wks    Avg   High    Low  StdDev    Total
   1  …
▸  2  (your team, from the URL's teamId)
   …
      League average: … points per team per week
```

Run it again any week: it re-reads the whole season, so the files always cover every completed
week to date.

## Private leagues

Most leagues are private, and ESPN answers those with HTTP 401 unless you send the two login
cookies your browser uses:

1. Log in at fantasy.espn.com and open your league.
2. Open dev tools → **Application** (Chrome) or **Storage** (Firefox) → **Cookies** →
   `https://fantasy.espn.com`.
3. Copy the values of `espn_s2` (long, URL-encoded) and `SWID` (looks like `{ABCD-…}`, braces
   included).

```bash
export ESPN_S2='AEB…long value…'
export ESPN_SWID='{ABCD1234-…}'
node espn-fantasy/cli.mjs "https://fantasy.espn.com/football/team?leagueId=1744376062&teamId=3&seasonId=2026"
```

These cookies are your ESPN login. Keep them out of git and out of shared scripts. They expire
after a while; if a run that used to work starts saying the cookies were rejected, copy fresh
ones.

## What it writes

To `espn-fantasy/data/<league>-<season>/` (gitignored, since it holds league members' names):

| File | Shape | Use it for |
|---|---|---|
| `raw.json` | the untouched ESPN response | anything the CSVs don't cover — rosters, settings, records |
| `weekly_scores.csv` | one row per team per week: points, opponent, opponent's points, W/L/T | pandas, R, pivot tables, points-against, luck |
| `team_averages.csv` | one row per team: rank, avg, high, low, std dev, total, then `wk1`, `wk2`, … | dropping into a spreadsheet |

```python
import pandas as pd
df = pd.read_csv("espn-fantasy/data/1744376062-2026/weekly_scores.csv")
df.pivot(index="team", columns="week", values="points")
```

## Options

| Flag | |
|---|---|
| `--team <id>` | mark a team in the table (the URL's `teamId` does this automatically) |
| `--playoffs` | include playoff and consolation games; regular season only by default |
| `--input <file>` | re-analyse a saved `raw.json` without hitting ESPN |
| `--out <dir>` | write the files somewhere else |

## How the numbers are counted

- **Only decided matchups count.** The week in progress and future weeks are still
  `UNDECIDED` on ESPN, and their partial or zero scores would drag averages down. A week shows
  up the morning after ESPN finalizes it (usually Tuesday or Wednesday).
- **Regular season by default.** Only some teams play in the playoffs and consolation games are
  often played with benched rosters, so they skew a team-to-team comparison. `--playoffs`
  brings them in.
- **Two-week playoff rounds count as two weeks.** ESPN reports one total for the round, so the
  average divides by NFL weeks, not matchups. `weekly_scores.csv` keeps the round's total
  and says how many weeks it spanned (`nfl_weeks`).
- **Std dev** is week-to-week consistency: lower means a steadier team.

## About the API

ESPN has no published API. This uses the same endpoint the fantasy site's own pages read
(`lm-api-reads.fantasy.espn.com`, views `mTeam`, `mMatchupScore`, `mSettings`). It is
unofficial, so ESPN can change it without notice; if a run breaks with a response the tool
doesn't understand, `raw.json` from a working run shows the shape it expects.

## Tests

`npm test` from the repo root runs `espn.test.mjs` along with the game's tests. It checks the
parsing and the averages against a small league shaped like ESPN's response.
