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
    ROB_LOWE: 'rob-lowe',              // two top tier teams (Thinkin Supey counts as top tier)
    MEASURING_STICK: 'measuring-stick', // Ya Never Know vs top tier
    BEAT_EM_OFF: 'beat-em-off',        // favorite (Thinkin Supey or Ya Never Know) vs regular team
    HOUSE_DIVIDED: 'house-divided'     // any two favorites playing each other
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
const ALL_CATEGORIES = ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided'];

// Default: all categories enabled for all competitions
const DEFAULT_BIG_GAME_SETTINGS = {
    perCompetition: {
        'premier-league': ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'champions-league': ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'fa-cup': ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'league-cup': ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'nba': ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided'],
        'nhl': ['rob-lowe', 'measuring-stick', 'beat-em-off', 'house-divided']
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

            // Ensure all competitions exist (in case new ones were added)
            if (parsed.perCompetition) {
                for (const competition of Object.keys(COMPETITIONS)) {
                    if (!parsed.perCompetition[competition]) {
                        parsed.perCompetition[competition] = [...ALL_CATEGORIES];
                    }
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
    const isTopTier = topTierTeamIds.includes(teamId);
    const isFavorite = favoriteTeamIds.includes(teamId);

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
    const isHomeTopTier = homeTeamCategory === TEAM_LEVELS.TOP_TIER || isHomeThinkinSupey;
    const isAwayTopTier = awayTeamCategory === TEAM_LEVELS.TOP_TIER || isAwayThinkinSupey;

    // House Divided: any two favorites playing each other (highest priority for favorites)
    if (isHomeFavorite && isAwayFavorite) {
        return GAME_CATEGORIES.HOUSE_DIVIDED;
    }

    // Rob Lowe: two top tier teams (Thinkin Supey counts as top tier)
    if (isHomeTopTier && isAwayTopTier) {
        return GAME_CATEGORIES.ROB_LOWE;
    }

    // Measuring Stick: Ya Never Know vs top tier (non-favorite)
    if ((isHomeYaNeverKnow && isAwayTopTier) || (isAwayYaNeverKnow && isHomeTopTier)) {
        return GAME_CATEGORIES.MEASURING_STICK;
    }

    // Beat Em Off: favorite (Thinkin Supey OR Ya Never Know) vs regular team
    if (isHomeFavorite && !isAwayTopTier && !isAwayFavorite) {
        return GAME_CATEGORIES.BEAT_EM_OFF;
    }
    if (isAwayFavorite && !isHomeTopTier && !isHomeFavorite) {
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
    [GAME_CATEGORIES.MEASURING_STICK]: 'Measuring Stick Games',
    [GAME_CATEGORIES.BEAT_EM_OFF]: 'Beat Em Off Games',
    [GAME_CATEGORIES.HOUSE_DIVIDED]: 'House Divided Games'
};

const GAME_CATEGORY_DESCRIPTIONS = {
    [GAME_CATEGORIES.ROB_LOWE]: 'Two top tier teams facing off',
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
