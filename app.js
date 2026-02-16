// localStorage key for favorite teams (shared with settings.js)
const FAVORITE_TEAMS_KEY = 'sports-tracker-favorite-teams';

// Watch Party mode - when viewing a shared URL
let watchPartyMode = null;

// ============================================
// Module-level Cache for localStorage Reads
// ============================================
// These caches prevent repeated JSON.parse() calls during render cycles.
// Invalidated when saving new values or at start of loadSchedules().

let _favoriteTeamsCache = null;
let _mustWatchCache = null;

// Invalidate app-specific caches (called at start of loadSchedules)
function invalidateAppCache() {
    _favoriteTeamsCache = null;
    _mustWatchCache = null;
    // Also invalidate shared.js caches
    if (typeof invalidateSettingsCache === 'function') {
        invalidateSettingsCache();
    }
}

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
        espnPath: 'soccer/eng.1',
        logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/368.png'
    },
    {
        name: 'Tampa Bay Buccaneers',
        id: '27',
        league: 'nfl',
        sport: 'football',
        espnPath: 'football/nfl',
        logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png'
    },
    {
        name: 'Tampa Bay Lightning',
        id: '20',
        league: 'nhl',
        sport: 'hockey',
        espnPath: 'hockey/nhl',
        logo: 'https://a.espncdn.com/i/teamlogos/nhl/500/tb.png'
    },
    {
        name: 'Tampa Bay Rays',
        id: '30',
        league: 'mlb',
        sport: 'baseball',
        espnPath: 'baseball/mlb',
        logo: 'https://a.espncdn.com/i/teamlogos/mlb/500/tb.png'
    }
];

// Get favorite teams from localStorage (or defaults)
// Uses module-level cache to avoid repeated JSON.parse() calls during render
function getFavoriteTeams() {
    // Return cached value if available
    if (_favoriteTeamsCache !== null) {
        return _favoriteTeamsCache;
    }

    try {
        const saved = localStorage.getItem(FAVORITE_TEAMS_KEY);
        if (saved) {
            const teams = JSON.parse(saved);
            if (Array.isArray(teams) && teams.length > 0) {
                _favoriteTeamsCache = teams;
                return teams;
            }
        }
    } catch (e) {
        console.error('Error loading favorite teams:', e);
    }
    _favoriteTeamsCache = DEFAULT_TEAMS;
    return DEFAULT_TEAMS;
}

// How many upcoming games to show per team
const GAMES_TO_SHOW = 5;

// How many days ahead to look for games
const DAYS_AHEAD = 30;

// Auto-refresh interval (15 minutes in milliseconds)
const REFRESH_INTERVAL = 15 * 60 * 1000;

// Big Games configuration
// Premier League: Teams with points > (5th place points - 3) qualify
// Champions League: Any game featuring an English team
// FA Cup / League Cup: Games between teams meeting the PL threshold
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

// Get favorite team IDs filtered by sport (for cross-sport ID collision prevention)
function getFavoriteTeamIdsBySport(sport) {
    return getFavoriteTeams()
        .filter(t => t.sport === sport)
        .map(t => t.id);
}

// Check if a team ID matches any favorite team (within the same sport)
function isFavoriteTeamId(teamId, sport) {
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
        const response = await fetchWithTimeout(url);
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
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            // Schedule endpoint failed, fall back to scoreboard
            return fetchTeamGamesFromScoreboard(team);
        }
        const data = await response.json();
        const events = data.events || [];

        // Extract team color from API response
        const teamInfo = data.team || {};
        const teamColor = getTeamColor(team.id, teamInfo.color, teamInfo.alternateColor);
        const teamWithColor = { ...team, color: teamColor };

        // Check if we have any future games within our window
        const now = new Date();
        const windowEnd = new Date(now);
        windowEnd.setDate(now.getDate() + DAYS_AHEAD);

        const hasFutureGamesInWindow = events.some(event => {
            const eventDate = new Date(event.date);
            return eventDate > now && eventDate <= windowEnd;
        });

        if (!hasFutureGamesInWindow) {
            // No future games in our window (offseason, Spring Training not in schedule, etc.)
            console.log(`No games in next ${DAYS_AHEAD} days from schedule for ${team.name}, trying scoreboard...`);
            return fetchTeamGamesFromScoreboard(teamWithColor);
        }

        return { team: teamWithColor, events, error: false };
    } catch (error) {
        console.error(`Error fetching schedule for ${team.name}:`, error);
        return fetchTeamGamesFromScoreboard(team);
    }
}

