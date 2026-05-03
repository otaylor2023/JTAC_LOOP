export default function SentOverlay({ recommendation, friendly, onReturn }) {
  if (!recommendation) return null;
  const r = recommendation;
  const heading = r.nine_line?.line_2_heading?.value_deg_magnetic ?? 0;
  const fahLo = (heading - 15 + 360) % 360;
  const fahHi = (heading + 15) % 360;
  const time = new Date().toTimeString().slice(0, 5);
  return (
    <div className="sent-wrap">
      <div className="sent-ico">✅</div>
      <div className="sent-title">9-LINE SENT</div>
      <div className="sent-detail">Transmitted to GFC for approval</div>
      <div className="sent-meta">
        <div><span className="field">TGT: </span>{r.target_id}</div>
        <div><span className="field">WPN: </span>{r.munition?.primary?.name}</div>
        <div><span className="field">HDG: </span>{String(heading).padStart(3, '0')}°M · FAH {String(fahLo).padStart(3, '0')}°–{String(fahHi).padStart(3, '0')}°</div>
        <div><span className="field">FRDLY: </span>{r.nine_line?.line_8?.direction} {r.nine_line?.line_8?.distance_m}m — {friendly?.id ?? '—'}</div>
        <div><span className="field">CTRL: </span>{r.game_plan?.control_type?.replace('_', ' ')} · {r.game_plan?.method_of_attack}</div>
        <div><span className="field">TIME: </span>{time} LOCAL</div>
      </div>
      <button className="btn-return" onClick={onReturn}>Return to Map</button>
    </div>
  );
}
