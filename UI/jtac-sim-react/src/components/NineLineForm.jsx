import { useState, useMemo } from 'react';
import { TARGET_OPTIONS, NAMED_IPS, REMARK_PRESETS } from '../data/units';
import { Stepper, ChipPicker, ChipMulti, SegmentedToggle, CardinalRose } from './Controls';

// Read-only field block — for engine-derived values the JTAC doesn't edit.
function ReadOnly({ children, sub }) {
  return (
    <>
      <div className="ro-field">{children}</div>
      {sub && <div className="field-sub">{sub}</div>}
    </>
  );
}

function FieldHeader({ num, label, readback, auto, onWhy }) {
  return (
    <div className="field-row">
      <div className={`field-num${typeof num === 'string' ? ' purple-num' : ''}`}>{num}</div>
      <span className="field-lbl">{label}</span>
      {readback && <span className="rb-tag">READBACK</span>}
      {auto && <span className="auto-tag">AUTO</span>}
      {onWhy && (
        <button className="why-btn" onClick={onWhy} title="Rationale">i</button>
      )}
    </div>
  );
}

function FlagChip({ flag }) {
  const danger = ['DANGER_CLOSE', 'EXTREME_DANGER_CLOSE', 'CAT_I_INSIDE_RED_SELF_DEFENSE', 'INSUFFICIENT_PID', 'NOT_ENGAGEABLE', 'TARGET_IS_NSL', 'ROE_BLOCKED'].includes(flag);
  return <span className={`flag-chip ${danger ? 'danger' : 'warn'}`}>{flag.replace(/_/g, ' ')}</span>;
}

// Step PRF code through valid 4-digit codes (each digit 1..8).
function nextPRF(code, dir) {
  let n = parseInt(code, 10);
  for (let i = 0; i < 100; i++) {
    n += dir;
    const s = String(n).padStart(4, '0');
    if (s.length === 4 && [...s].every(d => d >= '1' && d <= '8')) return s;
  }
  return code;
}

