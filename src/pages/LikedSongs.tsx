import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  Music,
  Search,
  Check,
  X,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  Loader2,
  ListMusic,
  Plus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  fetchLikedSongs,
  fetchTidalLikedSongs,
  fetchTidalPlaylists,
  fetchPlaylists,
  migrateTracks,
  migrateTidalTracks,
  moveLikedToPlaylist,
  type LikedTrack,
  type TidalLikedTrack,
  type MigrationResult,
  type TrackToMigrate,
  type TidalPlaylist,
  type Playlist,
} from "../lib/api";
import PlaylistPickerModal from "../components/PlaylistPickerModal";

export default function LikedSongs() {
  const {
    spotifyCode,
    isSpotifyConnected,
    tidalSessionId,
    isTidalConnected,
    isLoading: authLoading,
  } = useAuth();
  const navigate = useNavigate();

  // Source toggle: "spotify" or "tidal"
  const [source, setSource] = useState<"spotify" | "tidal">("spotify");

  // Spotify Tracks state
  const [spotifyTracks, setSpotifyTracks] = useState<LikedTrack[]>([]);
  const [spotifyTotalTracks, setSpotifyTotalTracks] = useState(0);
  const [spotifyHasMore, setSpotifyHasMore] = useState(true);

  // Tidal Tracks state
  const [tidalTracks, setTidalTracks] = useState<TidalLikedTrack[]>([]);
  const [tidalTotalTracks, setTidalTotalTracks] = useState(0);
  const [tidalHasMore, setTidalHasMore] = useState(true);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Selection state
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] =
    useState<MigrationResult | null>(null);
  const [playlistName, setPlaylistName] = useState("My Liked Songs");
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);

  // Destination options for Spotify->Tidal: "favorites", "new", or tidal playlist ID
  // Destination options for Tidal->Spotify: "liked", "new", or spotify playlist ID
  const [destination, setDestination] = useState<string>("favorites");
  const [tidalPlaylists, setTidalPlaylists] = useState<TidalPlaylist[]>([]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);

  // Move-to-playlist (Spotify-only) state
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [movePickerSearch, setMovePickerSearch] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [moveToast, setMoveToast] = useState<{ kind: "info" | "error"; msg: string } | null>(null);
  const altKeyRef = useRef(false);
  const [altKeyDown, setAltKeyDown] = useState(false);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.altKey && !altKeyRef.current) {
        altKeyRef.current = true;
        setAltKeyDown(true);
      }
    }
    function up(e: KeyboardEvent) {
      if (!e.altKey && altKeyRef.current) {
        altKeyRef.current = false;
        setAltKeyDown(false);
      }
    }
    function blur() {
      altKeyRef.current = false;
      setAltKeyDown(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  async function handleMoveToPlaylist(target: Playlist, copyOnly: boolean) {
    if (!spotifyCode || selectedTracks.size === 0) return;
    setIsMoving(true);
    const ids = Array.from(selectedTracks);
    try {
      const result = await moveLikedToPlaylist(spotifyCode, target.id, ids, copyOnly);
      // Update local state: if we actually moved, remove from liked list
      if (!copyOnly) {
        setSpotifyTracks((prev) => prev.filter((t) => !selectedTracks.has(t.id)));
        setSpotifyTotalTracks((t) => Math.max(0, t - result.removed));
      }
      setSelectedTracks(new Set());
      setShowMovePicker(false);
      setMovePickerSearch("");
      setMoveToast({
        kind: "info",
        msg: copyOnly
          ? `Copied ${result.added} track${result.added !== 1 ? "s" : ""} to "${target.name}" (kept in Liked).`
          : `Moved ${result.added} track${result.added !== 1 ? "s" : ""} to "${target.name}".`,
      });
      setTimeout(() => setMoveToast(null), 4500);
    } catch (e: any) {
      setMoveToast({ kind: "error", msg: `Couldn't move: ${e.message}` });
      setTimeout(() => setMoveToast(null), 4500);
    } finally {
      setIsMoving(false);
    }
  }

  // Computed values based on source
  const tracks = source === "spotify" ? spotifyTracks : tidalTracks;
  const totalTracks =
    source === "spotify" ? spotifyTotalTracks : tidalTotalTracks;
  const hasMore = source === "spotify" ? spotifyHasMore : tidalHasMore;

  useEffect(() => {
    if (!authLoading && !isSpotifyConnected) {
      navigate("/");
    }
  }, [authLoading, isSpotifyConnected, navigate]);

  // Reset selection when source changes
  useEffect(() => {
    setSelectedTracks(new Set());
    setSearchQuery("");
    setMigrationResult(null);
    setDestination(source === "spotify" ? "favorites" : "liked");
  }, [source]);

  // Load destination playlists based on source
  useEffect(() => {
    const loadPlaylists = async () => {
      setIsLoadingPlaylists(true);
      try {
        if (source === "spotify" && tidalSessionId && isTidalConnected) {
          // Migrating to Tidal, load Tidal playlists
          const playlists = await fetchTidalPlaylists(tidalSessionId);
          setTidalPlaylists(playlists);
        } else if (source === "tidal" && spotifyCode) {
          // Migrating to Spotify, load Spotify playlists
          const playlists = await fetchPlaylists(spotifyCode);
          setSpotifyPlaylists(playlists);
        }
      } catch (error) {
        console.error("Error fetching playlists:", error);
      } finally {
        setIsLoadingPlaylists(false);
      }
    };

    loadPlaylists();
  }, [source, tidalSessionId, isTidalConnected, spotifyCode]);

  // Load Spotify liked songs
  useEffect(() => {
    if (!spotifyCode) return;

    const loadLikedSongs = async () => {
      setIsLoading(true);
      try {
        const data = await fetchLikedSongs(spotifyCode, 50, 0);
        setSpotifyTracks(data.tracks);
        setSpotifyTotalTracks(data.total);
        setSpotifyHasMore(data.has_more);
      } catch (error) {
        console.error("Error fetching Spotify liked songs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLikedSongs();
  }, [spotifyCode]);

  // Load Tidal liked songs
  useEffect(() => {
    if (!tidalSessionId || !isTidalConnected) return;

    const loadTidalLikedSongs = async () => {
      if (source === "tidal") setIsLoading(true);
      try {
        const data = await fetchTidalLikedSongs(tidalSessionId, 50, 0);
        setTidalTracks(data.tracks);
        setTidalTotalTracks(data.total);
        setTidalHasMore(data.has_more);
      } catch (error) {
        console.error("Error fetching Tidal liked songs:", error);
      } finally {
        if (source === "tidal") setIsLoading(false);
      }
    };

    loadTidalLikedSongs();
  }, [tidalSessionId, isTidalConnected, source]);

  // Load more songs
  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      if (source === "spotify" && spotifyCode) {
        const data = await fetchLikedSongs(
          spotifyCode,
          50,
          spotifyTracks.length,
        );
        setSpotifyTracks((prev) => [...prev, ...data.tracks]);
        setSpotifyHasMore(data.has_more);
      } else if (source === "tidal" && tidalSessionId) {
        const data = await fetchTidalLikedSongs(
          tidalSessionId,
          50,
          tidalTracks.length,
        );
        setTidalTracks((prev) => [...prev, ...data.tracks]);
        setTidalHasMore(data.has_more);
      }
    } catch (error) {
      console.error("Error loading more songs:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Filter tracks by search query
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const query = searchQuery.toLowerCase();
    return tracks.filter(
      (track) =>
        track.name.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query),
    );
  }, [tracks, searchQuery]);

  // Toggle track selection with shift-click range support
  const toggleTrack = (
    trackId: string,
    index: number,
    event: React.MouseEvent,
  ) => {
    // Shift-click for range selection
    if (event.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeIds = filteredTracks.slice(start, end + 1).map((t) => t.id);

      setSelectedTracks((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      // Normal click - toggle single track
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

  // Select all visible tracks
  const selectAll = () => {
    const visibleIds = new Set(filteredTracks.map((t) => t.id));
    setSelectedTracks(visibleIds);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedTracks(new Set());
  };

  // Handle migration - supports both Spotify->Tidal and Tidal->Spotify
  const handleMigrate = async () => {
    if (!spotifyCode || !tidalSessionId || selectedTracks.size === 0) return;

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const tracksToMigrate: TrackToMigrate[] = tracks
        .filter((t) => selectedTracks.has(t.id))
        .map((t) => ({
          name: t.name,
          artist: t.artists?.[0] || t.artist.split(",")[0].trim(),
          album: t.album,
        }));

      let result: MigrationResult;

      if (source === "spotify") {
        // Spotify -> Tidal
        result = await migrateTracks({
          spotifyCode,
          tidalSessionId,
          tracks: tracksToMigrate,
          playlistName: destination === "new" ? playlistName : undefined,
          targetPlaylistId:
            destination !== "favorites" && destination !== "new"
              ? destination
              : undefined,
          addToFavorites: destination === "favorites",
        });
      } else {
        // Tidal -> Spotify
        result = await migrateTidalTracks({
          spotifyCode,
          tidalSessionId,
          tracks: tracksToMigrate,
          playlistName: destination === "new" ? playlistName : undefined,
          targetPlaylistId:
            destination !== "liked" && destination !== "new"
              ? destination
              : undefined,
          addToLiked: destination === "liked",
        });
      }

      setMigrationResult(result);

      if (result.success) {
        setSelectedTracks(new Set());
        setShowDestinationPicker(false);
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

  // Get destination label
  const getDestinationLabel = () => {
    if (source === "spotify") {
      // Migrating to Tidal
      if (destination === "favorites") return "Tidal Favorites";
      if (destination === "new") return playlistName || "New Playlist";
      const playlist = tidalPlaylists.find((p) => p.id === destination);
      return playlist?.name || "Select destination";
    } else {
      // Migrating to Spotify
      if (destination === "liked") return "Spotify Liked Songs";
      if (destination === "new") return playlistName || "New Playlist";
      const playlist = spotifyPlaylists.find((p) => p.id === destination);
      return playlist?.name || "Select destination";
    }
  };

  // Click outside to close dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (authLoading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ background: "var(--bg-cream)" }}
      >
        <div
          className="w-12 h-12 rounded-full animate-spin"
          style={{
            border: "4px solid var(--green-pale)",
            borderTopColor: "var(--green-primary)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="p-8 max-w-6xl mx-auto"
      style={{ background: "var(--bg-cream)", minHeight: "100%" }}
    >
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background:
                  source === "spotify" ? "#1DB954" : "var(--text-dark)",
                color: "white",
              }}
            >
              <Heart className="w-8 h-8" />
            </div>
            <div>
              <h1 className="heading-lg" style={{ color: "var(--text-dark)" }}>
                Liked Songs
              </h1>
              <p style={{ color: "var(--text-medium)" }}>
                {totalTracks.toLocaleString()} songs from{" "}
                {source === "spotify" ? "Spotify" : "Tidal"}
              </p>
            </div>
          </div>

          {/* Source Toggle */}
          {isTidalConnected && (
            <div
              className="flex items-center gap-2 p-1 rounded-xl"
              style={{ background: "var(--bg-warm)" }}
            >
              <button
                onClick={() => setSource("spotify")}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                style={{
                  background: source === "spotify" ? "#1DB954" : "transparent",
                  color: source === "spotify" ? "white" : "var(--text-medium)",
                }}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Spotify
              </button>
              <button
                onClick={() => setSource("tidal")}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                style={{
                  background:
                    source === "tidal" ? "var(--text-dark)" : "transparent",
                  color: source === "tidal" ? "white" : "var(--text-medium)",
                }}
              >
                <svg
                  className="w-8 h-8"
                  viewBox="0 0 24 24"
                  fill="var(--text-medium)"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="
    M6 4 L3 7 L6 10 L9 7 Z
    M12 4 L9 7 L12 10 L15 7 Z
    M18 4 L15 7 L18 10 L21 7 Z
    M12 10 L9 13 L12 16 L15 13 Z
  "
                  />
                </svg>
                Tidal
              </button>
            </div>
          )}
        </div>

        {/* Search and Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
              style={{ color: "var(--text-light)" }}
            />
            <input
              type="text"
              placeholder="Search your liked songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl focus:outline-none"
              style={{
                background: "var(--bg-warm)",
                border: "1px solid var(--border-light)",
                color: "var(--text-dark)",
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-xs hidden sm:inline"
              style={{ color: "var(--text-light)" }}
            >
              Tip: Shift+click to select range
            </span>
            <button
              onClick={selectAll}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: "var(--green-pale)",
                color: "var(--green-primary)",
              }}
            >
              Select All ({filteredTracks.length})
            </button>
            {selectedTracks.size > 0 && (
              <button
                onClick={deselectAll}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: "var(--bg-warm)",
                  color: "var(--text-medium)",
                }}
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Selection Summary & Migrate Button */}
      {selectedTracks.size > 0 && (
        <div
          className="mb-6 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{
            background: "var(--green-pale)",
            border: "1px solid var(--green-light)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "var(--green-primary)", color: "white" }}
            >
              <Check className="w-5 h-5" />
            </div>
            <div>
              <p
                className="font-medium"
                style={{ color: "var(--green-primary)" }}
              >
                {selectedTracks.size} track
                {selectedTracks.size !== 1 ? "s" : ""} selected
              </p>
              <p className="text-sm" style={{ color: "var(--text-medium)" }}>
                Ready to migrate to {source === "spotify" ? "Tidal" : "Spotify"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Destination Picker */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDestinationPicker(!showDestinationPicker)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "white",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-medium)",
                }}
              >
                {destination === "favorites" || destination === "liked" ? (
                  <Heart
                    className="w-4 h-4"
                    style={{ color: "var(--coral)" }}
                  />
                ) : destination === "new" ? (
                  <Plus
                    className="w-4 h-4"
                    style={{ color: "var(--green-primary)" }}
                  />
                ) : (
                  <ListMusic
                    className="w-4 h-4"
                    style={{ color: "var(--green-primary)" }}
                  />
                )}
                <span>{getDestinationLabel()}</span>
                <ChevronDown
                  className="w-4 h-4"
                  style={{ color: "var(--text-light)" }}
                />
              </button>

              {/* Dropdown */}
              {showDestinationPicker && (
                <div
                  className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-lg z-50 overflow-hidden"
                  style={{
                    background: "white",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  {/* Liked/Favorites option */}
                  <button
                    onClick={() => {
                      setDestination(
                        source === "spotify" ? "favorites" : "liked",
                      );
                      setShowDestinationPicker(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background:
                        destination === "favorites" || destination === "liked"
                          ? "var(--green-pale)"
                          : "transparent",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    <Heart
                      className="w-5 h-5"
                      style={{ color: "var(--coral)" }}
                    />
                    <div>
                      <p
                        className="font-medium"
                        style={{ color: "var(--text-medium)" }}
                      >
                        {source === "spotify"
                          ? "Tidal Favorites"
                          : "Spotify Liked Songs"}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-light)" }}
                      >
                        Add to your liked songs
                      </p>
                    </div>
                    {(destination === "favorites" ||
                      destination === "liked") && (
                      <Check
                        className="w-4 h-4 ml-auto"
                        style={{ color: "var(--green-primary)" }}
                      />
                    )}
                  </button>

                  {/* Create new playlist option */}
                  <div
                    className="px-4 py-3"
                    style={{
                      background:
                        destination === "new"
                          ? "var(--green-pale)"
                          : "transparent",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    <button
                      onClick={() => setDestination("new")}
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <Plus
                        className="w-5 h-5"
                        style={{ color: "var(--green-primary)" }}
                      />
                      <div className="flex-1">
                        <p
                          className="font-medium"
                          style={{ color: "var(--text-medium)" }}
                        >
                          Create New Playlist
                        </p>
                        {destination === "new" ? (
                          <input
                            type="text"
                            placeholder="Playlist name"
                            value={playlistName}
                            onChange={(e) => setPlaylistName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 w-full px-2 py-1 rounded text-sm focus:outline-none"
                            style={{
                              background: "white",
                              border: "1px solid var(--border-light)",
                              color: "var(--text-medium)",
                            }}
                          />
                        ) : (
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-light)" }}
                          >
                            Create a new playlist on{" "}
                            {source === "spotify" ? "Tidal" : "Spotify"}
                          </p>
                        )}
                      </div>
                      {destination === "new" && (
                        <Check
                          className="w-4 h-4"
                          style={{ color: "var(--green-primary)" }}
                        />
                      )}
                    </button>
                  </div>

                  {/* Existing playlists - show Tidal or Spotify based on source */}
                  {source === "spotify" && tidalPlaylists.length > 0 && (
                    <>
                      <div
                        className="px-4 py-2"
                        style={{ background: "var(--bg-warm)" }}
                      >
                        <p
                          className="text-xs font-medium"
                          style={{ color: "var(--text-light)" }}
                        >
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
                              background:
                                destination === playlist.id
                                  ? "var(--green-pale)"
                                  : "transparent",
                            }}
                          >
                            <ListMusic
                              className="w-4 h-4 flex-shrink-0"
                              style={{ color: "var(--text-medium)" }}
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className="font-medium truncate"
                                style={{ color: "var(--text-medium)" }}
                              >
                                {playlist.name}
                              </p>
                              <p
                                className="text-xs"
                                style={{ color: "var(--text-light)" }}
                              >
                                {playlist.tracks_total} tracks
                              </p>
                            </div>
                            {destination === playlist.id && (
                              <Check
                                className="w-4 h-4 flex-shrink-0"
                                style={{ color: "var(--green-primary)" }}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Spotify playlists (when source is Tidal) */}
                  {source === "tidal" && spotifyPlaylists.length > 0 && (
                    <>
                      <div
                        className="px-4 py-2"
                        style={{ background: "var(--bg-warm)" }}
                      >
                        <p
                          className="text-xs font-medium"
                          style={{ color: "var(--text-light)" }}
                        >
                          YOUR SPOTIFY PLAYLISTS
                        </p>
                      </div>
                      <div className="max-h-48 overflow-auto">
                        {spotifyPlaylists.map((playlist) => (
                          <button
                            key={playlist.id}
                            onClick={() => {
                              setDestination(playlist.id);
                              setShowDestinationPicker(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                            style={{
                              background:
                                destination === playlist.id
                                  ? "var(--green-pale)"
                                  : "transparent",
                            }}
                          >
                            <ListMusic
                              className="w-4 h-4 flex-shrink-0"
                              style={{ color: "var(--text-medium)" }}
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className="font-medium truncate"
                                style={{ color: "var(--text-medium)" }}
                              >
                                {playlist.name}
                              </p>
                              <p
                                className="text-xs"
                                style={{ color: "var(--text-light)" }}
                              >
                                {playlist.tracks_total} tracks
                              </p>
                            </div>
                            {destination === playlist.id && (
                              <Check
                                className="w-4 h-4 flex-shrink-0"
                                style={{ color: "var(--green-primary)" }}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {isLoadingPlaylists && (
                    <div
                      className="px-4 py-3 flex items-center gap-2"
                      style={{ color: "var(--text-medium)" }}
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading playlists...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Move-to-playlist (Spotify source only — Spotify liked → Spotify playlist) */}
            {source === "spotify" && (
              <button
                onClick={() => setShowMovePicker(true)}
                disabled={isMoving || selectedTracks.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: "white", border: "1px solid var(--border-light)", color: "var(--text-dark)" }}
                title={`Move into a Spotify playlist. Hold ⌥ Option when picking to copy instead.`}
              >
                {isMoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListMusic className="w-4 h-4" />}
                Move to playlist…
              </button>
            )}

            {/* Migrate button - show based on destination availability */}
            {(source === "spotify" ? isTidalConnected : isSpotifyConnected) ? (
              <button
                onClick={handleMigrate}
                disabled={isMigrating || selectedTracks.size === 0}
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
                    Migrate to {source === "spotify" ? "Tidal" : "Spotify"}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => navigate("/settings")}
                className="btn-secondary"
              >
                Connect {source === "spotify" ? "Tidal" : "Spotify"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Move-to-playlist toast */}
      {moveToast && (
        <div
          className="mb-4 flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            background: moveToast.kind === "error" ? "var(--peach)" : "var(--green-pale)",
            color: moveToast.kind === "error" ? "var(--coral)" : "var(--green-primary)",
          }}
        >
          <AlertCircle className="w-4 h-4" />
          {moveToast.msg}
        </div>
      )}

      {/* Move-to-playlist picker */}
      {showMovePicker && (
        <PlaylistPickerModal
          playlists={spotifyPlaylists}
          loading={isLoadingPlaylists}
          search={movePickerSearch}
          setSearch={setMovePickerSearch}
          title={altKeyDown ? "Copy to playlist" : "Move to playlist"}
          onPick={(p) => handleMoveToPlaylist(p, altKeyRef.current)}
          onClose={() => {
            setShowMovePicker(false);
            setMovePickerSearch("");
          }}
          footer={
            <span>
              Picking a playlist will <strong>move</strong> the selected{" "}
              {selectedTracks.size} track{selectedTracks.size !== 1 ? "s" : ""} (remove from Liked). Hold{" "}
              <kbd
                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
              >
                ⌥ Option
              </kbd>{" "}
              while clicking to <strong>copy</strong> instead (keep in Liked).
              {altKeyDown && (
                <span
                  className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: "var(--blue-accent)", color: "white" }}
                >
                  COPY MODE
                </span>
              )}
            </span>
          }
        />
      )}

      {/* Migration Result */}
      {migrationResult && (
        <div
          className="mb-6 p-4 rounded-2xl"
          style={{
            background: migrationResult.success
              ? "var(--green-pale)"
              : "var(--peach)",
            border: migrationResult.success
              ? "1px solid var(--green-light)"
              : "1px solid var(--coral-light)",
          }}
        >
          <div className="flex items-start gap-3">
            {migrationResult.success ? (
              <Check
                className="w-6 h-6 flex-shrink-0"
                style={{ color: "var(--green-primary)" }}
              />
            ) : (
              <X
                className="w-6 h-6 flex-shrink-0"
                style={{ color: "var(--coral)" }}
              />
            )}
            <div>
              <h3
                className="font-display font-semibold mb-1"
                style={{ color: "var(--text-dark)" }}
              >
                {migrationResult.success
                  ? "Migration Complete!"
                  : "Migration Failed"}
              </h3>
              {migrationResult.success ? (
                <p style={{ color: "var(--text-medium)" }}>
                  Successfully migrated {migrationResult.migrated} of{" "}
                  {migrationResult.total_tracks} tracks to "
                  {migrationResult.playlist_name}".
                  {migrationResult.not_found > 0 && (
                    <span style={{ color: "var(--coral)" }}>
                      {" "}
                      {migrationResult.not_found} tracks could not be found on{" "}
                      {source === "spotify" ? "Tidal" : "Spotify"}.
                    </span>
                  )}
                </p>
              ) : (
                <p style={{ color: "var(--coral)" }}>{migrationResult.error}</p>
              )}
              {migrationResult.not_found_tracks &&
                migrationResult.not_found_tracks.length > 0 && (
                  <details className="mt-2">
                    <summary
                      className="text-sm cursor-pointer"
                      style={{ color: "var(--text-medium)" }}
                    >
                      Show tracks not found (
                      {migrationResult.not_found_tracks.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {migrationResult.not_found_tracks.map((track, i) => (
                        <li
                          key={i}
                          className="text-sm"
                          style={{ color: "var(--text-light)" }}
                        >
                          {track.name} - {track.artist}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Not connected warning - show for Tidal if viewing Spotify, vice versa */}
      {source === "spotify" && !isTidalConnected && (
        <div
          className="mb-6 p-4 rounded-2xl flex items-start gap-3"
          style={{
            background: "var(--peach)",
            border: "1px solid var(--coral-light)",
          }}
        >
          <AlertCircle
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: "var(--coral)" }}
          />
          <div>
            <p className="font-medium" style={{ color: "var(--coral)" }}>
              Connect Tidal
            </p>
            <p className="text-sm" style={{ color: "var(--text-medium)" }}>
              Go to Settings to connect your Tidal account before migrating
              songs.
            </p>
          </div>
        </div>
      )}

      {/* Tracks List */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div
          className="grid grid-cols-[auto_auto_1fr_1fr_auto_auto] gap-4 p-4 text-sm font-medium items-center"
          style={{
            borderBottom: "1px solid var(--border-light)",
            color: "var(--text-medium)",
          }}
        >
          {/* Select All Checkbox */}
          <div className="w-10 flex justify-center">
            <button
              onClick={
                selectedTracks.size === filteredTracks.length &&
                filteredTracks.length > 0
                  ? deselectAll
                  : selectAll
              }
              className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
              style={{
                borderColor:
                  selectedTracks.size === filteredTracks.length &&
                  filteredTracks.length > 0
                    ? "var(--green-primary)"
                    : "var(--border-light)",
                background:
                  selectedTracks.size === filteredTracks.length &&
                  filteredTracks.length > 0
                    ? "var(--green-primary)"
                    : "transparent",
              }}
              title={
                selectedTracks.size === filteredTracks.length
                  ? "Deselect all"
                  : "Select all"
              }
            >
              {selectedTracks.size === filteredTracks.length &&
                filteredTracks.length > 0 && (
                  <Check className="w-3 h-3 text-white" />
                )}
            </button>
          </div>
          <span className="w-8">#</span>
          <span>Title</span>
          <span>Album</span>
          <span>Added</span>
          <span>Duration</span>
        </div>

        {/* Track list */}
        {isLoading ? (
          <div className="p-8 text-center">
            <div
              className="w-10 h-10 mx-auto rounded-full animate-spin mb-4"
              style={{
                border: "3px solid var(--green-pale)",
                borderTopColor: "var(--green-primary)",
              }}
            />
            <p style={{ color: "var(--text-medium)" }}>
              Loading your liked songs...
            </p>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="p-8 text-center">
            <Heart
              className="w-12 h-12 mx-auto mb-4 opacity-30"
              style={{ color: "var(--text-light)" }}
            />
            <p style={{ color: "var(--text-medium)" }}>
              {searchQuery
                ? "No songs match your search"
                : "No liked songs found"}
            </p>
          </div>
        ) : (
          <>
            <div className="max-h-[600px] overflow-auto">
              {filteredTracks.map((track, index) => {
                const isSelected = selectedTracks.has(track.id);
                return (
                  <div
                    key={track.id}
                    onClick={(e) => toggleTrack(track.id, index, e)}
                    className="grid grid-cols-[auto_auto_1fr_1fr_auto_auto] gap-4 p-4 items-center cursor-pointer transition-colors select-none"
                    style={{
                      borderBottom: "1px solid var(--border-light)",
                      background: isSelected
                        ? "var(--green-pale)"
                        : "transparent",
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "var(--bg-warm)";
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Checkbox */}
                    <div className="w-10 flex justify-center">
                      <div
                        className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                        style={{
                          borderColor: isSelected
                            ? "var(--green-primary)"
                            : "var(--border-light)",
                          background: isSelected
                            ? "var(--green-primary)"
                            : "transparent",
                        }}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>

                    {/* Number */}
                    <span
                      className="w-8 text-sm"
                      style={{ color: "var(--text-light)" }}
                    >
                      {index + 1}
                    </span>

                    {/* Track info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {track.image ? (
                        <img
                          src={track.image}
                          alt={track.album}
                          className="w-10 h-10 rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "var(--bg-warm)" }}
                        >
                          <Music
                            className="w-5 h-5"
                            style={{ color: "var(--text-light)" }}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p
                          className="font-medium truncate"
                          style={{ color: "var(--text-dark)" }}
                        >
                          {track.name}
                        </p>
                        <p
                          className="text-sm truncate"
                          style={{ color: "var(--text-medium)" }}
                        >
                          {track.artist}
                        </p>
                      </div>
                    </div>

                    {/* Album */}
                    <p
                      className="truncate"
                      style={{ color: "var(--text-medium)" }}
                    >
                      {track.album}
                    </p>

                    {/* Added date */}
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-light)" }}
                    >
                      {track.added_at ? formatDate(track.added_at) : "-"}
                    </p>

                    {/* Duration */}
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-light)" }}
                    >
                      {formatDuration(track.duration_ms)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Load More */}
            {hasMore && !searchQuery && (
              <div
                className="p-4 text-center"
                style={{ borderTop: "1px solid var(--border-light)" }}
              >
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-full font-medium transition-colors"
                  style={{
                    background: "var(--bg-warm)",
                    color: "var(--text-dark)",
                  }}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Load More ({tracks.length} of {totalTracks})
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
