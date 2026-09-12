const fs = require('fs');
let content = fs.readFileSync('src/components/map/MapDock.tsx', 'utf8');

const anchor = `{OVERLAYS.filter((o) => o.ready).map((o) => (
                    <Chip
                      key={o.key}
                      on={props.activeOverlays.includes(o.key)}
                      color="var(--app-brand)"
                      onClick={() => props.toggleOverlay(o.key)}
                      title={o.sources}
                    >
                      {o.label}
                    </Chip>
                  ))}`;

const injection = `
                  {OVERLAYS.filter((o) => o.ready).map((o) => (
                    <Chip
                      key={o.key}
                      on={props.activeOverlays.includes(o.key)}
                      color="var(--app-brand)"
                      onClick={() => props.toggleOverlay(o.key)}
                      title={o.sources}
                    >
                      {o.label}
                    </Chip>
                  ))}
                  {props.activeOverlays.includes("land-value") && (
                    <div style={{ padding: 16, background: "rgba(255,255,255,0.05)", borderRadius: 12, marginTop: 12, border: "1px solid var(--app-border)" }}>
                      <h4 style={{ margin: "0 0 12px 0", fontSize: 13, fontWeight: 600 }}>Data Atlas Controls</h4>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, fontSize: 13 }}>
                        <span>3D Extrusion</span>
                        <input type="checkbox" checked={props.atlas3D ?? true} onChange={(e) => props.setAtlas3D?.(e.target.checked)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                        <span>Extrusion Height Multiplier ({props.atlasHeight ?? 1}x)</span>
                        <input type="range" min="0.1" max="5" step="0.1" value={props.atlasHeight ?? 1} onChange={(e) => props.setAtlasHeight?.(parseFloat(e.target.value))} />
                      </label>
                    </div>
                  )}
`;

content = content.replace(anchor, injection);
fs.writeFileSync('src/components/map/MapDock.tsx', content);
console.log('Patched MapDock.tsx UI');
