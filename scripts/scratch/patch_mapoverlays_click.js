const fs = require('fs');
let content = fs.readFileSync('src/components/map/MapOverlays.tsx', 'utf8');

const anchor = 'layerId === `ov-${candidate}-pt` || layerId === `ov-${candidate}-fill`,';
const injection = 'layerId === `ov-${candidate}-pt` || layerId === `ov-${candidate}-fill` || layerId === `ov-${candidate}-extrusion`,';
content = content.replace(anchor, injection);

fs.writeFileSync('src/components/map/MapOverlays.tsx', content);
console.log('Patched MapOverlays.tsx click handler');
