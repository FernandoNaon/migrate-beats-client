import { useMemo } from "react";
import { Loader2, Music, X } from "lucide-react";
import type { Playlist } from "../lib/api";

interface Props {
  playlists: Playlist[];
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  onPick: (p: Playlist) => void;
  onClose: () => void;
  title?: string;
  /** Only show playlists where the user is the owner (optional filter). */
  ownerName?: string;
  /** Hide these playlist ids from the list. */
  excludeIds?: string[];
  /** Footer node (e.g., a hint about modifier keys). */
  footer?: React.ReactNode;
}

export default function PlaylistPickerModal({
  playlists,
  loading,
  search,
  setSearch,
  onPick,
  onClose,
  title = "Pick a playlist",
  ownerName,
  excludeIds,
  footer,
}: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return playlists.filter((p) => {
      if (excludeIds?.includes(p.id)) return false;
      if (ownerName && p.owner !== ownerName) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [playlists, excludeIds, ownerName, search]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--bg-cream)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-light)" }}
        >
          <h3 className="font-display font-semibold" style={{ color: "var(--text-dark)" }}>
            {title}
          </h3>
          <button onClick={onClose} className="p-1" style={{ color: "var(--text-medium)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3" style={{ borderBottom: "1px solid var(--border-light)" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playlists…"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--green-primary)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: "var(--text-medium)" }}>
              No playlists found.
            </p>
          ) : (
            <ul>
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onPick(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-warm)]"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--green-pale)" }}
                      >
                        <Music className="w-5 h-5" style={{ color: "var(--green-primary)" }} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate" style={{ color: "var(--text-dark)" }}>
                        {p.name}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--text-medium)" }}>
                        {p.tracks_total} tracks · {p.owner}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {footer && (
          <div
            className="p-3 text-xs"
            style={{ borderTop: "1px solid var(--border-light)", color: "var(--text-medium)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
