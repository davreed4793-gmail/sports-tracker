// Settings page - Team picker functionality

// localStorage key for favorite teams
const FAVORITE_TEAMS_KEY = 'sports-tracker-favorite-teams';
const MAX_TEAMS = 10;

// Store all teams for search functionality
let allTeams = [];

// Default teams (used if no teams saved)
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

// League configurations for fetching team lists
const LEAGUES = {
    'premier-league': {
        name: 'Premier League',
        sport: 'soccer',
        espnPath: 'soccer/eng.1',
        teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams',
        logoTemplate: 'https://a.espncdn.com/i/teamlogos/soccer/500/{id}.png'
    },
    'nfl': {
        name: 'NFL',
        sport: 'football',
        espnPath: 'football/nfl',
        teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
        logoTemplate: 'https://a.espncdn.com/i/teamlogos/nfl/500/{abbrev}.png'
    },
    'nhl': {
        name: 'NHL',
        sport: 'hockey',
        espnPath: 'hockey/nhl',
        teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams',
        logoTemplate: 'https://a.espncdn.com/i/teamlogos/nhl/500/{abbrev}.png'
    },
    'nba': {
        name: 'NBA',
        sport: 'basketball',
        espnPath: 'basketball/nba',
        teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
        logoTemplate: 'https://a.espncdn.com/i/teamlogos/nba/500/{abbrev}.png'
    },
    'mlb': {
        name: 'MLB',
        sport: 'baseball',
        espnPath: 'baseball/mlb',
        teamsUrl: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams',
        logoTemplate: 'https://a.espncdn.com/i/teamlogos/mlb/500/{abbrev}.png'
    }
};

// Get saved favorite teams from localStorage
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

// Save favorite teams to localStorage
function saveFavoriteTeams(teams) {
    localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(teams));
}

// Add a team to favorites
function addFavoriteTeam(team) {
    const teams = getFavoriteTeams();
    if (teams.length >= MAX_TEAMS) {
        alert(`You can only have up to ${MAX_TEAMS} favorite teams. Remove one first.`);
        return false;
    }
    if (teams.some(t => t.id === team.id && t.league === team.league)) {
        return false; // Already added
    }
    teams.push(team);
    saveFavoriteTeams(teams);
    return true;
}

// Remove a team from favorites
function removeFavoriteTeam(teamId, league) {
    const teams = getFavoriteTeams();
    const filtered = teams.filter(t => !(t.id === teamId && t.league === league));
    saveFavoriteTeams(filtered);
}

// Move a team up or down in the favorites list
function moveFavoriteTeam(teamId, league, direction) {
    const teams = getFavoriteTeams();
    const index = teams.findIndex(t => t.id === teamId && t.league === league);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= teams.length) return;

    // Swap positions
    [teams[index], teams[newIndex]] = [teams[newIndex], teams[index]];
    saveFavoriteTeams(teams);
}

// Check if a team is already a favorite
function isFavorite(teamId, league) {
    const teams = getFavoriteTeams();
    return teams.some(t => t.id === teamId && t.league === league);
}

