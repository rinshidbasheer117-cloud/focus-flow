import { createStore } from "./store";
import { markDirty } from "./sync/dirty";

export type Genre = "progressive-house" | "melodic-techno" | "trance" | "instrumental-edm" | "high-energy" | "calm-electronic";
export type Energy = "low" | "medium" | "high";
export type VocalPref = "instrumental" | "vocal" | "any";

export const GENRES: { id: Genre; label: string }[] = [
  { id: "progressive-house", label: "Progressive house" },
  { id: "melodic-techno", label: "Melodic techno" },
  { id: "trance", label: "Trance" },
  { id: "instrumental-edm", label: "Instrumental EDM" },
  { id: "high-energy", label: "High-energy electronic" },
  { id: "calm-electronic", label: "Calm electronic" },
];

export interface Preferences {
  onboarded: boolean;
  genres: Genre[];
  energy: Energy;
  vocals: VocalPref;
  sessionMinutes: number;
  breakMinutes: number;
  animations: boolean;
  reducedMotion: boolean;
  reminders: boolean;
  updatedAt: number;
}

export const defaultPrefs: Preferences = {
  onboarded: false,
  genres: ["progressive-house", "melodic-techno"],
  energy: "medium",
  vocals: "instrumental",
  sessionMinutes: 25,
  breakMinutes: 5,
  animations: true,
  reducedMotion: false,
  reminders: true,
  updatedAt: 0,
};

export const prefsStore = createStore<Preferences>("fb.prefs", defaultPrefs);
export const usePrefs = prefsStore.use;
export function updatePrefs(p: Partial<Preferences>) {
  prefsStore.set((s) => ({ ...s, ...p, updatedAt: Date.now() }));
  markDirty("prefs");
}
/** Motion is allowed only when animations are on AND reduced motion is off. */
export const motionAllowed = (p: Preferences) => p.animations && !p.reducedMotion;
