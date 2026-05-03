import { useState, useCallback } from 'react';
import './App.css';

import MapView from './components/MapView';
import NineLineForm from './components/NineLineForm';
import RationaleModal from './components/RationaleModal';
import SentOverlay from './components/SentOverlay';

import { useDroneFeed, useFeedAge } from './hooks/useDroneFeed';
import { useAIRecommendation } from './hooks/useAIRecommendation';

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
  const [userHeading, setUserHeading] = useState(null); // null = use engine's egress-derived heading

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
    ...tacticalState,
  });

  // ── UI state ──────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('map');
  const [modalType, setModalType] = useState(null);
  const [sent, setSent] = useState(false);
  const [recVisible, setRecVisible] = useState(true);

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
        onChangeHeading={h => setUserHeading(h)}
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
        <div className="ai-actions" style={{ display: screen === 'nineline' ? 'none' : 'flex' }}>
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
            className={`ai-pill${aiReady ? '' : ' pending'}${isBlocked ? ' blocked' : ''}`}
            onClick={aiReady ? () => goTo('nineline') : undefined}
            disabled={!aiReady}
          >
            <span className="pill-dot"></span>
            {!aiReady
              ? 'AI computing…'
              : isBlocked
                ? `BLOCKED · ${recommendation?.flags?.[0] ?? 'review'}`
                : `Review 9-Line · ${recommendation?.munition?.primary?.id ?? '—'}`}
          </button>
        </div>
      </div>

      <NineLineForm
        active={screen === 'nineline'}
        recommendation={recommendation}
        onBack={() => goTo('map')}
        onChangePrimaryTarget={setPrimaryTargetId}
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