// Fetch teams for a league from ESPN
async function fetchLeagueTeams(leagueKey) {
    const league = LEAGUES[leagueKey];
    try {
        const response = await fetch(league.teamsUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];

        return teams.map(t => {
            const team = t.team;
            const abbrev = team.abbreviation?.toLowerCase() || '';
            return {
                id: team.id,
                name: team.displayName || team.name,
                abbreviation: abbrev,
                league: leagueKey,
                sport: league.sport,
                espnPath: league.espnPath,
                logo: team.logos?.[0]?.href || league.logoTemplate.replace('{id}', team.id).replace('{abbrev}', abbrev)
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error(`Error fetching ${leagueKey} teams:`, error);
        return [];
    }
}

// Render the selected teams section with up/down reorder buttons
function renderSelectedTeams() {
    const container = document.getElementById('selected-teams');
    const teams = getFavoriteTeams();

    if (teams.length === 0) {
        container.innerHTML = '<p class="no-teams">No teams selected. Add some teams below!</p>';
        return;
    }

    const teamsHtml = teams.map((team, index) => {
        const isFirst = index === 0;
        const isLast = index === teams.length - 1;

        return `
        <div class="selected-team" data-team-id="${team.id}" data-league="${team.league}">
            <img src="${team.logo}" alt="" class="team-logo-small">
            <span class="team-name">${team.name}</span>
            <span class="team-league-badge ${team.league}">${LEAGUES[team.league]?.name || team.league}</span>
            <div class="reorder-buttons">
                <button class="reorder-btn move-up" title="Move up" ${isFirst ? 'disabled' : ''}>&#9650;</button>
                <button class="reorder-btn move-down" title="Move down" ${isLast ? 'disabled' : ''}>&#9660;</button>
            </div>
            <button class="remove-team-btn" title="Remove team">&times;</button>
        </div>
    `;
    }).join('');

    container.innerHTML = teamsHtml;

    // Add click handlers for remove buttons
    container.querySelectorAll('.remove-team-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const teamDiv = e.target.closest('.selected-team');
            const teamId = teamDiv.dataset.teamId;
            const league = teamDiv.dataset.league;
            removeFavoriteTeam(teamId, league);
            renderSelectedTeams();
            updateTeamGridState();
            updateSearchResultsState();
        });
    });

    // Add click handlers for reorder buttons
    container.querySelectorAll('.move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const teamDiv = e.target.closest('.selected-team');
            const teamId = teamDiv.dataset.teamId;
            const league = teamDiv.dataset.league;
            moveFavoriteTeam(teamId, league, 'up');
            renderSelectedTeams();
        });
    });

    container.querySelectorAll('.move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const teamDiv = e.target.closest('.selected-team');
            const teamId = teamDiv.dataset.teamId;
            const league = teamDiv.dataset.league;
            moveFavoriteTeam(teamId, league, 'down');
            renderSelectedTeams();
        });
    });
}

// Render teams for a specific league (with collapsed state)
function renderLeagueTeams(leagueKey, teams) {
    const container = document.getElementById(`teams-${leagueKey}`);

    if (teams.length === 0) {
        container.innerHTML = '<p class="error">Failed to load teams</p>';
        return;
    }

    const teamsHtml = teams.map(team => {
        const isSelected = isFavorite(team.id, team.league);
        return `
            <button class="team-option ${isSelected ? 'selected' : ''}"
                    data-team-id="${team.id}"
                    data-league="${team.league}"
                    data-team='${JSON.stringify(team).replace(/'/g, "&#39;")}'
                    ${isSelected ? 'disabled' : ''}>
                <img src="${team.logo}" alt="" class="team-logo-tiny">
                <span>${team.name}</span>
            </button>
        `;
    }).join('');

    container.innerHTML = teamsHtml;

    // Start collapsed
    container.classList.add('collapsed');

    // Add click handlers
    addTeamOptionClickHandlers(container);
}

// Add click handlers to team option buttons
function addTeamOptionClickHandlers(container) {
    container.querySelectorAll('.team-option:not(.selected)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const teamData = JSON.parse(btn.dataset.team);
            if (addFavoriteTeam(teamData)) {
                btn.classList.add('selected');
                btn.disabled = true;
                renderSelectedTeams();
                updateSearchResultsState();
            }
        });
    });
}

// Update team grid state (after removing a team)
function updateTeamGridState() {
    document.querySelectorAll('.team-grid .team-option').forEach(btn => {
        const teamId = btn.dataset.teamId;
        const league = btn.dataset.league;
        const isSelected = isFavorite(teamId, league);
        btn.classList.toggle('selected', isSelected);
        btn.disabled = isSelected;
    });
}

// Update search results state (after adding/removing a team)
function updateSearchResultsState() {
    document.querySelectorAll('#search-results .team-option').forEach(btn => {
        const teamId = btn.dataset.teamId;
        const league = btn.dataset.league;
        const isSelected = isFavorite(teamId, league);
        btn.classList.toggle('selected', isSelected);
        btn.disabled = isSelected;
    });
}

