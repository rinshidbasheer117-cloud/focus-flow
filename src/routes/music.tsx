import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/AppShell";
import { TrackRow } from "@/components/TrackRow";
import { Waveform } from "@/components/Waveform";
import { CATALOG } from "@/lib/music/catalog";
import { isPlayable, stopPlayback, usePlayer } from "@/lib/music/provider";
import { recommend, useFeedback } from "@/lib/music/recommend";
import { GENRES, usePrefs, type Energy, type Genre } from "@/lib/prefs";

export const Route = createFileRoute("/music")({
  head: () => ({
    meta: [
      { title: "Music · FocusBeat" },
      { name: "description", content: "Browse EDM focus music by genre and energy, or get rules-based picks." },
      { property: "og:title", content: "Music · FocusBeat" },
      { property: "og:description", content: "Progressive house, melodic techno, trance and calm electronic for focus." },
    ],
  }),
  component: MusicPage,
});

function MusicPage() {
  const prefs = usePrefs();
  const fb = useFeedback();
  const player = usePlayer();
  const [mode, setMode] = useState<"for-you" | "browse">("for-you");
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [energy, setEnergy] = useState<Energy | "all">("all");
  const [playableOnly, setPlayableOnly] = useState(false);
  const recs = useMemo(() => recommend(CATALOG, prefs, fb), [prefs, fb]);
  const browse = CATALOG.filter((t) => (genre === "all" || t.genre === genre) && (energy === "all" || t.energy === energy) && (!playableOnly || isPlayable(t)));
  const current = CATALOG.find((t) => t.id === player.trackId);

  return (
    <div>
      <PageHeader title="Music" subtitle="Preferences, not prescriptions. Pick what feels right." />
      <div className="surface mb-6 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Phase 1 note:</strong> tracks marked <span className="text-lime">Playable</span> are loops generated live in your browser. Tracks marked <em>Sample data</em> are illustrative listings only — no licensed streaming is connected yet.
      </div>

      {current && (
        <div className="surface mb-6 flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{player.status === "playing" ? "Now playing" : player.status === "error" ? "Can't play" : "Selected"}</p>
            <p className="truncate font-semibold">{current.title}</p>
            <Waveform active={player.status === "playing"} className="mt-2 h-8" />
          </div>
          {player.status === "playing" && <button className="btn btn-ghost" onClick={stopPlayback}>Stop</button>}
        </div>
      )}

      <div role="tablist" className="mb-4 flex gap-2">
        <button role="tab" aria-selected={mode === "for-you"} className="chip" aria-pressed={mode === "for-you"} onClick={() => setMode("for-you")}>For you</button>
        <button role="tab" aria-selected={mode === "browse"} className="chip" aria-pressed={mode === "browse"} onClick={() => setMode("browse")}>Browse</button>
      </div>

      {mode === "for-you" ? (
        recs.length ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">Ranked by simple rules: genre match +3, energy +2, vocal preference +1, liked +2, disliked −5.</p>
            <ul className="space-y-2">{recs.map((r) => <TrackRow key={r.track.id} track={r.track} reasons={r.reasons} />)}</ul>
          </>
        ) : (
          <EmptyState title="No matches yet" body="Your preferences don't match any tracks. Adjust them in Settings or browse everything."
            action={<Link to="/settings" className="btn btn-primary">Edit preferences</Link>} />
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <select aria-label="Genre" className="field w-auto" value={genre} onChange={(e) => setGenre(e.target.value as Genre | "all")}>
              <option value="all">All genres</option>{GENRES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <select aria-label="Energy" className="field w-auto" value={energy} onChange={(e) => setEnergy(e.target.value as Energy | "all")}>
              <option value="all">Any energy</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
            <label className="chip cursor-pointer"><input type="checkbox" className="accent-primary" checked={playableOnly} onChange={(e) => setPlayableOnly(e.target.checked)} /> Playable only</label>
          </div>
          {browse.length ? <ul className="space-y-2">{browse.map((t) => <TrackRow key={t.id} track={t} />)}</ul>
            : <EmptyState title="Nothing matches" body="Try a different genre or energy." />}
        </>
      )}
    </div>
  );
}
