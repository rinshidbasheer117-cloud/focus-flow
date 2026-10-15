import type { Preferences } from "../prefs";
import type { Track } from "./catalog";
import { createStore } from "../store";

export const feedbackStore = createStore<{ likes: string[]; dislikes: string[] }>("fb.musicFeedback", { likes: [], dislikes: [] });
export const useFeedback = feedbackStore.use;
export function setFeedback(id: string, kind: "like" | "dislike" | "none") {
  feedbackStore.set((f) => ({
    likes: kind === "like" ? [...new Set([...f.likes, id])] : f.likes.filter((x) => x !== id),
    dislikes: kind === "dislike" ? [...new Set([...f.dislikes, id])] : f.dislikes.filter((x) => x !== id),
  }));
}

/** Transparent rules-based scoring. Each rule produces a human-readable reason. */
export function recommend(tracks: Track[], p: Preferences, fb: { likes: string[]; dislikes: string[] }) {
  return tracks
    .map((t) => {
      let score = 0;
      const reasons: string[] = [];
      if (p.genres.includes(t.genre)) { score += 3; reasons.push("matches your genres"); }
      if (t.energy === p.energy) { score += 2; reasons.push(`${p.energy} energy`); }
      if (p.vocals === "any" || (p.vocals === "instrumental") === !t.vocals) { score += 1; reasons.push(t.vocals ? "has vocals" : "instrumental"); }
      if (fb.likes.includes(t.id)) { score += 2; reasons.push("you liked this"); }
      if (fb.dislikes.includes(t.id)) score -= 5;
      return { track: t, score, reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
