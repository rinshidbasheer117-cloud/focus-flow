import { createStore } from "./store";

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
};

export const prefsStore = createStore<Preferences>("fb.prefs", defaultPrefs);
export const usePrefs = prefsStore.use;
export const updatePrefs = (p: Partial<Preferences>) => prefsStore.set((s) => ({ ...s, ...p }));
/** Motion is allowed only when animations are on AND reduced motion is off. */
export const motionAllowed = (p: Preferences) => p.animations && !p.reducedMotion;