// Setup collapsible league sections
function setupCollapsibleSections() {
    document.querySelectorAll('.league-section h3').forEach(header => {
        // Add collapse indicator
        const indicator = document.createElement('span');
        indicator.className = 'collapse-indicator';
        indicator.textContent = '\u25B6'; // Right arrow (collapsed)
        header.insertBefore(indicator, header.firstChild);

        // Add click handler
        header.addEventListener('click', () => {
            const section = header.closest('.league-section');
            const grid = section.querySelector('.team-grid');
            const isCollapsed = grid.classList.contains('collapsed');

            if (isCollapsed) {
                grid.classList.remove('collapsed');
                indicator.textContent = '\u25BC'; // Down arrow (expanded)
            } else {
                grid.classList.add('collapsed');
                indicator.textContent = '\u25B6'; // Right arrow (collapsed)
            }
        });
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Filter teams by search query
function filterTeams(query) {
    const searchResults = document.getElementById('search-results');
    const leaguePicker = document.querySelector('.league-picker');

    if (!query.trim()) {
        // No search - hide results, show league sections
        searchResults.style.display = 'none';
        leaguePicker.style.display = 'flex';
        return;
    }

    // Show search results, hide league sections
    searchResults.style.display = 'grid';
    leaguePicker.style.display = 'none';

    const lowerQuery = query.toLowerCase();
    const matches = allTeams.filter(team =>
        team.name.toLowerCase().includes(lowerQuery)
    );

    if (matches.length === 0) {
        searchResults.innerHTML = '<p class="no-results">No teams found</p>';
        return;
    }

    const resultsHtml = matches.map(team => {
        const isSelected = isFavorite(team.id, team.league);
        return `
            <button class="team-option ${isSelected ? 'selected' : ''}"
                    data-team-id="${team.id}"
                    data-league="${team.league}"
                    data-team='${JSON.stringify(team).replace(/'/g, "&#39;")}'
                    ${isSelected ? 'disabled' : ''}>
                <img src="${team.logo}" alt="" class="team-logo-tiny">
                <span>${team.name}</span>
                <span class="team-league-badge ${team.league}">${LEAGUES[team.league]?.name || team.league}</span>
            </button>
        `;
    }).join('');

    searchResults.innerHTML = resultsHtml;

    // Add click handlers to search results
    addTeamOptionClickHandlers(searchResults);
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('team-search');
    const debouncedFilter = debounce(filterTeams, 200);

    searchInput.addEventListener('input', (e) => {
        debouncedFilter(e.target.value);
    });

    // Clear search on Escape
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            filterTeams('');
        }
    });
}

// Initialize big game settings UI with per-competition accordion sections
function initBigGameSettings() {
    const container = document.getElementById('big-game-categories');
    if (!container) return;

    const settings = getBigGameSettings();

    // Generate HTML for each competition section
    let sectionsHtml = '';
    for (const [competitionKey, competitionName] of Object.entries(COMPETITIONS)) {
        const enabledCategories = settings.perCompetition[competitionKey] || [];
        const enabledCount = enabledCategories.length;

        // Generate toggles for each category
        let categoriesHtml = '';
        for (const category of ALL_CATEGORIES) {
            const isChecked = enabledCategories.includes(category);
            const displayName = GAME_CATEGORY_DISPLAY_NAMES[category] || category;
            const description = GAME_CATEGORY_DESCRIPTIONS[category] || '';

            categoriesHtml += `
                <label class="category-toggle">
                    <input type="checkbox"
                           data-competition="${competitionKey}"
                           data-category="${category}"
                           ${isChecked ? 'checked' : ''}>
                    <div class="category-text">
                        <span class="category-name">${displayName}</span>
                        <span class="category-desc">${description}</span>
                    </div>
                </label>
            `;
        }

        sectionsHtml += `
            <div class="competition-section" data-competition="${competitionKey}">
                <div class="competition-header">
                    <span class="collapse-indicator">&#9654;</span>
                    <span class="competition-name">${competitionName}</span>
                    <span class="enabled-count">${enabledCount}/${ALL_CATEGORIES.length}</span>
                </div>
                <div class="category-toggles collapsed">
                    ${categoriesHtml}
                </div>
            </div>
        `;
    }

    container.innerHTML = sectionsHtml;

    // Add click handlers for competition headers (expand/collapse)
    container.querySelectorAll('.competition-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.competition-section');
            const togglesContainer = section.querySelector('.category-toggles');
            const indicator = header.querySelector('.collapse-indicator');
            const isCollapsed = togglesContainer.classList.contains('collapsed');

            if (isCollapsed) {
                togglesContainer.classList.remove('collapsed');
                indicator.innerHTML = '&#9660;'; // Down arrow
            } else {
                togglesContainer.classList.add('collapsed');
                indicator.innerHTML = '&#9654;'; // Right arrow
            }
        });
    });

    // Add change handlers for checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const competition = checkbox.dataset.competition;
            const category = checkbox.dataset.category;
            const currentSettings = getBigGameSettings();

            if (!currentSettings.perCompetition[competition]) {
                currentSettings.perCompetition[competition] = [];
            }

            if (checkbox.checked) {
                if (!currentSettings.perCompetition[competition].includes(category)) {
                    currentSettings.perCompetition[competition].push(category);
                }
            } else {
                currentSettings.perCompetition[competition] = currentSettings.perCompetition[competition].filter(c => c !== category);
            }

            saveBigGameSettings(currentSettings);

            // Update the enabled count display
            updateEnabledCount(competition);
        });
    });

    // Setup expand/collapse all buttons
    setupExpandCollapseButtons();
}