export default function NineLineForm({
  active,
  recommendation,
  onBack,
  onChangePrimaryTarget,
  onSend,
  onGFC,
  onWhy,
}) {
  // ── Local override state — JTAC's tap-driven choices on top of engine output.
  const [labelN, setLabelN] = useState(1);
  const [ipName, setIpName] = useState('IP NORTH');
  const [headingOffset, setHeadingOffset] = useState('—');
  const [prfCode, setPrfCode] = useState('1688');
  const [egressDir, setEgressDir] = useState(null); // null = use engine's default
  const [egressAlt, setEgressAlt] = useState(8000);
  const [remarkChips, setRemarkChips] = useState([]);

  if (!recommendation) {
    return (
      <div id="s3" className={active ? 'active' : ''}>
        <div className="nl-header">
          <button className="nl-back" onClick={onBack}>✕</button>
          <span className="nl-title">9-LINE — computing…</span>
        </div>
      </div>
    );
  }

  const r = recommendation;
  const blocked = r.engageability === 'NOT_ENGAGEABLE';
  const nl = r.nine_line || {};
  const m = r.munition?.primary;
  const headingStr = String(nl.line_2_heading?.value_deg_magnetic ?? 0).padStart(3, '0');
  const effectiveEgressDir = egressDir ?? nl.line_9?.direction ?? 'N';

  // Derived chip options for IPs / targets / weapons / mark types.
  const targetChipOptions = useMemo(
    () => TARGET_OPTIONS.map(t => ({ id: t.id, label: t.label })),
    []
  );
  const ipChipOptions = NAMED_IPS;
  const weaponChipOptions = useMemo(() => {
    if (!m) return [];
    return [
      { id: m.id, label: m.id },
      ...(r.munition.alternatives ?? []).map(a => ({ id: a.id, label: a.id })),
    ];
  }, [m, r.munition.alternatives]);
  const markChipOptions = ['NO MARK', 'LASER', 'SMOKE', 'IR', 'TALK-ON'];
  const markType = (nl.line_7?.mark_type ?? 'no_mark').toUpperCase().replace('_', '-');
  const isLaser = markType === 'LASER';

  return (
    <div id="s3" className={active ? 'active' : ''}>
      <div className="nl-header">
        <button className="nl-back" onClick={onBack} title="Close panel">✕</button>
        <span className="nl-title">9-LINE CAS REQUEST</span>
        <span className={`nl-badge${blocked ? ' nl-badge-blocked' : ''}`}>
          {blocked ? 'BLOCKED' : 'TAP-DRIVEN · LIVE'}
        </span>
      </div>

      <div className="nl-scroll">

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
          <div className="flag-bar">
            {r.flags.map(f => <FlagChip key={f} flag={f} />)}
          </div>
        )}

        {/* ═════════════ GAME PLAN ═════════════ */}
        <div className="form-section">Game Plan</div>

        <div className="nl-field">
          <div className="field-row"><span className="field-lbl">Label</span></div>
          <Stepper value={labelN} min={1} max={99} onChange={setLabelN}
                   format={v => `9-Line ${v}`} />
        </div>

        <div className="nl-field">
          <div className="field-row">
            <span className="field-lbl">Target</span>
            <button className="why-btn" onClick={() => onWhy?.('target')} title="Why this target?">i</button>
          </div>
          <ChipPicker options={targetChipOptions} value={r.target_id}
                      onChange={onChangePrimaryTarget} />
          <div className="field-sub">
            {r.target_classification} · {Math.round((r.cnn_confidence ?? 0) * 100)}% conf · {r.target_class?.replace(/_/g, ' ')}
          </div>
        </div>

        {!blocked && (
          <div className="nl-field">
            <div className="field-row"><span className="field-lbl">Type</span></div>
            <SegmentedToggle
              options={['1', '2', '3']}
              value={r.game_plan?.control_type?.replace('Type_', '') ?? '2'}
              onChange={() => {/* engine-driven; locked */}}
            />
            <div className="field-row" style={{ marginTop: 8 }}>
              <span className="field-lbl">MOA</span>
            </div>
            <SegmentedToggle
              options={['BOT', 'BOC']}
              value={r.game_plan?.method_of_attack ?? 'BOT'}
              onChange={() => {/* engine-driven; locked */}}
            />
            <div className="field-sub">{r.game_plan?.clearance_call_phrase}</div>
          </div>
        )}

        {!blocked && m && (
          <div className="nl-field">
            <div className="field-row">
              <span className="field-lbl">Weapon</span>
              <button className="why-btn" onClick={() => onWhy?.('weapon')} title="Why this weapon?">i</button>
            </div>
            <ChipPicker options={weaponChipOptions} value={m.id} onChange={() => {/* tap to alternate; thread through App later */}} />
            <div className="field-sub">
              {m.name} · RED <strong>{m.red_standing_m}m</strong> · TLE ≤ {m.tle_required_m}m · {m.guidance.toUpperCase()} · {m.fuze} · {m.count} on station · <strong>{m.effectiveness_rating}</strong> vs {r.target_class?.replace(/_/g, ' ')}
            </div>
          </div>
        )}

        {!blocked && (
          <>
            {/* ═════════════ 9-LINE ═════════════ */}
            <div className="form-section" style={{ marginTop: 16 }}>
              CAS 9-Line · {r.target_id}
            </div>

            {/* 1 — IP / BP */}
            <div className="nl-field">
              <FieldHeader num={1} label="IP / BP" />
              <ChipPicker options={ipChipOptions} value={ipName} onChange={setIpName} />
            </div>

            {/* 2 — Heading (drag handle on map) */}
            <div className="nl-field">
              <FieldHeader num={2} label="Heading" auto onWhy={() => onWhy?.('vector')} />
              <ReadOnly sub="Drag the orange handle on the map to adjust">
                <span className="ro-big">{headingStr}°M</span>
              </ReadOnly>
              <div className="field-row" style={{ marginTop: 6 }}>
                <span className="field-lbl">Offset</span>
              </div>
              <SegmentedToggle
                options={['—', 'LEFT', 'RIGHT']}
                value={headingOffset}
                onChange={setHeadingOffset}
              />
            </div>

            {/* 3 — Distance */}
            <div className="nl-field">
              <FieldHeader num={3} label="Distance" auto />
              <ReadOnly>
                <span className="ro-big">{nl.line_3_distance?.value ?? '—'} {nl.line_3_distance?.units ?? 'NM'}</span>
              </ReadOnly>
            </div>

            {/* 4 — Target Elevation */}
            <div className="nl-field">
              <FieldHeader num={4} label="Target Elevation" auto readback />
              <ReadOnly>
                <span className="ro-big">{nl.line_4?.value ?? '—'} {nl.line_4?.units ?? 'ft'} {nl.line_4?.datum ?? 'MSL'}</span>
              </ReadOnly>
            </div>

            {/* 5 — Target Description */}
            <div className="nl-field">
              <FieldHeader num={5} label="Target Description" auto onWhy={() => onWhy?.('target')} />
              <ReadOnly>{nl.line_5?.value ?? ''}</ReadOnly>
            </div>

            {/* 6 — Target Location */}
            <div className="nl-field">
              <FieldHeader num={6} label="Target Location" auto readback />
              <ReadOnly sub={`Format: ${nl.line_6?.format ?? 'MGRS'} · Datum: ${nl.line_6?.datum ?? 'WGS-84'} · Position fix: ${nl.line_6?.tle_category}`}>
                <span className="ro-big mono">{nl.line_6?.value ?? ''}</span>
              </ReadOnly>
            </div>

            {/* 7 — Mark + PRF */}
            <div className="nl-field">
              <FieldHeader num={7} label="Mark / Terminal Guidance" />
              <ChipPicker
                options={markChipOptions}
                value={markType === 'NO-MARK' ? 'NO MARK' : markType.replace('-', ' ')}
                onChange={() => {/* engine-driven; tap to override later */}}
              />
              {isLaser && (
                <>
                  <div className="field-row" style={{ marginTop: 8 }}>
                    <span className="field-lbl">PRF Code</span>
                  </div>
                  <Stepper
                    value={prfCode}
                    min={1111}
                    max={8888}
                    step={1}
                    onChange={v => setPrfCode(typeof v === 'string' ? v : nextPRF(prfCode, v - parseInt(prfCode, 10) > 0 ? 1 : -1))}
                    format={() => prfCode}
                    label="laser code"
                  />
                </>
              )}
              <div className="field-sub">
                {nl.line_7?.value}
                {nl.line_7?.backup_mark ? ` · backup: ${nl.line_7.backup_mark.value}` : ''}
              </div>
            </div>

            {/* 8 — Friendlies */}
            <div className="nl-field">
              <FieldHeader num={8} label="Friendlies" auto />
              <ReadOnly sub="Position from drone — JTAC-PLI uplink">
                <span className="ro-big">{nl.line_8?.direction ?? '—'} {nl.line_8?.distance_m ?? 0} m</span>
              </ReadOnly>
            </div>

            {/* 9 — Egress: cardinal rose + altitude stepper */}
            <div className="nl-field">
              <FieldHeader num={9} label="Egress" />
              <div className="egress-row">
                <CardinalRose value={effectiveEgressDir} onChange={setEgressDir} size={150} />
                <div className="egress-alt">
                  <div className="field-lbl" style={{ marginBottom: 4 }}>Altitude</div>
                  <Stepper
                    value={egressAlt}
                    min={500}
                    max={25000}
                    step={500}
                    onChange={setEgressAlt}
                    format={v => v.toLocaleString()}
                    suffix=" ft MSL"
                  />
                </div>
              </div>
              <div className="field-sub">Egress {effectiveEgressDir}, climb to {egressAlt.toLocaleString()} ft MSL</div>
            </div>

            {/* Remarks: chip picker + engine-generated list */}
            <div className="form-section" style={{ marginTop: 16 }}>
              Remarks &amp; Restrictions
            </div>

            <div className="nl-field">
              <div className="field-row">
                <span className="field-lbl">Add presets</span>
              </div>
              <ChipMulti
                options={REMARK_PRESETS}
                selected={remarkChips}
                onToggle={id => setRemarkChips(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])}
              />
            </div>

            <div className="nl-field">
              {r.remarks?.length > 0 && (
                <div className="remark-block">
                  <div className="remark-block-label">REMARKS · ENGINE-GENERATED</div>
                  {r.remarks.map((rmk, i) => (
                    <div key={i} className="remark-line">• {rmk.text}</div>
                  ))}
                  {remarkChips.map(id => {
                    const p = REMARK_PRESETS.find(p => p.id === id);
                    return p ? <div key={id} className="remark-line">• {p.text}</div> : null;
                  })}
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
            </div>
          </>
        )}

        {/* Reasoning trace */}
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
          <button className="btn-gfc" onClick={onGFC}>Send GFC Summary</button>
        </div>
      )}
    </div>
  );
}
