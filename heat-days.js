
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// ======================================
// EXTREME HEAT — GROUPED BAR CHART
// ======================================

const root = d3.select('#heat-line-chart');

const status =
  document.querySelector('#heat-chart-status');

const detail =
  document.querySelector('#heat-chart-detail');

const threshold =
  document.querySelector('#heat-threshold');

const interval =
  document.querySelector('#heat-interval');

const reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;


// ======================================
// EMISSIONS SCENARIOS
// ======================================

const scenarios = [
  {
    key: 'T2M_MAX_SSP126',
    name: 'SSP1-2.6',
    label: 'Low Emissions',
    color: '#7dc4f5'
  },
  {
    key: 'T2M_MAX_SSP245',
    name: 'SSP2-4.5',
    label: 'Medium Emissions',
    color: '#f1c27d'
  },
  {
    key: 'T2M_MAX_SSP370',
    name: 'SSP3-7.0',
    label: 'High Emissions',
    color: '#ff8055'
  }
];

// All scenarios are visible initially

const activeScenarios = new Set(
  scenarios.map(s => s.key)
);


// ======================================
// LOAD DAILY TEMPERATURE DATA
// ======================================

async function init() {

  try {

    const raw = await d3.text(
      'data/fire_data.csv'
    );

    const lines = raw.split(/\r?\n/);

    const start = lines.findIndex(
      line => line.trim().startsWith('YEAR,MO,DY,')
    );

    if (start < 0) {
      throw new Error('NASA CSV header not found');
    }

    // Keep June through September

    const data = d3.csvParse(
      lines.slice(start).join('\n')
    ).filter(
      d => +d.MO >= 6 && +d.MO <= 9
    );

    const groups = d3.group(
      data,
      d => +d.YEAR
    );


    // ======================================
    // CALCULATE EXTREME HEAT DAYS
    // ======================================

    function countHeatDays(year, scenario, value) {

      const rows = groups.get(year) || [];

      // Remove invalid or missing temperatures

      const valid = rows.filter(row =>

        row[scenario.key] != null &&
        row[scenario.key].trim() !== '' &&
        Number.isFinite(+row[scenario.key]) &&
        +row[scenario.key] !== -999

      );

      // June through September has 122 days

      const complete =

        valid.length === 122 &&

        new Set(
          valid.map(row => `${row.MO}-${row.DY}`)
        ).size === 122;

      if (!complete) return null;

      // Convert Celsius to Fahrenheit
      // and count days reaching the threshold

      return valid.filter(row =>

        (+row[scenario.key]) * 1.8 + 32
          >= value - 1e-9

      ).length;

    }


    // ======================================
    // CREATE CHART
    // ======================================

    root.selectAll('*').remove();

    const W = 960;
    const H = 460;

    const m = {
      top: 35,
      right: 25,
      bottom: 65,
      left: 65
    };

    const bottom = H - m.bottom;

    const svg = root.append('svg')

      .attr('viewBox', `0 0 ${W} ${H}`)

      .attr('role', 'group')

      .attr(
        'aria-label',
        'Grouped bar chart of projected extreme heat days'
      );


    // ======================================
    // SCALES
    // ======================================

    const x0 = d3.scaleBand()

      .range([m.left, W - m.right])

      .paddingInner(0.28)

      .paddingOuter(0.12);

    const x1 = d3.scaleBand()

      .padding(0.12);

    const y = d3.scaleLinear()

      .domain([0, 122])

      .range([bottom, m.top]);


    // ======================================
    // GRIDLINES
    // ======================================

    svg.append('g')

      .attr(
        'transform',
        `translate(${m.left},0)`
      )

      .call(
        d3.axisLeft(y)

          .tickValues([0, 20, 40, 60, 80, 100, 120])

          .tickSize(
            -(W - m.left - m.right)
          )
      )

      .call(g =>
        g.selectAll('.tick line')
          .attr('stroke', '#30485b')
          .attr('stroke-dasharray', '4 4')
      )

      .call(g =>
        g.select('.domain').remove()
      );


    // X-axis container

    const xAxis = svg.append('g')

      .attr(
        'transform',
        `translate(0,${bottom})`
      );


    // Y-axis title

    svg.append('text')

      .attr('x', m.left)

      .attr('y', 18)

      .attr('fill', '#b8c7d5')

      .attr('font-size', 13)

      .text('Days per summer');


    // X-axis title

    svg.append('text')

      .attr('x', W / 2)

      .attr('y', H - 15)

      .attr('text-anchor', 'middle')

      .attr('fill', '#b8c7d5')

      .attr('font-size', 13)

      .text('Year');


    // Container for bars

    const barsLayer = svg.append('g');


    // ======================================
    // CREATE HOVER TOOLTIP
    // ======================================

    const tooltip = root.append('div')

      .attr('class', 'heat-bar-tooltip')

      .style('opacity', 0);


    function positionTooltip(event) {

      const [x, y] = d3.pointer(
        event,
        root.node()
      );

      const maxLeft = Math.max(
        0,
        root.node().clientWidth -
          tooltip.node().offsetWidth - 8
      );

      tooltip

        .style(
          'left',
          `${Math.max(0, Math.min(x + 14, maxLeft))}px`
        )

        .style(
          'top',
          `${Math.max(0, y - 100)}px`
        );

    }


    // ======================================
    // HIGHLIGHT A YEAR
    // ======================================

    function highlightYear(year) {

      barsLayer.selectAll('.heat-bar')

        .attr('opacity', d =>
          d.year === year ? 1 : 0.25
        );

    }


    function resetHighlight() {

      barsLayer.selectAll('.heat-bar')

        .attr('opacity', 1);

      tooltip.style('opacity', 0);

    }


    // ======================================
    // INTERACTIVE LEGEND
    // ======================================

    const legend = root.append('div')

      .attr('class', 'heat-bar-legend');


    const legendItems = legend.selectAll('button')

      .data(scenarios)

      .join('button')

      .attr('type', 'button')

      .attr('class', 'heat-legend-item')

      .attr('aria-pressed', 'true');


    legendItems.append('span')

      .attr('class', 'heat-legend-color')

      .style('background', d => d.color);


    const legendText = legendItems.append('span');

    legendText.append('strong')

      .text(d => d.name);

    legendText.append('small')

      .text(d => d.label);


    // Click to hide or reveal a scenario

    legendItems.on('click', (event, d) => {

      if (activeScenarios.has(d.key)) {

        // Always keep at least one scenario visible

        if (activeScenarios.size === 1) return;

        activeScenarios.delete(d.key);

      } else {

        activeScenarios.add(d.key);

      }

      render();

    });


    // ======================================
    // RENDER / UPDATE BAR GRAPH
    // ======================================

    function render() {

      const value = +threshold.value;

      const yearInterval = +interval.value;

      const years = d3.range(
        2020,
        2101,
        yearInterval
      );


      const visibleScenarios = scenarios.filter(
        s => activeScenarios.has(s.key)
      );


      status.textContent =

        `Summer days reaching ${value}°F or higher ` +

        `(June–September)`;


      detail.textContent =

        'Hover over a bar or use Tab to explore ' +

        'projected extreme heat. Click the legend ' +

        'to compare emissions scenarios.';


      resetHighlight();


      // Generate bar chart data

      const chartData = years.flatMap(year =>

        visibleScenarios.map(scenario => ({

          year: year,

          key: scenario.key,

          name: scenario.name,

          label: scenario.label,

          color: scenario.color,

          count: countHeatDays(
            year,
            scenario,
            value
          )

        }))

      );


      // Update scales

      x0.domain(years);

      x1.domain(
        visibleScenarios.map(s => s.key)
      )

        .range([0, x0.bandwidth()]);


      // Update year labels

      xAxis.call(

        d3.axisBottom(x0)

          .tickSizeOuter(0)

          .tickFormat(d3.format('d'))

      );


      // Update legend appearance

      legendItems

        .classed(
          'inactive',
          d => !activeScenarios.has(d.key)
        )

        .attr(
          'aria-pressed',
          d => activeScenarios.has(d.key)
        );


      // ======================================
      // DRAW ANIMATED BARS
      // ======================================

      const bars = barsLayer

        .selectAll('.heat-bar')

        .data(

          chartData.filter(d => d.count !== null),

          d => `${d.year}-${d.key}`

        );


      // Remove outdated bars

      bars.exit()

        .interrupt()

        .transition()

        .duration(reducedMotion ? 0 : 250)

        .attr('y', bottom)

        .attr('height', 0)

        .remove();


      // Create new bars

      const enteringBars = bars.enter()

        .append('rect')

        .attr('class', 'heat-bar')

        .attr('x', d =>
          x0(d.year) + x1(d.key)
        )

        .attr('width', x1.bandwidth())

        .attr('y', bottom)

        .attr('height', 0)

        .attr('rx', 4)

        .attr('fill', d => d.color)

        .attr('tabindex', 0);


      const allBars = enteringBars.merge(bars);


      // Accessible bar descriptions

      allBars.attr(
        'aria-label',
        d => `${d.year}, ${d.name}: ${d.count} days`
      );


      // Animate bars when controls change

      allBars

        .interrupt()

        .transition()

        .duration(reducedMotion ? 0 : 650)

        .ease(d3.easeCubicOut)

        .attr('x', d =>
          x0(d.year) + x1(d.key)
        )

        .attr('width', x1.bandwidth())

        .attr('y', d => y(d.count))

        .attr('height', d =>
          bottom - y(d.count)
        )

        .attr('fill', d => d.color);


      // ======================================
      // HOVER INTERACTIONS
      // ======================================

      allBars

        .on('pointerenter', (event, d) => {

          highlightYear(d.year);

          tooltip.html(`

            <div class="heat-tooltip-year">
              ${d.year}
            </div>

            <div class="heat-tooltip-value"
                 style="color: ${d.color}">
              ${d.count} days
            </div>

            <div>
              ${d.name} · ${d.label}
            </div>

            <small>
              Reaching ${value}°F or higher
            </small>

          `)

            .style('opacity', 1);

          positionTooltip(event);

          showYearDetails(d.year);

        })

        .on('pointermove', event => {

          positionTooltip(event);

        })

        .on('pointerleave', () => {

          resetHighlight();

        })

        .on('focus', (event, d) => {

          highlightYear(d.year);

          showYearDetails(d.year);

        })

        .on('blur', () => {

          resetHighlight();

        });


      // ======================================
      // DISPLAY MISSING DATA
      // ======================================

      barsLayer.selectAll('.heat-missing')

        .data(
          chartData.filter(d => d.count === null),
          d => `${d.year}-${d.key}`
        )

        .join('text')

        .attr('class', 'heat-missing')

        .attr('x', d =>
          x0(d.year) + x1(d.key) +
          x1.bandwidth() / 2
        )

        .attr('y', bottom - 8)

        .attr('text-anchor', 'middle')

        .attr('fill', '#91a5b7')

        .attr('font-size', 10)

        .text('N/A');


      // Zero-day values receive a visible label

      barsLayer.selectAll('.heat-zero-label')

        .data(
          chartData.filter(d => d.count === 0),
          d => `${d.year}-${d.key}`
        )

        .join('text')

        .attr('class', 'heat-zero-label')

        .attr('x', d =>
          x0(d.year) + x1(d.key) +
          x1.bandwidth() / 2
        )

        .attr('y', bottom - 8)

        .attr('text-anchor', 'middle')

        .attr('fill', d => d.color)

        .attr('font-size', 11)

        .text('0')

        .on('pointerenter', (event, d) => {

          highlightYear(d.year);

          showYearDetails(d.year);

        })

        .on('pointerleave', resetHighlight);


      // ======================================
      // YEAR COMPARISON DETAILS
      // ======================================

      function showYearDetails(year) {

        const readings = chartData.filter(
          d => d.year === year
        );

        detail.replaceChildren();

        const heading = document.createElement('h3');

        heading.className = 'heat-detail-year';

        heading.textContent =

          `${year} — Summer days reaching ${value}°F`;

        detail.appendChild(heading);


        const grid = document.createElement('div');

        grid.className = 'heat-detail-grid';


        readings.forEach(d => {

          const card = document.createElement('div');

          card.className = 'heat-detail-card';

          const label = document.createElement('span');

          label.textContent = d.name;

          const number = document.createElement('strong');

          number.style.color = d.color;

          number.textContent =

            d.count === null

              ? 'N/A'

              : `${d.count} days`;

          card.append(label, number);

          grid.appendChild(card);

        });

        detail.appendChild(grid);

      }


      // Display the final year by default

      showYearDetails(years[years.length - 1]);

    }


    // ======================================
    // EVENT LISTENERS
    // ======================================

    threshold.addEventListener(
      'change',
      render
    );

    interval.addEventListener(
      'change',
      render
    );


    // Initial graph

    render();


  } catch (error) {

    console.error('Heat chart:', error);

    status.textContent =

      'Could not load heat-day data. Check ' +

      'that data/fire_data.csv exists and ' +

      'contains the expected temperature columns.';

  }

}

init();