// Update the enabled count display for a competition
function updateEnabledCount(competitionKey) {
    const section = document.querySelector(`.competition-section[data-competition="${competitionKey}"]`);
    if (!section) return;

    const checkboxes = section.querySelectorAll('input[type="checkbox"]');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const countEl = section.querySelector('.enabled-count');
    if (countEl) {
        countEl.textContent = `${checkedCount}/${ALL_CATEGORIES.length}`;
    }
}

// Setup expand/collapse all buttons
function setupExpandCollapseButtons() {
    const expandBtn = document.getElementById('expand-all-btn');
    const collapseBtn = document.getElementById('collapse-all-btn');

    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            document.querySelectorAll('.competition-section .category-toggles').forEach(toggles => {
                toggles.classList.remove('collapsed');
            });
            document.querySelectorAll('.competition-section .collapse-indicator').forEach(indicator => {
                indicator.innerHTML = '&#9660;'; // Down arrow
            });
        });
    }

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            document.querySelectorAll('.competition-section .category-toggles').forEach(toggles => {
                toggles.classList.add('collapsed');
            });
            document.querySelectorAll('.competition-section .collapse-indicator').forEach(indicator => {
                indicator.innerHTML = '&#9654;'; // Right arrow
            });
        });
    }
}

// Initialize display options (preseason toggle, etc.)
function initDisplayOptions() {
    const preseasonCheckbox = document.getElementById('show-preseason');
    if (!preseasonCheckbox) return;

    // Set initial state from localStorage
    preseasonCheckbox.checked = getShowPreseason();

    // Add change handler
    preseasonCheckbox.addEventListener('change', () => {
        setShowPreseason(preseasonCheckbox.checked);
    });
}

// Render watch party view-only settings
function renderWatchPartySettings(watchParty) {
    const bannerContainer = document.getElementById('watch-party-banner-container');
    if (bannerContainer) {
        bannerContainer.innerHTML = `<div class="watch-party-banner">Viewing Watch Party Settings<a href="settings.html" onclick="clearWatchPartySession(); window.location.href='settings.html'; return false;">View your own settings</a></div>`;
    }

    // Add watch-party-mode class to body for CSS styling
    document.body.classList.add('watch-party-mode');

    // Hide the "Add Teams" section entirely
    const leaguePicker = document.querySelector('.league-picker');
    const searchBox = document.querySelector('.search-box');
    if (leaguePicker) leaguePicker.style.display = 'none';
    if (searchBox) searchBox.style.display = 'none';

    // Hide the "Add Teams" section header
    const addTeamsSection = document.querySelector('.settings-section:has(.league-picker)');
    if (addTeamsSection) addTeamsSection.style.display = 'none';

    // Render partner's teams (view-only, no buttons)
    renderWatchPartyTeams(watchParty.teams || []);

    // Render big game settings (disabled)
    renderWatchPartyBigGames(watchParty.bigGames || {});

    // Render preseason toggle (disabled)
    renderWatchPartyPreseason(watchParty.showPreseason);

    // Update section descriptions
    const favTeamsDesc = document.querySelector('.settings-section:first-child .settings-description');
    if (favTeamsDesc) {
        favTeamsDesc.textContent = "These are the Watch Party host's favorite teams.";
    }
    const bigGamesDesc = document.querySelector('.settings-section:has(#big-game-categories) .settings-description');
    if (bigGamesDesc) {
        bigGamesDesc.textContent = "These are the Watch Party host's Big Game settings.";
    }
}

