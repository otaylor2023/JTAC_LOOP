import { useMemo, useState } from 'react';
import { recommendSequence, autoPrioritize } from '../engine/decisionTree';
import { AIRCRAFT_ON_STATION, WEATHER, ROE } from '../data/units';

// Multi-strike sequence planner.
//
// When a JTAC needs to engage multiple targets in rapid succession, the
// drone feed can't update fast enough between strikes. This panel shows
// the chained recommendations the engine produces by predicting the
// post-strike state at each step and re-running on top of it.
//
// JTAC selects which targets to include + the order, sees the full chain,
// and transmits the bundle as one queued sequence.

export default function StrikeSequence({
  active,
  hostiles,
  friendlies,
  self,
  onBack,
  onSendSequence,
}) {
  // Default order: confidence-descending (engine's autoPrioritize).
  const initialOrder = useMemo(() => autoPrioritize(hostiles, 'confidence_desc'), [hostiles]);
  const [order, setOrder] = useState(initialOrder);
  const [enabled, setEnabled] = useState(() => new Set(initialOrder));

  // Re-run the chain whenever inputs change.
  const sequence = useMemo(() => {
    const targetIds = order.filter(id => enabled.has(id));
    if (targetIds.length === 0) return null;
    return recommendSequence(
      {
        hostiles, friendlies, self,
        aircraft: AIRCRAFT_ON_STATION,
        weather: WEATHER,
        roe: ROE,
        time_of_day: 'day',
      },
      targetIds,
    );
  }, [order, enabled, hostiles, friendlies, self]);

  function moveTarget(idx, dir) {
    setOrder(prev => {
      const next = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function toggleEnabled(id) {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (!active) return null;

  return (
    <div id="s4" className="active strike-sequence">
      <div className="nl-header">
        <button className="nl-back" onClick={onBack} title="Close panel">✕</button>
        <span className="nl-title">MULTI-STRIKE SEQUENCE</span>
        <span className="nl-badge">RAPID · CHAINED</span>
      </div>

      <div className="nl-scroll">

        <div className="seq-explainer">
          <strong>Recursive planner.</strong> Each strike's predicted output
          (target destroyed, munition expended) becomes the input for the next
          strike. Use this when there's no time to wait for drone feed updates
          between rapid succession engagements.
        </div>

        {/* Target order + enable toggles */}
        <div className="form-section">Engagement Order</div>
        <div className="seq-order-list">
          {order.map((id, idx) => {
            const h = hostiles.find(x => x.id === id);
            if (!h) return null;
            const on = enabled.has(id);
            return (
              <div key={id} className={`seq-order-row${on ? '' : ' off'}`}>
                <button
                  className="seq-toggle"
                  onClick={() => toggleEnabled(id)}
                  aria-pressed={on}
                >{on ? '✓' : '○'}</button>
                <div className="seq-order-info">
                  <div className="seq-order-pos">#{idx + 1}</div>
                  <div className="seq-order-id">{id}</div>
                  <div className="seq-order-class">{h.target_class?.replace(/_/g, ' ')} · {Math.round((h.cnn_confidence ?? 0) * 100)}% conf</div>
                </div>
                <div className="seq-order-arrows">
                  <button onClick={() => moveTarget(idx, -1)} disabled={idx === 0}>↑</button>
                  <button onClick={() => moveTarget(idx, +1)} disabled={idx === order.length - 1}>↓</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chain summary */}
        {sequence && (
          <>
            <div className="form-section" style={{ marginTop: 16 }}>
              Chain Summary
            </div>
            <div className="seq-summary">
              <div className="seq-summary-row">
                <span className="seq-summary-label">Steps planned</span>
                <span className="seq-summary-val">{sequence.total_steps_planned}</span>
              </div>
              <div className="seq-summary-row">
                <span className="seq-summary-label">Successful</span>
                <span className="seq-summary-val ok">{sequence.successful_steps}</span>
              </div>
              <div className="seq-summary-row">
                <span className="seq-summary-label">Chain status</span>
                <span className={`seq-summary-val ${sequence.chain_broken ? 'broken' : 'ok'}`}>
                  {sequence.chain_broken ? 'BROKEN' : 'OK'}
                </span>
              </div>
              <div className="seq-summary-row">
                <span className="seq-summary-label">Munitions expended</span>
                <span className="seq-summary-val mono">
                  {Object.keys(sequence.munitions_expended).length === 0
                    ? '—'
                    : Object.entries(sequence.munitions_expended).map(([k, v]) => `${k}×${v}`).join(' · ')}
                </span>
              </div>
            </div>

            {/* Per-step chain */}
            <div className="form-section" style={{ marginTop: 16 }}>
              Strike Chain · {sequence.steps.length} steps
            </div>

            {sequence.steps.map((step, i) => (
              <StepCard key={i} step={step} />
            ))}
          </>
        )}

        {!sequence && (
          <div className="seq-empty">No targets enabled. Toggle one or more targets above to plan a chain.</div>
        )}

        <div style={{ height: 8 }}></div>
      </div>

      <div className="nl-footer">
        <button
          className="btn-send-9line"
          onClick={() => sequence && onSendSequence?.(sequence)}
          disabled={!sequence || sequence.successful_steps === 0}
        >
          📡 SEND SEQUENCE ({sequence?.successful_steps ?? 0} STRIKES)
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function StepCard({ step }) {
  if (step.skipped) {
    return (
      <div className="step-card skipped">
        <div className="step-head">
          <span className="step-num">#{step.step}</span>
          <span className="step-target mono">{step.target_id}</span>
          <span className="step-status skipped">SKIPPED</span>
        </div>
        <div className="step-skip-reason">{step.skip_reason}</div>
      </div>
    );
  }

  const r = step.recommendation;
  const blocked = r.engageability === 'NOT_ENGAGEABLE';

  return (
    <div className={`step-card ${blocked ? 'blocked' : ''}`}>
      <div className="step-head">
        <span className="step-num">#{step.step}</span>
        <span className="step-target mono">{step.target_id}</span>
        <span className={`step-status ${blocked ? 'blocked' : 'ok'}`}>
          {blocked ? 'BLOCKED' : r.engageability.replace(/_/g, ' ')}
        </span>
      </div>

      {!blocked && r.munition?.primary && (
        <>
          <div className="step-rec">
            <div className="step-rec-row">
              <span className="step-label">Weapon:</span>
              <span className="step-value mono">{r.munition.primary.id}</span>
              <span className="step-value-sub">RED {r.munition.primary.red_standing_m}m · {r.munition.primary.guidance.toUpperCase()}</span>
            </div>
            <div className="step-rec-row">
              <span className="step-label">Control:</span>
              <span className="step-value">{r.game_plan.control_type.replace('_', ' ')} · {r.game_plan.method_of_attack}</span>
            </div>
            <div className="step-rec-row">
              <span className="step-label">Mark:</span>
              <span className="step-value">{r.nine_line.line_7?.value}</span>
            </div>
            <div className="step-rec-row">
              <span className="step-label">Friendlies:</span>
              <span className="step-value">{r.nine_line.line_8?.direction} {r.nine_line.line_8?.distance_m}m</span>
            </div>
          </div>

          {r.flags?.length > 0 && (
            <div className="step-flags">
              {r.flags.map(f => <span key={f} className={`flag-chip ${['DANGER_CLOSE', 'EXTREME_DANGER_CLOSE'].includes(f) ? 'danger' : 'warn'}`}>{f.replace(/_/g, ' ')}</span>)}
            </div>
          )}

          {step.input_snapshot && (
            <div className="step-input-snapshot">
              <span className="step-snap-label">State at this step:</span>{' '}
              {step.input_snapshot.remaining_hostiles} hostile{step.input_snapshot.remaining_hostiles === 1 ? '' : 's'} remaining ·{' '}
              loadout {Object.entries(step.input_snapshot.loadout)
                .map(([k, v]) => `${k}:${typeof v === 'object' ? v.count : v}`)
                .join(' · ')}
            </div>
          )}
        </>
      )}

      {blocked && (
        <div className="step-blocked-reasons">
          {r.block_reasons?.map((reason, i) => (
            <div key={i} className="step-blocked-reason">• {reason}</div>
          ))}
        </div>
      )}
    </div>
  );
}
