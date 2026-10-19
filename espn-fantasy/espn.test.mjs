import { describe, expect, it } from 'vitest';
import { fetchLeague, leagueEndpoint, parseLeagueUrl } from './espn.mjs';
import { ownerName, teamAverages, teamName, toCsv, weeklyScores } from './stats.mjs';

/**
 * A four-team league shaped like ESPN's mTeam + mMatchupScore + mSettings
 * response: three decided regular-season weeks, week 4 in progress, and a
 * two-week playoff round (periods 5 = NFL weeks 5–6) with a bye.
 */
const league = {
  id: 123,
  seasonId: 2026,
  members: [
    { id: '{A}', displayName: 'ann_ff', firstName: 'Ann', lastName: 'Lee' },
    { id: '{B}', displayName: 'bobby' },
  ],
  teams: [
    { id: 1, name: 'Gridiron Gang', primaryOwner: '{A}', owners: ['{A}'] },
    { id: 2, location: 'Old', nickname: 'Style', owners: ['{B}'] },
    { id: 3, name: 'Hail, Mary "HM"', owners: [] },
    { id: 4, abbrev: 'FOUR' },
  ],
  settings: {
    name: 'Test League',
    scheduleSettings: {
      matchupPeriodCount: 4,
      matchupPeriods: { 1: [1], 2: [2], 3: [3], 4: [4], 5: [5, 6] },
    },
  },
  schedule: [
    { matchupPeriodId: 1, playoffTierType: 'NONE', winner: 'HOME', home: { teamId: 1, totalPoints: 120 }, away: { teamId: 2, totalPoints: 100 } },
    { matchupPeriodId: 1, playoffTierType: 'NONE', winner: 'AWAY', home: { teamId: 3, totalPoints: 90 }, away: { teamId: 4, totalPoints: 110.5 } },
    { matchupPeriodId: 2, playoffTierType: 'NONE', winner: 'TIE', home: { teamId: 2, totalPoints: 105 }, away: { teamId: 3, totalPoints: 105 } },
    { matchupPeriodId: 2, playoffTierType: 'NONE', winner: 'HOME', home: { teamId: 4, totalPoints: 130 }, away: { teamId: 1, totalPoints: 80 } },
    { matchupPeriodId: 3, playoffTierType: 'NONE', winner: 'HOME', home: { teamId: 1, totalPoints: 100 }, away: { teamId: 3, totalPoints: 95 } },
    { matchupPeriodId: 3, playoffTierType: 'NONE', winner: 'AWAY', home: { teamId: 2, totalPoints: 85 }, away: { teamId: 4, totalPoints: 99.5 } },
    // In progress: partial scores must not count.
    { matchupPeriodId: 4, playoffTierType: 'NONE', winner: 'UNDECIDED', home: { teamId: 1, totalPoints: 40 }, away: { teamId: 4, totalPoints: 22 } },
    { matchupPeriodId: 4, playoffTierType: 'NONE', winner: 'UNDECIDED', home: { teamId: 2, totalPoints: 31 }, away: { teamId: 3, totalPoints: 18 } },
    // Two-week playoff round, plus a bye.
    { matchupPeriodId: 5, playoffTierType: 'WINNERS_BRACKET', winner: 'HOME', home: { teamId: 4, totalPoints: 240 }, away: { teamId: 1, totalPoints: 200 } },
    { matchupPeriodId: 5, playoffTierType: 'WINNERS_BRACKET', winner: 'HOME', home: { teamId: 2, totalPoints: 210 } },
  ],
};

describe('team and owner names', () => {
  it('uses name, then location + nickname, then abbrev, then the id', () => {
    expect(league.teams.map(teamName)).toEqual(['Gridiron Gang', 'Old Style', 'Hail, Mary "HM"', 'FOUR']);
    expect(teamName({ id: 9 })).toBe('Team 9');
  });

  it('prefers the full name, falls back to the ESPN handle, then blank', () => {
    expect(league.teams.map((t) => ownerName(t, league.members))).toEqual(['Ann Lee', 'bobby', '', '']);
  });
});

