
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let turf;

const turfReady = import(
  'https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/+esm'
)
  .then(module => {
    turf = module;
  })
  .catch(error => {
    console.error('Turf failed to load:', error);
  });


// ======================================
// 1. MAPBOX ACCESS TOKEN
// ======================================

mapboxgl.accessToken = 'pk.eyJ1Ijoidm1hcnJvcXVpbmd1em1hbiIsImEiOiJjbXdkeWljcjQwMHh1MnpvZWI5dTdrOGl3In0.xo5Vd3LYeQQlubikstOSUw';


// ======================================
// 2. WEBSITE CONTROLS
// ======================================

const beforeYearSelect =
  document.querySelector('#before-year');

const afterYearSelect =
  document.querySelector('#after-year');

const beforeYearLabel =
  document.querySelector('#before-year-label');

const futureYear =
  document.querySelector('#future-year');

const beforeScenarioSelect =
  document.querySelector('#before-scenario');

const afterScenarioSelect =
  document.querySelector('#after-scenario');

const beforeScenarioLabel =
  document.querySelector('#before-scenario-label');

const afterScenarioLabel =
  document.querySelector('#after-scenario-label');

const monthSelect =
  document.querySelector('#month');

const description =
  document.querySelector('#map-description');

const scenarioNames = {
  ssp245: 'SSP2-4.5',
  ssp370: 'SSP3-7.0'
};


// ZIP CODE CONTROLS

const zipInput =
  document.querySelector('#zip-input');

const zipSearchButton =
  document.querySelector('#zip-search-button');

const zipResetButton =
  document.querySelector('#zip-reset-button');

const zipMessage =
  document.querySelector('#zip-message');

let zipFeatures = [];
let selectedZip = null;


// Populate year dropdowns

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

  style: 'mapbox://styles/mapbox/light-v11',

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


// Wait for the initial map load

const mapsReady = Promise.all(

  [beforeMap, afterMap].map(map =>

    new Promise(resolve => {

      if (map.loaded()) {

        resolve();

      } else {

        map.once('load', resolve);

      }

    })

  )

);


// Navigation controls

afterMap.addControl(
  new mapboxgl.NavigationControl()
);


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


  // ======================================
  // TEMPERATURE HOVER TOOLTIP
  // ======================================

  const temperaturePopup = new mapboxgl.Popup({

    closeButton: false,

    closeOnClick: false,

    offset: 15

  });


  // Change cursor

  map.on('mouseenter', 'temperature-fill', () => {

    map.getCanvas().style.cursor = 'pointer';

  });


  // Update tooltip

  map.on('mousemove', 'temperature-fill', event => {

    const feature = event.features[0];

    if (!feature) return;


    const rawTemp = feature.properties.temperature;

    const temp = rawTemp == null

      ? null

      : Number(rawTemp);


    const tempText =

      temp !== null && Number.isFinite(temp)

        ? `${temp.toFixed(1)}°F`

        : 'No temperature data';


    // Identify which map is being hovered over

    const isBefore = map === beforeMap;


    const year = isBefore

      ? beforeYearSelect.value

      : afterYearSelect.value;


    const month =
      monthSelect.selectedOptions[0].text;


    const scenario = isBefore

      ? beforeScenarioSelect.selectedOptions[0].text

      : afterScenarioSelect.selectedOptions[0].text;


    // Tooltip content

    const tooltipHTML = `

      <div class="temperature-tooltip">

        <h3>Projected Temperature</h3>

        <div class="tooltip-temperature">

          ${tempText}

        </div>

        <p><strong>Year:</strong> ${year}</p>

        <p><strong>Month:</strong> ${month}</p>

        <p><strong>Scenario:</strong> ${scenario}</p>

        <p class="tooltip-note">

          Average daily maximum temperature

        </p>

      </div>

    `;


    temperaturePopup

      .setLngLat(event.lngLat)

      .setHTML(tooltipHTML)

      .addTo(map);

  });


  // Remove tooltip

  map.on('mouseleave', 'temperature-fill', () => {

    map.getCanvas().style.cursor = '';

    temperaturePopup.remove();

  });

}


// ======================================
// 7. ZIP-CODE BOUNDARY LAYERS
// ======================================

function addZipLayers(map, geojsonData) {

  map.addSource('zipcodes', {

    type: 'geojson',

    data: geojsonData

  });


  // Draw ZIP-code outlines

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


  // Highlight selected ZIP code

  map.addLayer({

    id: 'zipcode-highlight',

    type: 'line',

    source: 'zipcodes',

    filter: [

      '==',

      ['to-string', ['get', 'zip']],

      ''

    ],

    paint: {

      'line-color': '#152f45',

      'line-width': 4,

      'line-opacity': 1

    }

  });

}


