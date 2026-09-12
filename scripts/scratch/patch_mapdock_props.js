const fs = require('fs');
let content = fs.readFileSync('src/components/map/MapDock.tsx', 'utf8');

// Insert props
const propsInsertionPoint = "toggleOverlay: (k: OverlayKey) => void;";
const newProps = `toggleOverlay: (k: OverlayKey) => void;
  atlasHeight?: number;
  setAtlasHeight?: (h: number) => void;
  atlas3D?: boolean;
  setAtlas3D?: (b: boolean) => void;`;
content = content.replace(propsInsertionPoint, newProps);

fs.writeFileSync('src/components/map/MapDock.tsx', content);
console.log('Patched MapDock.tsx props');
