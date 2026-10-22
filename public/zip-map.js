/* Keep comparison sales and market exploration independent of each other. */
(() => {
  const get = (id) => document.getElementById(id);
  const dollars = (value) => value == null ? 'No sales' : new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);
  let subject, metadata, selectedZip;
  let comparisonRequest = 0;
  const resultMap = window.createCountyMap({
    container: 'zip-map', status: 'zip-map-status', tooltip: 'zip-map-tooltip',
    badge: 'subject-zip-badge', onSelect: zip => {
      if (!Array.from(get('comparison-zip').options).some(item => item.value === zip)) {
        get('comparison-zip').add(new Option(zip, zip));
      }
      compare(zip);
    },
  });
  const marketMap = window.createCountyMap({
    container: 'market-area-map', status: 'market-map-status', tooltip: 'market-map-tooltip',
    onSelect: zip => {
      get('market-zip').value = zip;
      get('market-zip').dispatchEvent(new Event('input', {bubbles: true}));
    },
  });

  // Keep the result map in sync with the comparison selector.
  function highlight() { resultMap.select(selectedZip); }

  // Display exact historical examples, preserving the original estimated value.
  async function compare(zip) {
    selectedZip = zip;
    get('comparison-zip').value = zip;
    highlight();
    const requestId = ++comparisonRequest;
    get('comparison-status').textContent = 'Loading sales in ZIP ' + zip + '…';
    get('comparison-rows').replaceChildren();
    get('comparison-metrics').replaceChildren();
    try {
      const response = await fetch('/api/estimate', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: 'comparisons', zip, details: subject.details }),
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error('The sales service is unavailable. Please try another ZIP or retry shortly.'); }
      if (!response.ok) throw new Error(data.error || 'Unable to load sales.');
      if (requestId !== comparisonRequest) return;

      // Build summary cards using the saved estimate, not a different-ZIP prediction.
      [['Your home · ZIP ' + subject.details['ZIP Code'], dollars(subject.price)],
        ['Median of displayed sales · ZIP ' + zip, dollars(data.median)]].forEach(([title, value]) => {
        const article = document.createElement('article');
        article.className = 'card';
        const heading = document.createElement('h3');
        heading.textContent = title;
        const amount = document.createElement('strong');
        amount.className = 'metric';
        amount.textContent = value;
        article.append(heading, amount);
        get('comparison-metrics').append(article);
      });
      const rows = [{ subject: true, ...subject.details }, ...data.sales];
      rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        const own = index === 0;
        if (own) tr.className = 'subject-row';
        const values = own
          ? ['Your home (estimate)', row['ZIP Code'], Number(row['Building Area (sq ft)']).toLocaleString() + ' sq ft', row.Bedrooms, row['Full Bathrooms'], dollars(subject.price), 'Not a recorded sale']
          : ['Historical sale ' + index, row.zip_code, Number(row.char_bldg_sf).toLocaleString() + ' sq ft', row.char_beds, row.char_fbath, dollars(Number(row.sale_price)), row.sale_date.slice(0, 10)];
        values.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        });
        get('comparison-rows').append(tr);
      });
      get('comparison-status').textContent = data.sales.length
        ? 'Showing ' + data.sales.length + ' examples from ' + data.available + ' available sales in ZIP ' + zip + '. Building area uses exterior measurements.'
        : 'No historical examples are available in ZIP ' + zip + '. Select another area. Your estimate is unchanged.';
    } catch (error) {
      if (requestId === comparisonRequest) get('comparison-status').textContent = error.message;
    }
  }


  // Start a fresh result without changing the original property's estimate.
  function show(result, config) {
    subject = result;
    metadata = config;
    get('subject-zip-badge').textContent = 'Your home · ZIP ' + result.details['ZIP Code'];
    get('comparison-zip').replaceChildren();
    const codes = config.market_zip_codes;
    codes.forEach(zip => get('comparison-zip').add(new Option(zip, zip)));
    compare(subject.details['ZIP Code']);
    resultMap.render({subjectZip: subject.details['ZIP Code'], selectedZip: subject.details['ZIP Code'], counts: config.comparison_counts});
  }

  // The market map can be explored before requesting a property estimate.
  function showMarket(config) {
    marketMap.render({selectedZip: get('market-zip').value.trim(), counts: config.market_counts,
      countLabel: 'recorded transactions',
      statusMessage: 'Choose a ZIP to update the summary, charts, and table. Pale areas have no recorded sales in the supplied sample.'});
  }

  get('comparison-zip').addEventListener('change', event => compare(event.target.value));
  get('reset-comparison').addEventListener('click', () => compare(subject.details['ZIP Code']));
  get('reset-zip-map').addEventListener('click', () => resultMap.reset());
  get('reset-market-map').addEventListener('click', () => marketMap.reset());
  window.zipExplorer = {show, showMarket, syncMarketZip: zip => marketMap.select(zip)};
})();
