// Shared constants and functions for Sports Tracker

// ============================================
// Fetch with Timeout Helper
// ============================================

// Wraps fetch() with an AbortController timeout to prevent indefinite hangs
// Default timeout: 10 seconds
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeout}ms: ${url}`);
        }
        throw error;
    }
}

// ============================================
// Team Level Constants
// ============================================

const TEAM_LEVELS = {
    TOP_TIER: 'top-tier',
    FAVORITE: 'favorite',
    THINKIN_SUPEY: 'thinkin-supey',    // favorite + top tier
    YA_NEVER_KNOW: 'ya-never-know'     // favorite + NOT top tier
};

// ============================================
// Game Category Constants
// ============================================

const GAME_CATEGORIES = {
    ROB_LOWE: 'rob-lowe',              // TT vs TT (neither is favorite)
    PLAYOFF_PREVIEW: 'playoff-preview', // TT vs TS (top tier vs your top-tier favorite)
    MEASURING_STICK: 'measuring-stick', // TT vs YNK
    BEAT_EM_OFF: 'beat-em-off',        // TS/YNK vs R
    HOUSE_DIVIDED: 'house-divided'     // two favorites
};

// ============================================
// Competition Thresholds Config (expandable)
// ============================================

const TOP_TIER_THRESHOLDS = {
    'premier-league': {
        type: 'points-from-position',
        position: 5,
        offset: 3  // existing threshold
    },
    'champions-league': null,  // uses PL top tier
    'fa-cup': null,            // uses PL top tier
    'league-cup': null,        // uses PL top tier
    'nba': {
        type: 'top-n-by-conference-record',
        topN: 6  // top 6 by wins in each conference
    },
    'nhl': {
        type: 'top-n-by-conference-record',
        topN: 8  // top 8 by wins in each conference
    },
    'nfl': null,  // future
    'mlb': null   // future
};

// Soccer competitions that inherit PL top tier status
const SOCCER_COMPETITIONS = ['premier-league', 'champions-league', 'fa-cup', 'league-cup'];

// Standings API URLs
const STANDINGS_URLS = {
    'premier-league': 'https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings',
    'nba': 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
    'nhl': 'https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings'
};

// ============================================
// Big Game Settings (localStorage)
// ============================================

const BIG_GAME_SETTINGS_KEY = 'sports-tracker-big-game-settings';

// ============================================
// Module-level Cache for localStorage Reads
// ============================================
// These caches prevent repeated JSON.parse() calls during render cycles.
// Invalidated when saving new values.

let _bigGameSettingsCache = null;
let _showPreseasonCache = null;

// Clear all module-level caches (call at start of loadSchedules or when settings change)
function invalidateSettingsCache() {
    _bigGameSettingsCache = null;
    _showPreseasonCache = null;
}

// Schema version - increment when adding new categories or competitions
// Version 1: Initial per-competition settings
// Version 2: Added 'playoff-preview' category
// Version 3: Champions League uses unique CL-specific categories
const SETTINGS_SCHEMA_VERSION = 3;

// Competition keys to display names mapping
const COMPETITIONS = {
    'premier-league': 'Premier League',
    'champions-league': 'Champions League',
    'fa-cup': 'FA Cup',
    'league-cup': 'League Cup',
    'nba': 'NBA',
    'nhl': 'NHL'
};

// Soccer leagues use "Home v. Away" format; others use "Away @ Home"
const SOCCER_LEAGUES = ['premier-league', 'champions-league', 'fa-cup', 'league-cup'];

function isSoccerLeague(league) {
    return SOCCER_LEAGUES.includes(league);
}

// All game categories (standard - used by most competitions)
const ALL_CATEGORIES = ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'];

// Champions League specific categories (replaces standard categories for CL)
const CL_CATEGORIES = ['cl-favorite', 'cl-top-english', 'cl-other-english', 'cl-english-derby'];

// Default: all categories enabled for all competitions
// Note: Champions League uses CL-specific categories, others use standard ALL_CATEGORIES
const DEFAULT_BIG_GAME_SETTINGS = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    perCompetition: {
        'premier-league': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'champions-league': ['cl-favorite', 'cl-top-english', 'cl-other-english', 'cl-english-derby'],
        'fa-cup': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'league-cup': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'nba': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'nhl': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided']
    }
};

// Get big game settings from localStorage with migration support
// In watch party mode, returns the shared big game settings
// Uses module-level cache to avoid repeated JSON.parse() calls during render
function getBigGameSettings() {
    // Check for active watch party first
    const watchParty = getWatchPartySession();
    if (watchParty && watchParty.bigGames) {
        // Return watch party big game settings in expected format
        return {
            schemaVersion: SETTINGS_SCHEMA_VERSION,
            perCompetition: watchParty.bigGames
        };
    }

    // Return cached value if available
    if (_bigGameSettingsCache !== null) {
        return _bigGameSettingsCache;
    }

    try {
        const saved = localStorage.getItem(BIG_GAME_SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);

            // Migration: if old format (enabledCategories at root), migrate to perCompetition
            if (parsed.enabledCategories && !parsed.perCompetition) {
                const migratedSettings = {
                    schemaVersion: SETTINGS_SCHEMA_VERSION,
                    perCompetition: {}
                };
                // Apply old enabledCategories to ALL competitions
                for (const competition of Object.keys(COMPETITIONS)) {
                    migratedSettings.perCompetition[competition] = [...parsed.enabledCategories];
                }
                // Save migrated settings (also updates cache via saveBigGameSettings)
                saveBigGameSettings(migratedSettings);
                _bigGameSettingsCache = migratedSettings;
                return migratedSettings;
            }

            // Only run migrations if schema version is outdated
            if (parsed.perCompetition) {
                const savedVersion = parsed.schemaVersion || 1;
                let needsSave = false;

                // Ensure all competitions exist (add new competitions with appropriate categories)
                for (const competition of Object.keys(COMPETITIONS)) {
                    if (!parsed.perCompetition[competition]) {
                        // Champions League uses its own category set
                        parsed.perCompetition[competition] = competition === 'champions-league'
                            ? [...CL_CATEGORIES]
                            : [...ALL_CATEGORIES];
                        needsSave = true;
                    }
                }

                // Version-based migrations for new categories
                if (savedVersion < 2) {
                    // Version 2 added 'playoff-preview' - add to all competitions
                    for (const competition of Object.keys(COMPETITIONS)) {
                        if (!parsed.perCompetition[competition].includes('playoff-preview')) {
                            parsed.perCompetition[competition].push('playoff-preview');
                        }
                    }
                    needsSave = true;
                }

                if (savedVersion < 3) {
                    // Version 3: Champions League uses unique CL-specific categories
                    // Reset CL to new category scheme
                    parsed.perCompetition['champions-league'] = [...CL_CATEGORIES];
                    needsSave = true;
                }

                // Update version and save if migrations ran
                if (needsSave || savedVersion < SETTINGS_SCHEMA_VERSION) {
                    parsed.schemaVersion = SETTINGS_SCHEMA_VERSION;
                    saveBigGameSettings(parsed);
                }

                _bigGameSettingsCache = parsed;
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading big game settings:', e);
    }
    const defaultCopy = JSON.parse(JSON.stringify(DEFAULT_BIG_GAME_SETTINGS));
    _bigGameSettingsCache = defaultCopy;
    return defaultCopy;
}

// Save big game settings to localStorage
function saveBigGameSettings(settings) {
    _bigGameSettingsCache = settings;  // Update cache
    localStorage.setItem(BIG_GAME_SETTINGS_KEY, JSON.stringify(settings));
}

// Check if a game category is enabled for a specific competition
function isCategoryEnabledForCompetition(category, competition) {
    const settings = getBigGameSettings();
    const competitionCategories = settings.perCompetition[competition];
    if (!competitionCategories) return false;
    return competitionCategories.includes(category);
}

// Compute isBigGame based on gameCategory and competition-specific settings
function computeIsBigGameForCompetition(gameCategory, competition) {
    if (!gameCategory || !competition) return false;
    return isCategoryEnabledForCompetition(gameCategory, competition);
}

// Legacy function for backwards compatibility (checks all competitions)
function isCategoryEnabled(category) {
    const settings = getBigGameSettings();
    // Return true if enabled in ANY competition
    for (const competition of Object.keys(COMPETITIONS)) {
        if (settings.perCompetition[competition]?.includes(category)) {
            return true;
        }
    }
    return false;
}

// Legacy function - now uses competition-aware logic
// Note: callers should migrate to computeIsBigGameForCompetition
function computeIsBigGame(gameCategory) {
    if (!gameCategory) return false;
    return isCategoryEnabled(gameCategory);
}

// ============================================
// Team Categorization Functions
// ============================================

// Categorize a single team based on top tier status and favorite status
function categorizeTeam(teamId, topTierTeamIds, favoriteTeamIds) {
    // Convert to string for comparison (ESPN API may return numbers or strings)
    const teamIdStr = String(teamId);
    const isTopTier = topTierTeamIds.map(String).includes(teamIdStr);
    const isFavorite = favoriteTeamIds.map(String).includes(teamIdStr);

    if (isFavorite && isTopTier) {
        return TEAM_LEVELS.THINKIN_SUPEY;
    } else if (isFavorite && !isTopTier) {
        return TEAM_LEVELS.YA_NEVER_KNOW;
    } else if (isTopTier) {
        return TEAM_LEVELS.TOP_TIER;
    }
    return null;  // regular team, no special category
}

// ============================================
// Game Categorization Function
// ============================================

// Categorize a game based on the two teams' categories
function categorizeGame(homeTeamCategory, awayTeamCategory) {
    const isHomeThinkinSupey = homeTeamCategory === TEAM_LEVELS.THINKIN_SUPEY;
    const isAwayThinkinSupey = awayTeamCategory === TEAM_LEVELS.THINKIN_SUPEY;
    const isHomeYaNeverKnow = homeTeamCategory === TEAM_LEVELS.YA_NEVER_KNOW;
    const isAwayYaNeverKnow = awayTeamCategory === TEAM_LEVELS.YA_NEVER_KNOW;
    const isHomeFavorite = isHomeThinkinSupey || isHomeYaNeverKnow;
    const isAwayFavorite = isAwayThinkinSupey || isAwayYaNeverKnow;
    // Note: TOP_TIER here means non-favorite top tier only
    const isHomeTopTierOnly = homeTeamCategory === TEAM_LEVELS.TOP_TIER;
    const isAwayTopTierOnly = awayTeamCategory === TEAM_LEVELS.TOP_TIER;

    // House Divided: any two favorites playing each other (highest priority)
    if (isHomeFavorite && isAwayFavorite) {
        return GAME_CATEGORIES.HOUSE_DIVIDED;
    }

    // Playoff Preview: Top Tier (non-favorite) vs Thinkin Supey
    if ((isHomeTopTierOnly && isAwayThinkinSupey) || (isAwayTopTierOnly && isHomeThinkinSupey)) {
        return GAME_CATEGORIES.PLAYOFF_PREVIEW;
    }

    // Rob Lowe: Two top tiers (neither is a favorite)
    if (isHomeTopTierOnly && isAwayTopTierOnly) {
        return GAME_CATEGORIES.ROB_LOWE;
    }

    // Measuring Stick: Ya Never Know vs Top Tier (non-favorite)
    if ((isHomeYaNeverKnow && isAwayTopTierOnly) || (isAwayYaNeverKnow && isHomeTopTierOnly)) {
        return GAME_CATEGORIES.MEASURING_STICK;
    }

    // Beat Em Off: favorite vs regular team
    const isHomeRegular = !homeTeamCategory;
    const isAwayRegular = !awayTeamCategory;
    if (isHomeFavorite && isAwayRegular) {
        return GAME_CATEGORIES.BEAT_EM_OFF;
    }
    if (isAwayFavorite && isHomeRegular) {
        return GAME_CATEGORIES.BEAT_EM_OFF;
    }

    return null;  // regular game, no special category
}

// ============================================
// Helper: Build Team Category Map
// ============================================

// Build a map of teamId -> category for all teams
function buildTeamCategoryMap(allTeamIds, topTierTeamIds, favoriteTeamIds) {
    const categoryMap = {};
    for (const teamId of allTeamIds) {
        categoryMap[teamId] = categorizeTeam(teamId, topTierTeamIds, favoriteTeamIds);
    }
    return categoryMap;
}

// ============================================
// Game Category Display Names
// ============================================

const GAME_CATEGORY_DISPLAY_NAMES = {
    [GAME_CATEGORIES.ROB_LOWE]: 'Rob Lowe',
    [GAME_CATEGORIES.PLAYOFF_PREVIEW]: 'Playoff Preview',
    [GAME_CATEGORIES.MEASURING_STICK]: 'Measuring Stick',
    [GAME_CATEGORIES.BEAT_EM_OFF]: 'Beat Em Off',
    [GAME_CATEGORIES.HOUSE_DIVIDED]: 'House Divided'
};

const GAME_CATEGORY_DESCRIPTIONS = {
    [GAME_CATEGORIES.ROB_LOWE]: 'Two top tier teams (not your favorites)',
    [GAME_CATEGORIES.PLAYOFF_PREVIEW]: 'Top tier vs your top-tier favorite',
    [GAME_CATEGORIES.MEASURING_STICK]: 'Your underdog favorites vs top tier opponents',
    [GAME_CATEGORIES.BEAT_EM_OFF]: 'Your favorites vs regular teams',
    [GAME_CATEGORIES.HOUSE_DIVIDED]: 'Two of your favorites playing each other'
};

// Champions League specific category display names
const CL_CATEGORY_DISPLAY_NAMES = {
    'cl-favorite': 'Favorite Team',
    'cl-top-english': 'Top English',
    'cl-other-english': 'Other English',
    'cl-english-derby': 'English Derby'
};

const CL_CATEGORY_DESCRIPTIONS = {
    'cl-favorite': 'Champions League games involving one of your favorite teams',
    'cl-top-english': 'Games involving a top-tier Premier League team',
    'cl-other-english': 'Games involving a non-top-tier Premier League team',
    'cl-english-derby': 'Two English teams facing off'
};

// Get display name for any game category (standard or CL-specific)
function getGameCategoryDisplayName(category) {
    return GAME_CATEGORY_DISPLAY_NAMES[category] || CL_CATEGORY_DISPLAY_NAMES[category] || category;
}

// Get description for any game category (standard or CL-specific)
function getGameCategoryDescription(category) {
    return GAME_CATEGORY_DESCRIPTIONS[category] || CL_CATEGORY_DESCRIPTIONS[category] || '';
}

// Team Category Display Labels (for hover tooltips)
const TEAM_CATEGORY_LABELS = {
    [TEAM_LEVELS.THINKIN_SUPEY]: "Thinkin' Supey",
    [TEAM_LEVELS.YA_NEVER_KNOW]: "Ya Never Know",
    [TEAM_LEVELS.TOP_TIER]: "Top Tier",
    [TEAM_LEVELS.FAVORITE]: "Favorite"
};

// Get display label for a team category (returns "Normie" for regular teams)
function getCategoryLabel(category) {
    return TEAM_CATEGORY_LABELS[category] || "Normie";
}

// ============================================
// Preseason Settings (localStorage)
// ============================================

const PRESEASON_SETTINGS_KEY = 'sports-tracker-show-preseason';

// Get preseason visibility setting (default: true - show preseason games)
// Uses module-level cache to avoid repeated localStorage reads during render
function getShowPreseason() {
    // Check for active watch party first
    const watchParty = getWatchPartySession();
    if (watchParty && watchParty.showPreseason !== undefined) {
        return watchParty.showPreseason;
    }

    // Return cached value if available
    if (_showPreseasonCache !== null) {
        return _showPreseasonCache;
    }

    const saved = localStorage.getItem(PRESEASON_SETTINGS_KEY);
    _showPreseasonCache = saved === null ? true : saved === 'true';
    return _showPreseasonCache;
}

// Set preseason visibility setting
function setShowPreseason(value) {
    _showPreseasonCache = value;  // Update cache
    localStorage.setItem(PRESEASON_SETTINGS_KEY, String(value));
}

// ============================================
// API Response Cache (24-hour TTL)
// ============================================

const CACHE_KEY_PREFIX = 'sports-tracker-cache-';
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Get cached data if still valid
function getCached(key) {
    try {
        const cached = localStorage.getItem(CACHE_KEY_PREFIX + key);
        if (!cached) return null;

        const entry = JSON.parse(cached);
        const age = Date.now() - entry.timestamp;

        if (age < (entry.ttl || DEFAULT_TTL)) {
            return entry.data;
        }

        // Expired, remove it
        localStorage.removeItem(CACHE_KEY_PREFIX + key);
        return null;
    } catch (e) {
        console.error('Cache read error:', e);
        return null;
    }
}

// Set data in cache with TTL
function setCache(key, data, ttl = DEFAULT_TTL) {
    try {
        const entry = { timestamp: Date.now(), data: data, ttl: ttl };
        localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
    } catch (e) {
        console.error('Cache write error:', e);
    }
}

// Clear all cache entries
function clearAllCache() {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
            localStorage.removeItem(key);
        }
    }
}

// ============================================
// Standings Fetch Functions (shared across pages)
// ============================================
// These functions are used by both app.js and calendar.js
// Sharing them ensures consistent cache keys across pages

// Fetch NBA top tier teams (top 6 by wins in each conference)
async function fetchNBATopTierTeams() {
    const cacheKey = 'standings-nba';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetchWithTimeout(STANDINGS_URLS['nba']);
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
        const response = await fetchWithTimeout(STANDINGS_URLS['nhl']);
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

// ============================================
// Watch Party Sharing (URL encoding)
// ============================================

// Encode watch party settings to base64 URL param
function encodeWatchParty(settings) {
    try {
        return btoa(JSON.stringify(settings));
    } catch (e) {
        console.error('Error encoding watch party:', e);
        return null;
    }
}

// Decode watch party settings from base64 URL param
function decodeWatchParty(encoded) {
    try {
        return JSON.parse(atob(encoded));
    } catch (e) {
        console.error('Error decoding watch party:', e);
        return null;
    }
}

// Get watch party settings from URL if present
function getWatchPartyFromURL() {
    const params = new URLSearchParams(window.location.search);
    const wp = params.get('wp');
    return wp ? decodeWatchParty(wp) : null;
}

// Generate shareable URL with current settings
function generateWatchPartyURL(teams, bigGameSettings, showPreseason, mustWatch) {
    const settings = {
        // Include full team objects for recipient to use directly
        teams: teams.map(t => ({
            name: t.name,
            id: t.id,
            league: t.league,
            sport: t.sport,
            espnPath: t.espnPath,
            logo: t.logo
        })),
        bigGames: bigGameSettings.perCompetition,
        showPreseason: showPreseason,
        mustWatch: mustWatch || []
    };
    const encoded = encodeWatchParty(settings);
    if (!encoded) return null;

    const url = new URL(window.location.href);
    url.search = `?wp=${encoded}`;
    return url.toString();
}

// Get teams from watch party (handles both old string format and new object format)
function getWatchPartyTeams(watchParty) {
    if (!watchParty || !watchParty.teams) return [];

    // Check if teams are already full objects (new format)
    if (watchParty.teams.length > 0 && typeof watchParty.teams[0] === 'object') {
        return watchParty.teams;
    }

    // Old format: ["soccer-368", "nhl-20"] - can't resolve without lookup
    // Return empty array (old links won't work fully)
    return [];
}

// Parse watch party teams back to team objects (DEPRECATED - kept for backwards compatibility)
function parseWatchPartyTeams(encodedTeams, allKnownTeams) {
    // encodedTeams: ["soccer-368", "nhl-20"] OR full team objects
    // If already objects, return as-is
    if (encodedTeams.length > 0 && typeof encodedTeams[0] === 'object') {
        return encodedTeams;
    }

    // Old format - try to match against known team data
    const result = [];
    for (const encoded of encodedTeams) {
        const [sport, id] = encoded.split('-');
        const team = allKnownTeams.find(t => t.sport === sport && t.id === id);
        if (team) {
            result.push(team);
        }
    }
    return result;
}

// ============================================
// Watch Party Session Persistence
// ============================================

const WATCH_PARTY_SESSION_KEY = 'sports-tracker-watch-party';

// Store watch party in sessionStorage (persists across page navigation)
function setWatchPartySession(settings) {
    try {
        sessionStorage.setItem(WATCH_PARTY_SESSION_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Error saving watch party session:', e);
    }
}

// Get watch party from sessionStorage
function getWatchPartySession() {
    try {
        const saved = sessionStorage.getItem(WATCH_PARTY_SESSION_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        console.error('Error loading watch party session:', e);
        return null;
    }
}

// Clear watch party session (return to own view)
function clearWatchPartySession() {
    sessionStorage.removeItem(WATCH_PARTY_SESSION_KEY);
}

// Get active watch party (checks session first, then URL, stores URL params in session)
function getActiveWatchParty() {
    // First check sessionStorage
    const sessionWp = getWatchPartySession();
    if (sessionWp) {
        return sessionWp;
    }

    // Then check URL params
    const urlWp = getWatchPartyFromURL();
    if (urlWp) {
        // Store in session for cross-page persistence
        setWatchPartySession(urlWp);
        return urlWp;
    }

    return null;
}
