import type { Track } from "./catalog";
import { startSynth, stopSynth } from "./synth";
import { createStore } from "../store";

/** Provider adapter. Future: licensed catalog / Spotify / etc. each implement this after legal validation. */
export interface MusicProvider {
  id: string;
  name: string;
  canPlay(track: Track): boolean;
  play(track: Track): Promise<void>;
  stop(): void;
}

const synthProvider: MusicProvider = {
  id: "synth",
  name: "FocusBeat demo generator",
  canPlay: (t) => t.source === "generated" && !!t.synth,
  play: async (t) => startSynth({ bpm: t.bpm, energy: t.energy, style: t.synth!.style, root: t.synth!.root }),
  stop: stopSynth,
};
const PROVIDERS: Record<string, MusicProvider> = { synth: synthProvider };
export const getProvider = (id: string) => PROVIDERS[id];
export const isPlayable = (t: Track) => !!getProvider(t.providerId)?.canPlay(t);

interface PlayerState { trackId?: string; status: "idle" | "loading" | "playing" | "error"; error?: string; }
export const playerStore = createStore<PlayerState>("fb.player", { status: "idle" }, false);
export const usePlayer = playerStore.use;

export async function playTrack(t: Track) {
  const cur = playerStore.get();
  if (cur.trackId) getProvider(playerStore.get().trackId ? "synth" : "")?.stop();
  const p = getProvider(t.providerId);
  if (!p || !p.canPlay(t)) {
    playerStore.set({ trackId: t.id, status: "error", error: "This is sample metadata only — no audio is available for it yet." });
    return;
  }
  playerStore.set({ trackId: t.id, status: "loading" });
  try {
    await p.play(t);
    playerStore.set({ trackId: t.id, status: "playing" });
  } catch (e) {
    playerStore.set({ trackId: t.id, status: "error", error: e instanceof Error ? e.message : "Playback failed." });
  }
}
export function stopPlayback() {
  Object.values(PROVIDERS).forEach((p) => p.stop());
  playerStore.set((s) => ({ trackId: s.trackId, status: "idle" }));
}
