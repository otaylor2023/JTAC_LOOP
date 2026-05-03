// Reusable typing-free input primitives.
// Every JTAC field input that isn't auto-derived from drone data is built
// from one of these so the operator never has to bring up a keyboard.
//
// Components:
//   <Stepper>          numeric ± with snap
//   <ChipPicker>       single-select chips
//   <ChipMulti>        multi-select chips
//   <CardinalRose>     8-wedge directional picker (N..NW)
//   <SegmentedToggle>  2-way binary

import { useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
export function Stepper({ value, min = 0, max = 9999, step = 1, onChange, format = v => v, suffix = '', label }) {
  const dec = useCallback(() => onChange?.(Math.max(min, value - step)), [value, min, step, onChange]);
  const inc = useCallback(() => onChange?.(Math.min(max, value + step)), [value, max, step, onChange]);
  return (
    <div className="stepper">
      <button className="stepper-btn" onClick={dec} disabled={value <= min} aria-label="decrease">−</button>
      <div className="stepper-display">
        <div className="stepper-value">{format(value)}{suffix}</div>
        {label && <div className="stepper-label">{label}</div>}
      </div>
      <button className="stepper-btn" onClick={inc} disabled={value >= max} aria-label="increase">+</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
export function ChipPicker({ options, value, onChange }) {
  return (
    <div className="chip-picker">
      {options.map(opt => {
        const id = opt.id ?? opt;
        const label = opt.label ?? opt;
        return (
          <button
            key={id}
            type="button"
            className={`chip ${value === id ? 'on' : ''}`}
            onClick={() => onChange?.(id)}
          >{label}</button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
export function ChipMulti({ options, selected = [], onToggle }) {
  return (
    <div className="chip-picker">
      {options.map(opt => {
        const id = opt.id ?? opt;
        const label = opt.label ?? opt;
        const on = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`chip ${on ? 'on' : ''}`}
            onClick={() => onToggle?.(id)}
          >{label}</button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
export function SegmentedToggle({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(opt => {
        const id = opt.id ?? opt;
        const label = opt.label ?? opt;
        return (
          <button
            key={id}
            type="button"
            className={`segmented-btn ${value === id ? 'on' : ''}`}
            onClick={() => onChange?.(id)}
          >{label}</button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 8-wedge cardinal rose. Tap a wedge to pick a direction.
const ROSE_WEDGES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function sectorPath(r, startDeg, endDeg) {
  const start = (startDeg - 90) * Math.PI / 180;
  const end = (endDeg - 90) * Math.PI / 180;
  const x1 = r * Math.cos(start), y1 = r * Math.sin(start);
  const x2 = r * Math.cos(end), y2 = r * Math.sin(end);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export function CardinalRose({ value, onChange, size = 160 }) {
  const r = size / 2 - 4;
  return (
    <div className="rose-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`-${size/2} -${size/2} ${size} ${size}`} className="rose-svg">
        {ROSE_WEDGES.map((w, i) => {
          const start = i * 45 - 22.5;
          const end = i * 45 + 22.5;
          const on = value === w;
          const labelAngle = (i * 45 - 90) * Math.PI / 180;
          const lr = r * 0.7;
          const lx = lr * Math.cos(labelAngle);
          const ly = lr * Math.sin(labelAngle);
          return (
            <g key={w} className={`rose-wedge ${on ? 'on' : ''}`} onClick={() => onChange?.(w)}>
              <path d={sectorPath(r, start, end)} />
              <text x={lx} y={ly + 4} textAnchor="middle" className="rose-label">{w}</text>
            </g>
          );
        })}
        <circle r="3" fill="#fbbf24" />
      </svg>
    </div>
  );
}