// ======================================
// 8. GET TEMPERATURE DATA
// ======================================

function getTemperatureGeoJSON(year, month, scenario) {

  // Match scenario to correct CSV column

  const columnNames = {

    ssp245: 'MAX_F_SSP245',

    ssp370: 'MAX_F_SSP370'

  };


  const temperatureColumn = columnNames[scenario];


  // Filter selected year and month

  const selectedRows = monthlyData.filter(row =>

    Number(row.year) === Number(year) &&

    Number(row.month) === Number(month)

  );


  // Create coordinate lookup

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


  // Copy geographic regions

  const updatedGeoJSON =
    structuredClone(temperatureRegions);


  updatedGeoJSON.features.forEach(feature => {

    const { latitude, longitude } =
      feature.properties;


    const key =
      locationKey(latitude, longitude);


    feature.properties.temperature =

      temperatureLookup.get(key) ?? null;

  });


  return updatedGeoJSON;

}


// ======================================
// 9. UPDATE BOTH MAPS
// ======================================

function updateComparison() {

  const beforeYear =
    Number(beforeYearSelect.value);

  const afterYear =
    Number(afterYearSelect.value);


  const beforeScenario =
    beforeScenarioSelect.value;

  const afterScenario =
    afterScenarioSelect.value;


  const month =
    Number(monthSelect.value);


  // Update year labels

  beforeYearLabel.textContent = beforeYear;

  futureYear.textContent = afterYear;


  // Update scenario labels

  beforeScenarioLabel.textContent =
    scenarioNames[beforeScenario];

  afterScenarioLabel.textContent =
    scenarioNames[afterScenario];


  if (!dataReady) return;


  // LEFT MAP

  const beforeData = getTemperatureGeoJSON(

    beforeYear,

    month,

    beforeScenario

  );


  // RIGHT MAP

  const afterData = getTemperatureGeoJSON(

    afterYear,

    month,

    afterScenario

  );


  // Update both temperature layers

  beforeMap.getSource('temperature-regions')

    .setData(beforeData);


  afterMap.getSource('temperature-regions')

    .setData(afterData);


  // Update description

  const monthName =
    monthSelect.selectedOptions[0].text;


  description.textContent =

    `Comparing ${monthName} ${beforeYear} ` +

    `under ${scenarioNames[beforeScenario]} with ` +

    `${monthName} ${afterYear} ` +

    `under ${scenarioNames[afterScenario]}. ` +

    `Drag the slider to explore the differences.`;


  // Update personalized statistics

  safelyUpdateZipSummary();

}


// ======================================
// 10. LOAD TEMPERATURE DATA
// ======================================

async function initializeComparison() {

  try {

    const [csvData, geojsonData, zipData] =

      await Promise.all([

        d3.csv(

          'data/loca2_monthly.csv',

          d3.autoType

        ),

        d3.json(

          'data/loca2_regions.geojson'

        ),

        d3.json(

          'data/san_diego_zipcodes.geojson'

        )

      ]);


    zipFeatures = zipData.features;

    monthlyData = csvData;

    temperatureRegions = geojsonData;


    // Wait for Mapbox

    await mapsReady;


    // Add temperature overlays

    addTemperatureLayer(

      beforeMap,

      temperatureRegions

    );


    addTemperatureLayer(

      afterMap,

      temperatureRegions

    );


    // Add ZIP boundaries

    addZipLayers(beforeMap, zipData);

    addZipLayers(afterMap, zipData);


    dataReady = true;


    // Show default comparison

    updateComparison();


    console.log(

      'Two-year comparison map ready!'

    );


  } catch (error) {

    console.error(

      'Error initializing comparison:',

      error

    );


    description.textContent =

      'Error loading climate data. Check the console.';

  }

}


// ======================================
// 11. EVENT LISTENERS
// ======================================

beforeYearSelect.addEventListener(

  'change',

  updateComparison

);


afterYearSelect.addEventListener(

  'change',

  updateComparison

);


beforeScenarioSelect.addEventListener(

  'change',

  updateComparison

);


afterScenarioSelect.addEventListener(

  'change',

  updateComparison

);


monthSelect.addEventListener(

  'change',

  updateComparison

);


// ======================================
// 12. ZIP-CODE SEARCH AND ZOOM
// ======================================

function getFeatureBounds(feature) {

  const bounds = new mapboxgl.LngLatBounds();


  function addCoordinates(coordinates) {

    if (

      typeof coordinates[0] === 'number' &&

      typeof coordinates[1] === 'number'

    ) {

      bounds.extend(coordinates);

      return;

    }


    coordinates.forEach(addCoordinates);

  }


  addCoordinates(feature.geometry.coordinates);


  return bounds;

}


