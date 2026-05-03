import { useState, useEffect, useMemo } from 'react';
import { TARGET_OPTIONS, NAMED_IPS } from '../data/units';
import { Stepper, ChipPicker, CardinalRose } from './Controls';

// 9-line CAS form. Hybrid input model:
//   - Every field is an editable text input (touch keyboard works)
//   - Chip pickers / steppers / cardinal rose available as quick-pick
//     touchscreen affordances above or beside the text
//   - Engine values pre-fill all fields; the JTAC overrides as needed
//
// All chip pickers are FUNCTIONAL — tapping a chip swaps the value.

function FieldHeader({ num, label, readback, onWhy }) {
  return (
    <div className="field-row">
      {num != null && <div className="field-num">{num}</div>}
      <span className="field-lbl">{label}</span>
      {readback && <span className="rb-tag">READBACK</span>}
      {onWhy && (
        <button className="why-btn" onClick={onWhy} title="Rationale">i</button>
      )}
    </div>
  );
}

// Editable text input styled to look like a tactical readout.
function TacInput({ value, onChange, mono = false, big = false, placeholder }) {
  return (
    <input
      type="text"
      className={`tac-input${mono ? ' mono' : ''}${big ? ' big' : ''}`}
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
    />
  );
}

function FlagChip({ flag }) {
  const danger = ['DANGER_CLOSE', 'EXTREME_DANGER_CLOSE', 'CAT_I_INSIDE_RED_SELF_DEFENSE', 'INSUFFICIENT_PID', 'NOT_ENGAGEABLE', 'TARGET_IS_NSL', 'ROE_BLOCKED', 'MARGINAL_EFFECTIVENESS_OVERRIDE'].includes(flag);
  return <span className={`flag-chip ${danger ? 'danger' : 'warn'}`}>{flag.replace(/_/g, ' ')}</span>;
}

