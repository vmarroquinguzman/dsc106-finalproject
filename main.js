
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Add your Mapbox public access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoidm1hcnJvcXVpbmd1em1hbiIsImEiOiJjbXdkeWljcjQwMHh1MnpvZWI5dTdrOGl3In0.xo5Vd3LYeQQlubikstOSUw';

// Initialize map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-117.1611, 32.7157],
  zoom: 9
});

// Add zoom and rotation controls
map.addControl(new mapboxgl.NavigationControl());

// Wait until the map finishes loading
map.on('load', () => {
  console.log('Mapbox map loaded successfully!');
});


// Year slider
const yearSlider = document.querySelector('#year-slider');
const yearValue = document.querySelector('#year-value');

yearSlider.addEventListener('input', () => {
  yearValue.textContent = yearSlider.value;
  updateSelection();
});

// Emissions scenario selector
const scenarioSelect = document.querySelector('#scenario');

scenarioSelect.addEventListener('change', updateSelection);

function updateSelection() {
  const year = yearSlider.value;
  const scenario = scenarioSelect.selectedOptions[0].text;

  document.querySelector('#map-description').textContent =
    `Selected: ${year}, ${scenario}. ` +
    `Temperature projection layer coming next.`;
}

console.log('Map initialized');
console.log('D3 version:', d3.version);