// Fetch team info (for color data) from ESPN team endpoint
async function fetchTeamInfo(team) {
    const cacheKey = `team-info-${team.espnPath}-${team.id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `https://site.api.espn.com/apis/site/v2/sports/${team.espnPath}/teams/${team.id}`;
    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        const teamInfo = data.team || null;
        if (teamInfo) setCache(cacheKey, teamInfo);
        return teamInfo;
    } catch {
        return null;
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
                    allEvents.push(event);
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
                    allEvents.push(event);
                }
            }
        }
    }

    // Remove duplicates
    const uniqueEvents = [];
    const seenIds = new Set();
    for (const event of allEvents) {
        if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            uniqueEvents.push(event);
        }
    }

    const hasSignificantErrors = errorCount > dates.length / 2;
    return { team: teamWithColor, events: uniqueEvents, error: hasSignificantErrors };
}

// Determine season type label
function getSeasonTypeLabel(event, sport) {
    const seasonType = event.season?.type || event.seasonType?.type;
    const seasonSlug = event.season?.slug || '';
    const seasonTypeName = event.seasonType?.name || event.seasonType?.abbreviation || '';

    // Check for preseason - be specific to avoid matching "premier"
    // US sports use type 1 for preseason, or explicit "preseason" in the name
    const isPreseason = seasonType === 1 ||
                        seasonSlug.toLowerCase() === 'preseason' ||
                        seasonTypeName.toLowerCase().includes('preseason') ||
                        seasonTypeName.toLowerCase().includes('pre-season');

    // Check for playoffs (type 3 or explicit postseason)
    const isPlayoffs = seasonType === 3 ||
                       seasonSlug.toLowerCase().includes('postseason') ||
                       seasonTypeName.toLowerCase().includes('playoff') ||
                       seasonTypeName.toLowerCase().includes('postseason');

    if (isPreseason) {
        // MLB calls it Spring Training
        if (sport === 'baseball') {
            return 'Spring Training';
        }
        return 'Preseason';
    }

    if (isPlayoffs) {
        return 'Playoffs';
    }

    return null; // Regular season, no special label
}

// Parse a single event into a game object
function parseEvent(event, team) {
    const competition = event.competitions?.[0];
    if (!competition) return null;

    const gameDate = new Date(event.date);
    const isCompleted = competition.status?.type?.completed || false;

    // Find our team and opponent
    const competitors = competition.competitors || [];
    const ourTeam = competitors.find(c => c.id === team.id || c.team?.id === team.id);
    const opponent = competitors.find(c => c.id !== team.id && c.team?.id !== team.id);

    if (!opponent) return null;

    // Get broadcast info - ESPN uses different structures
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

    // Get season type label (Spring Training, Preseason, Playoffs, etc.)
    const seasonLabel = getSeasonTypeLabel(event, team.sport);

    return {
        id: event.id, // ESPN event ID for tracking must-watch
        date: gameDate,
        opponent: opponent.team?.displayName || opponent.team?.name || 'Unknown',
        opponentLogo: opponent.team?.logo,
        isHome: ourTeam?.homeAway === 'home',
        isCompleted: isCompleted,
        score: isCompleted ? {
            us: ourTeam?.score,
            them: opponent?.score,
            winner: ourTeam?.winner
        } : null,
        channel: tvChannels,
        venue: competition.venue?.fullName,
        seasonLabel: seasonLabel
    };
}

// Must Watch localStorage functions
const MUST_WATCH_KEY = 'sports-tracker-must-watch';

// Get must watch games from localStorage
// Uses module-level cache to avoid repeated JSON.parse() calls during render
function getMustWatchGames() {
    // In watch party mode, use the shared mustWatch list
    if (watchPartyMode && watchPartyMode.mustWatch) {
        return watchPartyMode.mustWatch;
    }

    // Return cached value if available
    if (_mustWatchCache !== null) {
        return _mustWatchCache;
    }

    try {
        const saved = localStorage.getItem(MUST_WATCH_KEY);
        _mustWatchCache = saved ? JSON.parse(saved) : [];
        return _mustWatchCache;
    } catch (e) {
        console.error('Error loading Must Watch games:', e);
        _mustWatchCache = [];
        return [];
    }
}

