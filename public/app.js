// Find a page element by its ID.
const $ = (id) => document.getElementById(id);

// Format a dollar amount for display.
const money = (n) => n == null ? 'No sales available' : new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
}).format(n);
let config, lastResult, marketRequest = 0;
let marketRows = [];
let marketPage = 0;

// Read JSON safely, including when the hosting platform returns a plain-text error.
async function request(url, options) {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    if (!response.ok) {
      throw new Error('The server could not load the property service (HTTP ' + response.status + '). Please try again shortly.');
    }
    throw new Error('The property service returned an unexpected response. Please try again shortly.');
  }
  if (!response.ok) {
    throw new Error(data?.error || 'The property service is unavailable (HTTP ' + response.status + ').');
  }
  return data;
}

// Add a supported value and description to a suggestion list.
function option(select, value, label = value) {
  const item = new Option(label, value);
  item.label = label;
  select.append(item);
}

// Build a reusable metric or historical-sale card.
function card(title, value, note = '') {
  const article = document.createElement('article');
  article.className = 'card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const number = document.createElement('strong');
  number.className = 'metric';
  number.textContent = value;
  const description = document.createElement('p');
  description.className = 'muted';
  description.textContent = note;
  article.append(heading, number, description);
  return article;
}

// Draw a monthly line chart, keeping gaps where no sale-price median exists.
function chart(rows, field, title) {
  const article = document.createElement('article');
  article.className = 'card chart-card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 480 220');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title + '. Full timeline shown; exact monthly values are in the table below.');
  const maximum = Math.max(1, ...rows.map(row => row[field] || 0));
  let segment = [];

  // Finish one continuous segment without connecting across missing medians.
  function drawSegment() {
    if (!segment.length) return;
    const path = document.createElementNS(ns, 'polyline');
    path.setAttribute('points', segment.join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#8e6541');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    segment = [];
  }

  // Label the y-axis and add quiet reference lines for comparison.
  [0, 0.5, 1].forEach(fraction => {
    const y = 174 - fraction * 138;
    const grid = document.createElementNS(ns, 'line');
    grid.setAttribute('x1', '65');
    grid.setAttribute('x2', '460');
    grid.setAttribute('y1', y);
    grid.setAttribute('y2', y);
    grid.setAttribute('stroke', '#bba694');
    grid.setAttribute('stroke-opacity', '0.35');
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', '58');
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', '#75614f');
    const value = maximum * fraction;
    text.textContent = field === 'median'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
      : Math.round(value).toLocaleString();
    svg.append(grid, text);
  });

  rows.forEach((row, index) => {
    if (row[field] == null) {
      drawSegment();
      return;
    }
    const x = 65 + index * 395 / Math.max(1, rows.length - 1);
    const y = 174 - row[field] / maximum * 138;
    segment.push(x + ',' + y);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', '3');
    dot.setAttribute('class', 'chart-point');
    const tip = document.createElementNS(ns, 'title');
    tip.textContent = row.month + ': ' + (field === 'median' ? money(row[field]) : row[field] + ' sales');
    dot.append(tip);
    svg.append(dot);
  });
  drawSegment();
  [[65, rows[0]?.month || ''], [415, rows[rows.length - 1]?.month || '']].forEach(([x, label]) => {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', '202');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#75614f');
    text.textContent = label;
    svg.append(text);
  });
  article.append(heading, svg);
  return article;
}

// Show the selected number of monthly rows and keep older months accessible.
function renderMarketRows() {
  const limit = Number($('row-limit').value);
  const pages = Math.max(1, Math.ceil(marketRows.length / limit));
  marketPage = Math.max(0, Math.min(marketPage, pages - 1));
  const start = marketPage * limit;
  $('market-rows').replaceChildren();
  marketRows.slice(start, start + limit).forEach(row => {
    const tr = document.createElement('tr');
    [row.month, row.count.toLocaleString(), money(row.median)].forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    $('market-rows').append(tr);
  });
  $('row-summary').textContent = marketRows.length
    ? 'Showing ' + (start + 1) + '–' + Math.min(start + limit, marketRows.length) + ' of ' + marketRows.length + ' monthly records'
    : 'No monthly records to show';
  $('previous-rows').disabled = marketPage === 0;
  $('next-rows').disabled = marketPage >= pages - 1;
}