export default function NineLineForm({
  active,
  recommendation,
  weaponOverride,
  onBack,
  onChangePrimaryTarget,
  onChangeWeapon,
  onChangeEgressDir,
  onChangeIP,
  onSend,
  onGFC,
  onWhy,
}) {
  // Local edited values — pre-filled from the engine each render unless the
  // JTAC has typed an override.
  const [overrides, setOverrides] = useState({});
  const set = (key, value) => setOverrides(o => ({ ...o, [key]: value }));
  const get = (key, fallback) => overrides[key] !== undefined ? overrides[key] : fallback;

  const [prfCode, setPrfCode] = useState(1688);
  const [egressAlt, setEgressAlt] = useState(8000);

  // Cache the engine's *natural* primary pick so OPT A can keep displaying
  // its weapon ID + meta even after the JTAC switches to OPT B.
  const [naturalPrimary, setNaturalPrimary] = useState(null);
  useEffect(() => {
    if (!weaponOverride && recommendation?.munition?.primary) {
      setNaturalPrimary({
        id: recommendation.munition.primary.id,
        red_standing_m: recommendation.munition.primary.red_standing_m,
        effectiveness_rating: recommendation.munition.primary.effectiveness_rating,
      });
    }
  }, [weaponOverride, recommendation?.munition?.primary?.id]);

  // Reset overrides when target changes — the JTAC's edits to target-specific
  // fields shouldn't bleed across targets.
  useEffect(() => {
    setOverrides({});
    setNaturalPrimary(null);
  }, [recommendation?.target_id]);

  if (!recommendation) {
    return (
      <div id="s3" className={active ? 'active' : ''}>
        <div className="nl-header">
          <button className="nl-back" onClick={onBack}>✕</button>
          <span className="nl-title">9-LINE — COMPUTING…</span>
        </div>
      </div>
    );
  }

  const r = recommendation;
  const blocked = r.engageability === 'NOT_ENGAGEABLE';
  const nl = r.nine_line || {};
  const m = r.munition?.primary;
  const headingStr = String(nl.line_2_heading?.value_deg_magnetic ?? 0).padStart(3, '0');
  const effectiveEgressDir = get('egressDir', nl.line_9?.direction ?? 'N');

  const targetChipOptions = useMemo(
    () => TARGET_OPTIONS.map(t => ({ id: t.id, label: t.id.replace('TGT.', '') })),
    []
  );
  const weaponChipOptions = useMemo(() => {
    if (!m) return [];
    return [
      { id: m.id, label: m.id },
      ...(r.munition?.alternatives ?? []).map(a => ({ id: a.id, label: a.id })),
    ];
  }, [m, r.munition?.alternatives]);

  const isLaser = (nl.line_7?.mark_type ?? '') === 'laser';

  return (
    <div id="s3" className={active ? 'active' : ''}>
      <div className="nl-header">
        <button className="nl-back" onClick={onBack} title="Close">✕</button>
        <span className="nl-title">9-LINE CAS BRIEF</span>
        <span className={`nl-badge${blocked ? ' nl-badge-blocked' : ''}`}>
          {blocked ? 'BLOCKED' : r.engageability.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="nl-scroll">

        {/* TWO RECOMMENDATIONS — radio-button pattern. Tap to compare. */}
        {!blocked && m && (() => {
          const altA_active = !weaponOverride;
          const altB = r.munition?.alternatives?.[0];
          const altB_active = !!weaponOverride && altB && weaponOverride === altB.id;
          return (
            <>
              <div className="opt-header">Pick a recommendation</div>
              <div className="opt-tabs" role="radiogroup" aria-label="Pick a recommendation">
                <button
                  type="button"
                  role="radio"
                  aria-checked={altA_active}
                  className={`opt-tab${altA_active ? ' active' : ''}`}
                  onClick={() => onChangeWeapon?.(null)}
                >
                  <span className="opt-label">A · Primary</span>
                  <span className="opt-weapon">{altA_active ? m.id : (naturalPrimary?.id ?? '—')}</span>
                  <span className="opt-meta">{
                    altA_active
                      ? `RED ${m.red_standing_m}m · ${m.effectiveness_rating}`
                      : (naturalPrimary ? `RED ${naturalPrimary.red_standing_m}m · ${naturalPrimary.effectiveness_rating}` : 'engine pick')
                  }</span>
                </button>
                {altB ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={altB_active}
                    className={`opt-tab${altB_active ? ' active' : ''}`}
                    onClick={() => onChangeWeapon?.(altB.id)}
                  >
                    <span className="opt-label">B · Alternate</span>
                    <span className="opt-weapon">{altB.id}</span>
                    <span className="opt-meta">{altB.effectiveness_rating}{altB_active ? ` · RED ${m.red_standing_m}m` : ''}</span>
                  </button>
                ) : (
                  <button type="button" className="opt-tab" disabled>
                    <span className="opt-label">B · Alternate</span>
                    <span className="opt-weapon">—</span>
                    <span className="opt-meta">no alternative</span>
                  </button>
                )}
              </div>
            </>
          );
        })()}

        {blocked && (
          <div className="block-banner">
            <div className="block-banner-title">⚠ NOT ENGAGEABLE</div>
            {r.block_reasons?.map((reason, i) => (
              <div key={i} className="block-banner-reason">• {reason}</div>
            ))}
            <div className="block-banner-flags">
              {r.flags?.map(f => <FlagChip key={f} flag={f} />)}
            </div>
          </div>
        )}

        {!blocked && r.flags?.length > 0 && (
          <div className="flag-bar">{r.flags.map(f => <FlagChip key={f} flag={f} />)}</div>
        )}

        {/* GAME PLAN */}
        <div className="form-section">Game Plan</div>

        <div className="nl-field">
          <div className="field-row">
            <span className="field-lbl">Target</span>
            <button className="why-btn" onClick={() => onWhy?.('target')}>i</button>
          </div>
          <ChipPicker options={targetChipOptions} value={r.target_id} onChange={onChangePrimaryTarget} />
          <div className="field-sub">
            {r.target_classification} · {Math.round((r.cnn_confidence ?? 0) * 100)}% conf · {r.target_class?.replace(/_/g, ' ')}
          </div>
        </div>

        {!blocked && (
          <div className="nl-field">
            <div className="field-row"><span className="field-lbl">Control · MOA</span></div>
            <TacInput value={get('controlMOA', `${r.game_plan?.control_type?.replace('_', ' ')} · ${r.game_plan?.method_of_attack}`)}
              onChange={v => set('controlMOA', v)} mono big />
            <div className="field-sub">{r.game_plan?.clearance_call_phrase}</div>
          </div>
        )}

        {!blocked && m && (
          <div className="field-sub" style={{ marginBottom: 6, padding: '4px 0' }}>
            {m.name} · {m.guidance.toUpperCase()} · {m.fuze} · {m.count} on station · TLE ≤ {m.tle_required_m}m
            <button className="why-btn" onClick={() => onWhy?.('weapon')} style={{ marginLeft: 6 }}>i</button>
          </div>
        )}

        {!blocked && (
          <>
            {/* 9-LINE */}
            <div className="form-section">CAS 9-Line · {r.target_id}</div>

            {/* 1 — IP / BP */}
            <div className="nl-field">
              <FieldHeader num={1} label="IP / BP" />
              <ChipPicker options={NAMED_IPS} value={get('ip', 'IP NORTH')}
                onChange={v => { set('ip', v); onChangeIP?.(v); }} />
              <TacInput value={get('ip', 'IP NORTH')} onChange={v => set('ip', v)} mono />
              <div className="field-sub">Tap an IP to update Line 2 heading + map attack vector</div>
            </div>

            {/* 2 — Heading */}
            <div className="nl-field">
              <FieldHeader num={2} label="Heading" onWhy={() => onWhy?.('vector')} />
              <TacInput value={get('heading', `${headingStr}°M`)} onChange={v => set('heading', v)} mono big />
              <div className="field-sub">Drag the orange handle on the map to adjust live</div>
            </div>

            {/* 3 — Distance */}
            <div className="nl-field">
              <FieldHeader num={3} label="Distance" />
              <TacInput value={get('distance', `${nl.line_3_distance?.value ?? '—'} ${nl.line_3_distance?.units ?? 'NM'}`)}
                onChange={v => set('distance', v)} mono big />
            </div>

            {/* 4 — Target Elevation */}
            <div className="nl-field">
              <FieldHeader num={4} label="Target Elevation" readback />
              <TacInput value={get('elev', `${nl.line_4?.value ?? '—'} ${nl.line_4?.units ?? 'ft'} ${nl.line_4?.datum ?? 'MSL'}`)}
                onChange={v => set('elev', v)} mono big />
            </div>

            {/* 5 — Target Description */}
            <div className="nl-field">
              <FieldHeader num={5} label="Target Description" onWhy={() => onWhy?.('target')} />
              <TacInput value={get('desc', nl.line_5?.value ?? '')} onChange={v => set('desc', v)} />
            </div>

            {/* 6 — Target Location */}
            <div className="nl-field">
              <FieldHeader num={6} label="Target Location" readback />
              <TacInput value={get('loc', nl.line_6?.value ?? '')} onChange={v => set('loc', v)} mono big />
              <div className="field-sub">
                {nl.line_6?.format ?? 'MGRS'} · {nl.line_6?.datum ?? 'WGS-84'} · {nl.line_6?.tle_category}
              </div>
            </div>

            {/* 7 — Mark */}
            <div className="nl-field">
              <FieldHeader num={7} label="Mark / Terminal Guidance" />
              <TacInput value={get('mark', nl.line_7?.value ?? '—')} onChange={v => set('mark', v)} />
              {isLaser && (
                <>
                  <div className="field-row" style={{ marginTop: 6 }}>
                    <span className="field-lbl">PRF Code</span>
                  </div>
                  <div className="prf-row">
                    <button
                      type="button"
                      className="prf-btn"
                      onClick={() => setPrfCode(p => Math.max(1111, p - 1))}
                      disabled={prfCode <= 1111}
                      aria-label="decrease"
                    >−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[1-8]{4}"
                      maxLength={4}
                      className="prf-input"
                      value={String(prfCode).padStart(4, '0')}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^1-8]/g, '').slice(0, 4);
                        if (raw.length === 4) setPrfCode(parseInt(raw, 10));
                        else if (raw.length > 0) setPrfCode(parseInt(raw.padEnd(4, '1'), 10));
                      }}
                      onBlur={e => {
                        const n = parseInt(e.target.value, 10);
                        if (Number.isFinite(n)) setPrfCode(Math.max(1111, Math.min(8888, n)));
                      }}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="prf-btn"
                      onClick={() => setPrfCode(p => Math.min(8888, p + 1))}
                      disabled={prfCode >= 8888}
                      aria-label="increase"
                    >+</button>
                  </div>
                  <div className="field-sub">Each digit 1–8 · type or step</div>
                </>
              )}
              {nl.line_7?.backup_mark && (
                <div className="field-sub">Backup: {nl.line_7.backup_mark.value}</div>
              )}
            </div>

            {/* 8 — Friendlies */}
            <div className="nl-field">
              <FieldHeader num={8} label="Friendlies" />
              <TacInput value={get('frnd', `${nl.line_8?.direction ?? '—'} ${nl.line_8?.distance_m ?? 0} m`)}
                onChange={v => set('frnd', v)} mono big />
              <div className="field-sub">From drone — JTAC-PLI uplink</div>
            </div>

            {/* 9 — Egress */}
            <div className="nl-field">
              <FieldHeader num={9} label="Egress" />
              <div className="egress-row">
                <CardinalRose value={effectiveEgressDir}
                  onChange={dir => { set('egressDir', dir); onChangeEgressDir?.(dir); }}
                  size={140} />
                <div className="egress-alt">
                  <div className="field-lbl" style={{ marginBottom: 4 }}>Altitude</div>
                  <Stepper value={egressAlt} min={500} max={25000} step={500}
                    onChange={setEgressAlt}
                    format={v => v.toLocaleString()} suffix=" ft MSL" />
                </div>
              </div>
              <TacInput value={get('egress', `Egress ${effectiveEgressDir}, climb to ${egressAlt.toLocaleString()} ft MSL`)}
                onChange={v => set('egress', v)} />
            </div>

            {/* Engine-generated remarks + restrictions */}
            <div className="form-section">Remarks &amp; Restrictions</div>

            {r.remarks?.length > 0 && (
              <div className="remark-block">
                <div className="remark-block-label">REMARKS · ENGINE-GENERATED</div>
                {r.remarks.map((rmk, i) => (
                  <div key={i} className="remark-line">• {rmk.text}</div>
                ))}
              </div>
            )}
            {r.restrictions?.length > 0 && (
              <div className="remark-block restriction">
                <div className="remark-block-label">RESTRICTIONS · MANDATORY READBACK</div>
                {r.restrictions.map((rst, i) => (
                  <div key={i} className="remark-line restriction">• {rst.text}</div>
                ))}
              </div>
            )}

            {/* Free-form additional remarks */}
            <div className="nl-field">
              <div className="field-row"><span className="field-lbl">Additional remarks</span></div>
              <textarea
                className="tac-input"
                rows={3}
                value={get('addRemarks', '')}
                onChange={e => set('addRemarks', e.target.value)}
                placeholder="Type any extra remarks for transmission…"
                spellCheck={false}
              />
            </div>
          </>
        )}

        <details className="trace-details">
          <summary>How the model decided ({r.reasoning_trace?.length ?? 0} steps)</summary>
          {r.reasoning_trace?.map((step, i) => (
            <div key={i} className={`trace-step trace-${step.status}`}>
              <div className="trace-tree">{step.tree} · <span className="trace-status">{step.status}</span></div>
              <div className="trace-text">{step.text}</div>
            </div>
          ))}
        </details>

        <div style={{ height: 8 }}></div>
      </div>

      {!blocked && (
        <div className="nl-footer">
          <button className="btn-send-9line" onClick={onSend}>📡 SEND 9-LINE</button>
          <button className="btn-gfc" onClick={onGFC}>SEND GFC SUMMARY</button>
        </div>
      )}
    </div>
  );
}
