// content.js - Runs in the Manage My Health page context
(function() {
  'use strict';
  // ---- Parsing helpers ----
  function parseValueString(valueStr) {
    if (!valueStr || !valueStr.trim()) return { value: '', unit: '', range: '', rangeMin: '', rangeMax: '' };
    const s = valueStr.trim();
    const rangeMatch = s.match(/^(.+?)\\s*\\(\\s*(.+?)\\s*\\)\\s*$/);
    let valuePart = s, rangePart = '';
    if (rangeMatch) { valuePart = rangeMatch[1].trim(); rangePart = rangeMatch[2].trim(); }
    const xUnitMatch = valuePart.match(/^([<>]?\\s*[\\d.]+)\\s+(x\\s+10e[\\d]+\\/\\S+)\\s*$/);
    const simpleMatch = valuePart.match(/^([<>]?\\s*[\\d.]+(?:\\s*x\\s+[\\d.e]+\\S*)?)\\s+(\\S.+?)\\s*$/);
    let value = valuePart, unit = '';
    if (xUnitMatch) { value = xUnitMatch[1].trim(); unit = xUnitMatch[2].trim(); }
    else if (simpleMatch) { value = simpleMatch[1].trim(); unit = simpleMatch[2].trim(); }
    let rangeMin = '', rangeMax = '';
    if (rangePart) {
      const minMax = rangePart.match(/^([<>]?\\s*[\\d.]+)\\s*[-\\u2013]\\s*([<>]?\\s*[\\d.]+)$/);
      if (minMax) { rangeMin = minMax[1].trim(); rangeMax = minMax[2].trim(); }
      else { rangeMin = rangePart; }
    }
    return { value, unit, range: rangePart, rangeMin, rangeMax };
  }
  function parseTabularSpan(text) {
    const t = text.trim();
    if (!t || t === 'Ref. Range' || t.startsWith('Validated by')) return null;
    const withRange = t.match(/^(\\S+)\\s+([\\d.]+)\\s+(\\S+)\\s+\\((.+?)\\)\\s*$/);
    if (withRange) {
      const rangeParts = withRange[4].trim().match(/^([<>]?\\s*[\\d.]+)\\s*[-\\u2013]\\s*([<>]?\\s*[\\d.]+)$/);
      return {
        testName: withRange[1], value: withRange[2], unit: withRange[3],
        range: withRange[4].trim(),
        rangeMin: rangeParts ? rangeParts[1].trim() : withRange[4].trim(),
        rangeMax: rangeParts ? rangeParts[2].trim() : '',
        comments: ''
      };
    }
    const noRange = t.match(/^(\\S+)\\s+([\\d.]+)\\s+(\\S+)\\s*$/);
    if (noRange) {
      return { testName: noRange[1], value: noRange[2], unit: noRange[3], range: '', rangeMin: '', rangeMax: '', comments: '' };
    }
    return null;
  }
  function getFieldListValue(body, labelText) {
    for (const fl of body.querySelectorAll('.field-list')) {
      const label = fl.querySelector('label');
      if (label && label.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
        const p = fl.querySelector('p');
        return p ? p.textContent.trim() : '';
      }
    }
    return '';
  }
  const SKIP_LABELS = new Set(['Patient Details', 'Ref. Range', '']);
  const META_LABELS = new Set(['Ordered by:', 'Laboratory:', 'Observation date:']);
  const COMMENT_LABELS = new Set(['Comment:', 'Comments:']);
  // ---- Sensitive result filter ----
  const SENSITIVE_TERMS = [
    'sti', 'std', 'hiv', 'sexually transmitted',
    'chlamydia', 'gonorrhoea', 'gonorrhea', 'syphilis',
    'herpes', 'hepatitis b', 'hepatitis c', 'hbsag',
    'anti-hcv', 'anti-hiv', 'hiv-1', 'hiv-2',
    'tpha', 'vdrl', 'rpr', 'treponema', 'hpv',
    'trichomonas', 'mycoplasma', 'ureaplasma'
  ];
  function isSensitiveResult(record) {
    const checkStr = (
      record.groupName + ' ' +
      record.orderedBy + ' ' +
      record.laboratory
    ).toLowerCase();
    return SENSITIVE_TERMS.some(term => checkStr.includes(term));
  }
  // ---- End sensitive result filter ----
  function parsePanelBody(body, groupName) {
    let testResultsP = null;
    for (const fl of body.querySelectorAll('.field-list')) {
      const label = fl.querySelector('label');
      if (label && label.textContent.includes('Test Results')) {
        testResultsP = fl.querySelector('p');
        break;
      }
    }
    if (!testResultsP) return null;
    const items = [];
    let orderedBy = '', laboratory = '', observationDate = '';
    const hasRefRange = testResultsP.textContent.includes('Ref. Range');
    if (hasRefRange) {
      const allSpans = Array.from(testResultsP.querySelectorAll('span'));
      const refRangeIdx = allSpans.findIndex(s => s.textContent.trim() === 'Ref. Range');
      if (refRangeIdx >= 0) {
        for (let i = refRangeIdx + 1; i < allSpans.length; i++) {
          const spanText = allSpans[i].textContent.trim();
          if (!spanText || spanText === 'Ref. Range' || spanText.startsWith('Validated by')) continue;
          if (spanText === 'Ordered by:' || spanText === 'Laboratory:' || spanText === 'Observation date:') break;
          const parsed = parseTabularSpan(spanText);
          if (parsed) items.push(parsed);
        }
      }
    }
    const bElements = Array.from(testResultsP.querySelectorAll('b'));
    for (const b of bElements) {
      const labelSpan = b.querySelector('span');
      const label = labelSpan ? labelSpan.textContent.trim() : b.textContent.trim();
      if (SKIP_LABELS.has(label)) continue;
      if (label.startsWith('Patient Name:') || label.startsWith('NHI No:') || label.startsWith('Date of Birth:')) continue;
      if (label.startsWith('Validated by') || label === 'Patient Details') continue;
      const parent = b.parentElement;
      if (!parent) continue;
      const siblings = Array.from(parent.childNodes);
      const bIdx = siblings.indexOf(b);
      const valueSpans = [];
      for (let i = bIdx + 1; i < siblings.length; i++) {
        const node = siblings[i];
        if (node.nodeType === 1 && node.tagName === 'B') break;
        if (node.nodeType === 1 && node.tagName === 'SPAN' && node.textContent.trim()) {
          valueSpans.push(node.textContent.trim());
        }
      }
      const valueText = valueSpans.join(' ').trim();
      if (label === 'Ordered by:') { orderedBy = valueText; continue; }
      if (label === 'Laboratory:') { laboratory = valueText; continue; }
      if (label === 'Observation date:') { observationDate = valueText; continue; }
      if (COMMENT_LABELS.has(label)) {
        if (items.length > 0 && valueText) {
          const last = items[items.length - 1];
          last.comments = (last.comments ? last.comments + ' | ' : '') + valueText;
        }
        continue;
      }
      if (!valueText) continue;
      const testName = label.replace(/:$/, '').trim();
      if (items.some(it => it.testName === testName)) continue;
      const parsed = parseValueString(valueText);
      items.push({ testName, ...parsed, comments: '' });
    }
    return {
      groupName,
      dateReceived: getFieldListValue(body, 'Date received'),
      dateUploaded: getFieldListValue(body, 'Date uploaded'),
      clinicianComments: getFieldListValue(body, 'Clinician comments'),
      location: getFieldListValue(body, 'Location Name'),
      doctor: getFieldListValue(body, 'Doctor'),
      orderedBy,
      laboratory,
      observationDate,
      items
    };
  }
  function parseCurrentPage() {
    const results = [];
    for (const panel of document.querySelectorAll('mat-expansion-panel')) {
      const body = panel.querySelector('.mat-expansion-panel-body');
      if (!body) continue;
      if (!body.textContent.includes('Ordered by:') && !body.textContent.includes('Test Results')) continue;
      const header = panel.querySelector('mat-expansion-panel-header');
      if (!header) continue;
      const h2 = header.querySelector('h2');
      const groupName = h2 ? h2.textContent.trim() : 'Unknown';
      const record = parsePanelBody(body, groupName);
      if (record) results.push(record);
    }
    return results;
  }
  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function expandAllPanels() {
    for (const panel of document.querySelectorAll('mat-expansion-panel')) {
      if (!panel.classList.contains('mat-expanded')) {
        const headerBtn = panel.querySelector('mat-expansion-panel-header');
        if (headerBtn) { headerBtn.click(); await sleep(200); }
      }
    }
    await sleep(500);
  }
  function getTotalRecords() {
    const infoEl = document.querySelector('.k-pager-info');
    if (infoEl) {
      const match = infoEl.textContent.match(/of (\\d+) Records/i);
      if (match) return parseInt(match[1]);
    }
    return 0;
  }
  function getCurrentPage() {
    const btn = document.querySelector('.k-pager-numbers .k-selected, button[aria-current="true"], .k-pager-numbers button[aria-pressed="true"]');
    if (btn) return parseInt(btn.textContent.trim());
    const select = document.querySelector('select[aria-label="Select page"]');
    if (select) return parseInt(select.value) || 1;
    return 1;
  }
  async function collectAllResults() {
    const allResults = [];
    try {
      const totalRecords = getTotalRecords();
      const totalPages = Math.ceil(totalRecords / 10);
      let pageNum = 1;
      chrome.runtime.sendMessage({ type: 'progress', current: pageNum, total: totalPages || 1 });
      while (true) {
        await expandAllPanels();
        const pageResults = parseCurrentPage();
        allResults.push(...pageResults.filter(r => !isSensitiveResult(r))); // STI/STD/HIV filter
        const nextBtn = document.querySelector('button[aria-label="Go to the next page"]');
        if (!nextBtn || nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') break;
        if (pageNum >= totalPages) break;
        nextBtn.click();
        await sleep(2000);
        pageNum++;
        chrome.runtime.sendMessage({ type: 'progress', current: pageNum, total: totalPages });
      }
      chrome.runtime.sendMessage({ type: 'done', data: allResults });
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'error', message: err.message || 'Unknown error' });
    }
  }
  window.addEventListener('mmh_collect_labs', () => collectAllResults());
})();