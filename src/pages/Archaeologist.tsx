import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScanSearch,
  RefreshCw,
  Loader2,
  AlertCircle,
  Music,
  Layers,
  Users,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Compass,
  HardDrive,
  Disc,
  Clock,
  Activity,
  Gem,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  fetchArchStatus,
  refreshArchSnapshot,
  fetchArchOverview,
  fetchArchPlaylistOverlap,
  fetchArchArtistDominance,
  fetchArchForgotten,
  fetchArchPlaylistHealth,
  fetchArchEvolution,
  fetchArchGenreClusters,
  fetchArchGenreOutliers,
  fetchArchHiddenGems,
  fetchArchCoOccurrence,
  type ArchSnapshotStatus,
  type ArchOverview,
  type ArchOverlapPair,
  type ArchArtistDominance,
  type ArchForgottenTrack,
  type ArchPlaylistHealth,
  type ArchEvolution,
  type ArchGenreCluster,
  type ArchGenreOutlier,
  type ArchHiddenGem,
  type ArchCoOccurrence,
} from "../lib/api";

type TabKey = "overview" | "dna" | "evolution" | "gems" | "discovery";

const TABS: { key: TabKey; label: string; icon: typeof Music }[] = [
  { key: "overview", label: "Overview", icon: ScanSearch },
  { key: "dna", label: "Collection DNA", icon: Layers },
  { key: "evolution", label: "Listening Evolution", icon: Activity },
  { key: "gems", label: "Hidden Gems", icon: Gem },
  { key: "discovery", label: "Artist Discovery", icon: Compass },
];

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

