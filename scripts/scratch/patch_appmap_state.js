const fs = require('fs');
let content = fs.readFileSync('src/components/map/AppMap.tsx', 'utf8');

// Insert hooks
const hooksInsertionPoint = "const [fieldNotesOnly, setFieldNotesOnly] = useState(false);";
const newHooks = `const [fieldNotesOnly, setFieldNotesOnly] = useState(false);
  const [atlasHeight, setAtlasHeight] = useState(1);
  const [atlas3D, setAtlas3D] = useState(true);`;
content = content.replace(hooksInsertionPoint, newHooks);

// Insert props to MapDock
const dockInsertionPoint = `activeOverlays={activeOverlays}
            toggleOverlay={(key) => {
              exitRadiusScene();
              toggleOverlay(key);
            }}`;
const newDockProps = `activeOverlays={activeOverlays}
            toggleOverlay={(key) => {
              exitRadiusScene();
              toggleOverlay(key);
            }}
            atlasHeight={atlasHeight}
            setAtlasHeight={setAtlasHeight}
            atlas3D={atlas3D}
            setAtlas3D={setAtlas3D}`;
content = content.replace(dockInsertionPoint, newDockProps);

// Insert props to MapOverlays
const overlaysInsertionPoint = `<MapOverlays
            active={activeOverlays}
            onFeatureState={rememberOverlayFeatureState}
            onFeatureBounds={rememberOverlayFeatureBounds}
          />`;
const newOverlaysProps = `<MapOverlays
            active={activeOverlays}
            onFeatureState={rememberOverlayFeatureState}
            onFeatureBounds={rememberOverlayFeatureBounds}
            atlas3D={atlas3D}
            atlasHeight={atlasHeight}
          />`;
content = content.replace(overlaysInsertionPoint, newOverlaysProps);

fs.writeFileSync('src/components/map/AppMap.tsx', content);
console.log('Patched AppMap.tsx');