function saveMustWatchGames(gameIds) {
    _mustWatchCache = gameIds;  // Update cache
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
    // Skip cleanup in watch party mode (don't modify local storage based on watch party data)
    if (watchPartyMode) return;

    const mustWatch = getMustWatchGames();
    const validIds = mustWatch.filter(id => currentGameIds.includes(id));
    if (validIds.length !== mustWatch.length) {
        saveMustWatchGames(validIds);
    }
}

// Fetch Premier League standings and return both qualifying teams AND all English teams
// Now returns team IDs for reliable matching instead of names
async function fetchPremierLeagueData() {
    const cacheKey = 'standings-premier-league';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetchWithTimeout('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings');
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

        // Sort by points descending
        teams.sort((a, b) => b.points - a.points);

        // All English team IDs (for Champions League matching)
        const allEnglishTeamIds = teams.map(t => t.id);

        // Calculate threshold: 5th place points - offset
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

// Legacy function for backwards compatibility
async function fetchQualifyingTeams() {
    const { qualifyingTeamIds } = await fetchPremierLeagueData();
    return qualifyingTeamIds;
}

// Note: fetchNBATopTierTeams() and fetchNHLTopTierTeams() are now in shared.js
// to ensure consistent cache keys when navigating between pages

// Helper: Check if a team ID matches any in a list (more reliable than name matching)
function teamIdMatchesList(teamId, teamIdList) {
    return teamIdList.includes(teamId);
}

// Fetch big games from all configured competitions
// KEY LOGIC: involvesFavorite flag determines behavior:
//   - If true: Show in Big Games on By Team page, auto-mark Must Watch
//   - Calendar page filters these out (handled in calendar.js)
// Returns { games: [], error: boolean }
async function fetchBigGames() {
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

    // Process all competitions in parallel (performance optimization)
    // Each competition fetches all its dates, then processes events
    const competitionPromises = Object.values(BIG_GAMES_CONFIG).map(async (config) => {
        // Fetch all matches for this competition in parallel
        const fetchPromises = dates.map(date => fetchScoreboardForDate(config.espnPath, date));
        const results = await Promise.all(fetchPromises);

        // Get the top tier list for this league
        const topTierTeamIds = topTierByLeague[config.league] || [];

        // Get favorite team IDs filtered by sport (ESPN IDs are only unique within a sport)
        // This prevents cross-sport ID collisions (e.g., NBA team ID 20 matching NHL team ID 20)
        const favoriteTeamIds = getFavoriteTeamIdsBySport(config.sport);

        const competitionGames = [];
        let competitionHasError = false;

        for (const result of results) {
            if (result.error) {
                competitionHasError = true;
            }
            for (const event of result.events) {
                const competitors = event.competitions?.[0]?.competitors || [];
                if (competitors.length !== 2) continue;

                const homeTeam = competitors.find(c => c.homeAway === 'home');
                const awayTeam = competitors.find(c => c.homeAway === 'away');

                // Skip game if either team is missing (prevents incorrect categorization)
                if (!homeTeam || !awayTeam) continue;

                // Use team IDs for matching instead of names (more reliable)
                const homeTeamId = homeTeam?.team?.id || homeTeam?.id || '';
                const awayTeamId = awayTeam?.team?.id || awayTeam?.id || '';

                let qualifies = false;

                // Check qualification based on competition type
                if (config.requiresEnglishTeam) {
                    // Champions League: at least one English team
                    const homeIsEnglish = teamIdMatchesList(homeTeamId, allEnglishTeamIds);
                    const awayIsEnglish = teamIdMatchesList(awayTeamId, allEnglishTeamIds);
                    qualifies = homeIsEnglish || awayIsEnglish;
                } else if (config.usePremierLeagueThreshold) {
                    // FA Cup / League Cup: both teams must meet PL threshold
                    const homeQualifies = teamIdMatchesList(homeTeamId, topTierTeamIds);
                    const awayQualifies = teamIdMatchesList(awayTeamId, topTierTeamIds);
                    qualifies = homeQualifies && awayQualifies;
                } else if (config.useNBAThreshold || config.useNHLThreshold) {
                    // NBA / NHL: both teams must be in top tier
                    const homeQualifies = teamIdMatchesList(homeTeamId, topTierTeamIds);
                    const awayQualifies = teamIdMatchesList(awayTeamId, topTierTeamIds);
                    qualifies = homeQualifies && awayQualifies;
                } else {
                    // Premier League: both teams must meet threshold
                    const homeQualifies = teamIdMatchesList(homeTeamId, topTierTeamIds);
                    const awayQualifies = teamIdMatchesList(awayTeamId, topTierTeamIds);
                    qualifies = homeQualifies && awayQualifies;
                }

                if (!qualifies) continue;

                const competition = event.competitions?.[0];
                const gameDate = new Date(event.date);
                const isCompleted = competition?.status?.type?.completed || false;

                // Skip completed games
                if (isCompleted) continue;

                // Get broadcast info
                const broadcasts = competition?.broadcasts || [];
                const tvChannels = broadcasts
                    .map(b => b.names?.join(', ') || b.media?.shortName || null)
                    .filter(c => c !== null)
                    .join(', ') || 'TBD';

                const homeTeamDisplayName = homeTeam?.team?.displayName || homeTeam?.team?.name || 'TBD';
                const awayTeamDisplayName = awayTeam?.team?.displayName || awayTeam?.team?.name || 'TBD';

                // *** KEY DISTINCTION: Check if either team is a favorite (by ID) ***
                const involvesFavorite = isFavoriteTeamId(homeTeamId, config.sport) || isFavoriteTeamId(awayTeamId, config.sport);

                // Categorize teams and game
                const homeTeamCategory = categorizeTeam(homeTeamId, topTierTeamIds, favoriteTeamIds);
                const awayTeamCategory = categorizeTeam(awayTeamId, topTierTeamIds, favoriteTeamIds);
                const gameCategory = categorizeGame(homeTeamCategory, awayTeamCategory);

                // Compute isBigGame based on enabled categories in settings for this competition
                const isBigGame = computeIsBigGameForCompetition(gameCategory, config.league);

                // Only include if this game category is enabled for this competition
                if (!isBigGame) continue;

                competitionGames.push({
                    id: event.id,
                    date: gameDate,
                    sport: config.sport,
                    league: config.league,
                    homeTeam: {
                        name: homeTeamDisplayName,
                        logo: homeTeam?.team?.logo,
                        score: homeTeam?.score
                    },
                    awayTeam: {
                        name: awayTeamDisplayName,
                        logo: awayTeam?.team?.logo,
                        score: awayTeam?.score
                    },
                    isCompleted: isCompleted,
                    channel: tvChannels,
                    // *** This flag is used to:
                    //     1. Auto-mark as Must Watch (in renderBigGamesCard)
                    //     2. Filter out from calendar.js (so it only shows once) ***
                    involvesFavorite: involvesFavorite,
                    gameCategory: gameCategory,
                    homeTeamId: homeTeamId,
                    awayTeamId: awayTeamId,
                    homeTeamCategory: homeTeamCategory,
                    awayTeamCategory: awayTeamCategory
                });
            }
        }
        return { games: competitionGames, hasError: competitionHasError };
    });

    // Wait for all competitions to complete and flatten results
    const competitionResults = await Promise.all(competitionPromises);
    for (const result of competitionResults) {
        if (result.hasError) hasError = true;
        bigGames.push(...result.games);
    }

    // Sort by date and remove duplicates
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

// Render big games card
// Games involving favorite teams are auto-marked as Must Watch
function renderBigGamesCard(games) {
    // Show empty state if no games
    if (games.length === 0) {
        return `
            <div class="team-card big-games-card">
                <div class="team-header big-games">
                    <img src="big-games-icon.jpg" alt="" class="team-logo big-games-icon">
                    <span class="team-name">Big Games</span>
                </div>
                <div class="games-list">
                    <p class="no-games">No upcoming games under current settings</p>
                </div>
            </div>
        `;
    }

    // Auto-save favorite team big games as Must Watch
    // Uses fresh read each iteration to avoid race conditions with user toggles
    for (const game of games) {
        if (game.involvesFavorite) {
            const currentMustWatch = getMustWatchGames();
            if (!currentMustWatch.includes(game.id)) {
                currentMustWatch.push(game.id);
                saveMustWatchGames(currentMustWatch);
            }
        }
    }

    const gamesHtml = games.map(game => {
        // *** KEY: involvesFavorite games are always Must Watch ***
        const mustWatch = game.involvesFavorite || isMustWatch(game.id);

        let resultHtml = '';
        if (game.isCompleted) {
            resultHtml = `
                <div class="game-score">
                    Final: ${game.homeTeam.score} - ${game.awayTeam.score}
                </div>
            `;
        }

        // For favorite team games, show locked star (can't uncheck)
        // For neutral big games, show toggleable star (disabled in watch party mode)
        const isDisabled = watchPartyMode ? 'disabled' : '';
        const mustWatchHtml = !game.isCompleted ? (
            game.involvesFavorite
                ? `<span class="must-watch-icon must-watch-locked" title="Auto-marked: involves your team">★</span>`
                : `<label class="must-watch-label ${mustWatch ? 'checked' : ''} ${watchPartyMode ? 'watch-party-disabled' : ''}">
                    <input type="checkbox"
                           class="must-watch-checkbox"
                           data-game-id="${game.id}"
                           ${mustWatch ? 'checked' : ''}
                           ${isDisabled}>
                    <span class="must-watch-icon">${mustWatch ? '★' : '☆'}</span>
                </label>`
        ) : '';

        const sportLabel = game.sport.charAt(0).toUpperCase() + game.sport.slice(1);
        const isSoccer = isSoccerLeague(game.league);

        // Sport-specific matchup: soccer "Home v. Away", others "Away @ Home"
        const leftTeam = isSoccer ? game.homeTeam : game.awayTeam;
        const rightTeam = isSoccer ? game.awayTeam : game.homeTeam;
        const leftCategory = isSoccer ? game.homeTeamCategory : game.awayTeamCategory;
        const rightCategory = isSoccer ? game.awayTeamCategory : game.homeTeamCategory;
        const separator = isSoccer ? 'v.' : '@';

        return `
            <div class="game big-game ${game.isCompleted ? 'completed' : ''} ${mustWatch ? 'must-watch' : ''} ${game.involvesFavorite ? 'favorite-big-game' : ''}">
                <div class="game-header">
                    <div class="game-date">${formatDate(game.date)}</div>
                    ${mustWatchHtml}
                </div>
                <div class="big-game-sport">${sportLabel}</div>
                <div class="big-game-matchup">
                    <div class="big-game-team">
                        ${leftTeam.logo ? `<img src="${leftTeam.logo}" alt="" class="big-game-logo">` : ''}
                        <span class="team-name-hover" data-category="${getCategoryLabel(leftCategory)}">${leftTeam.name}</span>
                    </div>
                    <span class="big-game-at">${separator}</span>
                    <div class="big-game-team">
                        ${rightTeam.logo ? `<img src="${rightTeam.logo}" alt="" class="big-game-logo">` : ''}
                        <span class="team-name-hover" data-category="${getCategoryLabel(rightCategory)}">${rightTeam.name}</span>
                    </div>
                </div>
                ${resultHtml}
                ${!game.isCompleted ? `<span class="game-channel">${game.channel}</span>` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="team-card big-games-card">
            <div class="team-header big-games">
                <img src="big-games-icon.jpg" alt="" class="team-logo big-games-icon">
                <span class="team-name">Big Games</span>
            </div>
            <div class="games-list">
                ${gamesHtml}
            </div>
        </div>
    `;
}

// Parse games from fetched data
function parseGames(teamData) {
    const { team, events, error } = teamData;

    if (error) {
        return { team, games: [], error };
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + DAYS_AHEAD);

    // Check preseason setting
    const showPreseason = getShowPreseason();

    const games = events
        .map(event => parseEvent(event, team))
        .filter(game => game !== null)
        .sort((a, b) => a.date - b.date);

    // Filter to games within the next 30 days and not yet completed (or recently completed)
    const upcoming = games.filter(g => {
        const isUpcoming = !g.isCompleted || g.date > new Date(now - 2*60*60*1000);
        const isWithinRange = g.date <= thirtyDaysFromNow;

        // Filter out preseason games if setting is off
        const isPreseason = g.seasonLabel && (
            g.seasonLabel === 'Preseason' ||
            g.seasonLabel === 'Spring Training'
        );
        const passesPreseasonFilter = showPreseason || !isPreseason;

        return isUpcoming && isWithinRange && passesPreseasonFilter;
    });

    // Only show future games (or games in progress)
    const futureGames = upcoming.filter(g => g.date > new Date(now - 2*60*60*1000));

    return {
        team,
        games: futureGames.slice(0, GAMES_TO_SHOW)
    };
}

// Format date for display
function formatDate(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) {
        return 'Today, ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (isTomorrow) {
        return 'Tomorrow, ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
}

// Render a single team's card
function renderTeamCard(teamData) {
    const { team, games, error } = teamData;

    let gamesHtml;
    if (error) {
        gamesHtml = `<div class="no-games">Error loading schedule</div>`;
    } else if (games.length === 0) {
        gamesHtml = `<div class="no-games">No upcoming games</div>`;
    } else {
        gamesHtml = games.map(game => {
            const homeAway = game.isHome ? 'vs' : '@';
            let resultHtml = '';
            let seasonLabelHtml = '';
            const mustWatch = isMustWatch(game.id);

            if (game.isCompleted && game.score) {
                const resultText = game.score.winner ? 'W' : 'L';
                resultHtml = `
                    <div class="game-score">
                        ${resultText} ${game.score.us}-${game.score.them}
                    </div>
                `;
            }

            if (game.seasonLabel) {
                seasonLabelHtml = `<span class="season-label">${game.seasonLabel}</span>`;
            }

            const isDisabled = watchPartyMode ? 'disabled' : '';
            const mustWatchHtml = !game.isCompleted ? `
                <label class="must-watch-label ${mustWatch ? 'checked' : ''} ${watchPartyMode ? 'watch-party-disabled' : ''}">
                    <input type="checkbox"
                           class="must-watch-checkbox"
                           data-game-id="${game.id}"
                           ${mustWatch ? 'checked' : ''}
                           ${isDisabled}>
                    <span class="must-watch-icon">${mustWatch ? '★' : '☆'}</span>
                </label>
            ` : '';

            const opponentLogoHtml = game.opponentLogo
                ? `<img src="${game.opponentLogo}" alt="" class="opponent-logo">`
                : '';

            return `
                <div class="game ${game.isCompleted ? 'completed' : ''} ${game.seasonLabel ? 'preseason' : ''} ${mustWatch ? 'must-watch' : ''}">
                    <div class="game-header">
                        <div class="game-date">${formatDate(game.date)} ${seasonLabelHtml}</div>
                        ${mustWatchHtml}
                    </div>
                    <div class="game-matchup">${homeAway} ${opponentLogoHtml} ${game.opponent}</div>
                    ${resultHtml}
                    ${!game.isCompleted ? `<span class="game-channel">${game.channel}</span>` : ''}
                </div>
            `;
        }).join('');
    }

    // Use team's dynamic color if available, fall back to league class
    const headerStyle = team.color ? `style="background-color: ${team.color}"` : '';
    const headerClass = team.color ? 'team-header' : `team-header ${team.league}`;

    return `
        <div class="team-card">
            <div class="${headerClass}" ${headerStyle}>
                <img src="${team.logo}" alt="${team.name}" class="team-logo">
                <span class="team-name">${team.name}</span>
            </div>
            <div class="games-list">
                ${gamesHtml}
            </div>
        </div>
    `;
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
    // Invalidate localStorage caches at start of each load cycle
    // This ensures fresh data on manual refresh or auto-refresh
    invalidateAppCache();

    const container = document.getElementById('schedules');
    const updateTime = document.getElementById('update-time');

    // Check for Watch Party mode (session or URL)
    if (watchPartyMode === null) {
        watchPartyMode = getActiveWatchParty();
    }

    // Check if this is a refresh (content already exists) vs initial load
    const isRefresh = container.querySelector('.team-card') !== null;
    if (isRefresh) {
        showRefreshIndicator();
    } else {
        // Show loading state only on initial load
        container.innerHTML = '<p class="loading">Loading schedules...</p>';
    }

    try {
        // Track errors for each category
        const errors = [];

        // Use watch party teams if in shared mode, otherwise use favorites
        let myTeams;
        if (watchPartyMode && watchPartyMode.teams) {
            // New format: teams are full objects; old format: parseWatchPartyTeams handles both
            myTeams = getWatchPartyTeams(watchPartyMode);
            if (myTeams.length === 0) {
                // Fallback for old format links
                myTeams = parseWatchPartyTeams(watchPartyMode.teams, DEFAULT_TEAMS.concat(getFavoriteTeams()));
            }
        } else {
            myTeams = getFavoriteTeams();
        }
        const gamePromises = myTeams.map(team => fetchTeamGames(team));
        const bigGamesPromise = fetchBigGames();

        const [teamGames, bigGamesResult] = await Promise.all([
            Promise.all(gamePromises),
            bigGamesPromise
        ]);

        // Check for team fetch errors
        for (const teamData of teamGames) {
            if (teamData.error) {
                errors.push(`${teamData.team.name} schedule may be incomplete`);
            }
        }

        // Check for big games fetch error
        if (bigGamesResult.error) {
            errors.push('Big Games data may be incomplete');
        }

        // Parse the games from each team
        const parsedSchedules = teamGames.map(parseGames);

        // Collect all game IDs for cleanup
        const allGameIds = [];
        for (const schedule of parsedSchedules) {
            for (const game of schedule.games) {
                allGameIds.push(game.id);
            }
        }
        for (const game of bigGamesResult.games) {
            allGameIds.push(game.id);
        }

        // Clean up old Must Watch IDs
        cleanupOldMustWatch(allGameIds);

        // Filter big games to next 7 days only
        const now = new Date();
        const sevenDaysFromNow = new Date(now);
        sevenDaysFromNow.setDate(now.getDate() + 7);
        const next7DaysBigGames = bigGamesResult.games.filter(g => g.date <= sevenDaysFromNow);

        // Render team cards in left columns, big games in right column
        const teamCardsHtml = parsedSchedules.map(renderTeamCard).join('');
        const bigGamesHtml = renderBigGamesCard(next7DaysBigGames);
        const errorHtml = renderErrorFooter(errors);

        // Watch party banner (render in dedicated container, not inside grid)
        const bannerContainer = document.getElementById('watch-party-banner-container');
        if (bannerContainer) {
            bannerContainer.innerHTML = watchPartyMode
                ? `<div class="watch-party-banner">Viewing shared Watch Party<a href="index.html" onclick="clearWatchPartySession(); window.location.href='index.html'; return false;">View your own</a></div>`
                : '';
        }

        container.innerHTML = `
            <div class="teams-column">
                <h3 class="column-header">Next Month</h3>
                ${teamCardsHtml}
            </div>
            <div class="big-games-column">
                <h3 class="column-header">Next Week</h3>
                ${bigGamesHtml}
            </div>
            ${errorHtml}
        `;

        // Update timestamp
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
    // Load schedules immediately
    loadSchedules();

    // Handle must-watch checkbox clicks (event delegation)
    document.getElementById('schedules').addEventListener('change', (e) => {
        if (e.target.classList.contains('must-watch-checkbox')) {
            const gameId = e.target.dataset.gameId;
            toggleMustWatch(gameId);
        }
    });

    // Set up auto-refresh
    setInterval(loadSchedules, REFRESH_INTERVAL);

    // Manual refresh button clears cache and reloads
    document.getElementById('manual-refresh-btn').addEventListener('click', () => {
        clearAllCache();
        loadSchedules();
    });

    // Share button generates URL and copies to clipboard
    // Always shares YOUR settings (not watch party's)
    document.getElementById('share-btn').addEventListener('click', async () => {
        const teams = getFavoriteTeams();
        const bigGameSettings = getBigGameSettings();
        const showPreseason = getShowPreseason();
        // Get local must watch directly (bypass watch party check)
        let mustWatch = [];
        try {
            const saved = localStorage.getItem(MUST_WATCH_KEY);
            mustWatch = saved ? JSON.parse(saved) : [];
        } catch (e) { /* ignore */ }

        const url = generateWatchPartyURL(teams, bigGameSettings, showPreseason, mustWatch);
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
