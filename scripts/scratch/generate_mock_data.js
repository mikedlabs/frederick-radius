const fs = require('fs');
const turf = require('@turf/turf');

// Frederick County bounding box approx: [minX, minY, maxX, maxY]
// [-77.7, 39.2, -77.1, 39.7]
const bbox = [-77.6, 39.25, -77.2, 39.6];
const cellSide = 0.5; // km
const options = { units: 'kilometers' };

const hexGrid = turf.hexGrid(bbox, cellSide, options);

// Assign random land values to each hex based on distance from downtown Frederick
const center = turf.point([-77.4105, 39.4143]); // Downtown Frederick

hexGrid.features = hexGrid.features.map(f => {
  const centroid = turf.centroid(f);
  const dist = turf.distance(center, centroid, { units: 'kilometers' });
  
  // Base value decreases with distance, plus some noise
  const baseValue = 500000;
  const distanceDecay = Math.max(0, 1 - (dist / 15)); // Decays over 15km
  let value = baseValue * distanceDecay;
  
  // Add noise
  value += (Math.random() - 0.5) * 100000;
  value = Math.max(50000, value); // Floor at 50k
  
  // High value corridor along I-270 (approx line from downtown to SE)
  const i270 = turf.lineString([[-77.4105, 39.4143], [-77.3, 39.3]]);
  const distToI270 = turf.pointToLineDistance(centroid, i270, { units: 'kilometers' });
  if (distToI270 < 2) {
      value += (2 - distToI270) * 150000;
  }
  
  f.properties = {
    land_value: Math.round(value)
  };
  return f;
});

fs.writeFileSync('public/data/frederick_land_value.geojson', JSON.stringify(hexGrid));
console.log('Generated ' + hexGrid.features.length + ' hexes.');
