// localStorage key for favorite teams (shared with settings.js)
const FAVORITE_TEAMS_KEY = 'sports-tracker-favorite-teams';

// Watch Party mode - when viewing a shared URL
let watchPartyMode = null;

// Teams with light primary colors that need to use their alternate color instead
// Format: { teamId: true } - these teams will use alternateColor for readability with white text
const LIGHT_COLOR_TEAM_OVERRIDES = {
    '381': true,  // Norwich City (Premier League) - primary is yellow
    '380': true,  // Wolverhampton Wanderers (Premier League) - primary is gold
    '18': true    // Nashville Predators (NHL) - primary is gold
};

// Default teams (used if no teams saved in localStorage)
const DEFAULT_TEAMS = [
    {
        name: 'Everton',
        id: '368',
        league: 'premier-league',
        sport: 'soccer',
        espnPath: 'soccer/eng.1'
    },
    {
        name: 'Tampa Bay Buccaneers',
        id: '27',
        league: 'nfl',
        sport: 'football',
        espnPath: 'football/nfl'
    },
    {
        name: 'Tampa Bay Lightning',
        id: '20',
        league: 'nhl',
        sport: 'hockey',
        espnPath: 'hockey/nhl'
    },
    {
        name: 'Tampa Bay Rays',
        id: '30',
        league: 'mlb',
        sport: 'baseball',
        espnPath: 'baseball/mlb'
    }
];

// Get favorite teams from localStorage (or defaults)
function getFavoriteTeams() {
    try {
        const saved = localStorage.getItem(FAVORITE_TEAMS_KEY);
        if (saved) {
            const teams = JSON.parse(saved);
            if (Array.isArray(teams) && teams.length > 0) {
                return teams;
            }
        }
    } catch (e) {
        console.error('Error loading favorite teams:', e);
    }
    return DEFAULT_TEAMS;
}

// How many days ahead to look for games
const DAYS_AHEAD = 30;

// Auto-refresh interval (15 minutes in milliseconds)
const REFRESH_INTERVAL = 15 * 60 * 1000;

// Big Games configuration (same as app.js)
const BIG_GAMES_CONFIG = {
    premierLeague: {
        espnPath: 'soccer/eng.1',
        sport: 'soccer',
        league: 'premier-league',
        thresholdOffset: 3
    },
    championsLeague: {
        espnPath: 'soccer/uefa.champions',
        sport: 'soccer',
        league: 'champions-league',
        // Any game with at least one English team qualifies
        requiresEnglishTeam: true
    },
    faCup: {
        espnPath: 'soccer/eng.fa',
        sport: 'soccer',
        league: 'fa-cup',
        // Uses same threshold as Premier League
        usePremierLeagueThreshold: true
    },
    leagueCup: {
        espnPath: 'soccer/eng.league_cup',
        sport: 'soccer',
        league: 'league-cup',
        // Uses same threshold as Premier League
        usePremierLeagueThreshold: true
    },
    nba: {
        espnPath: 'basketball/nba',
        sport: 'basketball',
        league: 'nba',
        // Top 6 by wins in each conference
        useNBAThreshold: true
    },
    nhl: {
        espnPath: 'hockey/nhl',
        sport: 'hockey',
        league: 'nhl',
        // Top 8 by wins in each conference
        useNHLThreshold: true
    }
};

// Get favorite team IDs for reliable comparison (computed dynamically)
function getFavoriteTeamIds() {
    return getFavoriteTeams().map(t => t.id);
}

// Get favorite team IDs filtered by sport (ESPN IDs are only unique within a sport)
function getFavoriteTeamIdsBySport(sport) {
    return getFavoriteTeams()
        .filter(t => t.sport === sport)
        .map(t => t.id);
}

// Check if a team ID matches any favorite team for a given sport
function isFavoriteTeamId(teamId, sport) {
    // Convert to string for comparison (ESPN API may return numbers or strings)
    const favoriteIds = getFavoriteTeamIdsBySport(sport);
    return favoriteIds.map(String).includes(String(teamId));
}

// Get the appropriate team color (checks override list)
// Returns hex color string with # prefix, or null if no color available
function getTeamColor(teamId, primaryColor, alternateColor) {
    if (!primaryColor) return null;

    // If team is in override list, use alternate color (if available)
    if (LIGHT_COLOR_TEAM_OVERRIDES[teamId] && alternateColor) {
        return '#' + alternateColor;
    }

    return '#' + primaryColor;
}