// Change table size without shortening either chart's full timeline.
$('row-limit').addEventListener('change', () => {
  marketPage = 0;
  renderMarketRows();
});
$('previous-rows').addEventListener('click', () => {
  marketPage--;
  renderMarketRows();
});
$('next-rows').addEventListener('click', () => {
  marketPage++;
  renderMarketRows();
});

// Show the page named in the URL and update navigation.
function route() {
  const page = ['home', 'estimate', 'market', 'about'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('.page').forEach(el => {
    el.hidden = el.id !== page;
  });
  document.querySelectorAll('nav a').forEach(el => {
    if (el.hash === '#' + page) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  if (page === 'market' && config) loadMarket();
  window.scrollTo(0, 0);
}

// Refresh neighborhood suggestions when the property ZIP changes.
function neighborhoods() {
  $('neighborhood-options').replaceChildren();
  $('neighborhood').value = '';
  (config.neighborhoods[$('zip').value.trim()] || []).forEach(code => option($('neighborhood-options'), code));
  validateChoices();
}

// Require supported codes while allowing users to type and filter suggestions.
function validateChoices() {
  if (!config) return false;
  const zip = $('zip').value.trim();
  const neighborhood = $('neighborhood').value.trim();
  const propertyClass = $('property-class').value.trim();
  $('zip').setCustomValidity(config.zip_codes.includes(zip) ? '' : 'Choose a supported ZIP from the suggestions.');
  $('neighborhood').setCustomValidity(!neighborhood || (config.neighborhoods[zip] || []).includes(neighborhood) ? '' : 'Choose a neighborhood listed for this ZIP, or leave it blank.');
  $('property-class').setCustomValidity(Object.hasOwn(config.house_classes, propertyClass) ? '' : 'Choose a supported Assessor class code from the suggestions.');
  return !$('zip').validationMessage && !$('neighborhood').validationMessage && !$('property-class').validationMessage;
}

// Load market summaries and ignore outdated responses.
async function loadMarket() {
  window.zipExplorer.syncMarketZip($('market-zip').value.trim());
  const requestId = ++marketRequest;
  $('market-status').textContent = 'Loading recorded sales…';
  marketRows = [];
  renderMarketRows();
  try {
    const data = await request('/api/estimate?view=market&zip=' + encodeURIComponent($('market-zip').value.trim()));
    if (requestId !== marketRequest) return;
    $('market-metrics').replaceChildren(card('Recorded transactions', data.count.toLocaleString(), 'Transactions in the selected sample'), card('Median sale price', money(data.median), 'Across all covered years'));
    $('market-rows').replaceChildren();
    // Include gaps explicitly rather than implying that adjacent observed months are consecutive.
    const lookup = new Map(data.months.map(row => [row.month, row]));
    const months = [];
    for (let year = 2019;
         year <= 2026; year++) for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2,'0')}`;
      if (key >= '2019-09' && key <= '2026-08') months.push(lookup.get(key) || {
        month: key, count: 0, median: null
      });
    }
    $('market-charts').replaceChildren(chart(months, 'count', 'Monthly sales activity'), chart(months, 'median', 'Monthly median sale price'));
    marketRows = months.slice().reverse();
    marketPage = 0;
    renderMarketRows();
    $('market-periods').replaceChildren(...data.periods.map(p => card(String(p.year), money(p.median), `${p.count.toLocaleString()} sales · January 1–${p.end}`)));
    $('market-status').textContent = data.count ? 'Sales loaded. Latest month is incomplete.' : 'No recorded sales in this sample for the selected ZIP.';
  }
  catch (error) {
    if (requestId===marketRequest) {
      $('market-status').textContent = error.message;
      $('market-metrics').replaceChildren();
      $('market-rows').replaceChildren();
      $('market-periods').replaceChildren();
      $('market-charts').replaceChildren();
    }
  }
}

// Keep dependent suggestions and validation in sync while typing.
$('zip').addEventListener('input', neighborhoods);
$('neighborhood').addEventListener('input', validateChoices);
$('property-class').addEventListener('input', validateChoices);

// Load a market only once a complete supported ZIP is entered; blank means all ZIPs.
$('market-zip').addEventListener('input', () => {
  if (!config) return;
  const zip = $('market-zip').value.trim();
  const valid = !zip || config.market_zip_codes.includes(zip);
  $('market-zip').setCustomValidity(valid ? '' : 'Choose a supported ZIP from the suggestions.');
  if (valid) loadMarket();
  else {
    marketRequest++;
    marketRows = [];
    renderMarketRows();
    $('market-status').textContent = 'Type or select a supported ZIP to update the results.';
    ['market-metrics', 'market-charts', 'market-rows', 'market-periods'].forEach(id => $(id).replaceChildren());
  }
});

// Submit validated property inputs and display the estimate and supporting sales.
$('property-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!validateChoices()) {
    event.target.reportValidity();
    return;
  }
  $('form-error').hidden = true;
  $('submit').disabled = true;
  $('submit').textContent = 'Calculating…';
  $('result').hidden = true;
  try {
    const details = Object.fromEntries(new FormData(event.target));
    ['ZIP Code', 'Neighborhood Code', 'Property Class'].forEach(key => {
      details[key] = details[key].trim();
    });
    ['Building Area (sq ft)', 'Land Area (sq ft)', 'Year Built', 'Bedrooms', 'Full Bathrooms', 'Half Bathrooms'].forEach(key => {
      details[key] = Number(details[key]);
    });
    const data = await request('/api/estimate', {
      method: 'POST', headers: {
        'Content-Type': 'application/json'
      }, body: JSON.stringify(details)
    });
    lastResult = data;
    $('price').textContent = money(data.price);
    $('result-date').textContent = 'Estimate date: '+data.details['Valuation Date'];
    $('result-location').textContent = 'ZIP ' + data.details['ZIP Code'] + ' · ' + (data.details['Property Class'] === '295' ? 'Townhome / row house' : 'Single-family home');
    $('result-features').replaceChildren();
    const features = [
      ['Bedrooms', data.details.Bedrooms],
      ['Bathrooms', data.details['Full Bathrooms'] + ' full · ' + data.details['Half Bathrooms'] + ' half'],
      ['Building area', Number(data.details['Building Area (sq ft)']).toLocaleString() + ' sq ft'],
      ['Year built', data.details['Year Built']],
    ];
    features.forEach(([label, value]) => {
      const item = document.createElement('div');
      const number = document.createElement('strong');
      const caption = document.createElement('span');
      number.textContent = value;
      caption.textContent = label;
      item.append(number, caption);
      $('result-features').append(item);
    });
    $('property-summary').replaceChildren();
    $('property-summary-secondary').replaceChildren();
    const detailEntries = Object.entries(data.details);
    const splitAt = Math.ceil(detailEntries.length / 2);
    detailEntries.forEach(([key, value], index) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = value === '' ? 'Not provided' : key === 'Property Class' ? value + ' — ' + config.house_classes[value] : value;
      $(index < splitAt ? 'property-summary' : 'property-summary-secondary').append(dt, dd);
    });
    $('property-form').hidden = true;
    $('result').hidden = false;
    window.zipExplorer.show(data, config);
    $('result').focus();
    $('result').scrollIntoView( {
      behavior: 'smooth', block: 'start'
    });
  }
  catch (error) {
    $('form-error').textContent = error.message;
    $('form-error').hidden = false;
  }
  finally {
    $('submit').disabled = false;
    $('submit').textContent = 'See My Estimate →';
  }
});

// Return to the form without losing entered values.
$('edit').addEventListener('click', () => {
  $('result').hidden = true;
  $('property-form').hidden = false;
  $('zip').focus();
});

// Save the latest estimate and entered details as a JSON file.
$('download').addEventListener('click', () => {
  if (!lastResult) return;
  const file = new Blob([JSON.stringify( {
    ...lastResult.details, 'Predicted Sale Price (USD)': lastResult.price, Model: lastResult.model
  }, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url;
  link.download = 'chicago_property_summary.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('hashchange', route);
route();

// Accept older API metadata while a restarted or redeployed backend catches up.
function normalizeMetadata(data) {
  if (!Array.isArray(data?.zip_codes) || !data.zip_codes.length || !data.house_classes || !data.today) {
    throw new Error('The property service returned incomplete setup information. Restart the local server or redeploy the latest backend.');
  }
  return {
    ...data,
    neighborhoods: data.neighborhoods || {},
    market_zip_codes: Array.isArray(data.market_zip_codes) ? data.market_zip_codes : data.zip_codes,
    comparison_counts: data.comparison_counts || {},
    market_counts: data.market_counts || {},
  };
}

// Load supported choices and model information before enabling the form.
Promise.all([
  request('/api/estimate'),
  request('/assets/chicago-zip-boundaries.geojson'),
]).then(([responseData, boundaries]) => {
  const data = normalizeMetadata(responseData);
  // Cross-check API choices against the map, including when an older API is running.
  const chicagoZips = new Set(boundaries.features.map(feature => String(feature.properties.zip)));
  data.zip_codes = data.zip_codes.filter(zip => chicagoZips.has(zip));
  data.market_zip_codes = data.market_zip_codes.filter(zip => chicagoZips.has(zip));
  if (!data.zip_codes.length) throw new Error('No supported Chicago ZIPs were returned by the property service.');
  $('zip-options').replaceChildren();
  $('market-zip-options').replaceChildren();
  $('class-options').replaceChildren();
  config = data;
  data.zip_codes.forEach(zip => {
    option($('zip-options'), zip);

  });
  data.market_zip_codes.forEach(zip => option($('market-zip-options'), zip));
  if (responseData.market_counts) {
    window.zipExplorer.showMarket(data);
  } else {
    $('market-map-status').textContent = 'Restart the local Python server or deploy the latest backend to load Chicago map coverage.';
  }
  Object.entries(data.house_classes).forEach(([code, label]) => option($('class-options'), code, code+' — '+label));
  $('zip').value = data.zip_codes.includes('60607') ? '60607' : data.zip_codes[0];
  $('property-class').value = '203';
  neighborhoods();
  $('estimate-date').textContent = data.today;
  $('year-built').max = data.today.slice(0, 4);
  $('accuracy').replaceChildren(card('Holdout average absolute error', money(data.mae), 'Average across evaluated sales; not an individual price range'), card('Within 20% of actual sale price', (data.within20*100).toFixed(1)+'%', 'Results for the exported model and supported evaluated inputs'));
  $('loading').hidden = true;
  $('property-form').hidden = false;
  if (location.hash==='#market') loadMarket();
}).catch (error => {
  $('loading').textContent = error.message+' Reload the page to retry.';
  $('market-status').textContent = error.message;
  $('accuracy').textContent = 'Accuracy information could not be loaded. Please reload.';
});

// Optional local photography; the metallic artwork remains when no image is supplied.
const heroImage = $('hero-image');
heroImage.addEventListener('load', () => {
  heroImage.hidden = false;
});
heroImage.addEventListener('error', () => {
  heroImage.hidden = true;
});
heroImage.src = '/assets/chicago-images.jpg';

// Keep the contact panel state and its accessible toggle label synchronized.
const contactDock = $('contact-dock');
const contactToggle = $('contact-toggle');
let contactPinned = false;
function setContactOpen(open) {
  $('contact-panel').hidden = !open;
  contactToggle.setAttribute('aria-expanded', String(open));
  contactToggle.setAttribute('aria-label', open ? 'Close project and team contacts' : 'Open project and team contacts');
}

// Reveal contacts on mouse hover without interfering with touch activation.
contactDock.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') setContactOpen(true);
});
contactDock.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse' && !contactPinned && !contactDock.contains(document.activeElement)) {
    setContactOpen(false);
  }
});

// Clicking or tapping pins the panel open until toggled or dismissed.
contactToggle.addEventListener('click', () => {
  contactPinned = !contactPinned;
  setContactOpen(contactPinned);
});

// Keep the panel available while navigating its links with the keyboard.
contactDock.addEventListener('focusout', event => {
  if (!contactPinned && !contactDock.contains(event.relatedTarget) && !contactDock.matches(':hover')) {
    setContactOpen(false);
  }
});

// Dismiss contacts with Escape and return keyboard focus to the toggle.
contactDock.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    contactPinned = false;
    setContactOpen(false);
    contactToggle.focus();
  }
});

// Close the floating panel when a user clicks elsewhere on the page.
document.addEventListener('pointerdown', event => {
  if (!contactDock.contains(event.target)) {
    contactPinned = false;
    setContactOpen(false);
  }
});

// Replace inconsistent native suggestion popups with searchable, keyboard-friendly lists.
function setupSearchDropdown(inputId, sourceId, emptyLabel) {
  const input = $(inputId);
  const source = $(sourceId);
  input.removeAttribute('list');
  const shell = document.createElement('span');
  shell.className = 'search-dropdown';
  input.parentNode.insertBefore(shell, input);
  shell.append(input);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'dropdown-toggle';
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.setAttribute('fill', 'none');
  const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevronPath.setAttribute('d', 'm7 10 5 5 5-5');
  chevronPath.setAttribute('stroke', 'currentColor');
  chevronPath.setAttribute('stroke-width', '1.7');
  chevronPath.setAttribute('stroke-linecap', 'round');
  chevronPath.setAttribute('stroke-linejoin', 'round');
  chevron.append(chevronPath);
  toggle.append(chevron);
  toggle.setAttribute('aria-label', 'Show ' + inputId.replaceAll('-', ' ') + ' choices');
  const popup = document.createElement('ul');
  popup.id = inputId + '-popup';
  popup.className = 'dropdown-options';
  popup.setAttribute('role', 'listbox');
  popup.setAttribute('aria-label', inputId.replaceAll('-', ' ') + ' choices');
  popup.hidden = true;
  document.body.append(popup);
  shell.append(toggle);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', popup.id);
  toggle.setAttribute('aria-controls', popup.id);
  toggle.setAttribute('aria-expanded', 'false');
  let choices = [];
  let active = -1;

  // Place the popup above other glass layers, opening upward if space is limited.
  function position() {
    const bounds = shell.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom - 12;
    const above = bounds.top - 12;
    const upwards = below < 200 && above > below;
    popup.style.left = Math.max(8, bounds.left) + 'px';
    popup.style.width = Math.min(bounds.width, window.innerWidth - 16) + 'px';
    popup.style.maxHeight = Math.max(90, Math.min(280, upwards ? above : below)) + 'px';
    popup.style.top = upwards ? 'auto' : bounds.bottom + 6 + 'px';
    popup.style.bottom = upwards ? window.innerHeight - bounds.top + 6 + 'px' : 'auto';
  }

  // Close the popup while preserving the user's typed or selected value.
  function close() {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  // Commit a supported choice and notify existing ZIP and class validation handlers.
  function choose(value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    input.focus({ preventScroll: true });
  }

  // Highlight a choice for arrow-key navigation without changing the form value.
  function highlight(index) {
    active = index;
    Array.from(popup.children).forEach((item, i) => {
      item.setAttribute('aria-selected', String(i === active));
    });
    const selected = popup.children[active];
    if (selected) {
      input.setAttribute('aria-activedescendant', selected.id);
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  // Show every choice on click, then filter by code or description while typing.
  function open(filter = '') {
    const query = filter.trim().toLowerCase();
    choices = Array.from(source.options).map(item => ({ value: item.value, label: item.label || item.value }));
    if (emptyLabel) choices.unshift({ value: '', label: emptyLabel });
    choices = choices.filter(item => (item.value + ' ' + item.label).toLowerCase().includes(query));
    popup.replaceChildren();
    active = -1;
    input.removeAttribute('aria-activedescendant');
    choices.forEach((choice, index) => {
      const item = document.createElement('li');
      item.id = popup.id + '-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.textContent = choice.label;
      item.addEventListener('pointerdown', event => event.preventDefault());
      item.addEventListener('click', () => choose(choice.value));
      popup.append(item);
    });
    if (!choices.length) {
      const message = document.createElement('li');
      message.className = 'dropdown-empty';
      message.textContent = inputId === 'neighborhood' ? 'No matches. Check the ZIP or leave this blank.' : 'No matching choices. Try another code.';
      popup.append(message);
    }
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    position();
  }

  input.addEventListener('click', () => open());
  input.addEventListener('input', () => open(input.value));
  toggle.addEventListener('pointerdown', event => event.preventDefault());
  toggle.addEventListener('click', event => {
    event.preventDefault();
    if (popup.hidden) { input.focus(); open(); }
    else close();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) open();
      if (choices.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
    }
    if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault();
      if (active >= 0 && choices[active]) choose(choices[active].value);
      else if (choices.length === 1) choose(choices[0].value);
      else close();
    }
  });
  input.addEventListener('blur', close);
  document.addEventListener('pointerdown', event => {
    if (!shell.contains(event.target) && !popup.contains(event.target)) close();
  });
  window.addEventListener('resize', close);
  window.addEventListener('scroll', event => {
    if (!popup.contains(event.target)) close();
  }, true);
}

setupSearchDropdown('zip', 'zip-options');
setupSearchDropdown('neighborhood', 'neighborhood-options', 'Not provided');
setupSearchDropdown('property-class', 'class-options');
setupSearchDropdown('market-zip', 'market-zip-options', 'All available ZIPs');

// Jump to comparison sales without changing the app's active page route.
$('scroll-comparisons').addEventListener('click', () => {
  $('zip-explorer-heading').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
