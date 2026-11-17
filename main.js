import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// ======================================
// 1. MAPBOX ACCESS TOKEN
// ======================================

// Paste your existing PUBLIC Mapbox token here
mapboxgl.accessToken = 'pk.eyJ1Ijoidm1hcnJvcXVpbmd1em1hbiIsImEiOiJjbXdkeWljcjQwMHh1MnpvZWI5dTdrOGl3In0.xo5Vd3LYeQQlubikstOSUw';

// ======================================
// 2. WEBSITE CONTROLS
// ======================================

const beforeYearSelect = document.querySelector('#before-year');
const afterYearSelect = document.querySelector('#after-year');

const beforeYearLabel = document.querySelector('#before-year-label');
const futureYear = document.querySelector('#future-year');

const scenarioSelect = document.querySelector('#scenario');
const monthSelect = document.querySelector('#month');
const description = document.querySelector('#map-description');

// ZIP-code search controls
const zipInput = document.querySelector('#zip-input');
const zipSearchButton = document.querySelector('#zip-search-button');
const zipResetButton = document.querySelector('#zip-reset-button');
const zipMessage = document.querySelector('#zip-message');

let zipFeatures = [];
let selectedZip = null;

// Populate year dropdowns with 2015–2100
for (let year = 2015; year <= 2100; year++) {
  beforeYearSelect.add(new Option(year, year));
  afterYearSelect.add(new Option(year, year));
}

// Default comparison
beforeYearSelect.value = '2020';
afterYearSelect.value = '2050';

// ======================================
// 3. INITIALIZE MAPBOX MAPS
// ======================================

const mapSettings = {
  style: 'mapbox://styles/mapbox/standard',
  center: [-116.85, 33.02],
  zoom: 8.5
};

// Left map
const beforeMap = new mapboxgl.Map({
  container: 'before',
  ...mapSettings
});

// Right map
const afterMap = new mapboxgl.Map({
  container: 'after',
  ...mapSettings
});

// Navigation buttons
afterMap.addControl(new mapboxgl.NavigationControl());

// Draggable comparison slider
const comparison = new mapboxgl.Compare(
  beforeMap,
  afterMap,
  '#comparison-container'
);

// Log map errors
beforeMap.on('error', event => {
  console.error('Before map error:', event.error);
});

afterMap.on('error', event => {
  console.error('After map error:', event.error);
});

// ======================================
// 4. DATA CONTAINERS
// ======================================

let monthlyData = [];
let temperatureRegions = null;
let dataReady = false;

// Coordinate matching between CSV and GeoJSON
function locationKey(lat, lon) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

// ======================================
// 5. TEMPERATURE COLOR SCALE
// ======================================

const temperatureColor = [
  'case',

  ['==', ['get', 'temperature'], null],
  '#AAAAAA',

  [
    'interpolate',
    ['linear'],
    ['get', 'temperature'],

    65, '#348B71',
    75, '#A6D58A',
    85, '#F4D35E',
    95, '#EF8E42',
    105, '#C9453D'
  ]
];

// ======================================
// 6. ADD TEMPERATURE LAYERS
// ======================================

function addTemperatureLayer(map, geojsonData) {

  // Add geographic source
  map.addSource('temperature-regions', {
    type: 'geojson',
    data: structuredClone(geojsonData)
  });

  // Colored temperature regions
  map.addLayer({
    id: 'temperature-fill',
    type: 'fill',
    source: 'temperature-regions',
    paint: {
      'fill-color': temperatureColor,
      'fill-opacity': 0.7
    }
  });

  // Geographic outlines
  map.addLayer({
    id: 'temperature-outline',
    type: 'line',
    source: 'temperature-regions',
    paint: {
      'line-color': '#555555',
      'line-width': 0.5,
      'line-opacity': 0.5
    }
  });

  // Click regions to view temperature
  map.on('click', 'temperature-fill', event => {

    const feature = event.features[0];
    if (!feature) return;

    const temp = feature.properties.temperature;

    const tempText = temp == null
      ? 'No data'
      : `${Number(temp).toFixed(1)}°F`;

    new mapboxgl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(`
        <strong>Projected Average Daily High</strong>
        <p>${tempText}</p>
      `)
      .addTo(map);

  });

  // Cursor changes when hovering over regions
  map.on('mouseenter', 'temperature-fill', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'temperature-fill', () => {
    map.getCanvas().style.cursor = '';
  });

}