// Fetch team info (for color data) from ESPN team endpoint
async function fetchTeamInfo(team) {
    const cacheKey = `team-info-${team.espnPath}-${team.id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `https://site.api.espn.com/apis/site/v2/sports/${team.espnPath}/teams/${team.id}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const teamInfo = data.team || null;
        if (teamInfo) setCache(cacheKey, teamInfo);
        return teamInfo;
    } catch {
        return null;
    }
}

// Generate date strings for the next N days (YYYYMMDD format)
function getUpcomingDates(days) {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dates.push(`${year}${month}${day}`);
    }
    return dates;
}

// Fetch scoreboard for a specific date and league (used for Big Games)
// Returns { events: [], error: boolean }
async function fetchScoreboardForDate(espnPath, dateStr) {
    const cacheKey = `scoreboard-${espnPath}-${dateStr}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard?dates=${dateStr}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return { events: [], error: true };
        }
        const data = await response.json();
        const result = { events: data.events || [], error: false };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error(`Error fetching scoreboard for ${dateStr}:`, error);
        return { events: [], error: true };
    }
}

// Fetch upcoming games for a team
// Uses schedule endpoint for US sports, scoreboard for soccer (schedule doesn't show future fixtures)
// Falls back to scoreboard if schedule returns no future games (e.g., MLB offseason)
async function fetchTeamGames(team) {
    // Soccer leagues don't have future fixtures in schedule endpoint - use scoreboard
    if (team.sport === 'soccer') {
        return fetchTeamGamesFromScoreboard(team);
    }

    // US sports have full season in schedule endpoint - much more efficient
    const url = `https://site.api.espn.com/apis/site/v2/sports/${team.espnPath}/teams/${team.id}/schedule`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Schedule endpoint failed, fall back to scoreboard
            return fetchTeamGamesFromScoreboard(team);
        }
        const data = await response.json();
        const rawEvents = data.events || [];

        // Extract team color from API response
        const teamInfo = data.team || {};
        const teamColor = getTeamColor(team.id, teamInfo.color, teamInfo.alternateColor);
        const teamWithColor = { ...team, color: teamColor };

        // Check if we have any future games within our window
        const now = new Date();
        const windowEnd = new Date(now);
        windowEnd.setDate(now.getDate() + DAYS_AHEAD);

        const hasFutureGamesInWindow = rawEvents.some(event => {
            const eventDate = new Date(event.date);
            return eventDate > now && eventDate <= windowEnd;
        });

        if (!hasFutureGamesInWindow) {
            // No future games in our window (offseason, Spring Training not in schedule, etc.)
            console.log(`No games in next ${DAYS_AHEAD} days from schedule for ${team.name}, trying scoreboard...`);
            return fetchTeamGamesFromScoreboard(teamWithColor);
        }

        // Wrap each event with team info for calendar parsing
        const events = rawEvents.map(event => ({ event, team: teamWithColor }));
        return { team: teamWithColor, events, error: false };
    } catch (error) {
        console.error(`Error fetching schedule for ${team.name}:`, error);
        return fetchTeamGamesFromScoreboard(team);
    }
}

// Fallback: fetch from daily scoreboards (needed for soccer)
async function fetchTeamGamesFromScoreboard(team) {
    const dates = getUpcomingDates(DAYS_AHEAD);
    const allEvents = [];
    let errorCount = 0;

    // If team doesn't have color yet, fetch team info in parallel with scoreboards
    let teamWithColor = team;
    const needsColor = !team.color;

    const fetchPromises = dates.map(date => fetchScoreboardForDate(team.espnPath, date));

    if (needsColor) {
        // Fetch team info and scoreboards in parallel
        const [teamInfo, ...results] = await Promise.all([
            fetchTeamInfo(team),
            ...fetchPromises
        ]);

        if (teamInfo) {
            const color = getTeamColor(team.id, teamInfo.color, teamInfo.alternateColor);
            teamWithColor = { ...team, color };
        }

        for (const result of results) {
            if (result.error) {
                errorCount++;
            }
            for (const event of result.events) {
                const competitors = event.competitions?.[0]?.competitors || [];
                const isOurGame = competitors.some(c => c.id === team.id || c.team?.id === team.id);
                if (isOurGame) {
                    allEvents.push({ event, team: teamWithColor });
                }
            }
        }
    } else {
        // Team already has color, just fetch scoreboards
        const results = await Promise.all(fetchPromises);
        for (const result of results) {
            if (result.error) {
                errorCount++;
            }
            for (const event of result.events) {
                const competitors = event.competitions?.[0]?.competitors || [];
                const isOurGame = competitors.some(c => c.id === team.id || c.team?.id === team.id);
                if (isOurGame) {
                    allEvents.push({ event, team: teamWithColor });
                }
            }
        }
    }

    const hasSignificantErrors = errorCount > dates.length / 2;
    return { team: teamWithColor, events: allEvents, error: hasSignificantErrors };
}

