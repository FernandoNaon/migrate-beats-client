import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Music,
  Disc3,
  Users,
  ListMusic,
  Clock,
  TrendingUp,
  Play,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  getTopTracks,
  getTopArtists,
  getRecentlyPlayed,
  getLibraryStats,
  type TopTrack,
  type TopArtist,
  type RecentTrack,
  type LibraryStats,
  type TimeRange,
} from "../lib/api";

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: "short_term", label: "Last 4 weeks" },
  { value: "medium_term", label: "Last 6 months" },
  { value: "long_term", label: "All time" },
];

export default function Dashboard() {
  const {
    spotifyCode,
    spotifyUser,
    isSpotifyConnected,
    isTidalConnected,
    tidalUser,
    isLoading: authLoading,
  } = useAuth();
  const navigate = useNavigate();

  const [timeRange, setTimeRange] = useState<TimeRange>("medium_term");
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isSpotifyConnected) {
      navigate("/");
    }
  }, [authLoading, isSpotifyConnected, navigate]);

  useEffect(() => {
    if (!spotifyCode) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [tracks, artists, recent, libraryStats] = await Promise.all([
          getTopTracks(spotifyCode, timeRange, 10),
          getTopArtists(spotifyCode, timeRange, 10),
          getRecentlyPlayed(spotifyCode, 10),
          getLibraryStats(spotifyCode),
        ]);
        setTopTracks(tracks);
        setTopArtists(artists);
        setRecentTracks(recent);
        setStats(libraryStats);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [spotifyCode, timeRange]);

  const formatPlayedAt = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
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

  const statCards = [
    {
      icon: Music,
      label: "Saved Tracks",
      value: stats?.saved_tracks ?? "-",
      color: 'var(--green-primary)',
      bg: 'var(--green-pale)',
    },
    {
      icon: ListMusic,
      label: "Playlists",
      value: stats?.playlists ?? "-",
      color: 'var(--blue-accent)',
      bg: 'var(--blue-soft)',
    },
    {
      icon: Disc3,
      label: "Saved Albums",
      value: stats?.saved_albums ?? "-",
      color: 'var(--coral)',
      bg: 'var(--peach)',
    },
    {
      icon: Users,
      label: "Following",
      value: stats?.followed_artists ?? "-",
      color: 'var(--green-light)',
      bg: 'var(--green-pale)',
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto" style={{ background: 'var(--bg-cream)', minHeight: '100%' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="heading-lg mb-2" style={{ color: 'var(--text-dark)' }}>
          Welcome back, {spotifyUser?.display_name?.split(" ")[0] || "there"}!
        </h1>
        <p style={{ color: 'var(--text-medium)' }}>Here's your Spotify listening activity</p>
      </div>

      {/* Quick Actions - Sync to Tidal */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {/* Spotify Status Card */}
        <div
          className="card p-6"
          style={{ background: 'linear-gradient(135deg, #1DB95415 0%, white 100%)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: '#1DB95420' }}
              >
                <svg
                  className="w-7 h-7"
                  viewBox="0 0 24 24"
                  fill="#1DB954"
                >
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg" style={{ color: 'var(--text-dark)' }}>Spotify</h3>
                <div className="flex items-center gap-2 text-sm" style={{ color: '#1DB954' }}>
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </div>
              </div>
            </div>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-medium)' }}>
            {stats?.playlists ?? 0} playlists • {stats?.saved_tracks ?? 0} saved tracks
          </p>
          <Link
            to="/migrate"
            className="inline-flex items-center gap-2 text-sm font-medium"
            style={{ color: '#1DB954' }}
          >
            Migrate Playlists
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Tidal Status/Sync Card */}
        <div
          className="card p-6"
          style={{
            background: isTidalConnected
              ? 'linear-gradient(135deg, var(--blue-soft) 0%, white 100%)'
              : 'var(--bg-warm)'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: isTidalConnected ? 'var(--blue-soft)' : 'var(--border-light)' }}
              >
            <svg
                      className="w-8 h-8"
                      viewBox="0 0 24 24"
                      fill="var(--text-dark)"
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
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg" style={{ color: 'var(--text-dark)' }}>Tidal</h3>
                {isTidalConnected ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--blue-accent)' }}>
                    <CheckCircle2 className="w-4 h-4" />
                    Connected as {tidalUser?.name}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-medium)' }}>
                    <XCircle className="w-4 h-4" />
                    Not connected
                  </div>
                )}
              </div>
            </div>
          </div>

          {isTidalConnected ? (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-medium)' }}>
                Ready to sync your playlists from Spotify to Tidal
              </p>
              <Link
                to="/migrate"
                className="inline-flex items-center gap-2 px-4 py-2 font-semibold rounded-full transition-colors"
                style={{ background: 'var(--blue-accent)', color: 'white' }}
              >
                <RefreshCw className="w-4 h-4" />
                Sync Playlists
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-medium)' }}>
                Connect Tidal to transfer your Spotify playlists
              </p>
              <Link
                to="/settings"
                className="btn-secondary"
              >
                Connect Tidal
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="card p-6 text-center"
          >
            <div
              className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: stat.bg }}
            >
              <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
            </div>
            <p className="text-2xl font-display font-semibold mb-1" style={{ color: 'var(--text-dark)' }}>
              {isLoading ? (
                <span
                  className="inline-block w-16 h-6 rounded animate-pulse"
                  style={{ background: 'var(--bg-warm)' }}
                />
              ) : (
                stat.value.toLocaleString()
              )}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-medium)' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5" style={{ color: 'var(--text-medium)' }} />
        <span className="mr-2" style={{ color: 'var(--text-medium)' }}>Time period:</span>
        <div className="pill-nav">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value)}
              className={timeRange === option.value ? "active" : ""}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Tracks */}
        <div className="card overflow-hidden p-0">
          <div
            className="p-4"
            style={{ borderBottom: '1px solid var(--border-light)' }}
          >
            <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
              <Music className="w-5 h-5" style={{ color: 'var(--green-primary)' }} />
              Top Tracks
            </h2>
          </div>
          <div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-4 flex items-center gap-3"
                    style={{ borderBottom: '1px solid var(--border-light)' }}
                  >
                    <div className="w-12 h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-warm)' }} />
                    <div className="flex-1">
                      <div className="w-32 h-4 rounded animate-pulse mb-2" style={{ background: 'var(--bg-warm)' }} />
                      <div className="w-24 h-3 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
                    </div>
                  </div>
                ))
              : topTracks.map((track, index) => (
                  <a
                    key={track.id}
                    href={`https://open.spotify.com/track/${track.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Spotify"
                    className="p-4 flex items-center gap-3 transition-colors group no-underline"
                    style={{ borderBottom: '1px solid var(--border-light)', color: 'inherit' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-warm)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="w-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>
                      {index + 1}
                    </span>
                    {track.image ? (
                      <img
                        src={track.image}
                        alt={track.album}
                        className="w-12 h-12 rounded-lg"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--bg-warm)' }}
                      >
                        <Music className="w-6 h-6" style={{ color: 'var(--text-light)' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>{track.name}</p>
                      <p className="text-sm truncate" style={{ color: 'var(--text-medium)' }}>
                        {track.artist}
                      </p>
                    </div>
                    <Play className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-light)' }} />
                  </a>
                ))}
          </div>
        </div>

        {/* Top Artists */}
        <div className="card overflow-hidden p-0">
          <div
            className="p-4"
            style={{ borderBottom: '1px solid var(--border-light)' }}
          >
            <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
              <Users className="w-5 h-5" style={{ color: 'var(--coral)' }} />
              Top Artists
            </h2>
          </div>
          <div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-4 flex items-center gap-3"
                    style={{ borderBottom: '1px solid var(--border-light)' }}
                  >
                    <div className="w-12 h-12 rounded-full animate-pulse" style={{ background: 'var(--bg-warm)' }} />
                    <div className="flex-1">
                      <div className="w-32 h-4 rounded animate-pulse mb-2" style={{ background: 'var(--bg-warm)' }} />
                      <div className="w-24 h-3 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
                    </div>
                  </div>
                ))
              : topArtists.map((artist, index) => (
                  <a
                    key={artist.id}
                    href={`https://open.spotify.com/artist/${artist.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Spotify"
                    className="p-4 flex items-center gap-3 transition-colors no-underline"
                    style={{ borderBottom: '1px solid var(--border-light)', color: 'inherit' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-warm)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="w-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>
                      {index + 1}
                    </span>
                    {artist.image ? (
                      <img
                        src={artist.image}
                        alt={artist.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--bg-warm)' }}
                      >
                        <Users className="w-6 h-6" style={{ color: 'var(--text-light)' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>{artist.name}</p>
                      <p className="text-sm truncate" style={{ color: 'var(--text-medium)' }}>
                        {artist.genres.slice(0, 2).join(", ") || "No genres"}
                      </p>
                    </div>
                  </a>
                ))}
          </div>
        </div>

        {/* Recently Played */}
        <div className="card overflow-hidden p-0">
          <div
            className="p-4"
            style={{ borderBottom: '1px solid var(--border-light)' }}
          >
            <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
              <Clock className="w-5 h-5" style={{ color: 'var(--blue-accent)' }} />
              Recently Played
            </h2>
          </div>
          <div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-4 flex items-center gap-3"
                    style={{ borderBottom: '1px solid var(--border-light)' }}
                  >
                    <div className="w-12 h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-warm)' }} />
                    <div className="flex-1">
                      <div className="w-32 h-4 rounded animate-pulse mb-2" style={{ background: 'var(--bg-warm)' }} />
                      <div className="w-24 h-3 rounded animate-pulse" style={{ background: 'var(--bg-warm)' }} />
                    </div>
                  </div>
                ))
              : recentTracks.map((track, index) => (
                  <a
                    key={`${track.id}-${index}`}
                    href={`https://open.spotify.com/track/${track.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Spotify"
                    className="p-4 flex items-center gap-3 transition-colors no-underline"
                    style={{ borderBottom: '1px solid var(--border-light)', color: 'inherit' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-warm)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {track.image ? (
                      <img
                        src={track.image}
                        alt={track.album}
                        className="w-12 h-12 rounded-lg"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--bg-warm)' }}
                      >
                        <Music className="w-6 h-6" style={{ color: 'var(--text-light)' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>{track.name}</p>
                      <p className="text-sm truncate" style={{ color: 'var(--text-medium)' }}>
                        {track.artist}
                      </p>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-light)' }}>
                      {formatPlayedAt(track.played_at)}
                    </span>
                  </a>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
