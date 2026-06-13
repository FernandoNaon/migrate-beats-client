import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Music,
  X,
  Plus,
  Loader2,
  Lock,
  AlertCircle,
  GripVertical,
  Trash2,
  Copy,
  Move,
  Check,
  Tag,
  ChevronDown,
  ChevronRight,
  Copyright,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  fetchPlaylists,
  fetchPlaylistDetails,
  fetchPlaylistGenres,
  reorderPlaylistTracks,
  moveTracksBetweenPlaylists,
  createSpotifyPlaylist,
  deleteSpotifyPlaylist,
  type Playlist,
  type PlaylistDetails,
  type PlaylistGenresResponse,
  type Track,
} from "../lib/api";
import PlaylistPickerModal from "../components/PlaylistPickerModal";

const MAX_BOARDS = 8;
const COPY_MODIFIER_LABEL = "⌥ Option";
const ROW_HEIGHT = 56; // keep tracks rendering at a single, predictable height
const SNACKBAR_DURATION_MS = 3200;

interface BoardState extends PlaylistDetails {
  loading?: boolean;
  error?: string;
}

type GenresState =
  | { status: "loading" }
  | { status: "ready"; data: PlaylistGenresResponse }
  | { status: "error"; message: string };

interface SnackbarItem {
  id: number;
  msg: string;
  kind: "info" | "error";
}

