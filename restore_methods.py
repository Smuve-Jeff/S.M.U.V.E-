import sys

file_path = "src/app/components/tha-spot/tha-spot.component.ts"
with open(file_path, "r") as f:
    lines = f.readlines()

# Find the end of signals declaration to add missing signals
signal_end_index = -1
for i, line in enumerate(lines):
    if "now = signal<number>(Date.now());" in line:
        signal_end_index = i
        break

if signal_end_index != -1:
    missing_signals = [
        "  activeRecommendationRail = computed(() => {\n",
        "    const roomId = this.activeRoom();\n",
        "    return this.matchingRecommendationRails().find(r => r.roomIds?.includes(roomId));\n",
        "  });\n",
        "  recommendedGames = computed(() => {\n",
        "    const rail = this.activeRecommendationRail();\n",
        "    return rail ? this.getGamesForRail(rail) : [];\n",
        "  });\n",
        "  recentlyPlayed = computed(() => this.games().slice(0, 3)); // Mock\n",
        "  liveMetrics = signal({ roomPlayers: 1710, activeMatches: 42 }); // Mock\n",
        "  activitySummary = signal({ favoriteRoomLabel: \"Producer Lounge\" }); // Mock\n",
        "  launchWarning = computed(() => {\n",
        "    const game = this.selectedGame();\n",
        "    return game ? this.resolveLaunchWarning(game) : \"\";\n",
        "  });\n"
    ]
    lines[signal_end_index+1:signal_end_index+1] = missing_signals

# Find where to add missing methods
# Before "onGameClick"
click_index = -1
for i, line in enumerate(lines):
    if "onGameClick(game: Game)" in line:
        click_index = i
        break

if click_index != -1:
    missing_methods = [
        "  setActiveRoom(id: string) {\n",
        "    this.activeRoom.set(id);\n",
        "  }\n",
        "  previewGame(game: Game) {\n",
        "    this.selectedGame.set(game);\n",
        "  }\n",
        "  getGamesForRail(rail: RecommendationRail): Game[] {\n",
        "    let games = [...this.games()];\n",
        "    if (rail.gameIds?.length) {\n",
        "      const lookup = new Map(games.map((game) => [game.id, game]));\n",
        "      return rail.gameIds.map((id) => lookup.get(id)).filter(Boolean) as Game[];\n",
        "    }\n",
        "    return games.slice(0, 4);\n",
        "  }\n",
        "  private resolveLaunchWarning(game: Game): string {\n",
        "    if (game.launchConfig?.embedMode === 'external-only') return 'External governance required. Launches in a separate tab.';\n",
        "    return 'Exact embed target verified.';\n",
        "  }\n"
    ]
    lines[click_index:click_index] = missing_methods

with open(file_path, "w") as f:
    f.writelines(lines)
