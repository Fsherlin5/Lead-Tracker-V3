// ====== Utility Functions ======
const STORAGE_KEY = 'leadTrackerProData';
const DEFAULT_ROWS_PER_DAY = 3;
const SELLING_DAYS = [1,2,3,4,5,6]; // Monday-Saturday (0=Sun)
const SOURCES = ["AS Call", "AS Internet", "Internet"];
const STATUS = ["Open", "Closed Won", "Closed Lost"];

// Ford blue for highlighting
const FORD_BLUE = "#2563eb";

// Helper: Get YYYY-MM for keying months
function getMonthKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
}
function getToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function formatDate(dateObj) {
  if (!(dateObj instanceof Date)) dateObj = new Date(dateObj);
  return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDT(dateObj) {
  if (!(dateObj instanceof Date)) dateObj = new Date(dateObj);
  return dateObj.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function isStale(lead, now=new Date()) {
  if (!lead.lastContactAttempt) return true;
  const last = new Date(lead.lastContactAttempt);
  const diff = (now - last)/(1000*60*60*24);
  return diff > 5;
}
function rowStatusClass(lead) {
  if (lead.hot) return 'hot-lead';
  if (lead.status === "Closed Won") return 'closed-won';
  if (lead.status === "Closed Lost") return 'closed-lost';
  if (isStale(lead)) return 'stale-lead';
  return '';
}
function emojiForLead(lead) {
  if (lead.hot) return "🔥";
  if (lead.status === "Closed Won") return "🏁";
  if (lead.status === "Closed Lost") return "❌";
  if (isStale(lead)) return "⏰";
  return "";
}

// ====== Data Handling ======
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch { return {}; }
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.data));
}
function clearData() {
  if (!confirm("Are you sure you want to clear ALL data?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// ====== CSV Helpers ======
function toCSV(rows) {
  if (!rows.length) return "";
  const header = Object.keys(rows[0]);
  const csv = [header.join(",")];
  for (let r of rows) {
    csv.push(header.map(f => `"${(String(r[f] ?? "")).replace(/"/g, '""')}"`).join(","));
  }
  return csv.join("\n");
}
function fromCSV(text) {
  // Simple CSV parser (assumes header, no multi-line fields)
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,''));
  const rows = [];
  for (let i=1; i<lines.length; ++i) {
    const vals = lines[i].match(/("([^"]|"")*"|[^,]*)/g).map(x => x.replace(/^"|"$/g,'').replace(/""/g,'"'));
    const obj = {};
    header.forEach((h,j)=>obj[h]=vals[j]);
    rows.push(obj);
  }
  return rows;
}

// ====== App State ======
const appState = {
  now: getToday(),
  currentMonth: getMonthKey(getToday()),
  data: loadData(), // { "YYYY-MM": [lead, ...] }
  filters: {
    contact: "all",
    status: "all",
    source: "all",
    hot: false,
    stale: false,
  }
};

// ====== UI Functions ======
function render() {
  renderMonthLabel();
  renderLeadsTable();
  renderMetrics();
  renderFilters();
}
function renderMonthLabel() {
  const d = new Date(appState.currentMonth + "-01");
  document.getElementById("monthLabel").textContent = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function renderLeadsTable() {
  const tbody = document.getElementById("leadsTableBody");
  tbody.innerHTML = "";

  // Get selling days for this month
  const [y, m] = appState.currentMonth.split("-").map(Number);
  const days = daysInMonth(y, m-1);

  // Build a map of leads by day
  const monthLeads = appState.data[appState.currentMonth] ?? [];
  const byDate = {};
  for (const lead of monthLeads) {
    let dt = new Date(lead.date);
    dt.setHours(0,0,0,0);
    const key = dt.toISOString();
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(lead);
  }

  // For each day in month, if selling day, render rows
  for(let day=1; day<=days; ++day) {
    const dt = new Date(y, m-1, day);
    if (!SELLING_DAYS.includes(dt.getDay())) continue; // skip Sunday

    const dateKey = dt.toISOString();
    const leads = byDate[dateKey] ?? [];
    // If no leads, prepopulate 3 empty rows
    const rows = leads.length ? leads : Array.from({length:DEFAULT_ROWS_PER_DAY},()=>makeBlankLead(dt));
    for (let i=0; i<rows.length; ++i) {
      tbody.appendChild(buildRow(rows[i], dt, dateKey, i));
    }
    // Add a button to add a new row for this date
    const addTr = document.createElement("tr");
    addTr.innerHTML = `<td colspan="15" style="background:#f2f6fd;">
      <button class="add-row-btn" data-date="${dateKey}">+ Add Lead for ${formatDate(dt)}</button>
    </td>`;
    tbody.appendChild(addTr);
  }
}
function buildRow(lead, dateObj, dateKey, idx) {
  const tr = document.createElement("tr");
  tr.className = rowStatusClass(lead);

  // Date
  const dateCell = document.createElement("td");
  dateCell.textContent = formatDate(dateObj);
  tr.appendChild(dateCell);

  // Customer Name
  tr.appendChild(tdInput("customerName", lead.customerName));

  // Phone
  tr.appendChild(tdInput("phone", lead.phone, "tel"));

  // Source
  tr.appendChild(tdSelect("source", SOURCES, lead.source));

  // Call Attempts
  tr.appendChild(tdCounter("callAttempts", lead.callAttempts, "📞"));

  // Text Attempts
  tr.appendChild(tdCounter("textAttempts", lead.textAttempts, "💬"));

  // Email Attempts
  tr.appendChild(tdCounter("emailAttempts", lead.emailAttempts, "✉️"));

  // Contact Made (multi)
  tr.appendChild(tdContactMade(lead));

  // Contact Types (show which types made)
  tr.appendChild(tdContactTypes(lead));

  // Status
  tr.appendChild(tdSelect("status", STATUS, lead.status));

  // Hot
  tr.appendChild(tdHot(lead));

  // Last Contact Attempt
  tr.appendChild(tdDate("lastContactAttempt", lead.lastContactAttempt));

  // Contact Made On
  tr.appendChild(tdDate("contactMadeOn", lead.contactMadeOn));

  // Status/Emoji cell
  const statCell = document.createElement("td");
  statCell.className = "status-cell";
  statCell.innerHTML = `<span class="emoji">${emojiForLead(lead)}</span>`;
  tr.appendChild(statCell);

  // Actions
  const tdActions = document.createElement("td");
  tdActions.className = "table-actions";
  const delBtn = document.createElement("button");
  delBtn.className = "delete-row-btn";
  delBtn.title = "Delete this lead";
  delBtn.innerHTML = "🗑";
  delBtn.onclick = () => { deleteLead(dateKey, lead); };
  tdActions.appendChild(delBtn);
  tr.appendChild(tdActions);

  // Attach event listeners to inputs
  tr.querySelectorAll("input, select, button.counter-btn, button.contact-btn, button.hot-btn").forEach(el => {
    el.addEventListener("change", onInputChange);
    el.addEventListener("click", onInputChange);
  });
  return tr;
}
function tdInput(field, value, type="text") {
  const td = document.createElement("td");
  td.innerHTML = `<input type="${type}" data-field="${field}" value="${value||""}" />`;
  return td;
}
function tdSelect(field, options, value) {
  const td = document.createElement("td");
  let opts = options.map(o=>`<option value="${o}"${o===value?' selected':''}>${o}</option>`).join("");
  td.innerHTML = `<select data-field="${field}"><option value=""></option>${opts}</select>`;
  return td;
}
function tdCounter(field, value, emoji) {
  const td = document.createElement("td");
  td.innerHTML = `<button class="counter-btn" data-field="${field}">${emoji} <span>${value||0}</span> +</button>`;
  return td;
}
function tdContactMade(lead) {
  // Multi-select: call, text, email
  const td = document.createElement("td");
  td.innerHTML = `
    <button class="contact-btn contact-call${lead.contactMadeCall ? " contact-made":""}" data-contact="call">📞</button>
    <button class="contact-btn contact-text${lead.contactMadeText ? " contact-made":""}" data-contact="text">💬</button>
    <button class="contact-btn contact-email${lead.contactMadeEmail ? " contact-made":""}" data-contact="email">✉️</button>
  `;
  return td;
}
function tdContactTypes(lead) {
  const td = document.createElement("td");
  let arr = [];
  if (lead.contactMadeCall) arr.push("📞");
  if (lead.contactMadeText) arr.push("💬");
  if (lead.contactMadeEmail) arr.push("✉️");
  td.textContent = arr.join(" ");
  return td;
}
function tdHot(lead) {
  const td = document.createElement("td");
  td.innerHTML = `<button class="hot-btn${lead.hot?" active":""}" data-field="hot" title="Toggle Hot">${lead.hot?"🔥":"🚗"}</button>`;
  return td;
}
function tdDate(field, value) {
  const td = document.createElement("td");
  td.textContent = value ? formatDT(new Date(value)) : "";
  return td;
}
function makeBlankLead(dateObj) {
  return {
    date: new Date(dateObj),
    customerName: "",
    phone: "",
    source: "",
    callAttempts: 0,
    textAttempts: 0,
    emailAttempts: 0,
    contactMadeCall: false,
    contactMadeText: false,
    contactMadeEmail: false,
    hot: false,
    status: "Open",
    lastContactAttempt: "",
    contactMadeOn: ""
  };
}

// ====== Input Handlers ======
function onInputChange(e) {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Array.from(tr.parentNode.children).indexOf(tr);
  // Find the date from the first cell, convert to ISO
  const dateStr = tr.cells[0]?.textContent;
  if (!dateStr) return;
  const date = new Date(dateStr);
  date.setHours(0,0,0,0);
  const dateKey = date.toISOString();

  // Find this lead in appState
  let leads = appState.data[appState.currentMonth] ?? [];
  let i = leads.findIndex(l => new Date(l.date).toISOString() === dateKey && l.customerName === tr.cells[1].querySelector("input").value && l.phone === tr.cells[2].querySelector("input").value);
  if (i === -1) {
    // Not found, pick by date and row index as fallback
    let allRows = leads.filter(l => new Date(l.date).toISOString() === dateKey);
    i = allRows.length > idx ? idx : 0;
  }
  let lead = leads[i] ?? makeBlankLead(date);
  // Update fields
  tr.querySelectorAll("input,select").forEach(inp => {
    const field = inp.dataset.field;
    if (field) lead[field] = inp.value;
  });
  // Counter buttons
  tr.querySelectorAll("button.counter-btn").forEach(btn => {
    btn.onclick = (ev) => {
      const field = btn.dataset.field;
      lead[field] = (+lead[field]||0) + 1;
      // Update lastContactAttempt
      lead.lastContactAttempt = new Date().toISOString();
      render(); saveData();
    };
  });
  // Contact buttons
  tr.querySelectorAll("button.contact-btn").forEach(btn => {
    btn.onclick = (ev) => {
      const type = btn.dataset.contact;
      lead["contactMade"+capitalize(type)] = !lead["contactMade"+capitalize(type)];
      // If just made contact, set date
      if (lead["contactMade"+capitalize(type)] && !lead.contactMadeOn) lead.contactMadeOn = new Date().toISOString();
      render(); saveData();
    };
  });
  // Hot toggle
  tr.querySelectorAll("button.hot-btn").forEach(btn => {
    btn.onclick = (ev) => {
      lead.hot = !lead.hot;
      render(); saveData();
    };
  });
  // Status select
  tr.querySelectorAll('select[data-field="status"]').forEach(sel => {
    sel.onchange = (ev) => {
      lead.status = sel.value;
      render(); saveData();
    };
  });
  // Save back
  leads[i] = lead;
  appState.data[appState.currentMonth] = leads;
  saveData();
  render();
}
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

// ====== Add/Delete Rows ======
document.addEventListener("click", function(e) {
  if (e.target.matches(".add-row-btn")) {
    const dateKey = e.target.dataset.date;
    const dt = new Date(dateKey);
    let leads = appState.data[appState.currentMonth] ?? [];
    leads.push(makeBlankLead(dt));
    appState.data[appState.currentMonth] = leads;
    saveData();
    render();
  }
});

// Delete lead row
function deleteLead(dateKey, lead) {
  let leads = appState.data[appState.currentMonth] ?? [];
  appState.data[appState.currentMonth] = leads.filter(l => !(l.date === lead.date && l.customerName === lead.customerName && l.phone === lead.phone));
  saveData();
  render();
}

// ====== Month Navigation ======
document.getElementById("prevMonthBtn").onclick = () => {
  const d = new Date(appState.currentMonth + "-01");
  d.setMonth(d.getMonth() - 1);
  appState.currentMonth = getMonthKey(d);
  render();
};
document.getElementById("nextMonthBtn").onclick = () => {
  const d = new Date(appState.currentMonth + "-01");
  d.setMonth(d.getMonth() + 1);
  appState.currentMonth = getMonthKey(d);
  render();
};

// ====== Save Button ======
document.getElementById("saveBtn").onclick = () => {
  saveData();
  alert("Data saved! (Stored in your browser and available when you revisit this site on this device/browser.)");
};

// ====== CSV Export/Import ======
document.getElementById("exportCsvBtn").onclick = () => {
  // Export all months, all leads
  let allLeads = [];
  Object.entries(appState.data).forEach(([month, leads]) => allLeads.push(...leads));
  const csv = toCSV(allLeads);
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = "lead_tracker_export.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

document.getElementById("importCsvInput").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const rows = fromCSV(evt.target.result);
    // Add all imported leads to appState, grouped by month
    for (let lead of rows) {
      if (!lead.date) continue;
      const d = new Date(lead.date);
      const key = getMonthKey(d);
      if (!appState.data[key]) appState.data[key] = [];
      // Avoid exact duplicates
      if (!appState.data[key].some(l => l.date === lead.date && l.customerName === lead.customerName && l.phone === lead.phone))
        appState.data[key].push(lead);
    }
    saveData();
    render();
    alert("CSV imported!");
  };
  reader.readAsText(file);
};

// ====== Filters & Metrics ======
function renderFilters() {
  // Set selects to current values
  document.getElementById("filterContact").value = appState.filters.contact;
  document.getElementById("filterStatus").value = appState.filters.status;
  document.getElementById("filterSource").value = appState.filters.source;
  document.getElementById("filterHot").classList.toggle("active", appState.filters.hot);
  document.getElementById("filterStale").classList.toggle("active", appState.filters.stale);
}
document.getElementById("filterContact").onchange = function() {
  appState.filters.contact = this.value;
  render();
};
document.getElementById("filterStatus").onchange = function() {
  appState.filters.status = this.value;
  render();
};
document.getElementById("filterSource").onchange = function() {
  appState.filters.source = this.value;
  render();
};
document.getElementById("filterHot").onclick = function() {
  appState.filters.hot = !appState.filters.hot;
  render();
};
document.getElementById("filterStale").onclick = function() {
  appState.filters.stale = !appState.filters.stale;
  render();
};

// ====== Metrics ======
function renderMetrics() {
  // Calculate for current month
  const leads = (appState.data[appState.currentMonth] ?? []).filter(l=>!!l.customerName);
  const total = leads.length;
  const closed = leads.filter(l=>l.status==="Closed Won").length;
  const closedLost = leads.filter(l=>l.status==="Closed Lost").length;
  const calls = leads.reduce((a,l)=>a+(+l.callAttempts||0),0);
  const texts = leads.reduce((a,l)=>a+(+l.textAttempts||0),0);
  const emails = leads.reduce((a,l)=>a+(+l.emailAttempts||0),0);
  const avgCalls = (closed ? (leads.filter(l=>l.status==="Closed Won").reduce((a,l)=>a+(+l.callAttempts||0),0)/closed).toFixed(1) : "0");
  const avgTexts = (closed ? (leads.filter(l=>l.status==="Closed Won").reduce((a,l)=>a+(+l.textAttempts||0),0)/closed).toFixed(1) : "0");
  const avgEmails = (closed ? (leads.filter(l=>l.status==="Closed Won").reduce((a,l)=>a+(+l.emailAttempts||0),0)/closed).toFixed(1) : "0");
  const avgLifecycle = (closed ?
    (leads.filter(l=>l.status==="Closed Won").reduce((a,l)=>a+(l.contactMadeOn?((new Date(l.contactMadeOn)-new Date(l.date))/(1000*60*60*24)):0),0)/closed).toFixed(1)
    : "0");
  const closingPct = (total ? ((closed/total)*100).toFixed(1) : "0");

  document.getElementById("metricsBar").innerHTML = `
    <div class="metric"><span class="emoji">📞</span> Avg Calls to Close: <strong>${avgCalls}</strong></div>
    <div class="metric"><span class="emoji">💬</span> Avg Texts to Close: <strong>${avgTexts}</strong></div>
    <div class="metric"><span class="emoji">✉️</span> Avg Emails to Close: <strong>${avgEmails}</strong></div>
    <div class="metric"><span class="emoji">⏳</span> Avg Lifecycle: <strong>${avgLifecycle}</strong> days</div>
    <div class="metric"><span class="emoji">🏁</span> Closing %: <strong>${closingPct}%</strong></div>
    <div class="metric"><span class="emoji">🔥</span> Hot Leads: <strong>${leads.filter(l=>l.hot).length}</strong></div>
    <div class="metric"><span class="emoji">⏰</span> Stale: <strong>${leads.filter(isStale).length}</strong></div>
  `;
}

// ====== On Load ======
window.onload = () => {
  render();
};