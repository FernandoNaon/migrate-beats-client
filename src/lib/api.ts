const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ==================== SPOTIFY AUTH ====================

export async function getSpotifyLoginUrl(clientRedirectUri?: string): Promise<{ auth_url: string }> {
  const search = clientRedirectUri
    ? `?client_redirect_uri=${encodeURIComponent(clientRedirectUri)}`
    : "";
  return fetchApi(`/login${search}`);
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
  name: string;
  artist: string;
  artists: string[];
  album: string;
  duration_ms: number;
  image?: string;
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