// Determine season type label
function getSeasonTypeLabel(event, sport) {
    const seasonType = event.season?.type || event.seasonType?.type;
    const seasonSlug = event.season?.slug || '';
    const seasonTypeName = event.seasonType?.name || event.seasonType?.abbreviation || '';

    const isPreseason = seasonType === 1 ||
                        seasonSlug.toLowerCase() === 'preseason' ||
                        seasonTypeName.toLowerCase().includes('preseason') ||
                        seasonTypeName.toLowerCase().includes('pre-season');

    const isPlayoffs = seasonType === 3 ||
                       seasonSlug.toLowerCase().includes('postseason') ||
                       seasonTypeName.toLowerCase().includes('playoff') ||
                       seasonTypeName.toLowerCase().includes('postseason');

    if (isPreseason) {
        if (sport === 'baseball') {
            return 'Spring Training';
        }
        return 'Preseason';
    }

    if (isPlayoffs) {
        return 'Playoffs';
    }

    return null;
}

// Parse a single event into a game object
function parseEvent(event, team) {
    const competition = event.competitions?.[0];
    if (!competition) return null;

    const gameDate = new Date(event.date);
    const isCompleted = competition.status?.type?.completed || false;

    const competitors = competition.competitors || [];
    const ourTeam = competitors.find(c => c.id === team.id || c.team?.id === team.id);
    const opponent = competitors.find(c => c.id !== team.id && c.team?.id !== team.id);

    if (!opponent) return null;

    const broadcasts = competition.broadcasts || [];
    let tvChannels = broadcasts
        .map(b => {
            if (b.names && b.names.length > 0) {
                return b.names.join(', ');
            }
            if (b.media && b.media.shortName) {
                return b.media.shortName;
            }
            return null;
        })
        .filter(c => c !== null)
        .join(', ') || 'TBD';

    // Add ESPN+ for NHL games unless on national TV or involving NY metro teams
    if (team.sport === 'hockey') {
        const nationalNetworks = ['TNT', 'NHL Network', 'ESPN', 'ABC'];
        const blackoutTeams = ['New York Rangers', 'New York Islanders', 'New Jersey Devils'];
        const opponentName = opponent.team?.displayName || opponent.team?.name || '';

        const isOnNationalTV = nationalNetworks.some(net =>
            tvChannels.toUpperCase().includes(net.toUpperCase())
        );
        const involvesBlackoutTeam = blackoutTeams.some(t =>
            opponentName.includes(t) || team.name.includes(t)
        );

        if (!isOnNationalTV && !involvesBlackoutTeam && !tvChannels.includes('ESPN+')) {
            tvChannels = tvChannels === 'TBD' ? 'ESPN+' : `${tvChannels}, ESPN+`;
        }
    }

    const seasonLabel = getSeasonTypeLabel(event, team.sport);

    return {
        id: event.id, // ESPN event ID for tracking must-watch
        date: gameDate,
        teamName: team.name,
        teamColor: team.color, // Dynamic team color from ESPN API
        league: team.league,
        opponent: opponent.team?.displayName || opponent.team?.name || 'Unknown',
        isHome: ourTeam?.homeAway === 'home',
        isCompleted: isCompleted,
        score: isCompleted ? {
            us: ourTeam?.score,
            them: opponent?.score,
            winner: ourTeam?.winner
        } : null,
        channel: tvChannels,
        seasonLabel: seasonLabel
    };
}

