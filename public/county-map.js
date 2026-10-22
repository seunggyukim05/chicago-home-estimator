/* Shared local Chicago area maps; no paid APIs or map-tile requests. */
window.createCountyMap = (initialOptions) => {
  let options = initialOptions;
  const ns = 'http://www.w3.org/2000/svg';
  let svg, boundaryPromise, homeView, currentView, paths = [];
  let subject, metadata, selectedZip;
  const absentBadge = {};

  // Resolve shared map element names to the page-specific map instance.
  const get = (id) => {
    const aliases = {
      'zip-map': options.container,
      'zip-map-status': options.status,
      'zip-map-tooltip': options.tooltip,
      'subject-zip-badge': options.badge,
    };
    return document.getElementById(aliases[id]) || absentBadge;
  };

  // Distinguish the property ZIP from the area currently being explored.
  function highlight() {
    paths.forEach(({element, zip}) => {
      element.classList.toggle('is-subject', zip === subject.details['ZIP Code']);
      element.classList.toggle('is-selected', zip === selectedZip);
      element.setAttribute('aria-pressed', String(zip === selectedZip));
    });
  }

  // Delegate an area click to the page while updating its highlighted ZIP.
  function compare(zip) {
    selectedZip = zip;
    highlight();
    options.onSelect(zip);
  }

  // Create SVG nodes without injecting markup from source data.
  function shape(tag, attributes) {
    const element = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  // Zoom around the map center, leaving page scrolling unaffected.
  function zoom(factor) {
    if (!svg) return;
    const width = Math.max(homeView[2] / 5, Math.min(homeView[2] * 1.5, currentView[2] * factor));
    const height = width * homeView[3] / homeView[2];
    currentView = [currentView[0] + (currentView[2] - width) / 2, currentView[1] + (currentView[3] - height) / 2, width, height];
    svg.setAttribute('viewBox', currentView.join(' '));
  }

  // Convert local longitude/latitude polygons to an approximate area map.
  async function drawMap() {
    try {
      if (!boundaryPromise) boundaryPromise = fetch('/assets/chicago-zip-boundaries.geojson').then(response => {
        if (!response.ok) throw new Error('Map boundaries could not be loaded.');
        return response.json();
      }).catch(error => { boundaryPromise = null; throw error; });
      const data = await boundaryPromise;
      const project = ([lon, lat]) => [lon * Math.cos(41.88 * Math.PI / 180) * 1000, -lat * 1000];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const features = data.features.map(feature => {
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        const d = polygons.map(polygon => polygon.map(ring => ring.map((coordinate, index) => {
          const [x, y] = project(coordinate);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          return (index ? 'L' : 'M') + x.toFixed(3) + ',' + y.toFixed(3);
        }).join(' ') + ' Z').join(' ')).join(' ');
        return { zip: String(feature.properties.zip), d };
      });
      homeView = [minX - 8, minY - 5, maxX - minX + 16, maxY - minY + 10];
      currentView = [...homeView];
      svg = shape('svg', { viewBox: homeView.join(' '), role: 'group', 'aria-label': 'Chicago ZIP areas. Tab to an area and press Enter to compare sales.' });
      paths = [];
      features.forEach(({ zip, d }) => {
        const count = metadata.comparison_counts[zip] || 0;
        const element = shape('path', { d, class: 'zip-area' + (count ? '' : ' no-sales'), 'fill-rule': 'evenodd', tabindex: '0', role: 'button', 'aria-label': 'ZIP ' + zip + ', ' + count + ' ' + (options.countLabel || 'historical examples') + '. Select an area.' });
        // Keep the tooltip above the SVG and near the hovered or focused area.
        const label = 'ZIP ' + zip + ' · ' + count.toLocaleString() + ' ' + (options.countLabel || 'historical examples');
        const nativeTitle = shape('title', {});
        nativeTitle.textContent = label;
        element.append(nativeTitle);
        const describe = (event) => {
          const tooltip = get('zip-map-tooltip');
          tooltip.hidden = false;
          tooltip.textContent = label;
          const shell = get('zip-map').parentElement;
          const bounds = shell.getBoundingClientRect();
          const area = element.getBoundingClientRect();
          const x = Number.isFinite(event?.clientX) ? event.clientX : area.left + area.width / 2;
          const y = Number.isFinite(event?.clientY) ? event.clientY : area.top + area.height / 2;
          tooltip.style.left = Math.max(10, Math.min(x - bounds.left + 14, bounds.width - tooltip.offsetWidth - 10)) + 'px';
          tooltip.style.top = Math.max(10, Math.min(y - bounds.top - tooltip.offsetHeight - 12, bounds.height - tooltip.offsetHeight - 10)) + 'px';
        };
        element.addEventListener('pointerenter', describe);
        element.addEventListener('pointermove', describe);
        element.addEventListener('mouseover', describe);
        element.addEventListener('focus', describe);
        element.addEventListener('click', event => { describe(event); compare(zip); });
        element.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); compare(zip); }
        });
        svg.append(element);
        paths.push({ element, zip });
      });
      get('zip-map').replaceChildren(svg);
      const controls = document.createElement('div');
      controls.className = 'zip-zoom-controls';
      [['+', 'Zoom in', 0.75], ['−', 'Zoom out', 1.33]].forEach(([label, title, factor]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'secondary';
        button.textContent = label; button.setAttribute('aria-label', title);
        button.addEventListener('click', () => zoom(factor));
        controls.append(button);
      });
      get('zip-map').append(controls);
      highlight();
      const subjectCode = subject.details['ZIP Code'];
      const subjectVisible = paths.some(item => item.zip === subjectCode);
      get('subject-zip-badge').textContent = subjectVisible
        ? 'Your home · ZIP ' + subjectCode + ' · highlighted'
        : 'Your home · ZIP ' + subjectCode + ' · outside this map';
      get('zip-map-status').textContent = options.statusMessage || 'Gold: your home’s ZIP   |     Brown: selected comparison ZIP. Pale areas have no historical examples. Click an area to compare.';
    } catch (error) {
      get('zip-map-status').textContent = 'The map could not load. Use the ZIP selector to explore sales.';
    }
  }


  return {
    // Load boundaries and draw this instance with its own selection and controls.
    render(nextOptions = {}) {
      options = {...options, ...nextOptions};
      subject = {details: {'ZIP Code': options.subjectZip || ''}};
      metadata = {comparison_counts: options.counts || {}};
      selectedZip = options.selectedZip || '';
      return drawMap();
    },
    // Update the selection when a user changes the accompanying ZIP field.
    select(zip) { selectedZip = zip; if (subject) highlight(); },
    // Restore the county-wide view after zooming.
    reset() { if (svg) { currentView = [...homeView]; svg.setAttribute('viewBox', currentView.join(' ')); } },
  };
};
