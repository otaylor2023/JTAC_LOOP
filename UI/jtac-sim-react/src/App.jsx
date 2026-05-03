import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';

import MapView from './components/MapView';
import NineLineForm from './components/NineLineForm';
import StrikeSequence from './components/StrikeSequence';
import RationaleModal from './components/RationaleModal';
import SentOverlay from './components/SentOverlay';
import ErrorBoundary from './components/ErrorBoundary';

import { useDroneFeed, useFeedAge } from './hooks/useDroneFeed';
import { useAIRecommendation } from './hooks/useAIRecommendation';
import { bearingDeg, distanceM } from './engine/geo';
import { NAMED_IPS } from './data/units';

export default function App() {
  // ── Drone feed (would be CoT/UDP websocket in production) ─────────────
  // Hostile positions jitter as if streaming from drone CV. Friendly + self
  // positions are static. Replace useDroneFeed for a real source — same shape.
  const { hostiles, friendlies, self, lastUpdate } = useDroneFeed();
  const feedAge = useFeedAge(lastUpdate);

  // ── JTAC overrides on top of the engine ───────────────────────────────
  // These feed back into the engine so the recommendation re-runs coherently.
  const initialPrimary = hostiles.find(h => h.primary)?.id ?? hostiles[0]?.id;
  const [primaryTargetId, setPrimaryTargetId] = useState(initialPrimary);
  const [userHeading, setUserHeading] = useState(null);
  const [weaponOverride, setWeaponOverride] = useState(null);
  const [egressDir, setEgressDir] = useState(null);

  // Tactical knobs (would come from JTAC tablet UI eventually).
  const [tacticalState] = useState({
    jtac_visual_on_target: false,
    jtac_visual_on_aircraft: false,
    friendlies_taking_effective_fire: false,
    drone_has_laser_designator: true,
    drone_has_ir_pointer: true,
  });

  // ── Live recommendation — recomputes every time anything above changes ──
  const { ready: aiReady, recommendation } = useAIRecommendation({
    hostiles, friendlies, self,
    primaryTargetId,
    user_heading: userHeading,
    weapon_override: weaponOverride,
    ...tacticalState,
  });

  // Reset weapon override + egress when target changes — engine picks fresh.
  useState(() => null); // placeholder for clarity

  // ── UI state ──────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('map');
  const [modalType, setModalType] = useState(null);
  const [sent, setSent] = useState(false);
  const [recVisible, setRecVisible] = useState(true);

  // Pulse the AI pill briefly whenever the primary target changes — gives
  // the JTAC a clear "new recommendation ready" cue, especially after rapid
  // hostile-tapping or after closing the panel and re-engaging.
  const [pillPulse, setPillPulse] = useState(false);
  const prevTargetRef = useRef(primaryTargetId);
  useEffect(() => {
    if (prevTargetRef.current !== primaryTargetId) {
      prevTargetRef.current = primaryTargetId;
      setPillPulse(true);
      const id = setTimeout(() => setPillPulse(false), 1500);
      return () => clearTimeout(id);
    }
  }, [primaryTargetId]);

  const goTo = useCallback(next => setScreen(next), []);

  // ── Derived from recommendation ───────────────────────────────────────
  const effectiveHeading = recommendation?.nine_line?.line_2_heading?.value_deg_magnetic ?? 0;
  const weaponRedM = recommendation?.munition?.primary?.red_standing_m ?? null;
  const isBlocked = recommendation?.engageability === 'NOT_ENGAGEABLE';

  return (
    <div className="app-root">
      <MapView
        hostiles={hostiles}
        friendlies={friendlies}
        self={self}
        primaryTargetId={primaryTargetId}
        heading={effectiveHeading}
        showAttack={aiReady && recVisible && !isBlocked}
        scenarioActive={aiReady && recVisible && !isBlocked}
        weaponMinSafe={weaponRedM}
        egressDir={egressDir ?? recommendation?.nine_line?.line_9?.direction ?? null}
        onChangeHeading={h => setUserHeading(h)}
        onSelectHostile={id => {
          setPrimaryTargetId(id);
          setWeaponOverride(null);
          setEgressDir(null);
          // Tapping a hostile ALWAYS surfaces the 9-line for that target.
          // Removes the need to find the pill afterward and prevents the
          // closure-captures-stale-screen bug.
          setScreen('nineline');
        }}
        resizeKey={screen}
      />

      <div id="s1">
        <div className="topbar">
          <button className="topbar-btn" title="Layers">☰</button>
          <div className="topbar-center">
            <span className="callsign">{self.id}</span>
            <span className="callsign-role">JTAC · ACTIVE</span>
          </div>
          <button className="topbar-btn" title="More">⋮</button>
        </div>
        <div className="map-spacer"></div>
        <div className="statusbar">
          <div className="status-left">
            <span className="count-chip hostile">{hostiles.length} HOSTILES</span>
            <div className="live-dot"></div>
            <span className="feed-label">{feedAge}</span>
          </div>
          <div className="status-right">
            <span className="count-chip friendly">{friendlies.length} FRIENDLY</span>
          </div>
        </div>
        <div className="ai-actions" style={{ display: screen === 'map' ? 'flex' : 'none' }}>
          {aiReady && (
            <button
              className={`ai-toggle${recVisible ? ' on' : ''}`}
              onClick={() => setRecVisible(v => !v)}
              title={recVisible ? 'Hide recommendation overlay' : 'Show recommendation overlay'}
              aria-pressed={recVisible}
            >
              {recVisible ? '◉' : '◌'}
            </button>
          )}
          <button
            className={`ai-pill${aiReady ? '' : ' pending'}${isBlocked ? ' blocked' : ''}${pillPulse ? ' pulse' : ''}`}
            onClick={aiReady ? () => goTo('nineline') : undefined}
            disabled={!aiReady}
            title={aiReady ? 'Open 9-line review' : 'AI is computing'}
          >
            <span className="pill-dot"></span>
            {!aiReady
              ? 'AI COMPUTING…'
              : isBlocked
                ? `REVIEW · BLOCKED (${recommendation?.flags?.[0]?.replace(/_/g, ' ') ?? 'review'})`
                : `REVIEW 9-LINE · ${recommendation?.munition?.primary?.id ?? '—'}`}
          </button>
          {aiReady && hostiles.length > 1 && (
            <button
              className="ai-pill multi"
              onClick={() => goTo('sequence')}
              title="Plan multiple rapid strikes — recursive chain"
            >
              <span className="pill-dot"></span>
              Multi-Strike · {hostiles.length}
            </button>
          )}
        </div>
      </div>

      <ErrorBoundary>
      <NineLineForm
        active={screen === 'nineline'}
        recommendation={recommendation}
        weaponOverride={weaponOverride}
        onBack={() => goTo('map')}
        onChangePrimaryTarget={id => { setPrimaryTargetId(id); setWeaponOverride(null); setEgressDir(null); }}
        onChangeWeapon={setWeaponOverride}
        onChangeEgressDir={setEgressDir}
        onChangeIP={(ipName) => {
          // Doctrinal: heading = bearing(IP → target). Compute and update the
          // user_heading so the map's attack vector + heading line update live.
          const ip = NAMED_IPS.find(x => x.id === ipName);
          const tgt = hostiles.find(h => h.id === primaryTargetId);
          if (ip && tgt) {
            setUserHeading(Math.round(bearingDeg(ip.lat, ip.lng, tgt.lat, tgt.lng)));
          }
        }}
        onWhy={type => setModalType(type)}
        onSend={() => setSent(true)}
        onGFC={() => {
          if (!recommendation) return;
          const r = recommendation;
          const fl = friendlies[0];
          alert(
            'GFC SUMMARY TRANSMITTED\n\n' +
              `"Engaging ${r.target_id} (${r.target_classification ?? r.target_class}) ` +
              `at grid ${r.nine_line.line_6.value} with ${r.munition.primary.name} ` +
              `on attack heading ${String(r.nine_line.line_2_heading.value_deg_magnetic).padStart(3, '0')}°M. ` +
              `Nearest friendly ${fl?.id ?? '—'} is ${r.nine_line.line_8.distance_m}m ${r.nine_line.line_8.direction} — ` +
              `${r.flags.includes('DANGER_CLOSE') ? 'DANGER CLOSE, GFC initials required' : 'standoff verified'}. ` +
              `${r.restrictions.length} restrictions applied. Approved by ${self.id} ${new Date().toTimeString().slice(0, 5)}L."`
          );
        }}
      />
      </ErrorBoundary>

      <ErrorBoundary>
      <StrikeSequence
        active={screen === 'sequence'}
        hostiles={hostiles}
        friendlies={friendlies}
        self={self}
        onBack={() => goTo('map')}
        onSendSequence={(seq) => {
          const lines = seq.steps
            .filter(s => !s.skipped && s.recommendation?.engageability !== 'NOT_ENGAGEABLE')
            .map((s, i) => `9-Line ${i + 1}: ${s.target_id} → ${s.recommendation.munition.primary.id}`);
          alert(
            `${seq.successful_steps} 9-LINE${seq.successful_steps === 1 ? '' : 'S'} QUEUED\n\n` +
            (seq.chain_broken ? 'CHAIN BROKEN — review before transmission\n\n' : '') +
            lines.join('\n')
          );
        }}
      />
      </ErrorBoundary>

      {modalType && (
        <RationaleModal
          type={modalType}
          recommendation={recommendation}
          onClose={() => setModalType(null)}
        />
      )}

      {sent && recommendation && (
        <SentOverlay
          recommendation={recommendation}
          friendly={friendlies[0]}
          onReturn={() => {
            setSent(false);
            goTo('map');
          }}
        />
      )}
    </div>
  );
}