export default function PlaylistManager() {
  const { spotifyCode, isSpotifyConnected, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [boards, setBoards] = useState<Record<string, BoardState>>({});
  const [boardOrder, setBoardOrder] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Create-playlist inline form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Drag state
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [activeFromBoard, setActiveFromBoard] = useState<string | null>(null);
  const [overBoard, setOverBoard] = useState<string | null>(null);

  // Persistent top toast for load-level issues (kept separate from per-action snackbar)
  const [topToast, setTopToast] = useState<{ kind: "info" | "error"; msg: string } | null>(null);

  // Bottom snackbar — Spotify-style. Items queue; one shows at a time.
  const [snackQueue, setSnackQueue] = useState<SnackbarItem[]>([]);
  const snackbarIdRef = useRef(0);

  // Toolbar toggles
  const [highlightDups, setHighlightDups] = useState(false);

  // Genre state per board
  const [boardGenres, setBoardGenres] = useState<Record<string, GenresState>>({});
  const [genresOpen, setGenresOpen] = useState<Record<string, boolean>>({});
  const [genresExpanded, setGenresExpanded] = useState<Record<string, boolean>>({});

  // Modifier-key state
  const altKeyRef = useRef(false);
  const [altKeyDown, setAltKeyDown] = useState(false);

  // Per-board mutation queue — serializes API calls per playlist so concurrent drags
  // don't race on snapshot_id.
  const mutationQueueRef = useRef<Record<string, Promise<unknown>>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ---- Load all playlists once ----
  useEffect(() => {
    if (authLoading) return;
    if (!isSpotifyConnected || !spotifyCode) {
      navigate("/");
      return;
    }
    setLoadingPlaylists(true);
    fetchPlaylists(spotifyCode)
      .then(setAllPlaylists)
      .catch((e) => setTopToast({ kind: "error", msg: `Couldn't load playlists: ${e.message}` }))
      .finally(() => setLoadingPlaylists(false));
  }, [authLoading, isSpotifyConnected, spotifyCode, navigate]);

  // ---- Modifier key tracking ----
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

  // ---- Snackbar queue lifecycle ----
  useEffect(() => {
    if (snackQueue.length === 0) return;
    const t = setTimeout(() => {
      setSnackQueue((q) => q.slice(1));
    }, SNACKBAR_DURATION_MS);
    return () => clearTimeout(t);
  }, [snackQueue]);

  const showSnack = useCallback((kind: "info" | "error", msg: string) => {
    setSnackQueue((q) => [...q, { id: ++snackbarIdRef.current, kind, msg }]);
  }, []);

  // ---- Mutation queue helper ----
  const enqueueMutation = useCallback(
    <T,>(boardIds: string[], fn: () => Promise<T>): Promise<T> => {
      const previous = boardIds.map((id) => mutationQueueRef.current[id] || Promise.resolve());
      const chain = Promise.allSettled(previous).then(() => fn());
      // Catch so a single failure doesn't break the chain for subsequent mutations.
      const safe = chain.catch(() => undefined);
      for (const id of boardIds) {
        mutationQueueRef.current[id] = safe;
      }
      return chain;
    },
    []
  );

  // ==================== BOARD MGMT ====================

  async function addBoard(playlistId: string) {
    if (!spotifyCode) return;
    if (boards[playlistId]) return;
    if (boardOrder.length >= MAX_BOARDS) {
      setTopToast({ kind: "error", msg: `You can pin at most ${MAX_BOARDS} playlists.` });
      return;
    }
    const stub = allPlaylists.find((p) => p.id === playlistId);
    setBoards((b) => ({
      ...b,
      [playlistId]: {
        id: playlistId,
        name: stub?.name ?? "Loading…",
        snapshot_id: "",
        is_owner: false,
        tracks_total: stub?.tracks_total ?? 0,
        tracks: [],
        image: stub?.image,
        loading: true,
      },
    }));
    setBoardOrder((o) => [...o, playlistId]);

    try {
      const details = await fetchPlaylistDetails(spotifyCode, playlistId);
      setBoards((b) => ({ ...b, [playlistId]: { ...details, loading: false } }));
    } catch (e: any) {
      setBoards((b) => ({
        ...b,
        [playlistId]: { ...b[playlistId], loading: false, error: e.message },
      }));
    }
  }

  function removeBoard(playlistId: string) {
    setBoardOrder((o) => o.filter((id) => id !== playlistId));
    setBoards((b) => {
      const next = { ...b };
      delete next[playlistId];
      return next;
    });
    delete mutationQueueRef.current[playlistId];
  }

  async function handleCreate() {
    if (!spotifyCode || !newName.trim()) return;
    setCreating(true);
    try {
      const created = await createSpotifyPlaylist(spotifyCode, newName.trim());
      setAllPlaylists((ps) => [
        { id: created.id, name: created.name, tracks_total: 0, image: created.image, owner: created.owner ?? "" },
        ...ps,
      ]);
      setBoards((b) => ({
        ...b,
        [created.id]: {
          id: created.id,
          name: created.name,
          snapshot_id: created.snapshot_id ?? "",
          image: created.image,
          owner: created.owner,
          is_owner: true,
          tracks_total: 0,
          tracks: [],
        },
      }));
      setBoardOrder((o) => (o.includes(created.id) ? o : [...o, created.id]));
      setNewName("");
      setShowCreate(false);
      showSnack("info", `Created "${created.name}"`);
    } catch (e: any) {
      showSnack("error", `Couldn't create playlist: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(playlistId: string) {
    if (!spotifyCode) return;
    setDeleting(true);
    try {
      const name = boards[playlistId]?.name ?? "playlist";
      await deleteSpotifyPlaylist(spotifyCode, playlistId);
      removeBoard(playlistId);
      setAllPlaylists((ps) => ps.filter((p) => p.id !== playlistId));
      setConfirmDelete(null);
      showSnack("info", `Deleted "${name}"`);
    } catch (e: any) {
      showSnack("error", `Couldn't delete: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }

  // ==================== GENRES ====================

  function toggleGenres(boardId: string) {
    setGenresOpen((o) => ({ ...o, [boardId]: !o[boardId] }));
    if (!boardGenres[boardId] && spotifyCode) {
      setBoardGenres((g) => ({ ...g, [boardId]: { status: "loading" } }));
      fetchPlaylistGenres(spotifyCode, boardId).then(
        (data) => setBoardGenres((g) => ({ ...g, [boardId]: { status: "ready", data } })),
        (err) => setBoardGenres((g) => ({ ...g, [boardId]: { status: "error", message: err.message } }))
      );
    }
  }

  // ==================== DUP DETECTION ====================

  // For each board: set of track ids that appear >1 times within that board
  const withinDupCounts = useMemo(() => {
    const out: Record<string, Map<string, number>> = {};
    for (const id of boardOrder) {
      const counts = new Map<string, number>();
      for (const t of boards[id]?.tracks ?? []) {
        const tid = t.id;
        if (tid) counts.set(tid, (counts.get(tid) || 0) + 1);
      }
      out[id] = counts;
    }
    return out;
  }, [boards, boardOrder]);

  // For each track id: set of board ids it appears in (across pinned playlists)
  const crossBoardMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const id of boardOrder) {
      const seen = new Set<string>();
      for (const t of boards[id]?.tracks ?? []) {
        if (!t.id) continue;
        // Only count one occurrence per board for cross-board purposes
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        let set = m.get(t.id);
        if (!set) {
          set = new Set();
          m.set(t.id, set);
        }
        set.add(id);
      }
    }
    return m;
  }, [boards, boardOrder]);

  const dupSummary = useMemo(() => {
    let within = 0;
    for (const id of boardOrder) {
      withinDupCounts[id]?.forEach((c) => {
        if (c > 1) within += c - 1; // count extra copies, not the originals
      });
    }
    let across = 0;
    crossBoardMap.forEach((set) => {
      if (set.size > 1) across++;
    });
    return { within, across };
  }, [boardOrder, withinDupCounts, crossBoardMap]);

  // ==================== DRAG HANDLERS ====================

  function findBoardOfTrack(trackKey: string): string | null {
    for (const id of boardOrder) {
      if (boards[id].tracks.some((t) => trackKey === keyOf(id, t))) return id;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const board = findBoardOfTrack(id);
    if (!board) return;
    const track = boards[board].tracks.find((t) => keyOf(board, t) === id);
    if (!track) return;
    setActiveTrack(track);
    setActiveFromBoard(board);
  }

  function onDragOver(e: DragOverEvent) {
    if (!e.over) return setOverBoard(null);
    const overId = String(e.over.id);
    if (boards[overId]) {
      setOverBoard(overId);
      return;
    }
    const b = findBoardOfTrack(overId);
    if (b) setOverBoard(b);
  }

  async function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;

    const fromBoard = activeFromBoard;
    const draggedTrack = activeTrack;
    const wantsCopy = altKeyRef.current;
    setActiveTrack(null);
    setActiveFromBoard(null);
    setOverBoard(null);

    if (!overId || !fromBoard || !draggedTrack || !spotifyCode) return;
    const targetBoard = boards[overId] ? overId : findBoardOfTrack(overId);
    if (!targetBoard) return;

    // ---- Reorder within same board ----
    if (targetBoard === fromBoard) {
      if (activeId === overId) return;
      if (wantsCopy) {
        showSnack("info", "Within a playlist, drag reorders — copy doesn't apply.");
      }
      const board = boards[fromBoard];
      const oldIndex = board.tracks.findIndex((t) => keyOf(fromBoard, t) === activeId);
      const newIndex = board.tracks.findIndex((t) => keyOf(fromBoard, t) === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      if (!board.is_owner) {
        showSnack("error", "You don't own this playlist — read-only.");
        return;
      }
      const prevTracks = board.tracks;
      const reordered = arrayMove(prevTracks, oldIndex, newIndex);
      const trackName = draggedTrack.name;
      setBoards((b) => ({ ...b, [fromBoard]: { ...b[fromBoard], tracks: reordered } }));

      // Spotify reorder math:
      // - range_start = current index of the item BEFORE removal
      // - insert_before = target index in the BEFORE-removal coordinate system
      // Moving DOWN: target index in the resulting list is `newIndex`, but since we
      // count before removal we need newIndex + 1.
      // Moving UP: insert_before == newIndex.
      const insertBefore = newIndex > oldIndex ? newIndex + 1 : newIndex;
      const snapBefore = board.snapshot_id;

      enqueueMutation([fromBoard], async () => {
        try {
          const result = await reorderPlaylistTracks(
            spotifyCode,
            fromBoard,
            oldIndex,
            insertBefore,
            1,
            snapBefore
          );
          setBoards((b) => ({
            ...b,
            [fromBoard]: { ...b[fromBoard], snapshot_id: result.snapshot_id ?? b[fromBoard].snapshot_id },
          }));
          showSnack("info", `Moved "${trackName}" #${oldIndex + 1} → #${newIndex + 1} in "${board.name}"`);
        } catch (err: any) {
          setBoards((b) => ({ ...b, [fromBoard]: { ...b[fromBoard], tracks: prevTracks } }));
          showSnack("error", `Reorder failed: ${err.message}`);
        }
      });
      return;
    }

    // ---- Move/copy across boards ----
    const source = boards[fromBoard];
    const target = boards[targetBoard];
    if (!target.is_owner) {
      showSnack("error", "Target playlist is read-only — you don't own it.");
      return;
    }
    if (!draggedTrack.uri) {
      showSnack("error", "Local files can't be moved.");
      return;
    }
    const forcedCopy = !source.is_owner;
    const copyOnly = wantsCopy || forcedCopy;

    let insertIndex = target.tracks.length;
    if (overId !== targetBoard) {
      const overIdx = target.tracks.findIndex((t) => keyOf(targetBoard, t) === overId);
      if (overIdx >= 0) insertIndex = overIdx;
    }

    const prevSourceTracks = source.tracks;
    const prevTargetTracks = target.tracks;
    const trackName = draggedTrack.name;
    const sourceName = source.name;
    const targetName = target.name;

    setBoards((b) => {
      const next = { ...b };
      const newTarget = [...prevTargetTracks];
      newTarget.splice(insertIndex, 0, draggedTrack);
      next[targetBoard] = { ...target, tracks: newTarget };
      if (!copyOnly) {
        next[fromBoard] = {
          ...source,
          tracks: prevSourceTracks.filter((t) => keyOf(fromBoard, t) !== activeId),
        };
      }
      return next;
    });

    const sourceSnap = source.snapshot_id;
    enqueueMutation([fromBoard, targetBoard], async () => {
      try {
        const result = await moveTracksBetweenPlaylists({
          code: spotifyCode,
          sourcePlaylistId: fromBoard,
          targetPlaylistId: targetBoard,
          trackUris: [draggedTrack.uri!],
          sourceSnapshotId: sourceSnap,
          targetPosition: insertIndex,
          copyOnly,
        });
        setBoards((b) => ({
          ...b,
          [fromBoard]: { ...b[fromBoard], snapshot_id: result.source_snapshot_id ?? b[fromBoard].snapshot_id },
          [targetBoard]: { ...b[targetBoard], snapshot_id: result.target_snapshot_id ?? b[targetBoard].snapshot_id },
        }));
        if (copyOnly) {
          showSnack(
            "info",
            forcedCopy && !wantsCopy
              ? `Copied "${trackName}" to "${targetName}" (you don't own the source)`
              : `Copied "${trackName}" to "${targetName}"`
          );
        } else {
          showSnack("info", `Moved "${trackName}" from "${sourceName}" to "${targetName}"`);
        }
      } catch (err: any) {
        setBoards((b) => ({
          ...b,
          [fromBoard]: { ...b[fromBoard], tracks: prevSourceTracks },
          [targetBoard]: { ...b[targetBoard], tracks: prevTargetTracks },
        }));
        showSnack("error", `${copyOnly ? "Copy" : "Move"} failed: ${err.message}`);
      }
    });
  }

  // ==================== RENDER ====================

  const excludeIds = useMemo(() => Object.keys(boards), [boards]);
  const showCopyMode = activeTrack !== null && overBoard !== null && overBoard !== activeFromBoard && altKeyDown;
  const showMoveMode = activeTrack !== null && overBoard !== null && overBoard !== activeFromBoard && !altKeyDown;
  const activeSnack = snackQueue[0];

  return (
    <div className="p-6 h-full flex flex-col" style={{ background: "var(--bg-cream)" }}>
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--text-dark)" }}>
            Playlist Manager
          </h1>
          <p className="text-sm" style={{ color: "var(--text-medium)" }}>
            Pin up to {MAX_BOARDS} playlists. Drag tracks to reorder or move between them.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setHighlightDups((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
            style={{
              background: highlightDups ? "var(--green-primary)" : "var(--bg-warm)",
              color: highlightDups ? "white" : "var(--text-dark)",
              border: "1px solid var(--border-light)",
            }}
            title="Highlight duplicates within and across pinned playlists"
          >
            <Copyright className="w-4 h-4" />
            {highlightDups ? "Hide dups" : "Highlight dups"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium"
            style={{ background: "var(--bg-warm)", color: "var(--text-dark)", border: "1px solid var(--border-light)" }}
          >
            <Plus className="w-4 h-4" />
            New playlist
          </button>
          <button
            onClick={() => setShowPicker(true)}
            disabled={loadingPlaylists || boardOrder.length >= MAX_BOARDS}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium disabled:opacity-50"
            style={{ background: "var(--green-primary)", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            Pin playlist {boardOrder.length > 0 && `(${boardOrder.length}/${MAX_BOARDS})`}
          </button>
        </div>
      </header>

      {/* Always-visible hint */}
      <div
        className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{ background: "var(--bg-warm)", color: "var(--text-medium)", border: "1px solid var(--border-light)" }}
      >
        <Copy className="w-3.5 h-3.5" />
        <span>
          Tip: drag a track across playlists to <strong>move</strong> it. Hold{" "}
          <kbd
            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{ background: "var(--bg-cream)", border: "1px solid var(--border-light)" }}
          >
            {COPY_MODIFIER_LABEL}
          </kbd>{" "}
          to <strong>copy</strong> instead (keep it in both).
        </span>
      </div>

      {highlightDups && boardOrder.length > 0 && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: "var(--peach)", color: "var(--coral)" }}
        >
          <Copyright className="w-3.5 h-3.5" />
          <span>
            <strong>{dupSummary.within}</strong> extra copy
            {dupSummary.within !== 1 ? "ies" : ""} within playlists ·{" "}
            <strong>{dupSummary.across}</strong> track{dupSummary.across !== 1 ? "s" : ""} shared across pinned
            playlists
          </span>
        </div>
      )}

      {topToast && (
        <div
          className="mb-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            background: topToast.kind === "error" ? "var(--peach)" : "var(--green-pale)",
            color: topToast.kind === "error" ? "var(--coral)" : "var(--green-primary)",
          }}
        >
          <AlertCircle className="w-4 h-4" />
          {topToast.msg}
          <button onClick={() => setTopToast(null)} className="ml-auto" style={{ color: "inherit" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showCreate && (
        <div
          className="mb-3 p-3 flex items-center gap-2 rounded-xl"
          style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)" }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name"
            className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
            style={{ background: "var(--bg-cream)", border: "1px solid var(--border-light)" }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setShowCreate(false);
                setNewName("");
              }
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            style={{ background: "var(--green-primary)", color: "white" }}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Create
          </button>
          <button
            onClick={() => {
              setShowCreate(false);
              setNewName("");
            }}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-medium)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {boardOrder.length === 0 ? (
        <EmptyState onAdd={() => setShowPicker(true)} disabled={loadingPlaylists} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 h-full pb-2" style={{ minWidth: "fit-content" }}>
              {boardOrder.map((id) => (
                <Board
                  key={id}
                  board={boards[id]}
                  isHighlighted={overBoard === id && activeFromBoard !== id}
                  onRemove={() => removeBoard(id)}
                  onDelete={() => setConfirmDelete(id)}
                  withinDupCounts={withinDupCounts[id] || new Map()}
                  crossBoardMap={crossBoardMap}
                  highlightDups={highlightDups}
                  boardNames={boards}
                  genresState={boardGenres[id]}
                  genresOpen={!!genresOpen[id]}
                  genresExpanded={!!genresExpanded[id]}
                  onToggleGenres={() => toggleGenres(id)}
                  onToggleGenresExpanded={() =>
                    setGenresExpanded((e) => ({ ...e, [id]: !e[id] }))
                  }
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeTrack ? (
              <div
                className="px-3 py-2 rounded-lg shadow-lg flex items-center gap-3 relative"
                style={{ background: "var(--bg-warm)", border: "1px solid var(--border-light)", width: 320 }}
              >
                {activeTrack.image ? (
                  <img src={activeTrack.image} alt="" className="w-8 h-8 rounded" />
                ) : (
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center"
                    style={{ background: "var(--green-pale)" }}
                  >
                    <Music className="w-4 h-4" style={{ color: "var(--green-primary)" }} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate font-medium">{activeTrack.name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-medium)" }}>
                    {activeTrack.artist}
                  </p>
                </div>
                {(showCopyMode || showMoveMode) && (
                  <div
                    className="absolute -top-3 -right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shadow"
                    style={{
                      background: showCopyMode ? "var(--blue-accent)" : "var(--green-primary)",
                      color: "white",
                    }}
                  >
                    {showCopyMode ? <Copy className="w-3 h-3" /> : <Move className="w-3 h-3" />}
                    {showCopyMode ? "COPY" : "MOVE"}
                  </div>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {showPicker && (
        <PlaylistPickerModal
          playlists={allPlaylists}
          loading={loadingPlaylists}
          search={pickerSearch}
          setSearch={setPickerSearch}
          excludeIds={excludeIds}
          title="Pin a playlist"
          onPick={(p) => {
            addBoard(p.id);
            setShowPicker(false);
            setPickerSearch("");
          }}
          onClose={() => {
            setShowPicker(false);
            setPickerSearch("");
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDelete
          name={boards[confirmDelete]?.name ?? "this playlist"}
          loading={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Spotify-style bottom snackbar */}
      {activeSnack && (
        <div
          key={activeSnack.id}
          className="fixed left-1/2 bottom-6 z-50 px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 max-w-[90vw]"
          style={{
            background: activeSnack.kind === "error" ? "var(--coral)" : "var(--text-dark)",
            color: "white",
            transform: "translateX(-50%)",
            animation: "snackbar-rise 180ms ease-out",
          }}
        >
          {activeSnack.kind === "error" ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span className="truncate">{activeSnack.msg}</span>
          {snackQueue.length > 1 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full ml-2"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              +{snackQueue.length - 1}
            </span>
          )}
        </div>
      )}

      {/* keyframes — keep inline so we don't touch global CSS */}
      <style>{`
        @keyframes snackbar-rise {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function keyOf(boardId: string, track: Track): string {
  const tail = track.uri || track.id || `${track.name}-${track.artist}`;
  return `${boardId}::${tail}`;
}

// ==================== EMPTY STATE ====================

function EmptyState({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div
        className="text-center p-12 rounded-2xl max-w-md"
        style={{ background: "var(--bg-warm)", border: "1px dashed var(--border-light)" }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--green-pale)" }}
        >
          <Music className="w-8 h-8" style={{ color: "var(--green-primary)" }} />
        </div>
        <h2 className="font-display text-lg font-semibold mb-2" style={{ color: "var(--text-dark)" }}>
          No playlists pinned yet
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-medium)" }}>
          Pin a playlist to start managing it side-by-side with others.
        </p>
        <button
          onClick={onAdd}
          disabled={disabled}
          className="px-5 py-2 rounded-xl font-medium disabled:opacity-50"
          style={{ background: "var(--green-primary)", color: "white" }}
        >
          {disabled ? "Loading…" : "Pin a playlist"}
        </button>
      </div>
    </div>
  );
}

// ==================== BOARD ====================

function Board({
  board,
  isHighlighted,
  onRemove,
  onDelete,
  withinDupCounts,
  crossBoardMap,
  highlightDups,
  boardNames,
  genresState,
  genresOpen,
  genresExpanded,
  onToggleGenres,
  onToggleGenresExpanded,
}: {
  board: BoardState;
  isHighlighted: boolean;
  onRemove: () => void;
  onDelete: () => void;
  withinDupCounts: Map<string, number>;
  crossBoardMap: Map<string, Set<string>>;
  highlightDups: boolean;
  boardNames: Record<string, BoardState>;
  genresState: GenresState | undefined;
  genresOpen: boolean;
  genresExpanded: boolean;
  onToggleGenres: () => void;
  onToggleGenresExpanded: () => void;
}) {
  const trackIds = useMemo(() => board.tracks.map((t) => keyOf(board.id, t)), [board]);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-warm)",
        border: `2px solid ${isHighlighted ? "var(--green-primary)" : "var(--border-light)"}`,
        width: 340,
        minWidth: 340,
        height: "100%",
        transition: "border-color 120ms ease",
      }}
    >
      <div
        className="p-3 flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--border-light)" }}
      >
        {board.image ? (
          <img src={board.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "var(--green-pale)" }}
          >
            <Music className="w-5 h-5" style={{ color: "var(--green-primary)" }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate" style={{ color: "var(--text-dark)" }}>
            {board.name}
          </p>
          <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-medium)" }}>
            {board.tracks.length} tracks
            {!board.is_owner && !board.loading && (
              <>
                <span>·</span>
                <Lock className="w-3 h-3" />
                <span>read-only</span>
              </>
            )}
          </p>
        </div>
        {board.is_owner && !board.loading && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--coral)" }}
            title="Delete playlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg"
          style={{ color: "var(--text-medium)" }}
          title="Unpin from board"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Genres collapsible */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>
        <button
          onClick={onToggleGenres}
          className="w-full px-3 py-2 flex items-center gap-2 text-xs"
          style={{ color: "var(--text-medium)" }}
        >
          {genresOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Tag className="w-3.5 h-3.5" />
          <span>Genres</span>
          {genresState?.status === "ready" && (
            <span style={{ color: "var(--text-light)" }}>
              · {genresState.data.genres.length} found
            </span>
          )}
        </button>
        {genresOpen && (
          <div className="px-3 pb-2">
            <GenreList
              state={genresState}
              expanded={genresExpanded}
              onToggleExpanded={onToggleGenresExpanded}
            />
          </div>
        )}
      </div>

      <BoardDroppable boardId={board.id} isEmpty={board.tracks.length === 0}>
        {board.loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--green-primary)" }} />
          </div>
        ) : board.error ? (
          <div className="p-4 text-sm" style={{ color: "var(--coral)" }}>
            {board.error}
          </div>
        ) : (
          <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
            {board.tracks.map((t, i) => {
              const tid = t.id || "";
              const withinCount = tid ? withinDupCounts.get(tid) || 1 : 1;
              const occursIn = tid ? crossBoardMap.get(tid) : undefined;
              const otherBoards = occursIn
                ? Array.from(occursIn).filter((bid) => bid !== board.id)
                : [];
              return (
                <SortableTrack
                  key={keyOf(board.id, t)}
                  id={keyOf(board.id, t)}
                  index={i}
                  track={t}
                  highlightDups={highlightDups}
                  withinCount={withinCount}
                  otherBoardNames={otherBoards.map((bid) => boardNames[bid]?.name ?? bid)}
                />
              );
            })}
            {board.tracks.length === 0 && (
              <div className="p-6 text-center text-sm" style={{ color: "var(--text-light)" }}>
                Empty — drop tracks here.
              </div>
            )}
          </SortableContext>
        )}
      </BoardDroppable>
    </div>
  );
}

// ==================== GENRE LIST ====================

function GenreList({
  state,
  expanded,
  onToggleExpanded,
}: {
  state: GenresState | undefined;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  if (!state) return null;
  if (state.status === "loading")
    return (
      <div className="flex items-center gap-2 text-xs py-2" style={{ color: "var(--text-light)" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading genres…
      </div>
    );
  if (state.status === "error")
    return (
      <p className="text-xs py-1" style={{ color: "var(--coral)" }}>
        Couldn't load genres: {state.message}
      </p>
    );
  const all = state.data.genres;
  if (all.length === 0)
    return (
      <p className="text-xs py-1" style={{ color: "var(--text-light)" }}>
        No genre tags on the artists in this playlist.
      </p>
    );
  const shown = expanded ? all : all.slice(0, 5);
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {shown.map((g) => (
        <span
          key={g.genre}
          title={g.sample_artists.join(", ")}
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: "var(--bg-cream)", color: "var(--text-medium)", border: "1px solid var(--border-light)" }}
        >
          <span className="capitalize">{g.genre}</span> · {g.count}
        </span>
      ))}
      {all.length > 5 && (
        <button
          onClick={onToggleExpanded}
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: "var(--green-pale)", color: "var(--green-primary)" }}
        >
          {expanded ? "Show less" : `+${all.length - 5} more`}
        </button>
      )}
    </div>
  );
}

// ==================== BOARD DROPPABLE ====================

function BoardDroppable({
  boardId,
  isEmpty,
  children,
}: {
  boardId: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useSortable({ id: boardId, data: { isContainer: true } });
  return (
    <div
      ref={setNodeRef}
      className="flex-1 overflow-y-auto"
      style={{ minHeight: isEmpty ? 100 : undefined }}
    >
      {children}
    </div>
  );
}

// ==================== SORTABLE TRACK ====================

function SortableTrack({
  id,
  index,
  track,
  highlightDups,
  withinCount,
  otherBoardNames,
}: {
  id: string;
  index: number;
  track: Track;
  highlightDups: boolean;
  withinCount: number; // 1 means unique, >1 means duplicate inside same playlist
  otherBoardNames: string[]; // other pinned boards this track is in
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Using visibility:hidden (not opacity:0.4 or display:none) keeps the row's
  // height in the flow so the placeholder gap is exactly the right size —
  // no apparent "missing row" effect after drop.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    visibility: isDragging ? "hidden" : "visible",
    height: ROW_HEIGHT,
  };

  const withinDup = withinCount > 1;
  const crossDup = otherBoardNames.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-1.5"
      {...attributes}
    >
      <button
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 -ml-1"
        style={{ color: "var(--text-light)" }}
        aria-label="Drag handle"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-xs w-6 text-right flex-shrink-0" style={{ color: "var(--text-light)" }}>
        {index + 1}
      </span>
      {track.image ? (
        <img src={track.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
      ) : (
        <div
          className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--green-pale)" }}
        >
          <Music className="w-4 h-4" style={{ color: "var(--green-primary)" }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-dark)" }}>
          {track.name}
        </p>
        <p className="text-xs truncate flex items-center gap-1" style={{ color: "var(--text-medium)" }}>
          <span className="truncate">{track.artist}</span>
          {highlightDups && withinDup && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: "var(--peach)", color: "var(--coral)" }}
              title={`Appears ${withinCount}× in this playlist`}
            >
              ×{withinCount}
            </span>
          )}
          {highlightDups && crossDup && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 truncate max-w-[140px]"
              style={{ background: "var(--blue-soft)", color: "var(--blue-accent)" }}
              title={`Also in: ${otherBoardNames.join(", ")}`}
            >
              also in {otherBoardNames.length > 1 ? `${otherBoardNames.length} others` : otherBoardNames[0]}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ==================== CONFIRM DELETE ====================

function ConfirmDelete({
  name,
  loading,
  onConfirm,
  onCancel,
}: {
  name: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden p-5"
        style={{ background: "var(--bg-cream)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display font-semibold mb-2" style={{ color: "var(--text-dark)" }}>
          Delete "{name}"?
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-medium)" }}>
          This unfollows the playlist from your Spotify account. The action is irreversible from this app —
          Spotify keeps a brief restore window in their web client.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--bg-warm)", color: "var(--text-dark)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            style={{ background: "var(--coral)", color: "white" }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
