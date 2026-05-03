import { useMemo, useState, useEffect } from 'react';
import { recommendSequence, autoPrioritize } from '../engine/decisionTree.js';
import { distanceM } from '../engine/geo.js';
import { AIRCRAFT_ON_STATION, WEATHER, ROE } from '../data/units.js';
import { Stepper } from './Controls.jsx';

// Multi-strike planner — wizard flow.
//
// 1. Pick total # of strikes via stepper.
// 2. Step through them one at a time. Each step shows the full
//    recommendation for that strike — review, confirm, or deny.
// 3. After all are reviewed, single SEND button transmits the bundle.
//
// Engine still chains recursively under the hood — strike N+1 plans
// against the predicted state after strike N. The transmission shape
// is N independent Type 2 9-lines (per Collen's preference: keep simple
// workflows simple). Type 3 consolidation lives in the engine for when
// a multi-aircraft scenario calls for it.

const STATUS = { PENDING: 'pending', REVIEWED: 'reviewed', DENIED: 'denied' };

export default function StrikeSequence({
  active,
  hostiles,
  friendlies,
  self,
  onBack,
  onSendSequence,
}) {
  const [strikeCount, setStrikeCount] = useState(Math.min(hostiles.length, 2));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [statuses, setStatuses] = useState([]);

  // Clamp count + reset wizard when hostile feed changes.
  useEffect(() => {
    setStrikeCount(c => Math.min(c, Math.max(1, hostiles.length)));
  }, [hostiles.length]);

  const order = useMemo(() => autoPrioritize(hostiles, 'confidence_desc'), [hostiles]);
  const targetIds = order.slice(0, strikeCount);

  const sequence = useMemo(() => {
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
  }, [targetIds.join('|'), hostiles, friendlies, self]);

  // ── Coordination analysis: how spread are the targets? Used to suggest
  //    whether this should be Type 3 consolidated brief or sequential Type 2.
  //    Per JP 3-09.3 III-46, Type 3 only works when one set of restrictions
  //    legitimately covers all strikes. Threshold ~500m (one kill-box keypad).
  const coord = useMemo(() => {
    if (targetIds.length < 2) return { type: 'single', spreadM: 0, recommended: 'type_2' };
    const targetsInPlay = targetIds.map(id => hostiles.find(h => h.id === id)).filter(Boolean);
    let maxSpread = 0;
    for (let i = 0; i < targetsInPlay.length; i++) {
      for (let j = i + 1; j < targetsInPlay.length; j++) {
        const d = distanceM(targetsInPlay[i].lat, targetsInPlay[i].lng, targetsInPlay[j].lat, targetsInPlay[j].lng);
        if (d > maxSpread) maxSpread = d;
      }
    }
    const spreadM = Math.round(maxSpread);
    let recommended = 'type_2';      // sequential default
    let label = 'Sequential Type 2';
    let detail = 'Targets dispersed — separate 9-lines per strike';
    if (spreadM <= 500) {
      recommended = 'type_3';
      label = 'Type 3 viable';
      detail = 'Tight cluster — one CLEARED TO ENGAGE could cover all strikes';
    } else if (spreadM <= 1500) {
      label = 'Sequential preferred';
      detail = 'Borderline spread — separate 9-lines safer than Type 3';
    }
    return { type: 'multi', spreadM, recommended, label, detail };
  }, [targetIds.join('|'), hostiles]);

  // Reset statuses + clamp current index when count changes.
  useEffect(() => {
    setStatuses(Array.from({ length: strikeCount }, () => STATUS.PENDING));
    setCurrentIdx(i => Math.min(i, Math.max(0, strikeCount - 1)));
  }, [strikeCount]);

  if (!active) return null;

  const maxStrikes = Math.max(1, hostiles.length);
  const currentStep = sequence?.steps[currentIdx];
  const isLast = currentIdx === strikeCount - 1;
  const reviewedCount = statuses.filter(s => s === STATUS.REVIEWED).length;
  const allActed = statuses.every(s => s !== STATUS.PENDING);

  function setStatus(idx, value) {
    setStatuses(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function goNext() {
    setStatus(currentIdx, STATUS.REVIEWED);
    if (!isLast) setCurrentIdx(currentIdx + 1);
  }

  function goPrev() {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  }

  function toggleDeny() {
    const cur = statuses[currentIdx];
    setStatus(currentIdx, cur === STATUS.DENIED ? STATUS.PENDING : STATUS.DENIED);
  }

  function send() {
    if (!sequence) return;
    const approvedSteps = sequence.steps.filter((_, i) => statuses[i] === STATUS.REVIEWED);
    onSendSequence?.({ ...sequence, steps: approvedSteps, successful_steps: approvedSteps.length });
  }

  return (
    <div id="s4" className="active strike-sequence">
      <div className="nl-header">
        <button className="nl-back" onClick={onBack}>✕</button>
        <span className="nl-title">MULTI-STRIKE</span>
        <ProgressDots count={strikeCount} currentIdx={currentIdx} statuses={statuses} />
      </div>

      <div className="nl-scroll">

        {/* ═════ ENGAGEMENT-LEVEL section — applies to all strikes ═════ */}
        <div className="form-section">Engagement</div>

        <div className="nl-field">
          <Stepper
            value={strikeCount}
            min={1}
            max={maxStrikes}
            onChange={setStrikeCount}
            format={v => `${v} strike${v === 1 ? '' : 's'}`}
            label={`of ${maxStrikes} hostile${maxStrikes === 1 ? '' : 's'} on feed`}
          />
        </div>

        {sequence && (
          <EngagementSummary
            sequence={sequence}
            coord={coord}
            aircraftPlatform={AIRCRAFT_ON_STATION.platform}
            strikeCount={strikeCount}
          />
        )}

        {sequence?.chain_broken && currentIdx >= sequence.successful_steps && (
          <div className="seq-warn-block">
            Chain broke at this strike — engine could not produce a viable munition.
          </div>
        )}

        {/* ═════ PER-STRIKE section — current wizard step ═════ */}
        {currentStep && (
          <>
            <div className="form-section" style={{ marginTop: 14 }}>
              Strike {currentIdx + 1} of {strikeCount}
            </div>
            <div className="wizard-step">
              {statuses[currentIdx] !== STATUS.PENDING && (
                <div className="wizard-step-header">
                  <StatusPill status={statuses[currentIdx]} />
                </div>
              )}
              <StrikeDetail step={currentStep} />
            </div>
          </>
        )}

        <div style={{ height: 8 }}></div>
      </div>

      <div className="nl-footer wizard-footer-v2">
        {!allActed ? (
          <>
            <button
              className="wf-prev"
              onClick={goPrev}
              disabled={currentIdx === 0}
              aria-label="Previous strike"
            >←</button>
            <button
              className="wf-next"
              onClick={goNext}
              disabled={!currentStep}
            >
              {isLast ? 'CONFIRM ✓' : 'NEXT →'}
            </button>
            <button
              className="wf-deny"
              onClick={toggleDeny}
              aria-label={statuses[currentIdx] === STATUS.DENIED ? 'Undo deny' : 'Deny strike'}
            >
              {statuses[currentIdx] === STATUS.DENIED ? '↶ undo' : '✗ deny'}
            </button>
          </>
        ) : (
          <button
            className="btn-send-9line wizard-send"
            onClick={send}
            disabled={reviewedCount === 0}
          >
            📡 SEND {reviewedCount} 9-LINE{reviewedCount === 1 ? '' : 'S'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Engagement-level summary (applies to whole multi-strike plan) ────
function EngagementSummary({ sequence, coord, aircraftPlatform, strikeCount }) {
  const munitionTally = sequence.munitions_expended ?? {};
  const munitionList = Object.entries(munitionTally)
    .map(([id, n]) => `${id}×${n}`)
    .join(' · ') || '—';

  const isSingle = strikeCount <= 1;
  const isTight = coord.recommended === 'type_3';

  return (
    <div className="engagement-card">
      <div className="eng-row">
        <span className="eng-label">Aircraft</span>
        <span className="eng-value mono">{aircraftPlatform}</span>
      </div>
      <div className="eng-row">
        <span className="eng-label">Coordination</span>
        <span className="eng-value">
          {isSingle ? 'Single 9-line' : `${strikeCount} passes · separate 9-lines`}
        </span>
      </div>
      {!isSingle && (
        <div className="eng-row">
          <span className="eng-label">Target spread</span>
          <span className="eng-value mono">{coord.spreadM} m</span>
        </div>
      )}
      <div className="eng-row">
        <span className="eng-label">Munitions</span>
        <span className="eng-value mono">{munitionList}</span>
      </div>

      {!isSingle && (
        <div className={`eng-coord-hint ${isTight ? 'tight' : 'dispersed'}`}>
          <span className="eng-coord-label">{coord.label}</span>
          <span className="eng-coord-detail">{coord.detail}</span>
        </div>
      )}
    </div>
  );
}

// ─── Progress dots ─────────────────────────────────────────────────────
function ProgressDots({ count, currentIdx, statuses }) {
  return (
    <div className="progress-dots" aria-label={`Strike ${currentIdx + 1} of ${count}`}>
      {Array.from({ length: count }).map((_, i) => {
        const s = statuses[i];
        const cls = i === currentIdx ? 'current'
          : s === STATUS.REVIEWED ? 'done'
          : s === STATUS.DENIED ? 'denied'
          : 'pending';
        return <span key={i} className={`dot ${cls}`} />;
      })}
      <span className="progress-text">{currentIdx + 1} of {count}</span>
    </div>
  );
}

// ─── Status pill on the active step ─────────────────────────────────────
function StatusPill({ status }) {
  if (status === STATUS.REVIEWED) return <span className="status-pill reviewed">✓ REVIEWED</span>;
  if (status === STATUS.DENIED)   return <span className="status-pill denied">✗ DENIED</span>;
  return <span className="status-pill pending">PENDING</span>;
}

// ─── Strike detail — the 9-line for the active step ────────────────────
function StrikeDetail({ step }) {
  if (step.skipped) {
    return (
      <div className="brief-section">
        <div className="brief-section-label">SKIPPED · {step.target_id}</div>
        <div className="brief-remark">{step.skip_reason}</div>
      </div>
    );
  }

  const r = step.recommendation;
  const blocked = r.engageability === 'NOT_ENGAGEABLE';

  if (blocked) {
    return (
      <div className="brief-section restriction">
        <div className="brief-section-label">⚠ BLOCKED · {r.target_id}</div>
        {r.block_reasons?.map((reason, i) => (
          <div key={i} className="brief-remark restriction">• {reason}</div>
        ))}
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
          Flags: {r.flags?.join(', ') || 'none'}
        </div>
      </div>
    );
  }

  const m = r.munition.primary;
  const nl = r.nine_line;

  return (
    <>
      <div className="strike-target-line">
        <span className="mono target-id">{r.target_id}</span>
        <span className="target-class">{r.target_class?.replace(/_/g, ' ')}</span>
        <span className="target-conf">{Math.round((r.cnn_confidence ?? 0) * 100)}% conf</span>
      </div>

      {/* Game plan */}
      <div className="brief-section">
        <div className="brief-section-label">GAME PLAN</div>
        <div className="brief-line"><span className="bl-label">Munition</span><span className="mono">{m.id}</span> · RED {m.red_standing_m}m · {m.guidance.toUpperCase()}</div>
        <div className="brief-line"><span className="bl-label">Type</span>{r.game_plan.control_type.replace('_', ' ')} · {r.game_plan.method_of_attack}</div>
        <div className="brief-line"><span className="bl-label">Call</span>{r.game_plan.clearance_call_phrase}</div>
        <div className="brief-line"><span className="bl-label">Effect</span><strong>{m.effectiveness_rating}</strong> vs {r.target_class?.replace(/_/g, ' ')}</div>
      </div>

      {/* Flags */}
      {r.flags?.length > 0 && (
        <div className="strike-flags">
          {r.flags.map(f => (
            <span key={f} className={`flag-chip ${['DANGER_CLOSE', 'EXTREME_DANGER_CLOSE'].includes(f) ? 'danger' : 'warn'}`}>
              {f.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* 9-line */}
      <div className="brief-section">
        <div className="brief-section-label">9-LINE</div>
        <div className="brief-line"><span className="bl-label">L1 IP/BP</span><span className="mono">{nl.line_1_ip?.value}</span></div>
        <div className="brief-line"><span className="bl-label">L2 Hdg</span><span className="mono">{String(nl.line_2_heading?.value_deg_magnetic ?? 0).padStart(3, '0')}°M</span></div>
        <div className="brief-line"><span className="bl-label">L3 Dist</span><span className="mono">{nl.line_3_distance?.value} NM</span></div>
        <div className="brief-line"><span className="bl-label">L4 Elev</span><span className="mono">{nl.line_4?.value} ft MSL</span> <span className="rb-tag-inline">READBACK</span></div>
        <div className="brief-line"><span className="bl-label">L5 Tgt</span>{nl.line_5?.value}</div>
        <div className="brief-line"><span className="bl-label">L6 Loc</span><span className="mono">{nl.line_6?.value}</span> <span className="rb-tag-inline">READBACK</span></div>
        <div className="brief-line"><span className="bl-label">L7 Mark</span>{nl.line_7?.value}</div>
        <div className="brief-line"><span className="bl-label">L8 Frnd</span><span className="mono">{nl.line_8?.direction} {nl.line_8?.distance_m}m</span></div>
        <div className="brief-line"><span className="bl-label">L9 Egress</span>{nl.line_9?.value}</div>
      </div>

      {/* Restrictions */}
      {r.restrictions?.length > 0 && (
        <div className="brief-section restriction">
          <div className="brief-section-label">RESTRICTIONS · MANDATORY READBACK</div>
          {r.restrictions.map((rs, i) => (
            <div key={i} className="brief-remark restriction">• {rs.text}</div>
          ))}
        </div>
      )}

      {/* Predicted state at this step (planning info) */}
      {step.input_snapshot && (
        <div className="planning-snapshot">
          <span className="ps-label">At this step:</span>{' '}
          {step.input_snapshot.remaining_hostiles} hostile{step.input_snapshot.remaining_hostiles === 1 ? '' : 's'} remaining ·{' '}
          {Object.entries(step.input_snapshot.loadout)
            .map(([k, v]) => `${k}:${typeof v === 'object' ? v.count : v}`)
            .join(' · ')}
        </div>
      )}
    </>
  );
}
