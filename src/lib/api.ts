const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

const SESSION_TOKEN_KEY = "session_token";

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}
export function setSessionToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}
export function clearSessionToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    // Session invalid/expired — drop it so the app can route back to login.
    clearSessionToken();
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ==================== SPOTIFY AUTH ====================

export async function getSpotifyLoginUrl(): Promise<{ auth_url: string }> {
  return fetchApi("/login");
}

// ==================== SESSION AUTH (refactored) ====================

export interface AuthMePayload {
  spotify_user: SpotifyUser;
  app_user: AppUser;
}

/** Exchange the OAuth code ONCE for a session token + profile. Stores the token. */
export async function exchangeSpotifyCode(
  code: string
): Promise<{ session_token: string } & AuthMePayload> {
  const result = await fetchApi<{ session_token: string } & AuthMePayload>(
    "/auth/spotify/exchange",
    { method: "POST", body: JSON.stringify({ code }) }
  );
  if (result.session_token) setSessionToken(result.session_token);
  return result;
}

/** Fetch the current authed user's profile + tier + usage (session via Bearer). */
export async function getAuthMe(): Promise<AuthMePayload> {
  return fetchApi("/auth/me", { method: "POST", body: JSON.stringify({}) });
}

/** Revoke the current session server-side and clear the local token. */
export async function logoutSession(): Promise<{ success: boolean }> {
  try {
    return await fetchApi("/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } finally {
    clearSessionToken();
  }
}

// ==================== SPOTIFY USER ====================

export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  image?: string;
  country?: string;
  product?: string;
  followers: number;
}

