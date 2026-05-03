import L from 'leaflet';

export function mkHostileIcon(primary) {
  const sz = primary ? 24 : 20;
  return L.divIcon({
    className: '',
    html: `<div class="m-hostile-inner${primary ? ' lg' : ''}"></div>`,
    iconSize:   [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  });
}

export const friendlyIcon = L.divIcon({
  className: '',
  html: '<div class="m-friendly"></div>',
  iconSize:   [22, 15],
  iconAnchor: [11, 7],
});

export const selfIcon = L.divIcon({
  className: '',
  html: '<div class="m-self"></div>',
  iconSize:   [18, 20],
  iconAnchor: [9, 20],
});
