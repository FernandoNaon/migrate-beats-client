import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ListMusic,
  Music,
  ArrowRight,
  Check,
  X,
  AlertCircle,
  Search,
  ExternalLink,
  RefreshCw,
  Trash2,
  Merge,
  ChevronDown,
  Loader2,
  Heart,
  Plus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  fetchPlaylists,
  fetchPlaylistTracks,
  fetchTidalPlaylists,
  fetchTidalPlaylistTracks,
  migratePlaylist,
  migrateTracks,
  migrateTidalPlaylistToSpotify,
  deleteTidalPlaylist,
  mergeTidalPlaylists,
  type Playlist,
  type Track,
  type TidalPlaylist,
  type TidalTrack,
  type MigrationResult,
  type MergePlaylistsResult,
  type TrackToMigrate,
} from "../lib/api";

export default function Migrate() {
  const { spotifyCode, isSpotifyConnected, tidalSessionId, isTidalConnected, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Spotify state
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<Playlist[]>([]);
  const [filteredSpotifyPlaylists, setFilteredSpotifyPlaylists] = useState<Playlist[]>([]);
  const [spotifySearchQuery, setSpotifySearchQuery] = useState("");
  const [selectedSpotifyPlaylist, setSelectedSpotifyPlaylist] = useState<Playlist | null>(null);
  const [spotifyTracks, setSpotifyTracks] = useState<Track[]>([]);
  const [isLoadingSpotify, setIsLoadingSpotify] = useState(true);
  const [isLoadingSpotifyTracks, setIsLoadingSpotifyTracks] = useState(false);

  // Tidal state
  const [tidalPlaylists, setTidalPlaylists] = useState<TidalPlaylist[]>([]);
  const [filteredTidalPlaylists, setFilteredTidalPlaylists] = useState<TidalPlaylist[]>([]);
  const [tidalSearchQuery, setTidalSearchQuery] = useState("");
  const [selectedTidalPlaylist, setSelectedTidalPlaylist] = useState<TidalPlaylist | null>(null);
  const [tidalTracks, setTidalTracks] = useState<TidalTrack[]>([]);
  const [isLoadingTidal, setIsLoadingTidal] = useState(false);
  const [isLoadingTidalTracks, setIsLoadingTidalTracks] = useState(false);

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // Track selection state (for selective migration)
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Destination picker state
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [destination, setDestination] = useState<string>("new"); // "favorites", "new", or playlist ID
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Merge state
  const [isMerging, setIsMerging] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<TidalPlaylist | null>(null);
  const [mergeResult, setMergeResult] = useState<MergePlaylistsResult | null>(null);

  // Active view state
  const [activeView, setActiveView] = useState<"spotify" | "tidal" | null>(null);

  useEffect(() => {
    if (!authLoading && !isSpotifyConnected) {
      navigate("/");
    }
  }, [authLoading, isSpotifyConnected, navigate]);

  // Load Spotify playlists
  useEffect(() => {
    if (!spotifyCode) return;

    const loadPlaylists = async () => {
      try {
        const data = await fetchPlaylists(spotifyCode);
        setSpotifyPlaylists(data);
        setFilteredSpotifyPlaylists(data);
      } catch (error) {
        console.error("Error fetching Spotify playlists:", error);
      } finally {
        setIsLoadingSpotify(false);
      }
    };

    loadPlaylists();
  }, [spotifyCode]);

  // Load Tidal playlists
  useEffect(() => {
    if (!tidalSessionId || !isTidalConnected) return;

    const loadTidalPlaylists = async () => {
      setIsLoadingTidal(true);
      try {
        const data = await fetchTidalPlaylists(tidalSessionId);
        setTidalPlaylists(data);
        setFilteredTidalPlaylists(data);
      } catch (error) {
        console.error("Error fetching Tidal playlists:", error);
      } finally {
        setIsLoadingTidal(false);
      }
    };

    loadTidalPlaylists();
  }, [tidalSessionId, isTidalConnected]);

  // Filter Spotify playlists
  useEffect(() => {
    const query = spotifySearchQuery.toLowerCase();
    setFilteredSpotifyPlaylists(
      spotifyPlaylists.filter((p) => p.name.toLowerCase().includes(query))
    );
  }, [spotifySearchQuery, spotifyPlaylists]);

  // Filter Tidal playlists
  useEffect(() => {
    const query = tidalSearchQuery.toLowerCase();
    setFilteredTidalPlaylists(
      tidalPlaylists.filter((p) => p.name.toLowerCase().includes(query))
    );
  }, [tidalSearchQuery, tidalPlaylists]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDestinationPicker(false);
      }
    };

    if (showDestinationPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDestinationPicker]);

  const handleSelectSpotifyPlaylist = async (playlist: Playlist) => {
    if (!spotifyCode) return;

    // Cancel merge mode when selecting Spotify playlist
    if (mergeMode) {
      setMergeMode(false);
      setMergeTarget(null);
    }

    setSelectedSpotifyPlaylist(playlist);
    setSelectedTidalPlaylist(null);
    setSpotifyTracks([]);
    setTidalTracks([]);
    setMigrationResult(null);
    setMergeResult(null);
    setShowDeleteConfirm(false);
    setIsLoadingSpotifyTracks(true);
    setActiveView("spotify");
    // Reset track selection
    setSelectedTracks(new Set());
    setLastClickedIndex(null);
    setNewPlaylistName(playlist.name); // Default new playlist name to source playlist name

    try {
      const data = await fetchPlaylistTracks(spotifyCode, playlist.id);
      setSpotifyTracks(data);
    } catch (error) {
      console.error("Error fetching Spotify tracks:", error);
    } finally {
      setIsLoadingSpotifyTracks(false);
    }
  };

  const handleSelectTidalPlaylist = async (playlist: TidalPlaylist) => {
    if (!tidalSessionId) return;

    // If in merge mode, handle merge target selection
    if (mergeMode && mergeTarget) {
      if (playlist.id === mergeTarget.id) {
        // Can't merge with itself
        return;
      }
      // Perform merge
      await handleMerge(playlist);
      return;
    }

    setSelectedTidalPlaylist(playlist);
    setSelectedSpotifyPlaylist(null);
    setTidalTracks([]);
    setSpotifyTracks([]);
    setMigrationResult(null);
    setMergeResult(null);
    setShowDeleteConfirm(false);
    setIsLoadingTidalTracks(true);
    setActiveView("tidal");

    try {
      const data = await fetchTidalPlaylistTracks(tidalSessionId, playlist.id);
      setTidalTracks(data);
    } catch (error) {
      console.error("Error fetching Tidal tracks:", error);
    } finally {
      setIsLoadingTidalTracks(false);
    }
  };

  const handleMigrate = async () => {
    if (!spotifyCode || !tidalSessionId || !selectedSpotifyPlaylist) return;

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const result = await migratePlaylist(
        spotifyCode,
        tidalSessionId,
        selectedSpotifyPlaylist.id,
        selectedSpotifyPlaylist.name
      );
      setMigrationResult(result);

      // Refresh Tidal playlists after successful migration
      if (result.success) {
        const data = await fetchTidalPlaylists(tidalSessionId);
        setTidalPlaylists(data);
        setFilteredTidalPlaylists(data);
      }
    } catch (error) {
      setMigrationResult({
        success: false,
        total_tracks: 0,
        migrated: 0,
        not_found: 0,
        not_found_tracks: [],
        error: error instanceof Error ? error.message : "Migration failed",
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDelete = async () => {
    if (!tidalSessionId || !selectedTidalPlaylist) return;

    setIsDeleting(true);

    try {
      await deleteTidalPlaylist(tidalSessionId, selectedTidalPlaylist.id);

      // Refresh Tidal playlists
      const data = await fetchTidalPlaylists(tidalSessionId);
      setTidalPlaylists(data);
      setFilteredTidalPlaylists(data);

      // Clear selection
      setSelectedTidalPlaylist(null);
      setTidalTracks([]);
      setActiveView(null);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting playlist:", error);
      alert("Failed to delete playlist: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsDeleting(false);
    }
  };

  const startMergeMode = () => {
    if (!selectedTidalPlaylist) return;
    setMergeMode(true);
    setMergeTarget(selectedTidalPlaylist);
    setMergeResult(null);
  };

  const cancelMergeMode = () => {
    setMergeMode(false);
    setMergeTarget(null);
  };

  const handleMerge = async (sourcePlaylist: TidalPlaylist) => {
    if (!tidalSessionId || !mergeTarget) return;

    setIsMerging(true);

    try {
      const result = await mergeTidalPlaylists(
        tidalSessionId,
        sourcePlaylist.id,  // Source (will be deleted)
        mergeTarget.id      // Target (will keep)
      );
      setMergeResult(result);

      // Refresh Tidal playlists
      const data = await fetchTidalPlaylists(tidalSessionId);
      setTidalPlaylists(data);
      setFilteredTidalPlaylists(data);

      // Refresh the target playlist tracks
      const tracks = await fetchTidalPlaylistTracks(tidalSessionId, mergeTarget.id);
      setTidalTracks(tracks);

      // Update selected playlist with new data
      const updatedTarget = data.find(p => p.id === mergeTarget.id);
      if (updatedTarget) {
        setSelectedTidalPlaylist(updatedTarget);
      }

      // Exit merge mode
      setMergeMode(false);
      setMergeTarget(null);
    } catch (error) {
      console.error("Error merging playlists:", error);
      alert("Failed to merge playlists: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsMerging(false);
    }
  };

  const refreshTidalPlaylists = async () => {
    if (!tidalSessionId) return;

    setIsLoadingTidal(true);
    try {
      const data = await fetchTidalPlaylists(tidalSessionId);
      setTidalPlaylists(data);
      setFilteredTidalPlaylists(data);
    } catch (error) {
      console.error("Error refreshing Tidal playlists:", error);
    } finally {
      setIsLoadingTidal(false);
    }
  };

  // Toggle track selection with shift-click range support
  const toggleTrack = (trackId: string, index: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if (event.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeIds = spotifyTracks.slice(start, end + 1).map((t) => t.id);

      setSelectedTracks((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      setSelectedTracks((prev) => {
        const next = new Set(prev);
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
        return next;
      });
    }

    setLastClickedIndex(index);
  };

  // Select all tracks
  const selectAllTracks = () => {
    const allIds = new Set(spotifyTracks.map((t) => t.id));
    setSelectedTracks(allIds);
  };

  // Deselect all tracks
  const deselectAllTracks = () => {
    setSelectedTracks(new Set());
  };

  // Check if all tracks are selected
  const allTracksSelected = spotifyTracks.length > 0 && selectedTracks.size === spotifyTracks.length;

  // Get destination label
  const getDestinationLabel = () => {
    if (destination === "favorites") return "Tidal Favorites";
    if (destination === "new") return newPlaylistName || "New Playlist";
    const playlist = tidalPlaylists.find((p) => p.id === destination);
    return playlist?.name || "Select destination";
  };

  // Handle selective migration (when tracks are selected)
  const handleSelectiveMigrate = async () => {
    if (!spotifyCode || !tidalSessionId || selectedTracks.size === 0) return;

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const tracksToMigrate: TrackToMigrate[] = spotifyTracks
        .filter((t) => selectedTracks.has(t.id))
        .map((t) => ({
          name: t.name,
          artist: t.artists[0] || t.artist.split(",")[0].trim(),
          album: t.album,
        }));

      const result = await migrateTracks({
        spotifyCode,
        tidalSessionId,
        tracks: tracksToMigrate,
        playlistName: destination === "new" ? (newPlaylistName || selectedSpotifyPlaylist?.name || "Migrated Playlist") : undefined,
        targetPlaylistId: destination !== "favorites" && destination !== "new" ? destination : undefined,
        addToFavorites: destination === "favorites",
      });
      setMigrationResult(result);

      if (result.success) {
        setSelectedTracks(new Set());
        setShowDestinationPicker(false);
        // Refresh Tidal playlists
        const data = await fetchTidalPlaylists(tidalSessionId);
        setTidalPlaylists(data);
        setFilteredTidalPlaylists(data);
      }
    } catch (error) {
      setMigrationResult({
        success: false,
        total_tracks: selectedTracks.size,
        migrated: 0,
        not_found: 0,
        not_found_tracks: [],
        error: error instanceof Error ? error.message : "Migration failed",
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // Handle Tidal to Spotify migration
  const handleTidalToSpotify = async () => {
    if (!spotifyCode || !tidalSessionId || !selectedTidalPlaylist) return;

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const result = await migrateTidalPlaylistToSpotify(
        spotifyCode,
        tidalSessionId,
        selectedTidalPlaylist.id,
        selectedTidalPlaylist.name
      );
      setMigrationResult(result);

      // Refresh Spotify playlists after successful migration
      if (result.success && spotifyCode) {
        const data = await fetchPlaylists(spotifyCode);
        setSpotifyPlaylists(data);
        setFilteredSpotifyPlaylists(data);
      }
    } catch (error) {
      setMigrationResult({
        success: false,
        total_tracks: selectedTidalPlaylist.tracks_total || 0,
        migrated: 0,
        not_found: 0,
        not_found_tracks: [],
        error: error instanceof Error ? error.message : "Migration failed",
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg-cream)' }}>
        <div
          className="w-12 h-12 rounded-full animate-spin"
          style={{ border: '4px solid var(--green-pale)', borderTopColor: 'var(--green-primary)' }}
        />
      </div>
    );
  }

  const PlaylistSkeleton = () => (
    <div className="p-4 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl animate-pulse" style={{ background: 'var(--bg-warm)' }} />
          <div className="flex-1">
            <div className="w-32 h-4 rounded animate-pulse mb-2" style={{ background: 'var(--bg-warm)' }} />
            <div className="w-20 h-3 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
          </div>
        </div>
      ))}
    </div>
  );

  const TrackSkeleton = () => (
    <div style={{ borderTop: '1px solid var(--border-light)' }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 p-4 items-center"
          style={{ borderBottom: '1px solid var(--border-light)' }}
        >
          <div className="w-8 h-4 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg animate-pulse" style={{ background: 'var(--bg-warm)' }} />
            <div>
              <div className="w-32 h-4 rounded animate-pulse mb-2" style={{ background: 'var(--bg-warm)' }} />
              <div className="w-24 h-3 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
            </div>
          </div>
          <div className="w-24 h-4 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
          <div className="w-12 h-4 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-cream)' }}>
      {/* Merge Mode Banner */}
      {mergeMode && (
        <div
          className="fixed top-0 left-64 right-0 z-50 py-3 px-6 flex items-center justify-between shadow-lg"
          style={{ background: 'var(--blue-accent)', color: 'white' }}
        >
          <div className="flex items-center gap-3">
            <Merge className="w-5 h-5" />
            <span>
              <strong>Merge Mode:</strong> Select a playlist to merge INTO "{mergeTarget?.name}".
              The selected playlist's tracks will be added and it will be deleted.
            </span>
          </div>
          <button
            onClick={cancelMergeMode}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Spotify Playlists Column */}
      <div
        className={`w-72 flex flex-col playlist-column ${mergeMode ? 'mt-14' : ''}`}
        style={{ background: 'var(--bg-warm)', borderRight: '1px solid var(--border-light)' }}
      >
        <div
          className="p-4"
          style={{ borderBottom: '1px solid var(--border-light)', background: 'linear-gradient(135deg, #1DB95410 0%, transparent 100%)' }}
        >
          <h2 className="font-display font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: '#1DB954' }}
            >
              <ListMusic className="w-3.5 h-3.5 text-white" />
            </div>
            Spotify Playlists
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-light)' }} />
            <input
              type="text"
              placeholder="Search..."
              value={spotifySearchQuery}
              onChange={(e) => setSpotifySearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none transition-colors"
              style={{
                background: 'var(--bg-warm)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-dark)'
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoadingSpotify ? (
            <PlaylistSkeleton />
          ) : filteredSpotifyPlaylists.length === 0 ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-medium)' }}>
              <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No playlists found</p>
            </div>
          ) : (
            <div>
              {filteredSpotifyPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleSelectSpotifyPlaylist(playlist)}
                  disabled={mergeMode}
                  className="w-full p-3 flex items-center gap-3 transition-colors text-left"
                  style={{
                    borderBottom: '1px solid var(--border-light)',
                    background: selectedSpotifyPlaylist?.id === playlist.id ? 'var(--green-pale)' : 'transparent',
                    borderLeft: selectedSpotifyPlaylist?.id === playlist.id ? '3px solid var(--green-primary)' : '3px solid transparent',
                    opacity: mergeMode ? 0.5 : 1,
                    cursor: mergeMode ? 'not-allowed' : 'pointer'
                  }}
                >
                  {playlist.image ? (
                    <img
                      src={playlist.image}
                      alt={playlist.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--bg-warm)' }}
                    >
                      <ListMusic className="w-5 h-5" style={{ color: 'var(--text-light)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-dark)' }}>
                      {playlist.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-medium)' }}>
                      {playlist.tracks_total} tracks
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className="p-3"
          style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-warm)' }}
        >
          <p className="text-xs text-center" style={{ color: 'var(--text-medium)' }}>
            {spotifyPlaylists.length} playlists
          </p>
        </div>
      </div>

      {/* Center - Selected Playlist Details */}
      <div className={`flex-1 overflow-auto ${mergeMode ? 'mt-14' : ''}`} style={{ background: 'var(--bg-cream)' }}>
        {selectedSpotifyPlaylist && activeView === "spotify" ? (
          <div className="p-8">
            {/* Spotify Playlist Header */}
            <div className="flex items-start gap-6 mb-8">
              {selectedSpotifyPlaylist.image ? (
                <img
                  src={selectedSpotifyPlaylist.image}
                  alt={selectedSpotifyPlaylist.name}
                  className="w-40 h-40 rounded-2xl object-cover shadow-lg"
                />
              ) : (
                <div
                  className="w-40 h-40 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--bg-warm)' }}
                >
                  <ListMusic className="w-12 h-12" style={{ color: 'var(--text-light)' }} />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="tag" style={{ background: '#1DB95420', color: '#1DB954' }}>
                    Spotify
                  </span>
                </div>
                <h1 className="heading-lg mb-2" style={{ color: 'var(--text-dark)' }}>
                  {selectedSpotifyPlaylist.name}
                </h1>
                <p className="mb-4" style={{ color: 'var(--text-medium)' }}>
                  {selectedSpotifyPlaylist.owner} • {selectedSpotifyPlaylist.tracks_total} tracks
                </p>

                {/* Migration Controls */}
                {isTidalConnected ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Destination Picker */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setShowDestinationPicker(!showDestinationPicker)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                        style={{
                          background: 'white',
                          border: '1px solid var(--border-light)',
                          color: 'var(--text-medium)'
                        }}
                      >
                        {destination === "favorites" ? (
                          <Heart className="w-4 h-4" style={{ color: 'var(--coral)' }} />
                        ) : destination === "new" ? (
                          <Plus className="w-4 h-4" style={{ color: 'var(--green-primary)' }} />
                        ) : (
                          <ListMusic className="w-4 h-4" style={{ color: 'var(--green-primary)' }} />
                        )}
                        <span>{getDestinationLabel()}</span>
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-light)' }} />
                      </button>

                      {/* Destination Dropdown */}
                      {showDestinationPicker && (
                        <div
                          className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-lg z-50 overflow-hidden"
                          style={{ background: 'white', border: '1px solid var(--border-light)' }}
                        >
                          {/* Favorites option */}
                          <button
                            onClick={() => {
                              setDestination("favorites");
                              setShowDestinationPicker(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                            style={{
                              background: destination === "favorites" ? 'var(--green-pale)' : 'transparent',
                              borderBottom: '1px solid var(--border-light)'
                            }}
                          >
                            <Heart className="w-5 h-5" style={{ color: 'var(--coral)' }} />
                            <div>
                              <p className="font-medium" style={{ color: 'var(--text-medium)' }}>Tidal Favorites</p>
                              <p className="text-xs" style={{ color: 'var(--text-light)' }}>Add to your liked songs</p>
                            </div>
                            {destination === "favorites" && (
                              <Check className="w-4 h-4 ml-auto" style={{ color: 'var(--green-primary)' }} />
                            )}
                          </button>

                          {/* Create new playlist option */}
                          <div
                            className="px-4 py-3"
                            style={{
                              background: destination === "new" ? 'var(--green-pale)' : 'transparent',
                              borderBottom: '1px solid var(--border-light)'
                            }}
                          >
                            <button
                              onClick={() => setDestination("new")}
                              className="w-full flex items-center gap-3 text-left"
                            >
                              <Plus className="w-5 h-5" style={{ color: 'var(--green-primary)' }} />
                              <div className="flex-1">
                                <p className="font-medium" style={{ color: 'var(--text-medium)' }}>Create New Playlist</p>
                                {destination === "new" ? (
                                  <input
                                    type="text"
                                    placeholder="Playlist name"
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 w-full px-2 py-1 rounded text-sm focus:outline-none"
                                    style={{
                                      background: 'white',
                                      border: '1px solid var(--border-light)',
                                      color: 'var(--text-medium)'
                                    }}
                                  />
                                ) : (
                                  <p className="text-xs" style={{ color: 'var(--text-light)' }}>Create a new playlist on Tidal</p>
                                )}
                              </div>
                              {destination === "new" && (
                                <Check className="w-4 h-4" style={{ color: 'var(--green-primary)' }} />
                              )}
                            </button>
                          </div>

                          {/* Existing Tidal playlists */}
                          {tidalPlaylists.length > 0 && (
                            <>
                              <div className="px-4 py-2" style={{ background: 'var(--bg-warm)' }}>
                                <p className="text-xs font-medium" style={{ color: 'var(--text-light)' }}>
                                  YOUR TIDAL PLAYLISTS
                                </p>
                              </div>
                              <div className="max-h-48 overflow-auto">
                                {tidalPlaylists.map((playlist) => (
                                  <button
                                    key={playlist.id}
                                    onClick={() => {
                                      setDestination(playlist.id);
                                      setShowDestinationPicker(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                                    style={{
                                      background: destination === playlist.id ? 'var(--green-pale)' : 'transparent',
                                    }}
                                  >
                                    <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-medium)' }} />
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium truncate" style={{ color: 'var(--text-medium)' }}>
                                        {playlist.name}
                                      </p>
                                      <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                                        {playlist.tracks_total} tracks
                                      </p>
                                    </div>
                                    {destination === playlist.id && (
                                      <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green-primary)' }} />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Migrate Button */}
                    <button
                      onClick={selectedTracks.size > 0 ? handleSelectiveMigrate : handleMigrate}
                      disabled={isMigrating || spotifyTracks.length === 0}
                      className="btn-primary"
                    >
                      {isMigrating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-5 h-5" />
                          {selectedTracks.size > 0
                            ? `Migrate ${selectedTracks.size} Track${selectedTracks.size !== 1 ? 's' : ''}`
                            : 'Migrate All'}
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigate("/settings")}
                    className="btn-secondary"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Connect Tidal to migrate
                  </button>
                )}
              </div>
            </div>

            {/* Migration Result */}
            {migrationResult && (
              <div
                className="p-4 rounded-2xl mb-6"
                style={{
                  background: migrationResult.success ? 'var(--green-pale)' : 'var(--peach)',
                  border: migrationResult.success ? '1px solid var(--green-light)' : '1px solid var(--coral-light)'
                }}
              >
                <div className="flex items-start gap-3">
                  {migrationResult.success ? (
                    <Check className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--green-primary)' }} />
                  ) : (
                    <X className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--coral)' }} />
                  )}
                  <div>
                    <h3 className="font-display font-semibold mb-1" style={{ color: 'var(--text-dark)' }}>
                      {migrationResult.success ? "Migration Complete!" : "Migration Failed"}
                    </h3>
                    {migrationResult.success ? (
                      <p style={{ color: 'var(--text-medium)' }}>
                        Successfully migrated {migrationResult.migrated} of{" "}
                        {migrationResult.total_tracks} tracks.
                        {migrationResult.not_found > 0 && (
                          <span style={{ color: 'var(--coral)' }}>
                            {" "}{migrationResult.not_found} tracks could not be found on Tidal.
                          </span>
                        )}
                      </p>
                    ) : (
                      <p style={{ color: 'var(--coral)' }}>{migrationResult.error}</p>
                    )}
                    {migrationResult.not_found_tracks.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-sm cursor-pointer" style={{ color: 'var(--text-medium)' }}>
                          Show tracks not found ({migrationResult.not_found_tracks.length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {migrationResult.not_found_tracks.map((track, i) => (
                            <li key={i} className="text-sm" style={{ color: 'var(--text-light)' }}>
                              • {track.name} - {track.artist}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Spotify Tracks */}
            <div className="card overflow-hidden">
              <div
                className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-4 p-4 text-sm font-medium items-center"
                style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-medium)' }}
              >
                {/* Select All Checkbox */}
                <div className="w-10 flex justify-center">
                  <button
                    onClick={allTracksSelected ? deselectAllTracks : selectAllTracks}
                    className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: allTracksSelected ? 'var(--green-primary)' : 'var(--border-light)',
                      background: allTracksSelected ? 'var(--green-primary)' : 'transparent',
                    }}
                    title={allTracksSelected ? "Deselect all" : "Select all"}
                  >
                    {allTracksSelected && <Check className="w-3 h-3 text-white" />}
                  </button>
                </div>
                <span className="w-8">#</span>
                <span>Title</span>
                <span>Album</span>
                <span>Duration</span>
              </div>

              {isLoadingSpotifyTracks ? (
                <TrackSkeleton />
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  {spotifyTracks.map((track, index) => {
                    const isSelected = selectedTracks.has(track.id);
                    return (
                      <div
                        key={`${track.id}-${index}`}
                        onClick={(e) => toggleTrack(track.id, index, e)}
                        className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-4 p-4 items-center transition-colors cursor-pointer select-none"
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          background: isSelected ? 'var(--green-pale)' : 'transparent',
                        }}
                        onMouseOver={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-warm)';
                        }}
                        onMouseOut={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {/* Checkbox */}
                        <div className="w-10 flex justify-center">
                          <div
                            className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                            style={{
                              borderColor: isSelected ? 'var(--green-primary)' : 'var(--border-light)',
                              background: isSelected ? 'var(--green-primary)' : 'transparent',
                            }}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <span className="w-8 text-sm" style={{ color: 'var(--text-light)' }}>{index + 1}</span>
                        <div className="flex items-center gap-3 min-w-0">
                          {track.image ? (
                            <img
                              src={track.image}
                              alt={track.album}
                              className="w-10 h-10 rounded-lg"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ background: 'var(--bg-warm)' }}
                            >
                              <Music className="w-5 h-5" style={{ color: 'var(--text-light)' }} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>{track.name}</p>
                            <p className="text-sm truncate" style={{ color: 'var(--text-medium)' }}>
                              {track.artist}
                            </p>
                          </div>
                        </div>
                        <p className="truncate" style={{ color: 'var(--text-medium)' }}>{track.album}</p>
                        <p className="text-sm" style={{ color: 'var(--text-light)' }}>
                          {formatDuration(track.duration_ms)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : selectedTidalPlaylist && activeView === "tidal" ? (
          <div className="p-8">
            {/* Tidal Playlist Header */}
            <div className="flex items-start gap-6 mb-8">
              {selectedTidalPlaylist.image ? (
                <img
                  src={selectedTidalPlaylist.image}
                  alt={selectedTidalPlaylist.name}
                  className="w-40 h-40 rounded-2xl object-cover shadow-lg"
                />
              ) : (
                <div
                  className="w-40 h-40 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--bg-warm)' }}
                >
                  <ListMusic className="w-12 h-12" style={{ color: 'var(--text-light)' }} />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="tag tag-blue">
                    Tidal
                  </span>
                </div>
                <h1 className="heading-lg mb-2" style={{ color: 'var(--text-dark)' }}>
                  {selectedTidalPlaylist.name}
                </h1>
                <p className="mb-4" style={{ color: 'var(--text-medium)' }}>
                  {selectedTidalPlaylist.tracks_total} tracks
                  {selectedTidalPlaylist.description && (
                    <span className="block text-sm mt-1">{selectedTidalPlaylist.description}</span>
                  )}
                </p>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Migrate to Spotify Button */}
                  <button
                    onClick={handleTidalToSpotify}
                    disabled={isMigrating || tidalTracks.length === 0}
                    className="btn-primary"
                    style={{ background: '#1DB954' }}
                  >
                    {isMigrating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Migrating...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-5 h-5" />
                        Migrate to Spotify
                      </>
                    )}
                  </button>

                  <button
                    onClick={startMergeMode}
                    disabled={isMerging}
                    className="btn-secondary"
                    style={{ borderColor: 'var(--blue-accent)', color: 'var(--blue-accent)' }}
                  >
                    <Merge className="w-4 h-4" />
                    Merge Another Playlist
                  </button>

                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--coral)' }}>Delete this playlist?</span>
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-4 py-2 font-semibold rounded-full transition-all"
                        style={{ background: 'var(--coral)', color: 'white' }}
                      >
                        {isDeleting ? "Deleting..." : "Yes, Delete"}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="btn-secondary"
                      style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Playlist
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Migration Result (Tidal to Spotify) */}
            {migrationResult && activeView === "tidal" && (
              <div
                className="p-4 rounded-2xl mb-6"
                style={{
                  background: migrationResult.success ? 'var(--green-pale)' : 'var(--peach)',
                  border: migrationResult.success ? '1px solid var(--green-light)' : '1px solid var(--coral-light)'
                }}
              >
                <div className="flex items-start gap-3">
                  {migrationResult.success ? (
                    <Check className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--green-primary)' }} />
                  ) : (
                    <X className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--coral)' }} />
                  )}
                  <div>
                    <h3 className="font-display font-semibold mb-1" style={{ color: 'var(--text-dark)' }}>
                      {migrationResult.success ? "Migration Complete!" : "Migration Failed"}
                    </h3>
                    {migrationResult.success ? (
                      <p style={{ color: 'var(--text-medium)' }}>
                        Successfully migrated {migrationResult.migrated} of{" "}
                        {migrationResult.total_tracks} tracks to Spotify.
                        {migrationResult.not_found > 0 && (
                          <span style={{ color: 'var(--coral)' }}>
                            {" "}{migrationResult.not_found} tracks could not be found on Spotify.
                          </span>
                        )}
                      </p>
                    ) : (
                      <p style={{ color: 'var(--coral)' }}>{migrationResult.error}</p>
                    )}
                    {migrationResult.not_found_tracks && migrationResult.not_found_tracks.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-sm cursor-pointer" style={{ color: 'var(--text-medium)' }}>
                          Show tracks not found ({migrationResult.not_found_tracks.length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {migrationResult.not_found_tracks.map((track, i) => (
                            <li key={i} className="text-sm" style={{ color: 'var(--text-light)' }}>
                              • {track.name} - {track.artist}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Merge Result */}
            {mergeResult && (
              <div
                className="p-4 rounded-2xl mb-6"
                style={{
                  background: mergeResult.success ? 'var(--blue-soft)' : 'var(--peach)',
                  border: mergeResult.success ? '1px solid var(--blue-accent)' : '1px solid var(--coral-light)'
                }}
              >
                <div className="flex items-start gap-3">
                  {mergeResult.success ? (
                    <Check className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--blue-accent)' }} />
                  ) : (
                    <X className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--coral)' }} />
                  )}
                  <div>
                    <h3 className="font-display font-semibold mb-1" style={{ color: 'var(--text-dark)' }}>
                      {mergeResult.success ? "Merge Complete!" : "Merge Failed"}
                    </h3>
                    {mergeResult.success ? (
                      <p style={{ color: 'var(--text-medium)' }}>
                        Added {mergeResult.tracks_added} tracks to this playlist.
                        {mergeResult.tracks_skipped > 0 && (
                          <span style={{ color: 'var(--coral)' }}>
                            {" "}{mergeResult.tracks_skipped} duplicate tracks were skipped.
                          </span>
                        )}
                        {" "}The source playlist has been deleted.
                      </p>
                    ) : (
                      <p style={{ color: 'var(--coral)' }}>{mergeResult.error}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tidal Tracks */}
            <div className="card overflow-hidden">
              <div
                className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 p-4 text-sm font-medium"
                style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-medium)' }}
              >
                <span className="w-8">#</span>
                <span>Title</span>
                <span>Album</span>
                <span>Duration</span>
              </div>

              {isLoadingTidalTracks ? (
                <TrackSkeleton />
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  {tidalTracks.map((track, index) => (
                    <div
                      key={`${track.id}-${index}`}
                      className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 p-4 items-center transition-colors"
                      style={{ borderBottom: '1px solid var(--border-light)' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-warm)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span className="w-8 text-sm" style={{ color: 'var(--text-light)' }}>{index + 1}</span>
                      <div className="flex items-center gap-3 min-w-0">
                        {track.image ? (
                          <img
                            src={track.image}
                            alt={track.album}
                            className="w-10 h-10 rounded-lg"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--bg-warm)' }}
                          >
                            <Music className="w-5 h-5" style={{ color: 'var(--text-light)' }} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>{track.name}</p>
                          <p className="text-sm truncate" style={{ color: 'var(--text-medium)' }}>
                            {track.artist}
                          </p>
                        </div>
                      </div>
                      <p className="truncate" style={{ color: 'var(--text-medium)' }}>{track.album}</p>
                      <p className="text-sm" style={{ color: 'var(--text-light)' }}>
                        {formatDuration(track.duration_ms)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'var(--green-pale)' }}
            >
              <ListMusic className="w-12 h-12" style={{ color: 'var(--green-primary)' }} />
            </div>
            <h2 className="heading-md mb-2" style={{ color: 'var(--text-dark)' }}>Select a Playlist</h2>
            <p className="max-w-md" style={{ color: 'var(--text-medium)' }}>
              Choose a playlist from Spotify or Tidal to view its tracks. Select a Spotify playlist to migrate it to Tidal.
            </p>
            {!isTidalConnected && (
              <div
                className="mt-6 p-4 rounded-2xl flex items-start gap-3 max-w-md"
                style={{ background: 'var(--peach)', border: '1px solid var(--coral-light)' }}
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--coral)' }} />
                <div className="text-left">
                  <p className="font-medium" style={{ color: 'var(--coral)' }}>Connect Tidal</p>
                  <p className="text-sm" style={{ color: 'var(--text-medium)' }}>
                    Go to Settings to connect your Tidal account to see your Tidal playlists and migrate from Spotify.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tidal Playlists Column */}
      <div
        className={`w-72 flex flex-col playlist-column ${mergeMode ? 'mt-14' : ''}`}
        style={{ background: 'var(--bg-warm)', borderLeft: '1px solid var(--border-light)' }}
      >
        <div
          className="p-4"
          style={{ borderBottom: '1px solid var(--border-light)', background: 'linear-gradient(135deg, var(--blue-soft) 0%, transparent 100%)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'var(--blue-accent)' }}
              >
                <ListMusic className="w-3.5 h-3.5 text-white" />
              </div>
              Tidal Playlists
            </h2>
            {isTidalConnected && (
              <button
                onClick={refreshTidalPlaylists}
                disabled={isLoadingTidal}
                className="p-1.5 rounded-lg transition-colors"
                title="Refresh playlists"
                style={{ color: 'var(--text-medium)' }}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingTidal ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          {isTidalConnected ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-light)' }} />
              <input
                type="text"
                placeholder="Search..."
                value={tidalSearchQuery}
                onChange={(e) => setTidalSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none transition-colors"
                style={{
                  background: 'var(--bg-warm)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-dark)'
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => navigate("/settings")}
              className="w-full py-2 px-4 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'var(--blue-soft)', color: 'var(--blue-accent)' }}
            >
              Connect Tidal
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {!isTidalConnected ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-medium)' }}>
              <div
                className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center"
                style={{ background: 'var(--bg-warm)' }}
              >
                <ListMusic className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-sm mb-2">Not connected</p>
              <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                Connect your Tidal account in Settings to see your playlists
              </p>
            </div>
          ) : isLoadingTidal ? (
            <PlaylistSkeleton />
          ) : filteredTidalPlaylists.length === 0 ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-medium)' }}>
              <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No playlists found</p>
            </div>
          ) : (
            <div>
              {filteredTidalPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleSelectTidalPlaylist(playlist)}
                  disabled={isMerging || (mergeMode && playlist.id === mergeTarget?.id)}
                  className="w-full p-3 flex items-center gap-3 transition-colors text-left"
                  style={{
                    borderBottom: '1px solid var(--border-light)',
                    background: mergeMode && playlist.id === mergeTarget?.id
                      ? 'var(--blue-soft)'
                      : selectedTidalPlaylist?.id === playlist.id && !mergeMode
                        ? 'var(--blue-soft)'
                        : 'transparent',
                    borderRight: selectedTidalPlaylist?.id === playlist.id && !mergeMode
                      ? '3px solid var(--blue-accent)'
                      : mergeMode && playlist.id === mergeTarget?.id
                        ? '3px solid var(--blue-accent)'
                        : '3px solid transparent',
                    opacity: isMerging || (mergeMode && playlist.id === mergeTarget?.id) ? 0.5 : 1,
                    cursor: isMerging || (mergeMode && playlist.id === mergeTarget?.id) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {playlist.image ? (
                    <img
                      src={playlist.image}
                      alt={playlist.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--bg-warm)' }}
                    >
                      <ListMusic className="w-5 h-5" style={{ color: 'var(--text-light)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-dark)' }}>
                      {playlist.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-medium)' }}>
                      {playlist.tracks_total} tracks
                    </p>
                  </div>
                  {mergeMode && playlist.id === mergeTarget?.id && (
                    <span
                      className="px-2 py-1 text-xs rounded-full"
                      style={{ background: 'var(--blue-accent)', color: 'white' }}
                    >
                      Target
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {isTidalConnected && (
          <div
            className="p-3"
            style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-warm)' }}
          >
            <p className="text-xs text-center" style={{ color: 'var(--text-medium)' }}>
              {tidalPlaylists.length} playlists
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