// Highlight selected ZIP code

function highlightZip(zip) {

  const filter = [

    '==',

    ['to-string', ['get', 'zip']],

    String(zip)

  ];


  beforeMap.setFilter(

    'zipcode-highlight',

    filter

  );


  afterMap.setFilter(

    'zipcode-highlight',

    filter

  );

}


// Search ZIP code

function searchZipCode() {

  const zip = zipInput.value.trim();


  if (!/^\d{5}$/.test(zip)) {

    zipMessage.textContent =

      'Please enter a valid five-digit ZIP code.';

    return;

  }


  if (

    !dataReady ||

    !beforeMap.getLayer('zipcode-highlight')

  ) {

    zipMessage.textContent =

      'Map data is still loading. Please try again.';

    return;

  }


  const feature = zipFeatures.find(

    f => String(f.properties.zip) === zip

  );


  if (!feature) {

    zipMessage.textContent =

      'ZIP code not found in the San Diego County dataset.';

    return;

  }


  selectedZip = zip;


  // Highlight boundary

  highlightZip(zip);


  // Zoom to ZIP code

  const bounds = getFeatureBounds(feature);


  const zoomOptions = {

    padding: 65,

    maxZoom: 13,

    duration: 1000

  };


  beforeMap.resize();

  afterMap.resize();


  beforeMap.fitBounds(bounds, zoomOptions);


  zipMessage.textContent =

    `Showing ZIP code ${zip}` +

    (feature.properties.community

      ? ` — ${feature.properties.community}`

      : '');


  // Update personalized statistics separately

  safelyUpdateZipSummary();


  // Scroll to map

  document.querySelector('#climate-explorer')

    ?.scrollIntoView({

      behavior: 'smooth',

      block: 'start'

    });

}


// Reset map

function resetZipSearch() {

  zipInput.value = '';

  selectedZip = null;

  zipMessage.textContent = '';


  const summary =
    document.querySelector('#zip-summary');


  if (summary) {

    summary.hidden = true;

  }


  if (!dataReady) return;


  const emptyFilter = [

    '==',

    ['to-string', ['get', 'zip']],

    ''

  ];


  beforeMap.setFilter(

    'zipcode-highlight',

    emptyFilter

  );


  afterMap.setFilter(

    'zipcode-highlight',

    emptyFilter

  );


  beforeMap.flyTo({

    center: [-116.85, 33.02],

    zoom: 8.5,

    duration: 1000

  });

}


// Search button

zipSearchButton.addEventListener(

  'click',

  searchZipCode

);


// Enter key

zipInput.addEventListener(

  'keydown',

  event => {

    if (event.key === 'Enter') {

      searchZipCode();

    }

  }

);


// Reset button

zipResetButton.addEventListener(

  'click',

  resetZipSearch

);


// ======================================
// 13. PERSONALIZED ZIP-CODE STATISTICS
// ======================================

const zipOverlapCache = new Map();


function getZipOverlaps(zipFeature) {

  const zip =
    String(zipFeature.properties.zip);


  if (zipOverlapCache.has(zip)) {

    return zipOverlapCache.get(zip);

  }


  const overlaps = [];

  const zipBounds = turf.bbox(zipFeature);


  temperatureRegions.features.forEach(

    (cell, index) => {

      const cellBounds = turf.bbox(cell);


      // Skip cells outside ZIP code

      if (

        cellBounds[2] < zipBounds[0] ||

        cellBounds[0] > zipBounds[2] ||

        cellBounds[3] < zipBounds[1] ||

        cellBounds[1] > zipBounds[3]

      ) {

        return;

      }


      // Geographic intersection

      const intersection = turf.intersect(

        turf.featureCollection([zipFeature, cell])

      );


      if (!intersection) return;


      const overlapArea =

        turf.area(intersection);


      if (overlapArea > 0) {

        overlaps.push({

          index: index,

          area: overlapArea

        });

      }

    }

  );


  zipOverlapCache.set(zip, overlaps);


  return overlaps;

}


// ======================================
// UPDATE PERSONALIZED SUMMARY
// ======================================

