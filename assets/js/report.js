/* Read-only report UI. The browser requests public report data from this
   website only. No accounts, contact collection, delivery or browser storage. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const input = $('destination-search');
  const list = $('destination-options');
  const sheet = $('report-sheet');
  const body = $('report-body');
  const originalSample = body.cloneNode(true);
  const validId = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;
  const requestedId = new URLSearchParams(location.search).get('destination');
  const requested = validId(requestedId) ? requestedId : null;
  const infrastructure = /(?:https?:\/\/|www\.|(?:blob|table|dfs|queue)\.core|azurewebsites\.net|[?&]sig=|[<>]|\x00)/i;
  const safeText = (value, maximum, minimum = 1) => typeof value === 'string' && value.trim().length >= minimum && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value) && !infrastructure.test(value);
  const label = (place) => [place.name, place.admin].filter(Boolean).join(', ');
  const clean = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let destinations = [];
  let matches = [];
  let active = -1;
  let selected = null;
  let userChangedSelection = false;
  let reportSequence = 0;
  let reportController = null;
  let liveCatalogueApplied = false;
  let catalogState = 'loading';
  let catalogRequest = null;
  let freshnessTimer = null;
  let attemptedSlot = null;
  let lastAttemptAt = null;
  let displayedReportAt = null;
  const retryInterval = 5 * 60 * 1000;
  const retryWindow = 20 * 60 * 1000;
  const eastern = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const easternParts = (time) => Object.fromEntries(eastern.formatToParts(time).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const wallTime = (parts) => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0);

  function publicationWindow(now) {
    const local = easternParts(now);
    const currentWall = Date.UTC(local.year, local.month - 1, local.day, local.hour >= 12 ? 12 : 0);
    const resolve = (target) => {
      let candidate = target;
      for (let step = 0; step < 4; step += 1) {
        const correction = target - wallTime(easternParts(candidate));
        if (correction === 0) return candidate;
        candidate += correction;
      }
      throw new Error('Unavailable');
    };
    // Resolve both wall-clock slots independently. Their separation can be
    // eleven or thirteen hours on a daylight-saving transition day.
    return { current: resolve(currentWall), next: resolve(currentWall + 12 * 60 * 60 * 1000) };
  }

  function stopFreshnessTimer() {
    clearTimeout(freshnessTimer);
    freshnessTimer = null;
  }

  function retryAt(slot) {
    const checkpoint = Math.max(1, Math.floor((lastAttemptAt - slot) / retryInterval) + 1);
    return checkpoint <= 4 ? slot + checkpoint * retryInterval : null;
  }

  function checkPublication() {
    stopFreshnessTimer();
    if (!selected?.available || document.hidden) return;
    const now = Date.now();
    const { current } = publicationWindow(now);
    const due = retryAt(current);
    const stale = attemptedSlot !== current || (displayedReportAt !== null && displayedReportAt < current);
    // Four bounded retries at :05, :10, :15 and :20 allow the scheduled
    // publisher to finish. One second tolerates timer jitter at the last tick;
    // a suspended tab cannot resume an expired retry window.
    const retry = displayedReportAt === null && due !== null && now >= due && now <= current + retryWindow + 1000;
    if (stale || (!reportController && retry)) loadReport(selected);
    else scheduleFreshness();
  }

  function scheduleFreshness() {
    stopFreshnessTimer();
    if (!selected?.available || document.hidden || reportController) return;
    const now = Date.now();
    const { current, next } = publicationWindow(now);
    let wake = attemptedSlot !== current ? now : next;
    if (displayedReportAt === null && now <= current + retryWindow) {
      const due = retryAt(current);
      if (due !== null) wake = Math.min(wake, Math.max(now, due));
    }
    freshnessTimer = setTimeout(checkPublication, Math.max(0, wake - now));
  }

  function setQuery(destinationId) {
    // Retain only an approved destination identifier. Obsolete account links
    // are inert; discard their action, token and fragment before any fetch.
    const query = destinationId ? '?destination=' + encodeURIComponent(destinationId) : '';
    history.replaceState(null, '', location.pathname + query);
  }
  setQuery(requested);

  async function jsonRequest(path, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    // Allow the Functions host to cold-start before its bounded request runs.
    // This browser deadline does not extend the server's eight-second Blob read.
    const timeout = setTimeout(cancel, 30000);
    try {
      const response = await fetch(path, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) {
        const error = new Error('Unavailable');
        error.status = response.status;
        throw error;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Unavailable');
      if (Number(response.headers.get('content-length')) > 160000) throw new Error('Unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0;
      let text = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 160000) { await reader.cancel(); throw new Error('Unavailable'); }
        text += decoder.decode(value, { stream: true });
      }
      return JSON.parse(text + decoder.decode());
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }

  function isoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value.slice(0, 10);
  }

  function validReport(report, place) {
    const now = Date.now();
    const published = Date.parse(report?.reportDate);
    return report && report.status === 'available' && report.destinationId === place.id && safeText(report.title, 180)
      && typeof report.text === 'string' && report.text.trim().length >= 20 && report.text.length <= 24000 && !infrastructure.test(report.text)
      && isoDate(report.reportDate) && report.reportDate.includes('T') && Number.isFinite(report.radiusNm) && report.radiusNm > 0 && report.radiusNm <= 300
      && published >= publicationWindow(now).current && published <= now + 5 * 60 * 1000 && now - published <= 36 * 60 * 60 * 1000
      && Array.isArray(report.sourceDates) && report.sourceDates.length >= 1 && report.sourceDates.length <= 20
      && report.sourceDates.every((source) => source && safeText(source.label, 80) && isoDate(source.date));
  }

  function closeOptions() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function highlight(index) {
    active = index;
    [...list.querySelectorAll('[role="option"]')].forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) {
      const option = $('destination-option-' + active);
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function showOptions() {
    const query = clean(input.value);
    matches = destinations.filter((place) => clean(label(place)).includes(query)).slice(0, 30);
    list.replaceChildren();
    matches.forEach((place, i) => {
      const option = element('li');
      option.id = 'destination-option-' + i;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const detail = !liveCatalogueApplied
        ? (catalogState === 'loading' ? 'Checking report connection' : 'Report connection unavailable')
        : (place.available ? 'Check report' : 'No published report yet');
      option.append(element('span', label(place)), element('span', detail, 'destination-detail'));
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => selectDestination(place));
      list.append(option);
    });
    if (!matches.length) {
      const empty = element('li', 'No matching destination. Try another port, inlet or destination.', 'no-options');
      empty.setAttribute('role', 'presentation');
      list.append(empty);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(-1);
  }

  function cancelReport() {
    stopFreshnessTimer();
    displayedReportAt = null;
    attemptedSlot = null;
    lastAttemptAt = null;
    ++reportSequence;
    reportController?.abort();
    reportController = null;
    sheet.setAttribute('aria-busy', 'false');
    $('refresh-report').disabled = false;
  }

  function enteredDestination() {
    if (active >= 0) return matches[active] || null;
    const query = clean(input.value);
    if (!query) return null;
    // A highlighted choice wins. Otherwise accept an exact, unambiguous name
    // or the sole search result; never guess between similarly named ports.
    const exact = destinations.filter((place) => clean(label(place)) === query || clean(place.name) === query);
    if (exact.length === 1) return exact[0];
    return matches.length === 1 ? matches[0] : null;
  }

  function reportState(title, message) {
    const state = element('div', undefined, 'empty-report');
    state.append(element('h3', title), element('p', message));
    body.replaceChildren(state);
  }

  function clearSelection(message = 'Choose a destination from the results.') {
    cancelReport();
    selected = null;
    setQuery(null);
    $('selection-status').textContent = message;
    $('report-kind').textContent = 'Destination search';
    $('report-title').textContent = 'Choose your destination';
    $('report-meta').replaceChildren();
    $('report-notice').textContent = 'No report is selected.';
    $('sample-button').hidden = false;
    $('refresh-report').hidden = true;
    reportState('Choose a destination', 'Select a listed destination to check for a published report, or view the dated historical example.');
  }

  function selectDestination(place, automatic = false) {
    if (!automatic) userChangedSelection = true;
    selected = place;
    input.value = label(place);
    closeOptions();
    $('selection-status').textContent = 'Selected: ' + label(place) + '.';
    $('sample-button').hidden = false;
    $('refresh-report').hidden = liveCatalogueApplied && !place.available;
    setQuery(place.id);
    loadReport(place);
  }

  function showSample() {
    userChangedSelection = true;
    cancelReport();
    selected = null;
    input.value = '';
    closeOptions();
    $('report-kind').textContent = 'Historical example';
    $('report-title').textContent = 'Oregon Inlet, NC';
    $('report-meta').replaceChildren(element('time', '2 September 2026'), element('span', 'Water within 100 nm'));
    $('report-meta').firstChild.dateTime = '2026-09-02';
    $('report-notice').textContent = 'Example wording using the supplied sample values. Not current conditions.';
    body.replaceChildren(...[...originalSample.childNodes].map((node) => node.cloneNode(true)));
    $('selection-status').textContent = 'No destination selected.';
    $('sample-button').hidden = true;
    $('refresh-report').hidden = true;
    setQuery(null);
  }

  async function loadReport(place) {
    cancelReport();
    $('report-kind').textContent = 'Selected destination';
    $('report-title').textContent = label(place);
    $('report-meta').replaceChildren();
    if (!liveCatalogueApplied) {
      const connecting = catalogState === 'loading';
      sheet.setAttribute('aria-busy', String(connecting));
      $('refresh-report').hidden = false;
      $('refresh-report').disabled = connecting;
      $('refresh-report').textContent = connecting ? 'Connecting…' : 'Retry connection';
      $('report-notice').textContent = connecting
        ? 'Connecting to the report service for ' + label(place) + '. Availability has not been checked.'
        : 'The report service could not be reached for ' + label(place) + '. Select Retry connection to check again.';
      reportState((connecting ? 'Checking connection — ' : 'Connection unavailable — ') + label(place),
        'The destination list is available, but its report has not been checked. No other destination or historical example has been substituted.');
      return;
    }
    $('refresh-report').textContent = 'Refresh report';
    const sequence = reportSequence;
    reportController = new AbortController();
    sheet.setAttribute('aria-busy', 'true');
    $('refresh-report').disabled = true;
    $('report-notice').textContent = 'Checking for a published report for ' + label(place) + '.';
    reportState('Loading report — ' + label(place), 'The previous report and historical example are not used for this destination.');
    try {
      lastAttemptAt = Date.now();
      attemptedSlot = publicationWindow(lastAttemptAt).current;
      if (!place.available) throw new Error('Not published');
      const report = await jsonRequest('/api/reports/report?destination=' + encodeURIComponent(place.id), reportController.signal);
      if (sequence !== reportSequence) return;
      if (!validReport(report, place)) throw new Error('Unavailable');
      const date = new Date(report.reportDate);
      displayedReportAt = date.getTime();
      $('report-kind').textContent = 'Published report';
      $('report-meta').replaceChildren(element('time', date.toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })), element('span', 'Water within ' + report.radiusNm + ' nm'));
      $('report-meta').firstChild.dateTime = report.reportDate;
      $('report-notice').textContent = 'Use the report date and source dates below. Approximate areas are not confirmed current positions.';
      body.replaceChildren(element('pre', report.text, 'report-text'));
      const dates = element('section', undefined, 'report-section source-dates');
      dates.append(element('h3', 'Source dates'));
      report.sourceDates.forEach((source) => dates.append(element('p', source.label + ': ' + source.date, 'source-note')));
      body.prepend(dates);
    } catch (error) {
      if (sequence !== reportSequence) return;
      const missing = !place.available || error.status === 404;
      $('report-notice').textContent = missing
        ? 'No current report has been published for ' + label(place) + '.'
        : 'The report for ' + label(place) + ' could not be loaded. Try Refresh report.';
      reportState('Report unavailable — ' + label(place), missing
        ? 'Reports are scheduled for noon and midnight Eastern. Missing source data can leave a report unavailable. No other destination or historical example has been substituted.'
        : 'No other destination or historical example has been substituted. No current conditions are inferred from missing data.');
    } finally {
      if (sequence === reportSequence) {
        sheet.setAttribute('aria-busy', 'false');
        $('refresh-report').disabled = false;
        reportController = null;
        if (attemptedSlot !== null) scheduleFreshness();
      }
    }
  }

  input.addEventListener('input', () => {
    userChangedSelection = true;
    // Invalidate both the selection and its pending response before showing
    // new results. An old report must never appear under newly typed text.
    clearSelection();
    showOptions();
  });
  input.addEventListener('focus', showOptions);
  input.addEventListener('blur', closeOptions);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); closeOptions(); return; }
    if (event.key === 'Tab') { closeOptions(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) showOptions();
      if (matches.length) highlight(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (list.hidden) showOptions();
      const place = enteredDestination();
      if (place) selectDestination(place);
      else $('selection-status').textContent = matches.length
        ? 'Choose a destination from the matching results.'
        : 'No matching destination. Try another place name.';
    }
  });
  $('sample-button').addEventListener('click', showSample);
  $('refresh-report').addEventListener('click', () => {
    if (!selected) return;
    if (!liveCatalogueApplied) loadLiveCatalogue();
    else if (selected.available) loadReport(selected);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFreshnessTimer();
    else checkPublication();
  });
  window.addEventListener('pagehide', stopFreshnessTimer);
  window.addEventListener('pageshow', checkPublication);

  function applyCatalogue(catalog, isLive) {
    if (!Array.isArray(catalog?.destinations) || catalog.destinations.length > 1000) return false;
    if (!isLive && liveCatalogueApplied) return true;
    const ids = new Set();
    destinations = catalog.destinations.filter((place) => {
      if (!place || !validId(place.id) || !safeText(place.name, 120) || !safeText(place.admin, 100, 0) || ids.has(place.id)) return false;
      ids.add(place.id); return true;
    }).map((place) => ({ id: place.id, name: place.name.trim(), admin: place.admin.trim(), available: isLive && place.available === true }));
    if (isLive) { liveCatalogueApplied = true; catalogState = 'ready'; }
    input.disabled = destinations.length === 0;
    $('destination-help').textContent = destinations.length ? 'Type a place name. Select a result, or press Enter when there is one match. A listing does not guarantee a published report.' : 'No destinations are listed. The historical example remains readable.';
    if (isLive) $('service-status').textContent = destinations.some((place) => place.available) ? 'Reports are read here on the website. No account or email address is required.' : 'No published reports are available yet. The dated historical example remains readable.';
    if (selected) {
      const updated = destinations.find((place) => place.id === selected.id);
      if (updated) { selected = updated; if (isLive) selectDestination(updated, true); }
      else clearSelection('That destination is no longer listed. Choose another destination.');
    } else if (requested && !userChangedSelection) {
      const place = destinations.find((item) => item.id === requested);
      if (place) selectDestination(place, true);
      else if (isLive) clearSelection('That destination is not listed. Choose another destination.');
    }
    if (!list.hidden) showOptions();
    return true;
  }

  function loadLiveCatalogue() {
    // Only an explicit retry starts another catalog request. Concurrent clicks
    // share the existing request and its thirty-second network deadline.
    if (catalogRequest) return catalogRequest;
    catalogState = 'loading';
    $('service-status').textContent = 'Connecting to the report service. The dated historical example remains readable.';
    if (selected && !liveCatalogueApplied) loadReport(selected);
    if (!list.hidden) showOptions();
    catalogRequest = jsonRequest('/api/reports/catalog').then((data) => {
      if (!applyCatalogue(data, true)) throw new Error('Unavailable');
      return true;
    }).catch(() => {
      catalogState = 'failed';
      $('service-status').textContent = 'The report connection is unavailable. The dated historical example remains readable.';
      if (selected && !liveCatalogueApplied) loadReport(selected);
      if (!list.hidden) showOptions();
      return false;
    }).finally(() => { catalogRequest = null; });
    return catalogRequest;
  }

  async function loadCatalogue() {
    const fallback = jsonRequest('/data/report-destinations.json').then((data) => applyCatalogue(data, false)).catch(() => false);
    await Promise.all([fallback, loadLiveCatalogue()]);
    if (!destinations.length) $('destination-help').textContent = 'The destination list is unavailable. The historical example remains readable.';
    if (requested && !selected && !userChangedSelection) clearSelection('That destination is not listed. Choose another destination.');
  }
  loadCatalogue();
})();