// ======================================
// ZIP-CODE BOUNDARY LAYERS
// ======================================

function addZipLayers(map, geojsonData) {

  map.addSource('zipcodes', {
    type: 'geojson',
    data: geojsonData
  });

  // Draw all ZIP-code outlines
  map.addLayer({
    id: 'zipcode-outlines',
    type: 'line',
    source: 'zipcodes',
    paint: {
      'line-color': '#374151',
      'line-width': 0.7,
      'line-opacity': 0.6
    }
  });

  // Highlight the selected ZIP code
  map.addLayer({
    id: 'zipcode-highlight',
    type: 'line',
    source: 'zipcodes',
    filter: ['==', ['get', 'zip'], -1],
    paint: {
      'line-color': '#152f45',
      'line-width': 4,
      'line-opacity': 1
    }
  });
}


// ======================================
// 7. GET TEMPERATURE DATA FOR A YEAR
// ======================================

function getTemperatureGeoJSON(year, month, scenario) {

  // Match scenario to correct CSV column
  const columnNames = {
    ssp126: 'MAX_F_SSP126',
    ssp245: 'MAX_F_SSP245',
    ssp370: 'MAX_F_SSP370'
  };

  const temperatureColumn = columnNames[scenario];

  // Filter data by selected year and month
  const selectedRows = monthlyData.filter(row =>
    Number(row.YEAR) === Number(year) &&
    Number(row.MO) === Number(month)
  );

  // Create coordinate-to-temperature lookup
  const temperatureLookup = new Map();

  selectedRows.forEach(row => {

    const key = locationKey(
      row.latitude,
      row.longitude
    );

    const rawTemp = row[temperatureColumn];

    const temp = rawTemp == null || rawTemp === ''
      ? null
      : Number(rawTemp);

    temperatureLookup.set(
      key,
      temp !== null && Number.isFinite(temp)
        ? temp
        : null
    );

  });

  // Copy regions so each map can have its own temperatures
  const updatedGeoJSON = structuredClone(temperatureRegions);

  updatedGeoJSON.features.forEach(feature => {

    const { latitude, longitude } = feature.properties;

    const key = locationKey(latitude, longitude);

    feature.properties.temperature =
      temperatureLookup.get(key) ?? null;

  });

  return updatedGeoJSON;
}

// ======================================
// 8. UPDATE BOTH MAPS
// ======================================

function updateComparison() {

  const beforeYear = Number(beforeYearSelect.value);
  const afterYear = Number(afterYearSelect.value);

  // Update map labels
  beforeYearLabel.textContent = beforeYear;
  futureYear.textContent = afterYear;

  if (!dataReady) return;

  const month = Number(monthSelect.value);
  const scenario = scenarioSelect.value;

  // LEFT MAP: First selected year
  const beforeData = getTemperatureGeoJSON(
    beforeYear,
    month,
    scenario
  );

  // RIGHT MAP: Second selected year
  const afterData = getTemperatureGeoJSON(
    afterYear,
    month,
    scenario
  );

  // Update each Mapbox source
  beforeMap.getSource('temperature-regions').setData(
    beforeData
  );

  afterMap.getSource('temperature-regions').setData(
    afterData
  );

  const monthName = monthSelect.selectedOptions[0].text;
  const scenarioName = scenarioSelect.selectedOptions[0].text;

  description.textContent =
    `Comparing ${monthName} ${beforeYear} with ` +
    `${monthName} ${afterYear} under ${scenarioName}. ` +
    `Drag the slider to compare projected temperatures.`;

}

// ======================================
// 9. LOAD TEMPERATURE DATA
// ======================================

