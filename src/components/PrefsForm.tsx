import { GENRES, type Preferences, type Energy, type VocalPref } from "@/lib/prefs";

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span><span className="block font-semibold">{label}</span>{desc && <span className="block text-xs text-muted-foreground">{desc}</span>}</span>
      <input type="checkbox" role="switch" className="size-5 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function PrefsForm({ value, onChange, sections = ["music", "session", "comfort"] }: {
  value: Preferences; onChange: (p: Partial<Preferences>) => void; sections?: ("music" | "session" | "comfort")[];
}) {
  return (
    <div className="space-y-6">
      {sections.includes("music") && (
        <>
          <fieldset>
            <legend className="mb-2 font-display font-semibold">Genres you enjoy</legend>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => {
                const on = value.genres.includes(g.id);
                return (
                  <button type="button" key={g.id} className="chip" aria-pressed={on}
                    onClick={() => onChange({ genres: on ? value.genres.filter((x) => x !== g.id) : [...value.genres, g.id] })}>{g.label}</button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-display font-semibold">Music energy</legend>
            <div className="flex flex-wrap gap-2">
              {(["low", "medium", "high"] as Energy[]).map((e) => (
                <button type="button" key={e} className="chip capitalize" aria-pressed={value.energy === e} onClick={() => onChange({ energy: e })}>{e}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-display font-semibold">Vocals</legend>
            <div className="flex flex-wrap gap-2">
              {([["instrumental", "Instrumental only"], ["vocal", "Vocals welcome"], ["any", "No preference"]] as [VocalPref, string][]).map(([v, l]) => (
                <button type="button" key={v} className="chip" aria-pressed={value.vocals === v} onClick={() => onChange({ vocals: v })}>{l}</button>
              ))}
            </div>
          </fieldset>
        </>
      )}
      {sections.includes("session") && (
        <fieldset>
          <legend className="mb-2 font-display font-semibold">Focus session length</legend>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 25, 45].map((m) => (
              <button type="button" key={m} className="chip" aria-pressed={value.sessionMinutes === m} onClick={() => onChange({ sessionMinutes: m })}>{m} min</button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm">Break length
            <select className="field w-28" value={value.breakMinutes} onChange={(e) => onChange({ breakMinutes: Number(e.target.value) })}>
              {[3, 5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </fieldset>
      )}
      {sections.includes("comfort") && (
        <fieldset className="divide-y divide-border">
          <legend className="mb-2 font-display font-semibold">Comfort</legend>
          <Toggle label="Animations" desc="Waveforms and completion effects" checked={value.animations} onChange={(v) => onChange({ animations: v })} />
          <Toggle label="Reduced motion" desc="Turns off all movement and transitions" checked={value.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
          <Toggle label="Timer reminders" desc="Chime and a gentle note when a block ends" checked={value.reminders} onChange={(v) => onChange({ reminders: v })} />
        </fieldset>
      )}
    </div>
  );
}
