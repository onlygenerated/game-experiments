#!/usr/bin/env node
/**
 * Average weekly points by team for an ESPN fantasy football league.
 *
 *   node espn-fantasy/cli.mjs "https://fantasy.espn.com/football/team?leagueId=…&teamId=3&seasonId=2026"
 *   node espn-fantasy/cli.mjs --league 1744376062 --season 2026
 *   node espn-fantasy/cli.mjs --input espn-fantasy/data/1744376062-2026/raw.json
 *
 * Prints a ranked table and writes three files to espn-fantasy/data/<league>-<season>/:
 *   raw.json            the untouched ESPN response, for your own digging
 *   weekly_scores.csv   one row per team per week (long format: pandas, R, pivot tables)
 *   team_averages.csv   one row per team: average, high, low, std dev, total, then each week
 *
 * Private leagues: export ESPN_S2 and ESPN_SWID first (see README.md).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchLeague, parseLeagueUrl } from './espn.mjs';
import { teamAverages, toCsv, weeklyScores } from './stats.mjs';

const USAGE = `Usage:
  node espn-fantasy/cli.mjs <league URL> [options]
  node espn-fantasy/cli.mjs --league <id> --season <year> [options]

Options:
  --league <id>     ESPN league id
  --season <year>   season, e.g. 2026
  --team <id>       mark this team in the table (taken from the URL's teamId if present)
  --playoffs        include playoff and consolation matchups (regular season only by default)
  --input <file>    analyse a saved raw.json instead of fetching from ESPN
  --out <dir>       where to write files (default espn-fantasy/data/<league>-<season>)
  -h, --help        show this message

Private leagues: set ESPN_S2 and ESPN_SWID in the environment.`;

const round2 = (n) => Math.round(n * 100) / 100;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function resolveOptions() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        league: { type: 'string' },
        season: { type: 'string' },
        team: { type: 'string' },
        playoffs: { type: 'boolean', default: false },
        input: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    fail(`${e.message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  let fromUrl = {};
  try {
    if (positionals[0]) fromUrl = parseLeagueUrl(positionals[0]);
  } catch (e) {
    fail(e.message);
  }
  const opts = {
    leagueId: values.league ?? fromUrl.leagueId,
    season: values.season ?? fromUrl.season,
    teamId: values.team ?? fromUrl.teamId,
    includePlayoffs: values.playoffs,
    input: values.input,
    out: values.out,
  };
  if (!opts.input && !(opts.leagueId && opts.season)) {
    fail(`pass a league URL, or --league and --season.\n\n${USAGE}`);
  }
  return opts;
}

async function loadLeague(opts) {
  if (opts.input) return JSON.parse(await readFile(opts.input, 'utf8'));

  const espnS2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;
  if (Boolean(espnS2) !== Boolean(swid)) {
    fail('set both ESPN_S2 and ESPN_SWID, or neither.');
  }
  return fetchLeague({ leagueId: opts.leagueId, season: opts.season, espnS2, swid });
}

function printTable(league, season, averages, rows, markTeamId) {
  const name = league.settings?.name ?? `League ${league.id}`;
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
  const span = weeks.length === 1 ? `week ${weeks[0]}` : `weeks ${weeks[0]}–${weeks.at(-1)}`;

  console.log(`\n${name} — ${season} season`);
  console.log(`Average weekly points, ${span} (completed matchups only)\n`);

  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const teamWidth = Math.min(28, Math.max(4, ...averages.map((a) => a.team.length)));
  const ownerWidth = Math.min(20, Math.max(5, ...averages.map((a) => a.owner.length)));
  const num = (n, w = 7) => n.toFixed(1).padStart(w);

  console.log(
    `   #  ${'Team'.padEnd(teamWidth)}  ${'Owner'.padEnd(ownerWidth)}  Wks` +
      `${'Avg'.padStart(7)}${'High'.padStart(7)}${'Low'.padStart(7)}${'StdDev'.padStart(8)}${'Total'.padStart(9)}`,
  );
  averages.forEach((a, i) => {
    const mark = String(a.teamId) === String(markTeamId) ? '▸' : ' ';
    console.log(
      `${mark}${String(i + 1).padStart(3)}  ${clip(a.team, teamWidth).padEnd(teamWidth)}  ` +
        `${clip(a.owner, ownerWidth).padEnd(ownerWidth)}  ${String(a.weeks).padStart(3)}` +
        `${num(a.average)}${num(a.high)}${num(a.low)}${num(a.stdDev, 8)}${num(a.total, 9)}`,
    );
  });

  const leagueWeeks = averages.reduce((s, a) => s + a.weeks, 0);
  const leagueTotal = averages.reduce((s, a) => s + a.total, 0);
  console.log(`\n${' '.repeat(6)}League average: ${(leagueTotal / leagueWeeks).toFixed(1)} points per team per week`);
}

async function writeOutputs(dir, league, rows, averages, wroteRaw) {
  await mkdir(dir, { recursive: true });
  if (wroteRaw) await writeFile(join(dir, 'raw.json'), JSON.stringify(league, null, 2));

  await writeFile(
    join(dir, 'weekly_scores.csv'),
    toCsv(
      ['week', 'nfl_weeks', 'playoff', 'team_id', 'team', 'owner', 'points', 'opponent_id', 'opponent', 'opponent_points', 'result'],
      rows.map((r) => [
        r.week, r.weeks, r.playoff, r.teamId, r.team, r.owner, round2(r.points),
        r.opponentId, r.opponent, round2(r.opponentPoints), r.result,
      ]),
    ),
  );

  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
  await writeFile(
    join(dir, 'team_averages.csv'),
    toCsv(
      ['rank', 'team_id', 'team', 'owner', 'weeks', 'avg', 'high', 'low', 'std_dev', 'total', ...weeks.map((w) => `wk${w}`)],
      averages.map((a, i) => [
        i + 1, a.teamId, a.team, a.owner, a.weeks, round2(a.average), round2(a.high), round2(a.low),
        round2(a.stdDev), round2(a.total), ...weeks.map((w) => (w in a.byWeek ? round2(a.byWeek[w]) : '')),
      ]),
    ),
  );

  const files = [wroteRaw && 'raw.json', 'weekly_scores.csv', 'team_averages.csv'].filter(Boolean);
  console.log(`\nWrote ${files.join(', ')} to ${dir}`);
}

async function main() {
  const opts = resolveOptions();
  let league;
  try {
    league = await loadLeague(opts);
  } catch (e) {
    fail(e.message);
  }

  const leagueId = opts.leagueId ?? league.id;
  const season = opts.season ?? league.seasonId;
  const rows = weeklyScores(league, { includePlayoffs: opts.includePlayoffs });
  if (rows.length === 0) {
    console.log(`No completed ${opts.includePlayoffs ? '' : 'regular-season '}matchups yet for ${season}.`);
    return;
  }
  const averages = teamAverages(rows);

  printTable(league, season, averages, rows, opts.teamId);
  const dir = opts.out ?? fileURLToPath(new URL(`./data/${leagueId}-${season}`, import.meta.url));
  await writeOutputs(dir, league, rows, averages, !opts.input);
}

main();