export default function Archaeologist() {
  const { spotifyCode, isSpotifyConnected, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<ArchSnapshotStatus | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ kind: "info" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isSpotifyConnected || !spotifyCode) {
      navigate("/");
      return;
    }
    fetchArchStatus(spotifyCode)
      .then(setStatus)
      .catch((e) => setToast({ kind: "error", msg: `Couldn't load status: ${e.message}` }));
  }, [authLoading, isSpotifyConnected, spotifyCode, navigate]);

  function flash(kind: "info" | "error", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }

  async function handleRefresh() {
    if (!spotifyCode || refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshArchSnapshot(spotifyCode);
      setStatus({
        has_snapshot: true,
        built_at: result.built_at,
        tier: result.tier,
        daily_limit: result.daily_limit,
        refresh_remaining: result.refresh_remaining,
      });
      flash(
        "info",
        `Snapshot built: ${result.totals.playlists} playlists, ${result.totals.playlist_tracks} tracks, ${result.totals.saved_tracks} liked.` +
          (result.truncated.length ? ` (${result.truncated.join("; ")})` : "")
      );
    } catch (e: any) {
      flash("error", e.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const stale = useMemo(() => {
    if (!status?.built_at) return true;
    return Date.now() - new Date(status.built_at).getTime() > STALE_AFTER_MS;
  }, [status]);

  const builtAgo = useMemo(() => {
    if (!status?.built_at) return null;
    const ms = Date.now() - new Date(status.built_at).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [status]);

  return (
    <div className="p-6 h-full overflow-auto" style={{ background: "var(--bg-cream)" }}>
      <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--text-dark)" }}>
            Archaeologist
          </h1>
          <p className="text-sm" style={{ color: "var(--text-medium)" }}>
            Dig through your collection. We compute the facts — no AI guesswork.
          </p>
        </div>
        <SnapshotStatusBar
          status={status}
          stale={stale}
          builtAgo={builtAgo}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      </header>

      {toast && (
        <div
          className="mb-3 flex items-start gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            background: toast.kind === "error" ? "var(--peach)" : "var(--green-pale)",
            color: toast.kind === "error" ? "var(--coral)" : "var(--green-primary)",
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Tabs */}
      <div
        className="mb-5 flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
              style={{
                background: active ? "var(--bg-cream)" : "transparent",
                color: active ? "var(--text-dark)" : "var(--text-medium)",
                border: active ? "1px solid var(--border-light)" : "1px solid transparent",
              }}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {!status?.has_snapshot ? (
        <EmptySnapshot onRefresh={handleRefresh} refreshing={refreshing} />
      ) : tab === "overview" ? (
        <OverviewTab code={spotifyCode!} />
      ) : tab === "dna" ? (
        <DNATab code={spotifyCode!} />
      ) : tab === "evolution" ? (
        <EvolutionTab code={spotifyCode!} />
      ) : tab === "gems" ? (
        <GemsTab code={spotifyCode!} />
      ) : (
        <DiscoveryTab code={spotifyCode!} />
      )}
    </div>
  );
}

// ==================== STATUS BAR ====================

function SnapshotStatusBar({
  status,
  stale,
  builtAgo,
  refreshing,
  onRefresh,
}: {
  status: ArchSnapshotStatus | null;
  stale: boolean;
  builtAgo: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const noQuota = !!status && status.refresh_remaining <= 0;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl"
      style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
    >
      <div className="flex flex-col text-xs" style={{ color: "var(--text-medium)" }}>
        <span className="flex items-center gap-1">
          <HardDrive className="w-3.5 h-3.5" />
          {status?.has_snapshot ? (
            <>
              Snapshot · <strong style={{ color: stale ? "var(--coral)" : "var(--green-primary)" }}>{builtAgo}</strong>
            </>
          ) : (
            "No snapshot yet"
          )}
        </span>
        {status && (
          <span>
            Refresh: <strong>{status.refresh_remaining}</strong>/{status.daily_limit} left today ({status.tier})
          </span>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing || noQuota}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--green-primary)", color: "white" }}
        title={noQuota ? "Daily refresh limit reached" : "Rebuild snapshot from your Spotify library"}
      >
        {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {refreshing ? "Building…" : status?.has_snapshot ? "Refresh" : "Build snapshot"}
      </button>
    </div>
  );
}

// ==================== EMPTY ====================

function EmptySnapshot({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 360 }}>
      <div
        className="text-center p-10 rounded-2xl max-w-md"
        style={{ background: "var(--bg-warm)", border: "1px dashed var(--border-light)" }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--green-pale)" }}
        >
          <ScanSearch className="w-8 h-8" style={{ color: "var(--green-primary)" }} />
        </div>
        <h2 className="font-display text-lg font-semibold mb-2" style={{ color: "var(--text-dark)" }}>
          Build your first snapshot
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-medium)" }}>
          We pull your playlists, liked songs, top artists/tracks, and recent plays — once — and run analytics over the
          frozen data. Heavy operation; capped at 5,000 playlist tracks. Takes ~30-60s.
        </p>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="px-5 py-2 rounded-xl font-medium disabled:opacity-50 inline-flex items-center gap-2"
          style={{ background: "var(--green-primary)", color: "white" }}
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {refreshing ? "Building…" : "Build snapshot"}
        </button>
      </div>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================

function OverviewTab({ code }: { code: string }) {
  const [data, setData] = useState<ArchOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArchOverview(code).then(setData).catch((e) => setError(e.message));
  }, [code]);

  if (error) return <ErrorBox msg={error} />;
  if (!data) return <SkeletonBlock />;

  const stats: { label: string; value: string | number; icon: typeof Music; tint?: string }[] = [
    { label: "Playlists", value: data.total_playlists, icon: Layers, tint: "var(--green-primary)" },
    { label: "Playlist tracks", value: data.total_playlist_tracks, icon: Music, tint: "var(--green-light)" },
    { label: "Liked songs", value: data.total_saved_tracks, icon: Music, tint: "var(--coral)" },
    { label: "Saved albums", value: data.total_saved_albums, icon: Disc, tint: "var(--blue-accent)" },
    { label: "Unique artists", value: data.unique_artists, icon: Users, tint: "var(--green-primary)" },
    { label: "Unique albums", value: data.unique_albums, icon: Disc, tint: "var(--blue-accent)" },
    { label: "Avg playlist size", value: data.average_playlist_size, icon: Layers, tint: "var(--text-medium)" },
  ];

  return (
    <div className="space-y-4">
      {data.truncated.length > 0 && (
        <div
          className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: "var(--peach)", color: "var(--coral)" }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Your library exceeds our analysis cap. We analyzed what fits: {data.truncated.join("; ")}.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl"
            style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4" style={{ color: s.tint }} />
              <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-medium)" }}>
                {s.label}
              </span>
            </div>
            <p className="text-2xl font-display font-semibold" style={{ color: "var(--text-dark)" }}>
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.longest_playlist && (
          <FactCard
            icon={TrendingUp}
            label="Longest playlist"
            primary={data.longest_playlist.name}
            secondary={`${data.longest_playlist.tracks.toLocaleString()} tracks`}
          />
        )}
        {data.shortest_playlist && (
          <FactCard
            icon={TrendingDown}
            label="Smallest non-empty"
            primary={data.shortest_playlist.name}
            secondary={`${data.shortest_playlist.tracks.toLocaleString()} tracks`}
          />
        )}
      </div>

      {data.built_at && (
        <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-light)" }}>
          <Clock className="w-3 h-3" />
          Snapshot built at {new Date(data.built_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ==================== DNA TAB ====================

function DNATab({ code }: { code: string }) {
  const [overlap, setOverlap] = useState<ArchOverlapPair[] | null>(null);
  const [dominance, setDominance] = useState<ArchArtistDominance[] | null>(null);
  const [health, setHealth] = useState<ArchPlaylistHealth[] | null>(null);
  const [forgotten, setForgotten] = useState<ArchForgottenTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchArchPlaylistOverlap(code).then(setOverlap),
      fetchArchArtistDominance(code, 30).then(setDominance),
      fetchArchPlaylistHealth(code).then(setHealth),
      fetchArchForgotten(code, 30).then(setForgotten),
    ]).catch((e) => setError(e.message));
  }, [code]);

  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Artist dominance" icon={Users} hint="Most-occurring across all playlists + liked">
        {!dominance ? <SkeletonRows /> : dominance.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {dominance.slice(0, 15).map((a, i) => (
              <li key={a.artist_id} className="flex items-center gap-3 py-2">
                <span className="w-6 text-sm" style={{ color: "var(--text-light)" }}>{i + 1}</span>
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-dark)" }}>{a.name}</span>
                <span className="text-xs" style={{ color: "var(--text-medium)" }}>
                  {a.track_count} track{a.track_count !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Playlist overlap" icon={Layers} hint="Pairs sharing the most tracks">
        {!overlap ? <SkeletonRows /> : overlap.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {overlap.slice(0, 12).map((p, i) => (
              <li key={i} className="py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate flex-1" style={{ color: "var(--text-dark)" }}>{p.a}</span>
                  <span style={{ color: "var(--text-light)" }}>↔</span>
                  <span className="truncate flex-1" style={{ color: "var(--text-dark)" }}>{p.b}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-cream)" }}>
                    <div
                      className="h-full"
                      style={{ width: `${p.overlap_pct}%`, background: "var(--green-primary)" }}
                    />
                  </div>
                  <span className="text-xs w-20 text-right" style={{ color: "var(--text-medium)" }}>
                    {p.shared_tracks} · {p.overlap_pct}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Playlist health" icon={Sparkles} hint="Higher = more diverse, fewer duplicates, distinct">
        {!health ? <SkeletonRows /> : health.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {health.slice(0, 15).map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate" style={{ color: "var(--text-dark)" }}>{h.name}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: h.score >= 70 ? "var(--green-pale)" : h.score >= 50 ? "var(--bg-warm)" : "var(--peach)",
                      color: h.score >= 70 ? "var(--green-primary)" : h.score >= 50 ? "var(--text-medium)" : "var(--coral)",
                    }}
                  >
                    {h.score}
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: "var(--text-light)" }}>
                  {h.track_count} tracks · {h.duplicate_pct}% duplicates · diversity {h.artist_diversity}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Forgotten songs" icon={Clock} hint="Added > 12 mo ago, not in top, not in recent">
        {!forgotten ? <SkeletonRows /> : forgotten.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {forgotten.slice(0, 15).map((t) => (
              <li key={t.id} className="py-2">
                <a
                  href={`https://open.spotify.com/track/${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block no-underline"
                  style={{ color: "inherit" }}
                >
                  <p className="text-sm truncate font-medium" style={{ color: "var(--text-dark)" }}>{t.name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-medium)" }}>
                    {t.artist} · added {t.added_at ? new Date(t.added_at).toLocaleDateString() : "?"} · in {t.source}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ==================== EVOLUTION TAB ====================

function EvolutionTab({ code }: { code: string }) {
  const [data, setData] = useState<ArchEvolution | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArchEvolution(code).then(setData).catch((e) => setError(e.message));
  }, [code]);

  if (error) return <ErrorBox msg={error} />;
  if (!data) return <SkeletonBlock />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Rising artists" icon={TrendingUp} hint={`${data.ranges.short_term_label} vs ${data.ranges.long_term_label}`}>
        {data.rising_artists.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {data.rising_artists.slice(0, 12).map((a) => (
              <li key={a.id} className="py-2 flex items-center gap-2">
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-dark)" }}>{a.name}</span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: a.movement === "new" ? "var(--green-pale)" : "var(--bg-warm)",
                    color: a.movement === "new" ? "var(--green-primary)" : "var(--text-medium)",
                  }}
                >
                  {a.movement === "new" ? "NEW" : `↑ ${a.long_rank}→${a.short_rank}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Declining artists" icon={TrendingDown} hint="In your all-time top, not in last 4 weeks">
        {data.declining_artists.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {data.declining_artists.slice(0, 12).map((a) => (
              <li key={a.id} className="py-2 flex items-center gap-2">
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-dark)" }}>{a.name}</span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "var(--peach)", color: "var(--coral)" }}
                >
                  long #{a.long_rank} → out
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Emerging genres" icon={TrendingUp} hint="Gaining ground over your all-time">
        {data.emerging_genres.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {data.emerging_genres.map((g) => (
              <li key={g.genre} className="py-2 flex items-center gap-2 text-sm">
                <span className="flex-1 capitalize" style={{ color: "var(--text-dark)" }}>{g.genre}</span>
                <span className="text-xs" style={{ color: "var(--green-primary)" }}>+{g.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Fading genres" icon={TrendingDown} hint="Were big, now less so">
        {data.fading_genres.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {data.fading_genres.map((g) => (
              <li key={g.genre} className="py-2 flex items-center gap-2 text-sm">
                <span className="flex-1 capitalize" style={{ color: "var(--text-dark)" }}>{g.genre}</span>
                <span className="text-xs" style={{ color: "var(--coral)" }}>−{g.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Breakout tracks (last 4w)" icon={Sparkles} hint="In current top, not in all-time top">
        {data.breakout_tracks.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y col-span-2" style={{ borderColor: "var(--border-light)" }}>
            {data.breakout_tracks.slice(0, 12).map((t) => (
              <li key={t.id} className="py-2">
                <a
                  href={`https://open.spotify.com/track/${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block no-underline"
                  style={{ color: "inherit" }}
                >
                  <p className="text-sm truncate font-medium" style={{ color: "var(--text-dark)" }}>{t.name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-medium)" }}>
                    {(t.artist_names || []).join(", ")}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Persistent favorites" icon={Users} hint="Top both recently AND all time">
        {data.persistent_artists.length === 0 ? <EmptyRow /> : (
          <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
            {data.persistent_artists.slice(0, 12).map((a) => (
              <li key={a.id} className="py-2 text-sm" style={{ color: "var(--text-dark)" }}>
                {a.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ==================== HIDDEN GEMS TAB ====================

function GemsTab({ code }: { code: string }) {
  const [gems, setGems] = useState<ArchHiddenGem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchArchHiddenGems(code, 80).then(setGems).catch((e) => setError(e.message));
  }, [code]);

  const filtered = useMemo(() => {
    if (!gems) return null;
    if (filter === "all") return gems;
    return gems.filter((g) => g.reasons.some((r) => r.includes(filter)));
  }, [gems, filter]);

  const reasonChips = useMemo(() => {
    if (!gems) return [];
    const c: Record<string, number> = {};
    for (const g of gems) {
      for (const r of g.reasons) {
        // group by simplified label
        const key = r.includes("top genre")
          ? "top genre"
          : r.includes("deep cut")
          ? "deep cut"
          : r.includes("playlists")
          ? "multi-playlist"
          : r;
        c[key] = (c[key] || 0) + 1;
      }
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [gems]);

  if (error) return <ErrorBox msg={error} />;
  if (!gems) return <SkeletonBlock />;
  if (gems.length === 0) {
    return (
      <Card title="Hidden Gems" icon={Gem} hint="Your library didn't surface any candidates">
        <EmptyRow />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${gems.length})`} />
        {reasonChips.map(([label, count]) => (
          <FilterChip
            key={label}
            active={filter === label}
            onClick={() => setFilter(label)}
            label={`${label} (${count})`}
          />
        ))}
      </div>
      <Card title="Hidden Gems" icon={Gem} hint="Tracks in your library you've drifted away from, ranked by relevance">
        <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
          {(filtered ?? []).slice(0, 50).map((t) => (
            <li key={t.id} className="py-2">
              <a
                href={`https://open.spotify.com/track/${t.id}`}
                target="_blank"
                rel="noreferrer"
                className="block no-underline"
                style={{ color: "inherit" }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-dark)" }}>
                      {t.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--text-medium)" }}>
                      {t.artist} · {t.album}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-light)" }}>
                    {t.score.toFixed(1)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {t.reasons.map((r, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--bg-cream)", color: "var(--green-primary)" }}
                    >
                      {r}
                    </span>
                  ))}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--bg-cream)", color: "var(--text-light)" }}
                  >
                    in {t.source}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ==================== ARTIST DISCOVERY TAB ====================

function DiscoveryTab({ code }: { code: string }) {
  const [clusters, setClusters] = useState<ArchGenreCluster[] | null>(null);
  const [outliers, setOutliers] = useState<ArchGenreOutlier[] | null>(null);
  const [cooc, setCooc] = useState<ArchCoOccurrence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchArchGenreClusters(code).then(setClusters),
      fetchArchGenreOutliers(code, 30).then(setOutliers),
      fetchArchCoOccurrence(code, 2, 30).then(setCooc),
    ]).catch((e) => setError(e.message));
  }, [code]);

  if (error) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <Card title="Genre clusters" icon={Layers} hint="Your library, grouped by Spotify genre tags">
        {!clusters ? <SkeletonRows /> : clusters.length === 0 ? <EmptyRow /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusters.map((c) => (
              <div
                key={c.genre}
                className="rounded-xl p-3"
                style={{ background: "var(--bg-cream)", border: "1px solid var(--border-light)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium capitalize truncate" style={{ color: "var(--text-dark)" }}>
                    {c.genre}
                  </p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--green-pale)", color: "var(--green-primary)" }}
                  >
                    {c.artist_count} artists · {c.track_count} tracks
                  </span>
                </div>
                <p className="text-xs mb-1" style={{ color: "var(--text-medium)" }}>
                  {c.sample_artists.map((a) => a.name).join(" · ")}
                </p>
                {c.sample_playlists.length > 0 && (
                  <p className="text-[11px]" style={{ color: "var(--text-light)" }}>
                    seen in: {c.sample_playlists.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Outlier artists" icon={Compass} hint="Don't fit any of your main clusters — potential new directions">
          {!outliers ? <SkeletonRows /> : outliers.length === 0 ? <EmptyRow /> : (
            <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
              {outliers.slice(0, 20).map((a) => (
                <li key={a.id} className="py-2">
                  <a
                    href={`https://open.spotify.com/artist/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block no-underline"
                    style={{ color: "inherit" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-dark)" }}>
                        {a.name || "Unknown artist"}
                      </p>
                      <span className="text-[10px]" style={{ color: "var(--text-light)" }}>
                        {a.track_count} tracks
                      </span>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-medium)" }}>
                      {a.reason}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Co-occurrence" icon={Users} hint="Artist pairs sharing the most of your playlists">
          {!cooc ? <SkeletonRows /> : cooc.length === 0 ? <EmptyRow /> : (
            <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
              {cooc.slice(0, 20).map((p, i) => (
                <li key={i} className="py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <a
                      href={`https://open.spotify.com/artist/${p.a_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate flex-1 no-underline"
                      style={{ color: "var(--text-dark)" }}
                    >
                      {p.a_name}
                    </a>
                    <span style={{ color: "var(--text-light)" }}>↔</span>
                    <a
                      href={`https://open.spotify.com/artist/${p.b_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate flex-1 no-underline text-right"
                      style={{ color: "var(--text-dark)" }}
                    >
                      {p.b_name}
                    </a>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--bg-warm)", color: "var(--text-medium)" }}
                    >
                      {p.shared_playlists}×
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1 rounded-full transition-colors"
      style={{
        background: active ? "var(--green-primary)" : "var(--bg-warm)",
        color: active ? "white" : "var(--text-medium)",
        border: "1px solid var(--border-light)",
      }}
    >
      {label}
    </button>
  );
}

// ==================== SHARED UI ====================

function Card({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon: typeof Music;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
    >
      <div className="p-3" style={{ borderBottom: "1px solid var(--border-light)" }}>
        <h3 className="font-display font-semibold flex items-center gap-2 text-sm" style={{ color: "var(--text-dark)" }}>
          <Icon className="w-4 h-4" style={{ color: "var(--green-primary)" }} />
          {title}
        </h3>
        {hint && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-light)" }}>{hint}</p>}
      </div>
      <div className="p-3 flex-1">{children}</div>
    </div>
  );
}

function FactCard({
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  icon: typeof Music;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      className="p-4 rounded-xl flex items-center gap-3"
      style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
    >
      <Icon className="w-6 h-6" style={{ color: "var(--green-primary)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-medium)" }}>{label}</p>
        <p className="font-medium truncate" style={{ color: "var(--text-dark)" }}>{primary}</p>
        <p className="text-xs" style={{ color: "var(--text-light)" }}>{secondary}</p>
      </div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--green-primary)" }} />
    </div>
  );
}

function SkeletonRows() {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-light)" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="py-2 flex items-center gap-2">
          <div className="w-24 h-3 rounded animate-pulse" style={{ background: "var(--bg-cream)" }} />
          <div className="flex-1" />
          <div className="w-10 h-3 rounded animate-pulse" style={{ background: "var(--bg-cream)" }} />
        </li>
      ))}
    </ul>
  );
}

function EmptyRow() {
  return (
    <p className="text-sm text-center py-4" style={{ color: "var(--text-light)" }}>
      Nothing yet — your data didn't surface anything for this view.
    </p>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div
      className="p-4 rounded-xl text-sm flex items-start gap-2"
      style={{ background: "var(--peach)", color: "var(--coral)" }}
    >
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
