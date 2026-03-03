
// popup.js - Handles UI interactions and communicates with content script

let collectedData = [];

const statusBox = document.getElementById('statusBox');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const collectBtn = document.getElementById('collectBtn');
const csvBtn = document.getElementById('csvBtn');
const xmlBtn = document.getElementById('xmlBtn');
const exportSection = document.getElementById('exportSection');
const recordStat = document.getElementById('recordStat');

function setStatus(msg, type = '') {
  statusBox.textContent = msg;
  statusBox.className = 'status-box' + (type ? ' ' + type : '');
}

function setProgress(pct) {
  progressBar.style.display = 'block';
  progressFill.style.width = pct + '%';
}

collectBtn.addEventListener('click', async () => {
  collectBtn.disabled = true;
  setStatus('Checking page...', '');
  setProgress(0);
  exportSection.style.display = 'none';
  collectedData = [];

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes('managemyhealth.co.nz')) {
    setStatus('Please navigate to the Manage My Health Lab Results page first.', 'error');
    collectBtn.disabled = false;
    return;
  }

  // Listen for progress messages from content script
  chrome.runtime.onMessage.addListener(function onMsg(msg) {
    if (msg.type === 'progress') {
      setStatus('Collecting page ' + msg.current + ' of ' + msg.total + '...');
      setProgress((msg.current / msg.total) * 100);
    } else if (msg.type === 'done') {
      chrome.runtime.onMessage.removeListener(onMsg);
      collectedData = msg.data;
      setProgress(100);
      setStatus('✅ Collected ' + collectedData.length + ' lab result records!', 'success');
      recordStat.innerHTML = '<span class="record-count">' + collectedData.length + '</span> records ready to export';
      exportSection.style.display = 'block';
      collectBtn.disabled = false;
    } else if (msg.type === 'error') {
      chrome.runtime.onMessage.removeListener(onMsg);
      setStatus('Error: ' + msg.message, 'error');
      collectBtn.disabled = false;
    }
  });

  // Inject and run the collector
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: startCollection
  });
});

csvBtn.addEventListener('click', () => {
  if (!collectedData.length) return;
  const csv = generateCSV(collectedData);
  downloadFile(csv, 'lab-results.csv', 'text/csv');
});

xmlBtn.addEventListener('click', () => {
  if (!collectedData.length) return;
  const xml = generateXML(collectedData);
  downloadFile(xml, 'lab-results.xml', 'application/xml');
});

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateCSV(data) {
  const headers = ['GroupName','ObservationDate','DateReceived','DateUploaded','Location','Doctor','ClinicianComments','OrderedBy','Laboratory','TestName','Value','Unit','Range','RangeMin','RangeMax','IsMetaField','Comments'];
  const rows = [headers.join(',')];

  for (const record of data) {
    for (const item of record.items) {
      const row = [
        csvEscape(record.groupName),
        csvEscape(record.observationDate),
        csvEscape(record.dateReceived),
        csvEscape(record.dateUploaded),
        csvEscape(record.location),
        csvEscape(record.doctor),
        csvEscape(record.clinicianComments),
        csvEscape(record.orderedBy),
        csvEscape(record.laboratory),
        csvEscape(item.testName),
        csvEscape(item.value),
        csvEscape(item.unit),
        csvEscape(item.range),
        csvEscape(item.rangeMin),
        csvEscape(item.rangeMax),
        item.isMetaField ? 'true' : 'false',
        csvEscape(item.comments || '')
      ];
      rows.push(row.join(','));
    }
  }
  return rows.join('\n');
}

function csvEscape(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateXML(data) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<LabResults>'];

  for (const record of data) {
    lines.push('  <LabResult>');
    lines.push('    <GroupName>' + xmlEscape(record.groupName) + '</GroupName>');
    lines.push('    <ObservationDate>' + xmlEscape(record.observationDate) + '</ObservationDate>');
    lines.push('    <DateReceived>' + xmlEscape(record.dateReceived) + '</DateReceived>');
    lines.push('    <DateUploaded>' + xmlEscape(record.dateUploaded) + '</DateUploaded>');
    lines.push('    <Location>' + xmlEscape(record.location) + '</Location>');
    lines.push('    <Doctor>' + xmlEscape(record.doctor) + '</Doctor>');
    lines.push('    <ClinicianComments>' + xmlEscape(record.clinicianComments) + '</ClinicianComments>');
    lines.push('    <OrderedBy>' + xmlEscape(record.orderedBy) + '</OrderedBy>');
    lines.push('    <Laboratory>' + xmlEscape(record.laboratory) + '</Laboratory>');
    lines.push('    <TestItems>');

    for (const item of record.items) {
      lines.push('      <TestItem>');
      lines.push('        <TestName>' + xmlEscape(item.testName) + '</TestName>');
      lines.push('        <Value>' + xmlEscape(item.value) + '</Value>');
      lines.push('        <Unit>' + xmlEscape(item.unit) + '</Unit>');
      lines.push('        <Range>' + xmlEscape(item.range) + '</Range>');
      lines.push('        <RangeMin>' + xmlEscape(item.rangeMin) + '</RangeMin>');
      lines.push('        <RangeMax>' + xmlEscape(item.rangeMax) + '</RangeMax>');
      if (item.comments) {
        lines.push('        <Comments>' + xmlEscape(item.comments) + '</Comments>');
      }
      lines.push('      </TestItem>');
    }

    lines.push('    </TestItems>');
    lines.push('  </LabResult>');
  }

  lines.push('</LabResults>');
  return lines.join('\n');
}

function xmlEscape(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// This function runs in the page context
function startCollection() {
  // Forward to content script via custom event
  window.dispatchEvent(new CustomEvent('mmh_collect_labs'));
}
