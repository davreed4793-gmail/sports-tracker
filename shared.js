// Shared constants and functions for Sports Tracker

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

// Schema version - increment when adding new categories or competitions
// Version 1: Initial per-competition settings
// Version 2: Added 'playoff-preview' category
const SETTINGS_SCHEMA_VERSION = 2;

// Competition keys to display names mapping
const COMPETITIONS = {
    'premier-league': 'Premier League',
    'champions-league': 'Champions League',
    'fa-cup': 'FA Cup',
    'league-cup': 'League Cup',
    'nba': 'NBA',
    'nhl': 'NHL'
};

// All game categories
const ALL_CATEGORIES = ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'];

// Default: all categories enabled for all competitions
const DEFAULT_BIG_GAME_SETTINGS = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    perCompetition: {
        'premier-league': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'champions-league': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'fa-cup': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'league-cup': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'nba': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'nhl': ['rob-lowe', 'playoff-preview', 'measuring-stick', 'beat-em-off', 'house-divided']
    }
};

// Get big game settings from localStorage with migration support
function getBigGameSettings() {
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
                // Save migrated settings
                saveBigGameSettings(migratedSettings);
                return migratedSettings;
            }

            // Only run migrations if schema version is outdated
            if (parsed.perCompetition) {
                const savedVersion = parsed.schemaVersion || 1;
                let needsSave = false;

                // Ensure all competitions exist (add new competitions with all categories)
                for (const competition of Object.keys(COMPETITIONS)) {
                    if (!parsed.perCompetition[competition]) {
                        parsed.perCompetition[competition] = [...ALL_CATEGORIES];
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

                // Update version and save if migrations ran
                if (needsSave || savedVersion < SETTINGS_SCHEMA_VERSION) {
                    parsed.schemaVersion = SETTINGS_SCHEMA_VERSION;
                    saveBigGameSettings(parsed);
                }

                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading big game settings:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_BIG_GAME_SETTINGS));
}

// Save big game settings to localStorage
function saveBigGameSettings(settings) {
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
    [GAME_CATEGORIES.ROB_LOWE]: 'Rob Lowe Games',
    [GAME_CATEGORIES.PLAYOFF_PREVIEW]: 'Playoff Preview',
    [GAME_CATEGORIES.MEASURING_STICK]: 'Measuring Stick Games',
    [GAME_CATEGORIES.BEAT_EM_OFF]: 'Beat Em Off Games',
    [GAME_CATEGORIES.HOUSE_DIVIDED]: 'House Divided Games'
};

const GAME_CATEGORY_DESCRIPTIONS = {
    [GAME_CATEGORIES.ROB_LOWE]: 'Two top tier teams (not your favorites)',
    [GAME_CATEGORIES.PLAYOFF_PREVIEW]: 'Top tier vs your top-tier favorite',
    [GAME_CATEGORIES.MEASURING_STICK]: 'Your underdog favorites vs top tier opponents',
    [GAME_CATEGORIES.BEAT_EM_OFF]: 'Your favorites vs regular teams',
    [GAME_CATEGORIES.HOUSE_DIVIDED]: 'Two of your favorites playing each other'
};

// ============================================
// Preseason Settings (localStorage)
// ============================================

const PRESEASON_SETTINGS_KEY = 'sports-tracker-show-preseason';

// Get preseason visibility setting (default: true - show preseason games)
function getShowPreseason() {
    const saved = localStorage.getItem(PRESEASON_SETTINGS_KEY);
    return saved === null ? true : saved === 'true';
}

// Set preseason visibility setting
function setShowPreseason(value) {
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