function updateZipSummary() {

  const summary =
    document.querySelector('#zip-summary');


  if (!summary) return;


  if (!dataReady || !selectedZip) {

    summary.hidden = true;

    return;

  }


  const zipFeature = zipFeatures.find(

    feature =>

      String(feature.properties.zip) ===

      String(selectedZip)

  );


  if (!zipFeature) {

    summary.hidden = true;

    return;

  }


  const beforeYear =
    Number(beforeYearSelect.value);

  const afterYear =
    Number(afterYearSelect.value);

  const month =
    Number(monthSelect.value);


  const beforeScenario =
    beforeScenarioSelect.value;

  const afterScenario =
    afterScenarioSelect.value;


  const beforeData = getTemperatureGeoJSON(

    beforeYear,

    month,

    beforeScenario

  );


  const afterData = getTemperatureGeoJSON(

    afterYear,

    month,

    afterScenario

  );


  const overlaps =
    getZipOverlaps(zipFeature);


  let beforeTotal = 0;

  let afterTotal = 0;

  let totalArea = 0;


  // Calculate area-weighted averages

  overlaps.forEach(overlap => {

    const beforeTemp =

      beforeData.features[overlap.index]

        .properties.temperature;


    const afterTemp =

      afterData.features[overlap.index]

        .properties.temperature;


    if (

      Number.isFinite(beforeTemp) &&

      Number.isFinite(afterTemp)

    ) {

      beforeTotal +=

        beforeTemp * overlap.area;


      afterTotal +=

        afterTemp * overlap.area;


      totalArea += overlap.area;

    }

  });


  const beforeTemp = totalArea > 0

    ? beforeTotal / totalArea

    : null;


  const afterTemp = totalArea > 0

    ? afterTotal / totalArea

    : null;


  const difference = totalArea > 0

    ? afterTemp - beforeTemp

    : null;


  // LOCATION

  const community =

    zipFeature.properties.community;


  document.querySelector('#summary-location')

    .textContent = community

      ? `${community} · ZIP ${selectedZip}`

      : `ZIP ${selectedZip}`;


  // SELECTED MONTH

  const monthName =

    monthSelect.selectedOptions[0].text;


  document.querySelector('#summary-context')

    .textContent =

      `Projected temperatures for ${monthName}`;


  // SELECTED YEARS AND SCENARIOS

  document.querySelector('#summary-before-year')

    .textContent =

      `${beforeYear} · ${scenarioNames[beforeScenario]}`;


  document.querySelector('#summary-after-year')

    .textContent =

      `${afterYear} · ${scenarioNames[afterScenario]}`;


  // TEMPERATURES

  document.querySelector('#summary-before-temp')

    .textContent = beforeTemp === null

      ? 'N/A'

      : `${beforeTemp.toFixed(1)}°F`;


  document.querySelector('#summary-after-temp')

    .textContent = afterTemp === null

      ? 'N/A'

      : `${afterTemp.toFixed(1)}°F`;


  // TEMPERATURE DIFFERENCE

  const differenceElement =

    document.querySelector('#summary-difference');


  const changeText =

    document.querySelector('#summary-change-text');


  differenceElement.classList.remove(

    'warmer',

    'cooler'

  );


  if (difference === null) {

    differenceElement.textContent = 'N/A';

    changeText.textContent = 'Insufficient data';

  } else {

    const roundedDifference =

      Number(difference.toFixed(1));


    differenceElement.textContent =

      `${roundedDifference > 0 ? '+' : ''}` +

      `${roundedDifference.toFixed(1)}°F`;


    if (roundedDifference > 0) {

      differenceElement.classList.add('warmer');

      changeText.textContent = 'Warmer';

    } else if (roundedDifference < 0) {

      differenceElement.classList.add('cooler');

      changeText.textContent = 'Cooler';

    } else {

      changeText.textContent =

        'No difference at displayed precision';

    }

  }


  // Geographic coverage

  const coverage = Math.min(

    100,

    totalArea / turf.area(zipFeature) * 100

  );


  document.querySelector('#summary-note')

    .textContent =

      `Area-weighted estimate of monthly average ` +

      `daily maximum temperatures using LOCA2. ` +

      `${coverage.toFixed(0)}% of the ZIP-code area ` +

      `has data for both selected projections. ` +

      `These are regional projections, not exact ` +

      `neighborhood forecasts.`;


  summary.hidden = false;

}


// ======================================
// 14. SAFE STATISTICS UPDATE
// ======================================

async function safelyUpdateZipSummary() {

  await turfReady;


  try {

    updateZipSummary();

  } catch (error) {

    console.error('ZIP summary error:', error);


    const summary =

      document.querySelector('#zip-summary');


    if (summary) {

      summary.hidden = true;

    }

  }

}


// ======================================
// 15. INITIALIZE EVERYTHING
// ======================================

initializeComparison();


// Keep maps correctly sized

const comparisonContainer =

  document.querySelector('#comparison-container');


if (

  comparisonContainer &&

  typeof ResizeObserver !== 'undefined'

) {

  const observer = new ResizeObserver(() => {

    beforeMap.resize();

    afterMap.resize();

  });


  observer.observe(comparisonContainer);

}