export async function getUserProfile(code: string): Promise<SpotifyUser> {
  return fetchApi("/user_profile", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// ==================== DATABASE USER TRACKING ====================

export interface AppUser {
  id: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  tier: string;
  is_active: boolean;
  created_at?: string;
  last_login_at?: string;
  usage?: {
    migrations_today: number;
    migrations_limit: number;
  };
}

export async function registerUser(code: string): Promise<AppUser> {
  return fetchApi("/user/me", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export interface MigrationHistory {
  id: string;
  source_provider: string;
  target_provider: string;
  source_playlist_name?: string;
  target_playlist_name?: string;
  migration_type?: string;
  total_tracks: number;
  migrated_tracks: number;
  skipped_tracks: number;
  status: string;
  created_at?: string;
  completed_at?: string;
}

export async function getMigrationHistory(code: string, limit: number = 20): Promise<MigrationHistory[]> {
  return fetchApi("/user/history", {
    method: "POST",
    body: JSON.stringify({ code, limit }),
  });
}

// ==================== SPOTIFY PLAYLISTS ====================

export interface Playlist {
  id: string;
  name: string;
  tracks_total: number;
  image?: string;
  owner: string;
}

export interface Track {
  id: string;
  uri?: string;
  name: string;
  artist: string;
  artists: string[];
  album: string;
  duration_ms: number;
  image?: string;
  is_local?: boolean;
}

export async function fetchPlaylists(code: string): Promise<Playlist[]> {
  return fetchApi("/fetch_playlists", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchPlaylistTracks(code: string, playlistId: string): Promise<Track[]> {
  return fetchApi("/playlist_tracks", {
    method: "POST",
    body: JSON.stringify({ code, playlist_id: playlistId }),
  });
}

// ==================== SPOTIFY PLAYLIST MANAGEMENT ====================

export interface PlaylistDetails {
  id: string;
  name: string;
  snapshot_id: string;
  image?: string;
  owner?: string;
  is_owner: boolean;
  tracks_total: number;
  tracks: Track[];
}

export async function fetchPlaylistDetails(code: string, playlistId: string): Promise<PlaylistDetails> {
  return fetchApi("/playlist/details", {
    method: "POST",
    body: JSON.stringify({ code, playlist_id: playlistId }),
  });
}

export interface CreatedPlaylist {
  id: string;
  name: string;
  snapshot_id?: string;
  image?: string;
  owner?: string;
  tracks_total: number;
}

export async function createSpotifyPlaylist(
  code: string,
  name: string,
  description = "",
  isPublic = false
): Promise<CreatedPlaylist> {
  return fetchApi("/playlist/create", {
    method: "POST",
    body: JSON.stringify({ code, name, description, public: isPublic }),
  });
}

export interface MutationResult {
  success: boolean;
  snapshot_id?: string;
}

export async function addTracksToPlaylist(
  code: string,
  playlistId: string,
  trackUris: string[],
  position?: number
): Promise<MutationResult & { added: number }> {
  return fetchApi("/playlist/add_tracks", {
    method: "POST",
    body: JSON.stringify({ code, playlist_id: playlistId, track_uris: trackUris, position }),
  });
}

export async function removeTracksFromPlaylist(
  code: string,
  playlistId: string,
  trackUris: string[],
  snapshotId?: string
): Promise<MutationResult & { removed: number }> {
  return fetchApi("/playlist/remove_tracks", {
    method: "POST",
    body: JSON.stringify({ code, playlist_id: playlistId, track_uris: trackUris, snapshot_id: snapshotId }),
  });
}

export async function reorderPlaylistTracks(
  code: string,
  playlistId: string,
  rangeStart: number,
  insertBefore: number,
  rangeLength = 1,
  snapshotId?: string
): Promise<MutationResult> {
  return fetchApi("/playlist/reorder", {
    method: "POST",
    body: JSON.stringify({
      code,
      playlist_id: playlistId,
      range_start: rangeStart,
      insert_before: insertBefore,
      range_length: rangeLength,
      snapshot_id: snapshotId,
    }),
  });
}

export interface MoveTracksOptions {
  code: string;
  sourcePlaylistId: string;
  targetPlaylistId: string;
  trackUris: string[];
  sourceSnapshotId?: string;
  targetPosition?: number;
  copyOnly?: boolean;
}

export interface MoveTracksResult {
  success: boolean;
  added: number;
  removed: number;
  source_snapshot_id?: string;
  target_snapshot_id?: string;
}

export async function moveTracksBetweenPlaylists(opts: MoveTracksOptions): Promise<MoveTracksResult> {
  return fetchApi("/playlist/move_tracks", {
    method: "POST",
    body: JSON.stringify({
      code: opts.code,
      source_playlist_id: opts.sourcePlaylistId,
      target_playlist_id: opts.targetPlaylistId,
      track_uris: opts.trackUris,
      source_snapshot_id: opts.sourceSnapshotId,
      target_position: opts.targetPosition,
      copy_only: opts.copyOnly,
    }),
  });
}

export async function deleteSpotifyPlaylist(code: string, playlistId: string): Promise<{ success: boolean }> {
  return fetchApi("/playlist/delete", {
    method: "POST",
    body: JSON.stringify({ code, playlist_id: playlistId }),
  });
}

export interface PlaylistGenre {
  genre: string;
  count: number;
  sample_artists: string[];
}

export interface PlaylistGenresResponse {
  genres: PlaylistGenre[];
  total_artists: number;
}

export async function fetchPlaylistGenres(code: string, playlistId: string): Promise<PlaylistGenresResponse> {
  return fetchApi("/playlist/genres", {
    method: "POST",
    body: JSON.stringify({ code, playlist_id: playlistId }),
  });
}

export interface LikedMoveResult {
  success: boolean;
  added: number;
  removed: number;
  snapshot_id?: string;
}

export async function moveLikedToPlaylist(
  code: string,
  targetPlaylistId: string,
  trackIds: string[],
  copyOnly = false
): Promise<LikedMoveResult> {
  return fetchApi("/liked_songs/move_to_playlist", {
    method: "POST",
    body: JSON.stringify({
      code,
      target_playlist_id: targetPlaylistId,
      track_ids: trackIds,
      copy_only: copyOnly,
    }),
  });
}

// ==================== ARCHAEOLOGIST ====================

export interface ArchSnapshotStatus {
  has_snapshot: boolean;
  built_at: string | null;
  tier: string;
  daily_limit: number;
  refresh_remaining: number;
}

export interface ArchRefreshResult {
  success: boolean;
  totals: {
    playlists: number;
    playlist_tracks: number;
    saved_tracks: number;
    saved_albums: number;
    recent: number;
  };
  truncated: string[];
  built_at: string;
  refresh_remaining: number;
  tier: string;
  daily_limit: number;
}

export interface ArchOverview {
  total_playlists: number;
  total_playlist_tracks: number;
  total_saved_tracks: number;
  total_saved_albums: number;
  unique_artists: number;
  unique_albums: number;
  average_playlist_size: number;
  longest_playlist: { name: string; tracks: number } | null;
  shortest_playlist: { name: string; tracks: number } | null;
  built_at: string | null;
  truncated: string[];
}

export interface ArchOverlapPair {
  a: string;
  b: string;
  shared_tracks: number;
  overlap: number;
  overlap_pct: number;
}

export interface ArchArtistDominance {
  artist_id: string;
  name: string;
  track_count: number;
}

export interface ArchForgottenTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  added_at: string | null;
  source: string;
}

export interface ArchPlaylistHealth {
  id: string;
  name: string;
  track_count: number;
  duplicate_pct: number;
  artist_diversity: number;
  avg_overlap: number;
  score: number;
}

export interface ArchEvolutionArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number | null;
  followers: number | null;
  short_rank: number | null;
  long_rank: number | null;
  movement?: "new" | "up" | "dropped";
}

export interface ArchGenreDelta {
  genre: string;
  short: number;
  long: number;
  delta: number;
}

export interface ArchBreakoutTrack {
  id: string;
  name: string;
  artist_names: string[];
  album_name: string;
  popularity?: number;
}

export interface ArchEvolution {
  rising_artists: ArchEvolutionArtist[];
  declining_artists: ArchEvolutionArtist[];
  persistent_artists: ArchEvolutionArtist[];
  emerging_genres: ArchGenreDelta[];
  fading_genres: ArchGenreDelta[];
  breakout_tracks: ArchBreakoutTrack[];
  ranges: { short_term_label: string; medium_term_label: string; long_term_label: string };
}

export async function fetchArchStatus(code: string): Promise<ArchSnapshotStatus> {
  return fetchApi("/archaeologist/status", { method: "POST", body: JSON.stringify({ code }) });
}

export async function refreshArchSnapshot(code: string): Promise<ArchRefreshResult> {
  return fetchApi("/archaeologist/snapshot/refresh", { method: "POST", body: JSON.stringify({ code }) });
}

export async function fetchArchOverview(code: string): Promise<ArchOverview> {
  return fetchApi("/archaeologist/overview", { method: "POST", body: JSON.stringify({ code }) });
}

export async function fetchArchPlaylistOverlap(code: string, topN = 20): Promise<ArchOverlapPair[]> {
  return fetchApi("/archaeologist/playlist_overlap", {
    method: "POST",
    body: JSON.stringify({ code, top_n: topN }),
  });
}

export async function fetchArchArtistDominance(code: string, topN = 50): Promise<ArchArtistDominance[]> {
  return fetchApi("/archaeologist/artist_dominance", {
    method: "POST",
    body: JSON.stringify({ code, top_n: topN }),
  });
}

export async function fetchArchForgotten(
  code: string,
  topN = 50,
  monthsThreshold = 12
): Promise<ArchForgottenTrack[]> {
  return fetchApi("/archaeologist/forgotten", {
    method: "POST",
    body: JSON.stringify({ code, top_n: topN, months_threshold: monthsThreshold }),
  });
}

export async function fetchArchPlaylistHealth(code: string): Promise<ArchPlaylistHealth[]> {
  return fetchApi("/archaeologist/playlist_health", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchArchEvolution(code: string): Promise<ArchEvolution> {
  return fetchApi("/archaeologist/evolution", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// ---- Phase 2: Discovery ----

export interface ArchGenreCluster {
  genre: string;
  artist_count: number;
  track_count: number;
  sample_artists: { id: string; name: string; track_count: number }[];
  sample_playlists: string[];
}

export interface ArchGenreOutlier {
  id: string;
  name: string;
  primary_genre: string | null;
  cluster_size: number;
  track_count: number;
  playlist_count: number;
  popularity: number | null;
  reason: string;
}

export interface ArchHiddenGem {
  id: string;
  name: string;
  artist: string;
  album: string;
  source: string;
  reasons: string[];
  score: number;
}

export interface ArchCoOccurrence {
  a_id: string;
  a_name: string;
  b_id: string;
  b_name: string;
  shared_playlists: number;
}

export async function fetchArchGenreClusters(code: string): Promise<ArchGenreCluster[]> {
  return fetchApi("/archaeologist/genre_clusters", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchArchGenreOutliers(code: string, topN = 30): Promise<ArchGenreOutlier[]> {
  return fetchApi("/archaeologist/genre_outliers", {
    method: "POST",
    body: JSON.stringify({ code, top_n: topN }),
  });
}

export async function fetchArchHiddenGems(code: string, topN = 50): Promise<ArchHiddenGem[]> {
  return fetchApi("/archaeologist/hidden_gems", {
    method: "POST",
    body: JSON.stringify({ code, top_n: topN }),
  });
}

export async function fetchArchCoOccurrence(
  code: string,
  minPlaylists = 3,
  topN = 20
): Promise<ArchCoOccurrence[]> {
  return fetchApi("/archaeologist/co_occurrence", {
    method: "POST",
    body: JSON.stringify({ code, min_playlists: minPlaylists, top_n: topN }),
  });
}

// ==================== SPOTIFY INSIGHTS ====================

export interface TopTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  image?: string;
  popularity: number;
}

export interface TopArtist {
  id: string;
  name: string;
  genres: string[];
  image?: string;
  popularity: number;
  followers: number;
}

export interface RecentTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  image?: string;
  played_at: string;
}

export interface LibraryStats {
  saved_tracks: number;
  playlists: number;
  saved_albums: number;
  followed_artists: number;
}

export type TimeRange = "short_term" | "medium_term" | "long_term";

export async function getTopTracks(
  code: string,
  timeRange: TimeRange = "medium_term",
  limit: number = 20
): Promise<TopTrack[]> {
  return fetchApi("/top_tracks", {
    method: "POST",
    body: JSON.stringify({ code, time_range: timeRange, limit }),
  });
}

export async function getTopArtists(
  code: string,
  timeRange: TimeRange = "medium_term",
  limit: number = 20
): Promise<TopArtist[]> {
  return fetchApi("/top_artists", {
    method: "POST",
    body: JSON.stringify({ code, time_range: timeRange, limit }),
  });
}

export async function getRecentlyPlayed(code: string, limit: number = 20): Promise<RecentTrack[]> {
  return fetchApi("/recently_played", {
    method: "POST",
    body: JSON.stringify({ code, limit }),
  });
}

export async function getLibraryStats(code: string): Promise<LibraryStats> {
  return fetchApi("/library_stats", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// ==================== LIKED SONGS ====================

export interface LikedTrack extends Track {
  added_at: string;
}

export interface LikedSongsResponse {
  tracks: LikedTrack[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export async function fetchLikedSongs(
  code: string,
  limit: number = 50,
  offset: number = 0
): Promise<LikedSongsResponse> {
  return fetchApi("/liked_songs", {
    method: "POST",
    body: JSON.stringify({ code, limit, offset }),
  });
}

// ==================== TIDAL ====================

export interface TidalLoginResponse {
  verification_uri: string;
  user_code: string;
  session_id: string;
  expires_in: number;
}

export interface TidalAuthStatus {
  authenticated: boolean;
  user?: {
    id: string;
    name: string;
  };
  error?: string;
}

export async function startTidalLogin(): Promise<TidalLoginResponse> {
  return fetchApi("/tidal/login", { method: "POST" });
}

export async function checkTidalAuth(sessionId: string): Promise<TidalAuthStatus> {
  return fetchApi("/tidal/check_auth", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export interface TidalPlaylist {
  id: string;
  name: string;
  tracks_total: number;
  image?: string;
  description?: string;
}

export interface TidalTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration_ms: number;
  image?: string;
}

export async function fetchTidalPlaylists(sessionId: string): Promise<TidalPlaylist[]> {
  return fetchApi("/tidal/playlists", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function fetchTidalPlaylistTracks(sessionId: string, playlistId: string): Promise<TidalTrack[]> {
  return fetchApi("/tidal/playlist_tracks", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, playlist_id: playlistId }),
  });
}

export interface DeletePlaylistResult {
  success: boolean;
  message: string;
  error?: string;
}

export async function deleteTidalPlaylist(sessionId: string, playlistId: string): Promise<DeletePlaylistResult> {
  return fetchApi("/tidal/delete_playlist", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, playlist_id: playlistId }),
  });
}

export interface MergePlaylistsResult {
  success: boolean;
  message: string;
  tracks_added: number;
  tracks_skipped: number;
  source_deleted: boolean;
  error?: string;
}

export async function mergeTidalPlaylists(
  sessionId: string,
  sourcePlaylistId: string,
  targetPlaylistId: string
): Promise<MergePlaylistsResult> {
  return fetchApi("/tidal/merge_playlists", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      source_playlist_id: sourcePlaylistId,
      target_playlist_id: targetPlaylistId,
    }),
  });
}

// ==================== MIGRATION ====================

export interface MigrationResult {
  success: boolean;
  playlist_id?: string;
  playlist_name?: string;
  total_tracks: number;
  migrated: number;
  not_found: number;
  not_found_tracks: Array<{ name: string; artist: string; album: string }>;
  error?: string;
}

export async function migratePlaylist(
  spotifyCode: string,
  tidalSessionId: string,
  playlistId: string,
  playlistName: string
): Promise<MigrationResult> {
  return fetchApi("/migrate_playlist", {
    method: "POST",
    body: JSON.stringify({
      spotify_code: spotifyCode,
      tidal_session_id: tidalSessionId,
      playlist_id: playlistId,
      playlist_name: playlistName,
    }),
  });
}

export interface TrackToMigrate {
  name: string;
  artist: string;
  album: string;
}

export interface MigrateTracksOptions {
  spotifyCode: string;
  tidalSessionId: string;
  tracks: TrackToMigrate[];
  playlistName?: string;
  targetPlaylistId?: string;  // Existing playlist ID
  addToFavorites?: boolean;   // Add to Tidal favorites
}

export async function migrateTracks(options: MigrateTracksOptions): Promise<MigrationResult> {
  return fetchApi("/migrate_tracks", {
    method: "POST",
    body: JSON.stringify({
      spotify_code: options.spotifyCode,
      tidal_session_id: options.tidalSessionId,
      tracks: options.tracks,
      playlist_name: options.playlistName || "Migrated Songs",
      target_playlist_id: options.targetPlaylistId,
      add_to_favorites: options.addToFavorites,
    }),
  });
}

// ==================== TIDAL LIKED SONGS ====================

export interface TidalLikedSongsResponse {
  tracks: TidalLikedTrack[];
  total: number;
  has_more: boolean;
}

export interface TidalLikedTrack {
  id: string;
  name: string;
  artist: string;
  artists: string[];
  album: string;
  duration_ms: number;
  image?: string;
  added_at?: string;
}

export async function fetchTidalLikedSongs(
  sessionId: string,
  limit: number = 50,
  offset: number = 0
): Promise<TidalLikedSongsResponse> {
  return fetchApi("/tidal/liked_songs", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, limit, offset }),
  });
}

// ==================== TIDAL TO SPOTIFY MIGRATION ====================

export async function migrateTidalPlaylistToSpotify(
  spotifyCode: string,
  tidalSessionId: string,
  playlistId: string,
  playlistName?: string
): Promise<MigrationResult> {
  return fetchApi("/migrate_tidal_to_spotify", {
    method: "POST",
    body: JSON.stringify({
      spotify_code: spotifyCode,
      tidal_session_id: tidalSessionId,
      playlist_id: playlistId,
      playlist_name: playlistName,
    }),
  });
}

export interface MigrateTidalTracksOptions {
  spotifyCode: string;
  tidalSessionId: string;
  tracks: TrackToMigrate[];
  playlistName?: string;
  targetPlaylistId?: string;  // Existing Spotify playlist ID
  addToLiked?: boolean;       // Add to Spotify liked songs
}

export async function migrateTidalTracks(options: MigrateTidalTracksOptions): Promise<MigrationResult> {
  return fetchApi("/migrate_tidal_tracks", {
    method: "POST",
    body: JSON.stringify({
      spotify_code: options.spotifyCode,
      tidal_session_id: options.tidalSessionId,
      tracks: options.tracks,
      playlist_name: options.playlistName || "Migrated from Tidal",
      target_playlist_id: options.targetPlaylistId,
      add_to_liked: options.addToLiked,
    }),
  });
}
