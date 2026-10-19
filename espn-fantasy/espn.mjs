/**
 * ESPN fantasy football client.
 *
 * ESPN publishes no official API, but the fantasy site's own front end reads
 * league data from lm-api-reads.fantasy.espn.com, and that endpoint answers
 * plain HTTP requests. Public leagues need nothing. Private leagues need the
 * two cookies a logged-in browser sends: espn_s2 and SWID.
 */

const API = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

// mTeam: team names, owners, records. mMatchupScore: every matchup's score.
// mSettings: league name, regular-season length, and how many NFL weeks each
// matchup period spans (two-week playoff rounds span two).
const VIEWS = ['mTeam', 'mMatchupScore', 'mSettings'];

/**
 * Pull leagueId, seasonId and teamId out of any fantasy.espn.com league URL,
 * so you can paste the address bar instead of hunting for the numbers.
 */
export function parseLeagueUrl(url) {
  let params;
  try {
    params = new URL(url).searchParams;
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  const leagueId = params.get('leagueId');
  if (!leagueId) throw new Error(`No leagueId in ${url}`);
  return {
    leagueId,
    season: params.get('seasonId') ?? undefined,
    teamId: params.get('teamId') ?? undefined,
  };
}

export function leagueEndpoint(leagueId, season) {
  const url = new URL(`${API}/seasons/${season}/segments/0/leagues/${leagueId}`);
  for (const view of VIEWS) url.searchParams.append('view', view);
  return url.toString();
}

/**
 * Fetch the raw league document. `fetchImpl` is injectable for tests.
 */
export async function fetchLeague({ leagueId, season, espnS2, swid }, fetchImpl = fetch) {
  const headers = { Accept: 'application/json' };
  // The cookie values go through verbatim: espn_s2 is already URL-encoded in
  // the browser, and SWID keeps its braces.
  if (espnS2 && swid) headers.Cookie = `espn_s2=${espnS2}; SWID=${swid}`;

  let res;
  try {
    res = await fetchImpl(leagueEndpoint(leagueId, season), { headers });
  } catch (e) {
    // Node's fetch says only "fetch failed"; the reason is on the cause.
    throw new Error(`Could not reach ESPN: ${e.cause?.message ?? e.message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `ESPN refused access to league ${leagueId} (HTTP ${res.status}). ` +
        (espnS2
          ? 'Your ESPN_S2 / ESPN_SWID cookies were rejected — they may have expired; copy fresh ones from your browser.'
          : 'The league is probably private: set ESPN_S2 and ESPN_SWID (see espn-fantasy/README.md).'),
    );
  }
  if (res.status === 404) {
    throw new Error(`ESPN has no league ${leagueId} for the ${season} season.`);
  }
  if (!res.ok) throw new Error(`ESPN returned HTTP ${res.status} for league ${leagueId}.`);

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`ESPN returned something other than JSON: ${text.slice(0, 120)}`);
  }
}
