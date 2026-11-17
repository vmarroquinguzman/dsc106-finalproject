
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Keep your existing PUBLIC Mapbox token
mapboxgl.accessToken = 'pk.eyJ1Ijoidm1hcnJvcXVpbmd1em1hbiIsImEiOiJjbXdkeWljcjQwMHh1MnpvZWI5dTdrOGl3In0.xo5Vd3LYeQQlubikstOSUw';

// Initialize Mapbox
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/standard',
  center: [-116.85, 33.02],
  zoom: 8.5
});

map.addControl(new mapboxgl.NavigationControl());

// Website controls
const yearSlider = document.querySelector('#year-slider');
const yearValue = document.querySelector('#year-value');
const scenarioSelect = document.querySelector('#scenario');
const monthSelect = document.querySelector('#month');
const description = document.querySelector('#map-description');

// Empty data containers
let monthlyData = [];
let temperatureRegions = null;

// Match a CSV location to its GeoJSON polygon
function locationKey(lat, lon) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

// Color scale: temperature in Fahrenheit
const temperatureColor = [
  'case',
  ['==', ['get', 'temperature'], null], '#AAAAAA',
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

// Initialize everything when Mapbox loads
map.on('load', async () => {
  try {
    // Load temperature data and geographic regions
    const [csvData, geojsonData] = await Promise.all([
      d3.csv('data/regional_monthly.csv', d3.autoType),
      d3.json('data/temperature_regions.geojson')
    ]);

    monthlyData = csvData;
    temperatureRegions = geojsonData;

    // Initialize every region with no temperature
    temperatureRegions.features.forEach(feature => {
      feature.properties.temperature = null;
    });

    // Add geographic data source
    map.addSource('temperature-regions', {
      type: 'geojson',
      data: temperatureRegions
    });

    // Add color-filled regions
    map.addLayer({
      id: 'temperature-fill',
      type: 'fill',
      source: 'temperature-regions',
      paint: {
        'fill-color': temperatureColor,
        'fill-opacity': 0.65
      }
    });

    // Add subtle borders between temperature regions
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

    // Interactive popup
    map.on('click', 'temperature-fill', (event) => {
      const feature = event.features[0];
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

    map.on('mouseenter', 'temperature-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'temperature-fill', () => {
      map.getCanvas().style.cursor = '';
    });

    // Display initial selection
    updateTemperatureMap();

    console.log('Temperature map loaded successfully!');
  } catch (error) {
    console.error('Error loading temperature data:', error);
    description.textContent =
      'Unable to load temperature data. Check the browser console.';
  }
});

// Update map based on the selected controls
function updateTemperatureMap() {
  if (!temperatureRegions || monthlyData.length === 0) {
    return;
  }

  const year = Number(yearSlider.value);
  const month = Number(monthSelect.value);
  const scenario = scenarioSelect.value;

  const columnNames = {
    ssp126: 'MAX_F_SSP126',
    ssp245: 'MAX_F_SSP245',
    ssp370: 'MAX_F_SSP370'
  };

  const temperatureColumn = columnNames[scenario];

  const selectedRows = monthlyData.filter(row =>
    Number(row.YEAR) === year &&
    Number(row.MO) === month
  );

  // Create a lookup from coordinates to temperature
  const temperatureLookup = new Map();

  selectedRows.forEach(row => {
    const key = locationKey(row.latitude, row.longitude);
    const rawValue = row[temperatureColumn];
    const value = rawValue == null || rawValue === ''
        ? null
        : Number(rawValue);

    temperatureLookup.set(
      key,
      Number.isFinite(value) ? value : null
    );
  });

  // Assign temperature values to geographic regions
  temperatureRegions.features.forEach(feature => {
    const { latitude, longitude } = feature.properties;
    const key = locationKey(latitude, longitude);

    feature.properties.temperature =
      temperatureLookup.get(key) ?? null;
  });

  // Update the Mapbox geographic source
  map.getSource('temperature-regions').setData(
    temperatureRegions
  );

  // Update description
  const monthName =
    monthSelect.selectedOptions[0].text;

  const scenarioName =
    scenarioSelect.selectedOptions[0].text;

  description.textContent =
    `Projected average daily maximum temperatures ` +
    `for ${monthName} ${year} under ${scenarioName}. ` +
    `Click a region to see its projected temperature.`;

  yearValue.textContent = year;
}

// Control event listeners
yearSlider.addEventListener('input', updateTemperatureMap);

scenarioSelect.addEventListener('change', updateTemperatureMap);

monthSelect.addEventListener('change', updateTemperatureMap);