describe('weeklyScores', () => {
  it('keeps only decided regular-season matchups, one row per side', () => {
    const rows = weeklyScores(league);
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.week))).toEqual(new Set([1, 2, 3]));
  });

  it('records the opponent and the result from each side', () => {
    const rows = weeklyScores(league);
    const find = (week, teamId) => rows.find((r) => r.week === week && r.teamId === teamId);
    expect(find(1, 1)).toMatchObject({ points: 120, opponent: 'Old Style', opponentPoints: 100, result: 'W' });
    expect(find(1, 2)).toMatchObject({ result: 'L', owner: 'bobby' });
    expect(find(1, 4)).toMatchObject({ result: 'W' });
    expect(find(2, 3)).toMatchObject({ result: 'T' });
  });

  it('adds playoff rounds on request, skipping byes and noting the weeks spanned', () => {
    const rows = weeklyScores(league, { includePlayoffs: true }).filter((r) => r.playoff);
    expect(rows.map((r) => [r.teamId, r.weeks])).toEqual([
      [1, 2],
      [4, 2],
    ]);
  });

  it('falls back to the regular-season length when playoffTierType is missing', () => {
    const old = { ...league, schedule: league.schedule.map(({ playoffTierType, ...m }) => m) };
    expect(weeklyScores(old)).toHaveLength(12);
  });
});

describe('teamAverages', () => {
  it('ranks teams by average weekly points', () => {
    const averages = teamAverages(weeklyScores(league));
    expect(averages.map((a) => [a.teamId, a.weeks, a.total])).toEqual([
      [4, 3, 340],
      [1, 3, 300],
      [2, 3, 290],
      [3, 3, 290],
    ]);
    const top = averages[0];
    expect(top.average).toBeCloseTo(113.333, 3);
    expect(top.high).toBe(130);
    expect(top.low).toBe(99.5);
    expect(top.stdDev).toBeCloseTo(12.612, 3);
    expect(top.byWeek).toEqual({ 1: 110.5, 2: 130, 3: 99.5 });
  });

  it('counts a two-week playoff total as two weeks', () => {
    const team4 = teamAverages(weeklyScores(league, { includePlayoffs: true })).find((a) => a.teamId === 4);
    expect(team4.weeks).toBe(5);
    expect(team4.average).toBeCloseTo((340 + 240) / 5, 6);
    expect(team4.high).toBe(130);
  });
});

describe('toCsv', () => {
  it('quotes cells holding commas, quotes or newlines', () => {
    expect(toCsv(['a', 'b'], [['Hail, Mary "HM"', 1], [null, 'x\ny']])).toBe(
      'a,b\n"Hail, Mary ""HM""",1\n,"x\ny"\n',
    );
  });
});

describe('ESPN client', () => {
  it('reads league, season and team from a fantasy.espn.com URL', () => {
    expect(parseLeagueUrl('https://fantasy.espn.com/football/team?leagueId=1744376062&teamId=3&seasonId=2026')).toEqual({
      leagueId: '1744376062',
      season: '2026',
      teamId: '3',
    });
    expect(() => parseLeagueUrl('https://fantasy.espn.com/football/team')).toThrow(/leagueId/);
    expect(() => parseLeagueUrl('not a url')).toThrow(/Not a URL/);
  });

  it('asks for the team, matchup and settings views', () => {
    expect(leagueEndpoint('42', 2026)).toBe(
      'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/42' +
        '?view=mTeam&view=mMatchupScore&view=mSettings',
    );
  });

  const respond = (status, body) => async (url, init) => {
    respond.last = { url, init };
    return { status, ok: status < 400, text: async () => body };
  };

  it('sends the private-league cookies when given', async () => {
    const fetchImpl = respond(200, '{"id":42}');
    await expect(fetchLeague({ leagueId: '42', season: 2026, espnS2: 'AE%2Babc', swid: '{X-Y}' }, fetchImpl)).resolves.toEqual({ id: 42 });
    expect(respond.last.init.headers.Cookie).toBe('espn_s2=AE%2Babc; SWID={X-Y}');
  });

  it('sends no cookie for a public league', async () => {
    await fetchLeague({ leagueId: '42', season: 2026 }, respond(200, '{}'));
    expect(respond.last.init.headers.Cookie).toBeUndefined();
  });

  it('explains a refusal in terms of the cookies', async () => {
    await expect(fetchLeague({ leagueId: '42', season: 2026 }, respond(401, ''))).rejects.toThrow(/set ESPN_S2 and ESPN_SWID/);
    await expect(
      fetchLeague({ leagueId: '42', season: 2026, espnS2: 's', swid: 'w' }, respond(401, '')),
    ).rejects.toThrow(/expired/);
    await expect(fetchLeague({ leagueId: '42', season: 2026 }, respond(404, ''))).rejects.toThrow(/no league 42/);
    await expect(fetchLeague({ leagueId: '42', season: 2026 }, respond(200, '<html>'))).rejects.toThrow(/other than JSON/);
  });
});