// Must Watch localStorage functions (same key as app.js for sync)
const MUST_WATCH_KEY = 'sports-tracker-must-watch';

function getMustWatchGames() {
    try {
        const saved = localStorage.getItem(MUST_WATCH_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error('Error loading Must Watch games:', e);
        return [];
    }
}

function saveMustWatchGames(gameIds) {
    localStorage.setItem(MUST_WATCH_KEY, JSON.stringify(gameIds));
}

function toggleMustWatch(gameId) {
    const mustWatch = getMustWatchGames();
    const index = mustWatch.indexOf(gameId);
    if (index === -1) {
        mustWatch.push(gameId);
    } else {
        mustWatch.splice(index, 1);
    }
    saveMustWatchGames(mustWatch);
    // Re-render to update UI
    loadSchedules();
}

function isMustWatch(gameId) {
    return getMustWatchGames().includes(gameId);
}

// Clean up old Must Watch IDs that no longer correspond to any loaded games
function cleanupOldMustWatch(currentGameIds) {
    const mustWatch = getMustWatchGames();
    const validIds = mustWatch.filter(id => currentGameIds.includes(id));
    if (validIds.length !== mustWatch.length) {
        saveMustWatchGames(validIds);
    }
}

// Format date for table display
function formatDateForTable(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

// Format time for table display
function formatTimeForTable(date) {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });
}

// Format league slug to display name
function formatLeagueName(league) {
    const names = {
        'premier-league': 'Premier League',
        'champions-league': 'Champions League',
        'fa-cup': 'FA Cup',
        'league-cup': 'League Cup',
        'nfl': 'NFL',
        'nhl': 'NHL',
        'mlb': 'MLB',
        'nba': 'NBA',
        'big-game': 'Big Game'
    };
    return names[league] || league;
}