async function initializeComparison() {

  try {

    // Load CSV and temperature GeoJSON
    const [csvData, geojsonData, zipData] = await Promise.all([
        d3.csv('data/regional_monthly.csv', d3.autoType),
        d3.json('data/temperature_regions.geojson'),
        d3.json('data/san_diego_zipcodes.geojson')
    ]);

// Keep ZIP-code polygons for searching
zipFeatures = zipData.features;


    monthlyData = csvData;
    temperatureRegions = geojsonData;

    // Wait for both maps to load
    await Promise.all([
      new Promise(resolve => {
        if (beforeMap.loaded()) resolve();
        else beforeMap.once('load', resolve);
      }),

      new Promise(resolve => {
        if (afterMap.loaded()) resolve();
        else afterMap.once('load', resolve);
      })
    ]);

    // Add temperature overlays
    addTemperatureLayer(beforeMap, temperatureRegions);
    addTemperatureLayer(afterMap, temperatureRegions);

    // Add ZIP-code outlines to both maps
    addZipLayers(beforeMap, zipData);
    addZipLayers(afterMap, zipData);

    dataReady = true;

    // Show default years
    updateComparison();

    console.log('Two-year comparison map ready!');

  } catch (error) {

    console.error('Error initializing comparison:', error);

    description.textContent =
      'Error loading climate data. Check the console.';

  }

}

initializeComparison();

// ======================================
// 10. EVENT LISTENERS
// ======================================

// Update when either year changes
beforeYearSelect.addEventListener('change', updateComparison);
afterYearSelect.addEventListener('change', updateComparison);

// Update when scenario or month changes
scenarioSelect.addEventListener('change', updateComparison);
monthSelect.addEventListener('change', updateComparison);


// ======================================
// ZIP-CODE SEARCH AND ZOOM
// ======================================

// Find the bounding box of a GeoJSON polygon
function getFeatureBounds(feature) {
  const bounds = new mapboxgl.LngLatBounds();

  function addCoordinates(coordinates) {
    // A single [longitude, latitude] coordinate
    if (
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      bounds.extend(coordinates);
      return;
    }

    // Handle Polygon and MultiPolygon nesting
    coordinates.forEach(addCoordinates);
  }

  addCoordinates(feature.geometry.coordinates);

  return bounds;
}

// Highlight the selected ZIP on both maps
function highlightZip(zip) {
  const filter = [
    '==',
    ['get', 'zip'],
    Number(zip)
  ];

  beforeMap.setFilter('zipcode-highlight', filter);
  afterMap.setFilter('zipcode-highlight', filter);
}

// Search for a ZIP code
function searchZipCode() {
  const zip = zipInput.value.trim();

  if (!/^\d{5}$/.test(zip)) {
    zipMessage.textContent =
      'Please enter a valid five-digit ZIP code.';
    return;
  }

  if (!dataReady || !beforeMap.getLayer('zipcode-highlight')) {
    zipMessage.textContent =
      'Map data is still loading. Please try again.';
    return;
  }

  // Find the matching ZIP-code polygon
  const feature = zipFeatures.find(
    f => String(f.properties.zip) === zip
  );

  if (!feature) {
    zipMessage.textContent =
      'ZIP code not found in the San Diego County dataset.';
    return;
  }

  selectedZip = zip;

  // Highlight its real geographic boundary
  highlightZip(zip);

  // Zoom to the selected area
  const bounds = getFeatureBounds(feature);

  const zoomOptions = {
    padding: 65,
    maxZoom: 13,
    duration: 1000
  };

  // The comparison plugin synchronizes the maps
  beforeMap.fitBounds(bounds, zoomOptions);

  zipMessage.textContent =
    `Showing ZIP code ${zip}` +
    (feature.properties.community
      ? ` — ${feature.properties.community}`
      : '');
}

// Reset to the full county view
function resetZipSearch() {
  zipInput.value = '';
  selectedZip = null;
  zipMessage.textContent = '';

  if (!dataReady) return;

  const emptyFilter = [
    '==',
    ['get', 'zip'],
    -1
  ];

  beforeMap.setFilter('zipcode-highlight', emptyFilter);
  afterMap.setFilter('zipcode-highlight', emptyFilter);

  beforeMap.flyTo({
    center: [-116.85, 33.02],
    zoom: 8.5,
    duration: 1000
  });
}

// Search when clicking the button
zipSearchButton.addEventListener('click', searchZipCode);

// Search when pressing Enter
zipInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    searchZipCode();
  }
});

// Reset map
zipResetButton.addEventListener('click', resetZipSearch);

