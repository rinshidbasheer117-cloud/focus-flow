import { Play, Square, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import type { Track } from "@/lib/music/catalog";
import { GENRES } from "@/lib/prefs";
import { isPlayable, playTrack, stopPlayback, usePlayer } from "@/lib/music/provider";
import { setFeedback, useFeedback } from "@/lib/music/recommend";

export function SourceBadge({ track }: { track: Track }) {
  return isPlayable(track) ? (
    <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-lime">Playable · generated demo</span>
  ) : (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sample data · not playable</span>
  );
}

export function TrackRow({ track, reasons }: { track: Track; reasons?: string[] }) {
  const player = usePlayer();
  const fb = useFeedback();
  const isCur = player.trackId === track.id;
  const playing = isCur && player.status === "playing";
  const liked = fb.likes.includes(track.id), disliked = fb.dislikes.includes(track.id);
  return (
    <li className="surface flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <button className={`btn size-11 shrink-0 p-0 ${isPlayable(track) ? "btn-primary" : "btn-ghost"}`}
          onClick={() => (playing ? stopPlayback() : playTrack(track))}
          aria-label={playing ? `Stop ${track.title}` : `Play ${track.title}`}>
          {isCur && player.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : playing ? <Square className="size-4" /> : <Play className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{track.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {track.artist} · {GENRES.find((g) => g.id === track.genre)?.label} · {track.bpm} BPM · {track.energy} · {track.vocals ? "vocal" : "instrumental"}
          </p>
        </div>
        <button className="btn btn-ghost size-9 p-0" aria-pressed={liked} aria-label="More like this"
          onClick={() => setFeedback(track.id, liked ? "none" : "like")}>
          <ThumbsUp className={`size-4 ${liked ? "text-lime" : ""}`} />
        </button>
        <button className="btn btn-ghost size-9 p-0" aria-pressed={disliked} aria-label="Less like this"
          onClick={() => setFeedback(track.id, disliked ? "none" : "dislike")}>
          <ThumbsDown className={`size-4 ${disliked ? "text-destructive" : ""}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge track={track} />
        {reasons?.map((r) => <span key={r} className="text-[11px] text-muted-foreground">· {r}</span>)}
      </div>
      {isCur && player.status === "error" && <p role="alert" className="text-xs text-destructive">{player.error}</p>}
    </li>
  );
}
