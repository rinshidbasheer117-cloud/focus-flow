import type { Energy, Genre } from "../prefs";

/**
 * "generated": synthesized in-browser by the demo provider — genuinely playable.
 * "sample": sample metadata only (illustrative titles) — NOT playable in Phase 1.
 */
export type TrackSource = "generated" | "sample";
export interface Track {
  id: string;
  title: string;
  artist: string;
  genre: Genre;
  energy: Energy;
  vocals: boolean;
  bpm: number;
  source: TrackSource;
  providerId: string;
  synth?: { style: "house" | "techno" | "trance" | "ambient"; root: number };
}

export const CATALOG: Track[] = [
  { id: "g1", title: "Deep Work Pulse", artist: "FocusBeat Generator", genre: "progressive-house", energy: "medium", vocals: false, bpm: 122, source: "generated", providerId: "synth", synth: { style: "house", root: 45 } },
  { id: "g2", title: "Night Circuit", artist: "FocusBeat Generator", genre: "melodic-techno", energy: "medium", vocals: false, bpm: 124, source: "generated", providerId: "synth", synth: { style: "techno", root: 43 } },
  { id: "g3", title: "Lift Off", artist: "FocusBeat Generator", genre: "trance", energy: "high", vocals: false, bpm: 136, source: "generated", providerId: "synth", synth: { style: "trance", root: 47 } },
  { id: "g4", title: "Soft Grid", artist: "FocusBeat Generator", genre: "calm-electronic", energy: "low", vocals: false, bpm: 90, source: "generated", providerId: "synth", synth: { style: "ambient", root: 48 } },
  { id: "g5", title: "Overdrive Sprint", artist: "FocusBeat Generator", genre: "high-energy", energy: "high", vocals: false, bpm: 140, source: "generated", providerId: "synth", synth: { style: "techno", root: 40 } },
  { id: "g6", title: "Clean Lines", artist: "FocusBeat Generator", genre: "instrumental-edm", energy: "medium", vocals: false, bpm: 118, source: "generated", providerId: "synth", synth: { style: "house", root: 50 } },
  { id: "s1", title: "Horizon Drift (sample)", artist: "Sample Artist A", genre: "progressive-house", energy: "medium", vocals: true, bpm: 124, source: "sample", providerId: "none" },
  { id: "s2", title: "Afterglow Theory (sample)", artist: "Sample Artist B", genre: "melodic-techno", energy: "low", vocals: false, bpm: 120, source: "sample", providerId: "none" },
  { id: "s3", title: "Skyline Euphoria (sample)", artist: "Sample Artist C", genre: "trance", energy: "high", vocals: true, bpm: 138, source: "sample", providerId: "none" },
  { id: "s4", title: "Quiet Voltage (sample)", artist: "Sample Artist D", genre: "calm-electronic", energy: "low", vocals: false, bpm: 85, source: "sample", providerId: "none" },
  { id: "s5", title: "Redline (sample)", artist: "Sample Artist E", genre: "high-energy", energy: "high", vocals: true, bpm: 145, source: "sample", providerId: "none" },
  { id: "s6", title: "Glass Patterns (sample)", artist: "Sample Artist F", genre: "instrumental-edm", energy: "medium", vocals: false, bpm: 116, source: "sample", providerId: "none" },
];
