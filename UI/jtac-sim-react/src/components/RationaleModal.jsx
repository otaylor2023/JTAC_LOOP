import { RATIONALE } from '../data/rationale';

export default function RationaleModal({ type, recommendation, onClose }) {
  if (!type) return null;
  const r = RATIONALE[type];
  if (!r) return null;
  // Filter the engine's reasoning trace down to the trees relevant to this rationale type.
  const traceFilter = type === 'target'
    ? t => t.tree.startsWith('Tree 1')
    : type === 'weapon'
      ? t => t.tree.startsWith('Tree 2')
      : type === 'vector'
        ? t => t.tree.startsWith('Tree 5') || t.tree.startsWith('Tree 6')
        : () => false;
  const liveTrace = recommendation?.reasoning_trace?.filter(traceFilter) ?? [];
  return (
    <div
      className="modal-wrap"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card">
        <div className="modal-hdr">
          <span className="modal-ttl">{r.title}</span>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-txt">{r.text}</p>
          {liveTrace.length > 0 && (
            <div className="modal-ref" style={{ marginTop: 12 }}>
              <div className="ref-lbl">Live engine reasoning</div>
              {liveTrace.map((step, i) => (
                <div key={i} className="ref-txt" style={{ marginTop: 6 }}>
                  <strong>{step.tree}</strong> [{step.status}] — {step.text}
                </div>
              ))}
            </div>
          )}
          <div className="modal-ref">
            <div className="ref-lbl">FM / Doctrine Reference</div>
            <div className="ref-txt">{r.ref}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
