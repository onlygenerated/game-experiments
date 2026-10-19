/**
 * Turn a raw ESPN league document into per-team weekly scores and averages.
 *
 * Pure functions, no network: they run the same on a fresh fetch and on a
 * saved raw.json, which is what the tests feed them.
 */

export function teamName(team) {
  if (team.name) return team.name.trim();
  // Before 2024 ESPN split the name into location + nickname.
  const joined = [team.location, team.nickname].filter(Boolean).join(' ').trim();
  return joined || team.abbrev || `Team ${team.id}`;
}

export function ownerName(team, members = []) {
  const id = team.primaryOwner ?? team.owners?.[0];
  const member = members.find((m) => m.id === id);
  if (!member) return '';
  const full = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return full || member.displayName || '';
}

/**
 * One row per team per decided matchup.
 *
 * A matchup counts once ESPN has decided it (winner HOME, AWAY or TIE). The
 * week in progress and every future week read UNDECIDED, and their partial or
 * zero scores would drag the averages down.
 *
 * Playoffs are left out by default: only some teams play them, and
 * consolation games are often played with benched rosters, so they skew the
 * comparison. Playoff byes (a home side with no away side) are never counted.
 */
export function weeklyScores(league, { includePlayoffs = false } = {}) {
  const teams = new Map(
    (league.teams ?? []).map((t) => [t.id, { name: teamName(t), owner: ownerName(t, league.members) }]),
  );
  const describe = (id) => teams.get(id) ?? { name: `Team ${id}`, owner: '' };
  const schedule = league.settings?.scheduleSettings ?? {};
  const regularSeasonPeriods = schedule.matchupPeriodCount ?? Infinity;

  const rows = [];
  for (const m of league.schedule ?? []) {
    if (!m.home || !m.away) continue;
    if (!m.winner || m.winner === 'UNDECIDED') continue;
    const playoff = m.playoffTierType
      ? m.playoffTierType !== 'NONE'
      : m.matchupPeriodId > regularSeasonPeriods;
    if (playoff && !includePlayoffs) continue;
    // A two-week playoff round reports one total for both weeks.
    const weeks = schedule.matchupPeriods?.[m.matchupPeriodId]?.length || 1;

    for (const [side, other, sideKey] of [
      [m.home, m.away, 'HOME'],
      [m.away, m.home, 'AWAY'],
    ]) {
      const me = describe(side.teamId);
      const them = describe(other.teamId);
      rows.push({
        week: m.matchupPeriodId,
        weeks,
        playoff,
        teamId: side.teamId,
        team: me.name,
        owner: me.owner,
        points: side.totalPoints ?? 0,
        opponentId: other.teamId,
        opponent: them.name,
        opponentPoints: other.totalPoints ?? 0,
        result: m.winner === 'TIE' ? 'T' : m.winner === sideKey ? 'W' : 'L',
      });
    }
  }
  return rows.sort((a, b) => a.week - b.week || a.teamId - b.teamId);
}

/**
 * Per-team summary, best average first. `average` is total points over NFL
 * weeks played, so a two-week playoff total counts as two weeks; high, low
 * and stdDev are taken over per-week scores on the same basis.
 */
export function teamAverages(rows) {
  const byTeam = new Map();
  for (const r of rows) {
    if (!byTeam.has(r.teamId)) byTeam.set(r.teamId, { teamId: r.teamId, team: r.team, owner: r.owner, games: [] });
    byTeam.get(r.teamId).games.push(r);
  }

  return [...byTeam.values()]
    .map(({ games, ...who }) => {
      const weeks = games.reduce((s, g) => s + g.weeks, 0);
      const total = games.reduce((s, g) => s + g.points, 0);
      const perWeek = games.map((g) => g.points / g.weeks);
      const average = total / weeks;
      const variance = perWeek.reduce((s, p) => s + (p - average) ** 2, 0) / perWeek.length;
      return {
        ...who,
        weeks,
        average,
        high: Math.max(...perWeek),
        low: Math.min(...perWeek),
        stdDev: Math.sqrt(variance),
        total,
        byWeek: Object.fromEntries(games.map((g) => [g.week, g.points])),
      };
    })
    .sort((a, b) => b.average - a.average);
}

export function toCsv(header, records) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [header, ...records].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
