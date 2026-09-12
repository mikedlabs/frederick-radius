const fs = require('fs');
let content = fs.readFileSync('src/components/map/MapOverlays.tsx', 'utf8');

const anchor = `<Source key={key} id={\`ov-\${key}\`} type="geojson" data={fc}>
              <Layer
                id={\`ov-\${key}-extrusion\`}
                type={atlas3D ? "fill-extrusion" : "fill"}
                paint={
                  atlas3D
                    ? {
                        "fill-extrusion-color": [
                          "interpolate",
                          ["linear"],
                          ["get", "land_value"],
                          50000,
                          "#2b83ba",
                          250000,
                          "#abdda4",
                          500000,
                          "#fdae61",
                          750000,
                          "#d7191c",
                        ],
                        "fill-extrusion-height": [
                          "*",
                          [
                            "interpolate",
                            ["linear"],
                            ["get", "land_value"],
                            50000,
                            10,
                            1000000,
                            2000,
                          ],
                          atlasHeight,
                        ],
                        "fill-extrusion-base": 0,
                        "fill-extrusion-opacity": isVisible ? 0.8 : 0,
                        "fill-extrusion-opacity-transition": {
                          duration: LAYER_FADE_MS,
                          delay: 0,
                        },
                      }
                    : {
                        "fill-color": [
                          "interpolate",
                          ["linear"],
                          ["get", "land_value"],
                          50000,
                          "#2b83ba",
                          250000,
                          "#abdda4",
                          500000,
                          "#fdae61",
                          750000,
                          "#d7191c",
                        ],
                        "fill-opacity": isVisible ? 0.6 : 0,
                        "fill-opacity-transition": {
                          duration: LAYER_FADE_MS,
                          delay: 0,
                        },
                      }
                }
              />
            </Source>`;

const injection = `<Source key={key} id={\`ov-\${key}\`} type="geojson" data={fc}>
              {atlas3D ? (
                <Layer
                  id={\`ov-\${key}-extrusion\`}
                  type="fill-extrusion"
                  paint={{
                    "fill-extrusion-color": [
                      "interpolate",
                      ["linear"],
                      ["get", "land_value"],
                      50000,
                      "#2b83ba",
                      250000,
                      "#abdda4",
                      500000,
                      "#fdae61",
                      750000,
                      "#d7191c",
                    ],
                    "fill-extrusion-height": [
                      "*",
                      [
                        "interpolate",
                        ["linear"],
                        ["get", "land_value"],
                        50000,
                        10,
                        1000000,
                        2000,
                      ],
                      atlasHeight,
                    ],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-opacity": isVisible ? 0.8 : 0,
                    "fill-extrusion-opacity-transition": {
                      duration: LAYER_FADE_MS,
                      delay: 0,
                    },
                  }}
                />
              ) : (
                <Layer
                  id={\`ov-\${key}-fill\`}
                  type="fill"
                  paint={{
                    "fill-color": [
                      "interpolate",
                      ["linear"],
                      ["get", "land_value"],
                      50000,
                      "#2b83ba",
                      250000,
                      "#abdda4",
                      500000,
                      "#fdae61",
                      750000,
                      "#d7191c",
                    ],
                    "fill-opacity": isVisible ? 0.6 : 0,
                    "fill-opacity-transition": {
                      duration: LAYER_FADE_MS,
                      delay: 0,
                    },
                  }}
                />
              )}
            </Source>`;

content = content.replace(anchor, injection);
fs.writeFileSync('src/components/map/MapOverlays.tsx', content);
console.log('Patched MapOverlays TS error');