// Render a table of games
function renderGamesTable(games, tableId) {
    if (games.length === 0) {
        return `<p class="no-games">No games scheduled</p>`;
    }

    const rows = games.map(game => {
        // Big games don't need vs/@ prefix - they show "Home v. Away" already
        const homeAway = game.isBigGame ? '' : (game.isHome ? 'vs' : '@');
        const seasonLabelHtml = game.seasonLabel
            ? `<span class="season-label">${game.seasonLabel}</span>`
            : '';
        const mustWatch = isMustWatch(game.id);

        let resultHtml = '';
        if (game.isCompleted && game.score) {
            const resultText = game.score.winner ? 'W' : 'L';
            resultHtml = `<span class="game-result ${game.score.winner ? 'win' : 'loss'}">${resultText} ${game.score.us}-${game.score.them}</span>`;
        }

        const mustWatchHtml = !game.isCompleted ? `
            <label class="must-watch-label ${mustWatch ? 'checked' : ''}">
                <input type="checkbox"
                       class="must-watch-checkbox"
                       data-game-id="${game.id}"
                       ${mustWatch ? 'checked' : ''}>
                <span class="must-watch-icon">${mustWatch ? '★' : '☆'}</span>
            </label>
        ` : '';

        // Format matchup: show both teams, bold the favorite team
        let matchupText;
        if (game.isBigGame) {
            // Big games already have "Team A v. Team B" format, no bolding (neutral game)
            matchupText = game.opponent;
        } else {
            // Regular games: show "Home vs Away" with favorite (teamName) bolded
            if (game.isHome) {
                matchupText = `<strong>${game.teamName}</strong> vs ${game.opponent}`;
            } else {
                matchupText = `${game.opponent} vs <strong>${game.teamName}</strong>`;
            }
        }

        // Use team's dynamic color if available, fall back to league class
        const badgeStyle = game.teamColor ? `style="background-color: ${game.teamColor}"` : '';
        const badgeClass = game.teamColor ? 'team-badge' : `team-badge ${game.league}`;

        return `
            <tr class="${game.isCompleted ? 'completed' : ''} ${game.seasonLabel ? 'preseason' : ''} ${mustWatch ? 'must-watch' : ''}">
                <td class="date-cell">${formatDateForTable(game.date)}</td>
                <td class="time-cell">${formatTimeForTable(game.date)}</td>
                <td class="team-cell">
                    <span class="${badgeClass}" ${badgeStyle}>${formatLeagueName(game.league)}</span>
                </td>
                <td class="matchup-cell">${matchupText} ${seasonLabelHtml}</td>
                <td class="channel-cell">${game.isCompleted ? resultHtml : game.channel}</td>
                <td class="must-watch-cell">${mustWatchHtml}</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="games-table" id="${tableId}">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Competition</th>
                    <th>Matchup</th>
                    <th>Channel</th>
                    <th>Must Watch</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

// Fetch Premier League standings and return both qualifying teams AND all English teams
// Now returns team IDs for reliable matching instead of names
async function fetchPremierLeagueData() {
    const cacheKey = 'standings-premier-league';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings');
        if (!response.ok) {
            return { qualifyingTeamIds: [], allEnglishTeamIds: [], error: true };
        }

        const data = await response.json();
        const children = data.children || [];
        if (!children.length) {
            return { qualifyingTeamIds: [], allEnglishTeamIds: [], error: true };
        }

        const standings = children[0].standings || {};
        const entries = standings.entries || [];

        // Extract team IDs, names, and points
        const teams = entries.map(entry => {
            const teamId = entry.team?.id || '';
            const teamName = entry.team?.displayName || entry.team?.name || '';
            const stats = entry.stats || [];
            let points = 0;
            for (const stat of stats) {
                if (stat.name === 'points') {
                    points = parseInt(stat.value) || 0;
                    break;
                }
            }
            return { id: teamId, name: teamName, points };
        });

        teams.sort((a, b) => b.points - a.points);

        // All English team IDs (for Champions League matching)
        const allEnglishTeamIds = teams.map(t => t.id);

        if (teams.length < 5) {
            return { qualifyingTeamIds: [], allEnglishTeamIds, error: false };
        }
        const fifthPlacePoints = teams[4].points;
        const threshold = fifthPlacePoints - BIG_GAMES_CONFIG.premierLeague.thresholdOffset;

        // Qualifying team IDs (for big game matching)
        const qualifyingTeamIds = teams
            .filter(t => t.points > threshold)
            .map(t => t.id);

        const result = { qualifyingTeamIds, allEnglishTeamIds, error: false };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error fetching standings:', error);
        return { qualifyingTeamIds: [], allEnglishTeamIds: [], error: true };
    }
}

// Fetch NBA top tier teams (top 6 by wins in each conference)
async function fetchNBATopTierTeams() {
    const cacheKey = 'standings-nba';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch(STANDINGS_URLS['nba']);
        if (!response.ok) {
            return { topTierTeamIds: [], error: true };
        }

        const data = await response.json();
        const children = data.children || [];
        const topTierTeamIds = [];

        // Each child is a conference (Eastern, Western)
        for (const conference of children) {
            const standings = conference.standings || {};
            const entries = standings.entries || [];

            // Extract team ID and wins
            const teams = entries.map(entry => {
                const teamId = entry.team?.id || '';
                const stats = entry.stats || [];
                let wins = 0;
                for (const stat of stats) {
                    if (stat.name === 'wins') {
                        wins = parseInt(stat.value) || 0;
                        break;
                    }
                }
                return { id: teamId, wins };
            });

            // Sort by wins descending and take top 6
            teams.sort((a, b) => b.wins - a.wins);
            const topN = TOP_TIER_THRESHOLDS['nba'].topN;
            const topTeams = teams.slice(0, topN);
            topTierTeamIds.push(...topTeams.map(t => t.id));
        }

        const result = { topTierTeamIds, error: false };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error fetching NBA standings:', error);
        return { topTierTeamIds: [], error: true };
    }
}

// Fetch NHL top tier teams (top 8 by wins in each conference)
async function fetchNHLTopTierTeams() {
    const cacheKey = 'standings-nhl';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch(STANDINGS_URLS['nhl']);
        if (!response.ok) {
            return { topTierTeamIds: [], error: true };
        }

        const data = await response.json();
        const children = data.children || [];
        const topTierTeamIds = [];

        // Each child is a conference (Eastern, Western)
        for (const conference of children) {
            const standings = conference.standings || {};
            const entries = standings.entries || [];

            // Extract team ID and wins
            const teams = entries.map(entry => {
                const teamId = entry.team?.id || '';
                const stats = entry.stats || [];
                let wins = 0;
                for (const stat of stats) {
                    if (stat.name === 'wins') {
                        wins = parseInt(stat.value) || 0;
                        break;
                    }
                }
                return { id: teamId, wins };
            });

            // Sort by wins descending and take top 8
            teams.sort((a, b) => b.wins - a.wins);
            const topN = TOP_TIER_THRESHOLDS['nhl'].topN;
            const topTeams = teams.slice(0, topN);
            topTierTeamIds.push(...topTeams.map(t => t.id));
        }

        const result = { topTierTeamIds, error: false };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error fetching NHL standings:', error);
        return { topTierTeamIds: [], error: true };
    }
}

// Helper: Check if a team ID matches any in a list (more reliable than name matching)
function teamIdMatchesList(teamId, teamIdList) {
    // Convert to string for comparison (ESPN API may return numbers or strings)
    return teamIdList.map(String).includes(String(teamId));
}

// Fetch big games from all competitions based on user's Big Game Settings
// Includes games involving favorites (Beat Em Off, Playoff Preview, etc.) and Rob Lowe games
// Returns { games: [], error: boolean }
async function fetchBigGamesForCalendar() {
    const dates = getUpcomingDates(DAYS_AHEAD);
    const bigGames = [];
    let hasError = false;

    // Fetch all standings in parallel
    const [plData, nbaData, nhlData] = await Promise.all([
        fetchPremierLeagueData(),
        fetchNBATopTierTeams(),
        fetchNHLTopTierTeams()
    ]);

    if (plData.error) hasError = true;
    if (nbaData.error) hasError = true;
    if (nhlData.error) hasError = true;

    const { qualifyingTeamIds, allEnglishTeamIds } = plData;

    // Top tier teams by league
    const topTierByLeague = {
        'premier-league': qualifyingTeamIds,
        'champions-league': qualifyingTeamIds,  // Uses PL top tier
        'fa-cup': qualifyingTeamIds,             // Uses PL top tier
        'league-cup': qualifyingTeamIds,         // Uses PL top tier
        'nba': nbaData.topTierTeamIds,
        'nhl': nhlData.topTierTeamIds
    };

    // Process each competition
    for (const [, config] of Object.entries(BIG_GAMES_CONFIG)) {
        const fetchPromises = dates.map(date => fetchScoreboardForDate(config.espnPath, date));
        const results = await Promise.all(fetchPromises);

        // Get the top tier list for this league
        const topTierTeamIds = topTierByLeague[config.league] || [];

        // Get favorite team IDs filtered by sport (ESPN IDs are only unique within a sport)
        const favoriteTeamIds = getFavoriteTeamIdsBySport(config.sport);

        for (const result of results) {
            if (result.error) {
                hasError = true;
            }
            for (const event of result.events) {
                const competitors = event.competitions?.[0]?.competitors || [];
                if (competitors.length !== 2) continue;

                const homeTeam = competitors.find(c => c.homeAway === 'home');
                const awayTeam = competitors.find(c => c.homeAway === 'away');
                // Use team IDs for matching instead of names (more reliable)
                const homeTeamId = homeTeam?.team?.id || homeTeam?.id || '';
                const awayTeamId = awayTeam?.team?.id || awayTeam?.id || '';

                // A game qualifies if:
                // 1. It involves at least one favorite team (Beat Em Off, Playoff Preview, etc.)
                // 2. OR both teams are top tier (Rob Lowe)
                // For CL: also requires at least one English team if no favorites involved

                const homeIsFavorite = isFavoriteTeamId(homeTeamId, config.sport);
                const awayIsFavorite = isFavoriteTeamId(awayTeamId, config.sport);
                const involvesFavorite = homeIsFavorite || awayIsFavorite;

                const homeIsTopTier = teamIdMatchesList(homeTeamId, topTierTeamIds);
                const awayIsTopTier = teamIdMatchesList(awayTeamId, topTierTeamIds);
                const bothTopTier = homeIsTopTier && awayIsTopTier;

                let qualifies = false;

                if (involvesFavorite) {
                    // Game involves a favorite - qualifies for potential Beat Em Off, etc.
                    if (config.requiresEnglishTeam) {
                        // CL: favorite must be English team
                        const homeIsEnglish = teamIdMatchesList(homeTeamId, allEnglishTeamIds);
                        const awayIsEnglish = teamIdMatchesList(awayTeamId, allEnglishTeamIds);
                        qualifies = (homeIsFavorite && homeIsEnglish) || (awayIsFavorite && awayIsEnglish);
                    } else {
                        qualifies = true;
                    }
                } else if (bothTopTier) {
                    // Rob Lowe: two top tier teams (neither is favorite)
                    if (config.requiresEnglishTeam) {
                        // CL: at least one English team
                        const homeIsEnglish = teamIdMatchesList(homeTeamId, allEnglishTeamIds);
                        const awayIsEnglish = teamIdMatchesList(awayTeamId, allEnglishTeamIds);
                        qualifies = homeIsEnglish || awayIsEnglish;
                    } else {
                        qualifies = true;
                    }
                }

                if (!qualifies) continue;

                const homeTeamDisplayName = homeTeam?.team?.displayName || 'TBD';
                const awayTeamDisplayName = awayTeam?.team?.displayName || 'TBD';

                const competition = event.competitions?.[0];
                const gameDate = new Date(event.date);
                const isCompleted = competition?.status?.type?.completed || false;

                if (isCompleted) continue;

                const broadcasts = competition?.broadcasts || [];
                const tvChannels = broadcasts
                    .map(b => b.names?.join(', ') || b.media?.shortName || null)
                    .filter(c => c !== null)
                    .join(', ') || 'TBD';

                // Categorize teams and game
                const homeTeamCategory = categorizeTeam(homeTeamId, topTierTeamIds, favoriteTeamIds);
                const awayTeamCategory = categorizeTeam(awayTeamId, topTierTeamIds, favoriteTeamIds);
                const gameCategory = categorizeGame(homeTeamCategory, awayTeamCategory);

                // Compute isBigGame based on enabled categories in settings for this competition
                const isBigGame = computeIsBigGameForCompetition(gameCategory, config.league);

                // Only include if this game category is enabled for this competition
                if (!isBigGame) continue;

                // Format as a calendar game entry
                bigGames.push({
                    id: event.id,
                    date: gameDate,
                    teamName: 'Big Game',
                    league: config.league,
                    opponent: `${homeTeamDisplayName} v. ${awayTeamDisplayName}`,
                    isHome: true,
                    isCompleted: isCompleted,
                    score: null,
                    channel: tvChannels,
                    seasonLabel: null,
                    isBigGame: true,
                    gameCategory: gameCategory,
                    homeTeamId: homeTeamId,
                    awayTeamId: awayTeamId,
                    homeTeamCategory: homeTeamCategory,
                    awayTeamCategory: awayTeamCategory
                });
            }
        }
    }

    const seen = new Set();
    const games = bigGames
        .filter(g => {
            if (seen.has(g.id)) return false;
            seen.add(g.id);
            return true;
        })
        .sort((a, b) => a.date - b.date);

    return { games, error: hasError };
}

// Render error footer if any fetches failed
function renderErrorFooter(errors) {
    if (errors.length === 0) return '';

    const errorList = errors.map(e => `<li>${e}</li>`).join('');
    return `
        <div class="error-footer">
            <strong>Some data may be incomplete:</strong>
            <ul>${errorList}</ul>
            <p class="error-actions">
                <strong>Try:</strong> Refresh the page.
                If the issue persists, ESPN may have changed their API —
                <a href="mailto:davreed4793@gmail.com?subject=Sports%20Tracker%20Error&body=Error%20seen:%20${encodeURIComponent(errors.join(', '))}">let me know</a> so I can fix it.
            </p>
        </div>
    `;
}

// Refresh indicator helpers
function showRefreshIndicator() {
    const indicator = document.getElementById('refresh-indicator');
    if (indicator) indicator.style.display = 'block';
}

function hideRefreshIndicator() {
    const indicator = document.getElementById('refresh-indicator');
    if (indicator) indicator.style.display = 'none';
}

// Main function to load all schedules
async function loadSchedules() {
    const container = document.getElementById('calendar');
    const updateTime = document.getElementById('update-time');

    // Check for Watch Party mode (shared URL)
    if (watchPartyMode === null) {
        watchPartyMode = getWatchPartyFromURL();
    }

    // Check if this is a refresh (content already exists) vs initial load
    const isRefresh = container.querySelector('.calendar-table') !== null;
    if (isRefresh) {
        showRefreshIndicator();
    } else {
        // Show loading state only on initial load
        container.innerHTML = '<p class="loading">Loading schedules...</p>';
    }

    try {
        // Track errors for each category
        const errors = [];

        // Fetch big games only (already filtered by user's big game settings)
        const bigGamesResult = await fetchBigGamesForCalendar();

        // Check for big games fetch error
        if (bigGamesResult.error) {
            errors.push('Big Games data may be incomplete');
        }

        // Use big games directly (already filtered by isBigGame based on user settings)
        const allGames = [...bigGamesResult.games];

        // Remove duplicates using game ID (reliable ESPN identifier)
        const seenGames = new Set();
        const uniqueGames = allGames.filter(game => {
            if (seenGames.has(game.id)) return false;
            seenGames.add(game.id);
            return true;
        });

        // Clean up old Must Watch IDs
        const allGameIds = uniqueGames.map(g => g.id);
        cleanupOldMustWatch(allGameIds);

        uniqueGames.sort((a, b) => a.date - b.date);

        // Filter to games within the next 30 days only
        const now = new Date();
        const thirtyDaysFromNow = new Date(now);
        thirtyDaysFromNow.setDate(now.getDate() + DAYS_AHEAD);

        // Check preseason setting
        const showPreseason = getShowPreseason();

        const futureGames = uniqueGames.filter(g => {
            const isWithinWindow = g.date > new Date(now - 2*60*60*1000) && g.date <= thirtyDaysFromNow;

            // Filter out preseason games if setting is off
            const isPreseason = g.seasonLabel && (
                g.seasonLabel === 'Preseason' ||
                g.seasonLabel === 'Spring Training'
            );
            const passesPreseasonFilter = showPreseason || !isPreseason;

            return isWithinWindow && passesPreseasonFilter;
        });

        // Split into next 7 days and later
        const sevenDaysFromNow = new Date(now);
        sevenDaysFromNow.setDate(now.getDate() + 7);

        const next7Days = futureGames.filter(g => g.date <= sevenDaysFromNow);
        const laterThisMonth = futureGames.filter(g => g.date > sevenDaysFromNow);

        // Render both sections plus error footer if needed
        const errorHtml = renderErrorFooter(errors);

        // Watch party banner
        const watchPartyBanner = watchPartyMode
            ? `<div class="watch-party-banner">Viewing shared Watch Party<a href="${window.location.pathname}">View your own</a></div>`
            : '';

        container.innerHTML = `
            ${watchPartyBanner}
            <section class="calendar-section">
                <h2>Next 7 Days</h2>
                ${renderGamesTable(next7Days, 'next-7-days')}
            </section>

            <section class="calendar-section later-section">
                <h2>Later This Month</h2>
                ${renderGamesTable(laterThisMonth, 'later-this-month')}
            </section>
            ${errorHtml}
        `;

        updateTime.textContent = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        hideRefreshIndicator();

    } catch (error) {
        console.error('Error loading schedules:', error);
        container.innerHTML = '<p class="loading">Error loading schedules. Please refresh.</p>';
        hideRefreshIndicator();
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    loadSchedules();

    // Handle must-watch checkbox clicks (event delegation)
    document.getElementById('calendar').addEventListener('change', (e) => {
        if (e.target.classList.contains('must-watch-checkbox')) {
            const gameId = e.target.dataset.gameId;
            toggleMustWatch(gameId);
        }
    });

    setInterval(loadSchedules, REFRESH_INTERVAL);

    // Manual refresh button clears cache and reloads
    document.getElementById('manual-refresh-btn').addEventListener('click', () => {
        clearAllCache();
        loadSchedules();
    });

    // Share button generates URL and copies to clipboard
    document.getElementById('share-btn').addEventListener('click', async () => {
        const teams = getFavoriteTeams();
        const bigGameSettings = getBigGameSettings();
        const showPreseason = getShowPreseason();

        const url = generateWatchPartyURL(teams, bigGameSettings, showPreseason);
        if (url) {
            try {
                await navigator.clipboard.writeText(url);
                alert('Watch Party link copied to clipboard!');
            } catch {
                // Fallback for browsers that don't support clipboard API
                prompt('Copy this Watch Party link:', url);
            }
        }
    });
});