// Render watch party teams (view-only)
function renderWatchPartyTeams(teams) {
    const container = document.getElementById('selected-teams');
    if (!container) return;

    if (!teams || teams.length === 0) {
        container.innerHTML = '<p class="no-teams">No teams in this Watch Party.</p>';
        return;
    }

    // Teams can be full objects (new format) or strings (old format)
    const teamsHtml = teams.map(team => {
        let name, logo, league;

        if (typeof team === 'object') {
            // New format: full team object
            name = team.name;
            logo = team.logo;
            league = team.league;
        } else {
            // Old format: "sport-id" string - try to look up
            const [sport, id] = team.split('-');
            const found = DEFAULT_TEAMS.find(t => t.sport === sport && t.id === id);
            name = found ? found.name : `${sport} team ${id}`;
            logo = found ? found.logo : '';
            league = found ? found.league : sport;
        }

        return `
        <div class="selected-team watch-party-team">
            ${logo ? `<img src="${logo}" alt="" class="team-logo-small">` : ''}
            <span class="team-name">${name}</span>
            <span class="team-league-badge ${league}">${LEAGUES[league]?.name || league}</span>
        </div>
        `;
    }).join('');

    container.innerHTML = teamsHtml;
}

// Render watch party big game settings (disabled checkboxes)
function renderWatchPartyBigGames(bigGames) {
    const container = document.getElementById('big-game-categories');
    if (!container) return;

    let sectionsHtml = '';
    for (const [competitionKey, competitionName] of Object.entries(COMPETITIONS)) {
        const enabledCategories = bigGames[competitionKey] || [];
        const enabledCount = enabledCategories.length;

        let categoriesHtml = '';
        for (const category of ALL_CATEGORIES) {
            const isChecked = enabledCategories.includes(category);
            const displayName = GAME_CATEGORY_DISPLAY_NAMES[category] || category;
            const description = GAME_CATEGORY_DESCRIPTIONS[category] || '';

            categoriesHtml += `
                <label class="category-toggle">
                    <input type="checkbox"
                           ${isChecked ? 'checked' : ''}
                           disabled>
                    <div class="category-text">
                        <span class="category-name">${displayName}</span>
                        <span class="category-desc">${description}</span>
                    </div>
                </label>
            `;
        }

        sectionsHtml += `
            <div class="competition-section" data-competition="${competitionKey}">
                <div class="competition-header">
                    <span class="collapse-indicator">&#9654;</span>
                    <span class="competition-name">${competitionName}</span>
                    <span class="enabled-count">${enabledCount}/${ALL_CATEGORIES.length}</span>
                </div>
                <div class="category-toggles collapsed">
                    ${categoriesHtml}
                </div>
            </div>
        `;
    }

    container.innerHTML = sectionsHtml;

    // Add click handlers for expand/collapse (still works in view-only mode)
    container.querySelectorAll('.competition-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.competition-section');
            const togglesContainer = section.querySelector('.category-toggles');
            const indicator = header.querySelector('.collapse-indicator');
            const isCollapsed = togglesContainer.classList.contains('collapsed');

            if (isCollapsed) {
                togglesContainer.classList.remove('collapsed');
                indicator.innerHTML = '&#9660;';
            } else {
                togglesContainer.classList.add('collapsed');
                indicator.innerHTML = '&#9654;';
            }
        });
    });

    // Setup expand/collapse all buttons (still work in view-only mode)
    setupExpandCollapseButtons();
}

// Render watch party preseason toggle (disabled)
function renderWatchPartyPreseason(showPreseason) {
    const preseasonCheckbox = document.getElementById('show-preseason');
    if (preseasonCheckbox) {
        preseasonCheckbox.checked = showPreseason !== false;
        preseasonCheckbox.disabled = true;
    }
}

// Initialize the settings page
async function init() {
    // Check for watch party mode first
    const watchParty = getActiveWatchParty();
    if (watchParty) {
        renderWatchPartySettings(watchParty);
        return; // Skip normal init - we're in view-only mode
    }

    // Normal mode: render editable settings
    // Render currently selected teams
    renderSelectedTeams();

    // Setup collapsible sections
    setupCollapsibleSections();

    // Setup search
    setupSearch();

    // Initialize big game settings
    initBigGameSettings();

    // Initialize display options
    initDisplayOptions();

    // Fetch and render teams for each league in parallel
    const leagueKeys = Object.keys(LEAGUES);
    const fetchPromises = leagueKeys.map(key => fetchLeagueTeams(key));
    const results = await Promise.all(fetchPromises);

    // Store all teams for search
    allTeams = results.flat();

    leagueKeys.forEach((key, index) => {
        renderLeagueTeams(key, results[index]);
    });
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
