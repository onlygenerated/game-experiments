import { useMemo, useState } from 'react';
import { CONFIG, type Config, type HandName } from '../config';
import { RANK_LABEL } from '../deck';
import { getLens } from '../lens';
import { DEFAULT_RULESET, getRuleset, rulesetGroups, type Ruleset } from '../rulesets';
import { METRICS } from '../metrics.generated';
import {
  GROUPS,
  HAND_NAMES,
  RANKS_IN_ORDER,
  getPath,
  matchingPreset,
  normalise,
  setPath,
  visibleFields,
  type Field,
} from '../setup';

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function Control({
  field,
  cfg,
  onChange,
}: {
  field: Field;
  cfg: Config;
  onChange: (path: string, value: unknown) => void;
}) {
  const value = getPath(cfg, field.path);

  return (
    <div className="panel-inset flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-neutral-100">{field.label}</div>
        {field.help && (
          <div className="mt-0.5 text-[11px] leading-snug text-neutral-500">{field.help}</div>
        )}
      </div>

      {field.kind === 'bool' && (
        <button
          onClick={() => onChange(field.path, !value)}
          aria-pressed={Boolean(value)}
          className={`shrink-0 rounded px-3 py-1 text-[12px] font-bold ${
            value ? 'bg-emerald-600/30 text-emerald-200' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {value ? 'On' : 'Off'}
        </button>
      )}

      {field.kind === 'enum' && (
        <div className="flex shrink-0 flex-wrap gap-1">
          {field.options.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(field.path, o.value)}
              className={`rounded px-2 py-1 text-[12px] font-semibold ${
                value === o.value
                  ? 'bg-emerald-600/30 text-emerald-200'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {field.kind === 'number' && (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={num(value)}
            onChange={(e) => onChange(field.path, Number(e.target.value))}
            className="w-28 accent-emerald-500 min-[1280px]:w-40"
          />
          <span className="w-10 text-right font-mono text-[13px] text-emerald-300">
            {field.step && field.step < 1 ? num(value).toFixed(2) : num(value)}
          </span>
        </div>
      )}
    </div>
  );
}

/** The poker hand table and rank values, so every preset is reproducible here. */
function PokerTables({
  cfg,
  onChange,
}: {
  cfg: Config;
  onChange: (path: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="panel-inset overflow-x-auto rounded p-2">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
              <th className="pb-1">Hand</th>
              <th className="pb-1 text-right">Needs</th>
              <th className="pb-1 text-right">Chips</th>
              <th className="pb-1 text-right">Mult</th>
            </tr>
          </thead>
          <tbody>
            {HAND_NAMES.map((name: HandName) => {
              const h = cfg.hands[name];
              const dead = h.minCards > cfg.lineCap;
              return (
                <tr key={name} className={dead ? 'text-neutral-600' : ''}>
                  <td className="py-0.5 pr-2">
                    {name}
                    {dead && (
                      <span className="ml-1 text-[9px] uppercase text-amber-500/80">
                        unreachable
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 text-right font-mono text-neutral-500">{h.minCards}</td>
                  {(['chips', 'mult'] as const).map((k) => (
                    <td key={k} className="py-0.5 text-right">
                      <input
                        type="number"
                        value={h[k]}
                        min={0}
                        onChange={(e) =>
                          onChange(`hands.${name}.${k}`, Math.max(0, Number(e.target.value)))
                        }
                        className="w-14 rounded bg-neutral-900 px-1 py-0.5 text-right font-mono text-neutral-200 outline-none focus:border-sky-500"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-inset rounded p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
          Chips per rank
        </div>
        <div className="flex flex-wrap gap-1">
          {RANKS_IN_ORDER.map((r) => (
            <label key={r} className="flex items-center gap-1">
              <span className="w-4 text-right font-mono text-[11px] text-neutral-500">
                {RANK_LABEL[r]}
              </span>
              <input
                type="number"
                min={0}
                value={cfg.rankChips[r]}
                onChange={(e) => onChange(`rankChips.${r}`, Math.max(0, Number(e.target.value)))}
                className="w-12 rounded bg-neutral-900 px-1 py-0.5 text-right font-mono text-[12px] text-neutral-200 outline-none focus:border-sky-500"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SetupPage({
  initial,
  onStart,
  onClose,
}: {
  initial: Ruleset;
  onStart: (ruleset: Ruleset) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Config>(() => initial.config);
  const [advanced, setAdvanced] = useState(false);

  const cfg = useMemo(() => normalise(draft), [draft]);
  const change = (path: string, value: unknown) => setDraft((d) => normalise(setPath(d, path, value)));

  const preset = matchingPreset(cfg);
  const measured = preset ? METRICS.find((m) => m.id === preset.id) : undefined;

  const start = () =>
    onStart(
      preset ?? {
        id: 'custom',
        name: 'Custom setup',
        group: 'Custom',
        blurb: `A hand-built ruleset: ${getLens(cfg.lensId).name.toLowerCase()} scoring on a ${
          cfg.structure === 'hex' ? 'hex board' : `${cfg.gridSize}×${cfg.gridSize} grid`
        }. The target is hand-picked rather than calibrated.`,
        config: cfg,
      },
    );

  return (
    <div className="mx-auto w-full max-w-3xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Game setup</h1>
        <button
          onClick={onClose}
          className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>

      <p className="mb-3 text-[12px] leading-snug text-neutral-400">
        Every preset is one point in this space — nothing in the list is reachable here except by
        setting the same values. Options that cannot affect play under your current choices are
        hidden rather than shown doing nothing.
      </p>

      <div className="panel-inset mb-3 rounded p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
          Start from a preset
        </div>
        <select
          value={preset?.id ?? ''}
          onChange={(e) => e.target.value && setDraft(getRuleset(e.target.value).config)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[13px] text-neutral-200"
        >
          <option value="">Custom — not one of the presets</option>
          {rulesetGroups().map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {GROUPS.map((group) => {
          const fields = visibleFields(group, cfg);
          if (!fields.length) return null;
          return (
            <div key={group.title}>
              <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {group.title}
              </h2>
              {group.note && group.fields.some((f) => f.applies && !f.applies(cfg)) && (
                <p className="mb-1 text-[11px] leading-snug text-neutral-500">{group.note}</p>
              )}
              <div className="space-y-1.5">
                {fields.map((f) => (
                  <Control key={f.path} field={f} cfg={cfg} onChange={change} />
                ))}
              </div>
            </div>
          );
        })}

        {cfg.lensId === 'poker' && (
          <div>
            <button
              onClick={() => setAdvanced((v) => !v)}
              className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400"
            >
              Hand values {advanced ? '▲' : '▼'}
            </button>
            {advanced && <PokerTables cfg={cfg} onChange={change} />}
          </div>
        )}
      </div>

      <div className="panel sticky bottom-0 mt-3 -mx-1 rounded-lg p-2">
        {measured ? (
          <p className="mb-2 text-[11px] leading-snug text-neutral-400">
            This is exactly <span className="font-semibold text-emerald-300">{preset!.name}</span>,
            so its target is probe-calibrated and it has measured numbers on the Metrics page —
            lookahead lift ×{measured.lift.toFixed(2)}, mult live {measured.multPct}%.
          </p>
        ) : (
          <p className="mb-2 text-[11px] leading-snug text-amber-300/90">
            Not one of the presets, so the target of {cfg.targetScore} is a guess rather than a
            calibrated figure. The game plays correctly; winning or losing just does not mean much
            until it has been measured.
          </p>
        )}
        <button
          onClick={start}
          className="w-full rounded bg-gradient-to-b from-emerald-500 to-emerald-700 py-2.5 font-bold shadow-lg active:from-emerald-400 active:to-emerald-600"
        >
          Start this game
        </button>
        <button
          onClick={() => setDraft(CONFIG)}
          className="mt-1 w-full rounded px-2 py-1 text-[11px] text-neutral-500 active:bg-neutral-800"
        >
          Reset to the poker baseline
        </button>
      </div>
    </div>
  );
}

export const SETUP_DEFAULT = DEFAULT_RULESET;
