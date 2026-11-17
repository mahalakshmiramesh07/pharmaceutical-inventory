// ============================================================
//  PharmaCare — script.js
//  Hospital Pharmacy Management System
// ============================================================

const API = "http://127.0.0.1:5000";

// Chart instances (so we can destroy & redraw)
let dailyChart = null, monthlyChart = null, topMedChart = null;

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════

// All API calls go through here — sends session cookie every time
async function apiRequest(method, path, body = null) {
  const opts = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

// Sanitise text so hackers can't inject HTML
function safe(str) {
  if (str === null || str === undefined) return "—";
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

// Format currency
function fmt(n) { return parseFloat(n || 0).toFixed(2); }

// Format date nicely
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}

// Show a temporary toast message
function toast(msg, type="success") {
  const t = document.createElement("div");
  t.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:14px 22px; border-radius:8px; font-size:13.5px;
    font-weight:600; color:white; box-shadow:0 4px 20px rgba(0,0,0,0.2);
    animation: slideUp 0.3s ease;
    background: ${type==="success"?"#2e7d32":type==="error"?"#c62828":"#1565c0"};
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Empty row for tables
function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:28px;color:#90a4ae;">${msg}</td></tr>`;
}

// ══════════════════════════════════════════════════════
//  AUTH — LOGIN / REGISTER / LOGOUT
// ══════════════════════════════════════════════════════

function showLogin()    { document.getElementById("loginPage").style.display="flex"; document.getElementById("registerPage").style.display="none"; }
function showRegister() { document.getElementById("registerPage").style.display="flex"; document.getElementById("loginPage").style.display="none"; }

// Check if already logged in when page loads
window.onload = async function() {
  const data = await apiRequest("GET", "/auth-status");
  if (data.logged_in) {
    enterDashboard(data.username);
  }
};

// Login form
document.getElementById("loginForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const data = await apiRequest("POST", "/login", { username, password });
  if (data.message === "Login successful") {
    enterDashboard(username);
  } else {
    toast(data.error || "Login failed. Check your username and password.", "error");
  }
});

// Register form
document.getElementById("registerForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value;
  const data = await apiRequest("POST", "/register", { username, password });
  if (data.message) {
    toast("Account created! Please sign in.", "success");
    showLogin();
  } else {
    toast(data.error || "Registration failed.", "error");
  }
});

function enterDashboard(username) {
  document.getElementById("loginPage").style.display    = "none";
  document.getElementById("registerPage").style.display = "none";
  document.getElementById("dashboardPage").style.display = "flex";

  // Set user info in sidebar
  document.getElementById("sidebarUsername").textContent = username;
  document.getElementById("userAvatar").textContent = username.charAt(0).toUpperCase();
  document.getElementById("billCashier").textContent = username;

  // Load all data
  loadDashboard();
  loadAlerts();
}

async function logout() {
  await apiRequest("POST", "/logout");
  document.getElementById("dashboardPage").style.display = "none";
  document.getElementById("loginPage").style.display     = "flex";
  toast("Signed out successfully.", "info");
}

// ══════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════

const sectionTitles = {
  overview:   "Overview Dashboard",
  medicines:  "Medicines",
  batches:    "Medicine Batches",
  sell:       "Sell Medicine",
  billing:    "Billing",
  sales:      "Sales History",
  analytics:  "Sales Analytics",
  purchases:  "Purchase Management",
  suppliers:  "Suppliers",
  expiry:     "Expiry Alerts",
  lowstock:   "Low Stock Alerts"
};

function showSection(name) {
  // Hide all sections
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  // Show selected
  const sec = document.getElementById("section-" + name);
  if (sec) sec.classList.add("active");

  // Highlight nav button
  document.querySelectorAll(".nav-btn").forEach(b => {
    if (b.getAttribute("onclick") === `showSection('${name}')`) {
      b.classList.add("active");
    }
  });

  // Update topbar title
  document.getElementById("topbarTitle").textContent = sectionTitles[name] || name;

  // Load data for the selected section
  if (name === "overview")   { loadDashboard(); loadRecentSales(); }
  if (name === "medicines")  loadMedicines();
  if (name === "batches")    loadBatches();
  if (name === "sell")       { loadMedicinesDropdown(); }
  if (name === "sales")      loadSales();
  if (name === "analytics")  loadAnalytics();
  if (name === "purchases")  { loadPurchases(); loadMedicinesDropdown(); loadSuppliersDropdown(); }
  if (name === "suppliers")  loadSuppliers();
  if (name === "expiry")     loadAlerts();
  if (name === "lowstock")   loadLowStock();
}

// ══════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════

async function loadDashboard() {
  const data = await apiRequest("GET", "/dashboard");
  if (!data) return;

  document.getElementById("statMedicines").textContent = data.total_medicines ?? 0;
  document.getElementById("statStock").textContent     = data.total_stock     ?? 0;
  document.getElementById("statSales").textContent     = data.total_sales     ?? 0;
  document.getElementById("statExpiry").textContent    = data.expiry_alerts   ?? 0;

  // Topbar pills
  const ec = data.expiry_alerts || 0;
  const lc = data.low_stock     || 0;

  const ep = document.getElementById("expiryPill");
  const lp = document.getElementById("lowstockPill");
  document.getElementById("expiryCount").textContent   = ec;
  document.getElementById("lowstockCount").textContent = lc;
  ep.style.display = ec > 0 ? "inline-flex" : "none";
  lp.style.display = lc > 0 ? "inline-flex" : "none";

  // Sidebar nav badges
  const enb = document.getElementById("expiryNavBadge");
  const lnb = document.getElementById("lowstockNavBadge");
  enb.textContent   = ec; enb.style.display = ec > 0 ? "inline" : "none";
  lnb.textContent   = lc; lnb.style.display = lc > 0 ? "inline" : "none";

  // Quick alerts on overview
  const qa = document.getElementById("quickAlerts");
  qa.innerHTML = "";
  if (ec > 0) qa.innerHTML += `<div class="alert-box warning" style="margin-bottom:12px;"><span>⚠️</span><div><strong>${ec} medicine(s)</strong> expiring within 60 days. <a href="#" onclick="showSection('expiry');return false;" style="color:var(--warning);font-weight:700;">View Expiry Alerts →</a></div></div>`;
  if (lc > 0) qa.innerHTML += `<div class="alert-box danger" style="margin-bottom:12px;"><span>🚨</span><div><strong>${lc} medicine(s)</strong> below minimum stock level. <a href="#" onclick="showSection('lowstock');return false;" style="color:var(--danger);font-weight:700;">View Low Stock →</a></div></div>`;
}

async function loadRecentSales() {
  const data = await apiRequest("GET", "/sales");
  const tbody = document.getElementById("recentSalesTable");
  if (!data || !data.length) {
    tbody.innerHTML = emptyRow(4, "No sales recorded yet."); return;
  }
  tbody.innerHTML = data.slice(0, 5).map(s => `
    <tr>
      <td>${safe(s.medicine_name)}</td>
      <td>${safe(s.quantity)}</td>
      <td>₹${fmt(s.total_price)}</td>
      <td>${fmtDate(s.sale_date)}</td>
    </tr>`).join("");
}

// ══════════════════════════════════════════════════════
//  MEDICINES
// ══════════════════════════════════════════════════════

let allMedicines = [];

async function loadMedicines() {
  const data = await apiRequest("GET", "/medicines");
  allMedicines = data || [];
  document.getElementById("medCount").textContent = `(${allMedicines.length})`;
  renderMedicines(allMedicines);
}

function renderMedicines(list) {
  const tbody = document.getElementById("medicinesTable");
  if (!list.length) { tbody.innerHTML = emptyRow(8, "No medicines added yet."); return; }

  tbody.innerHTML = list.map((m, i) => {
    const stock    = m.total_stock ?? m.stock ?? 0;
    const minStock = m.min_stock   ?? 10;
    let statusTag  = "";
    if (stock === 0)          statusTag = `<span class="tag tag-red">Out of Stock</span>`;
    else if (stock <= minStock) statusTag = `<span class="tag tag-amber">Low Stock</span>`;
    else                       statusTag = `<span class="tag tag-green">In Stock</span>`;

    return `<tr>
      <td>${i+1}</td>
      <td><strong>${safe(m.name)}</strong></td>
      <td><span class="tag tag-blue">${safe(m.category || "—")}</span></td>
      <td>₹${fmt(m.price)}</td>
      <td><strong>${stock}</strong></td>
      <td>${minStock}</td>
      <td>${statusTag}</td>
      <td>
        <button class="btn btn-secondary btn-xs" onclick="openEditModal(${m.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteMedicine(${m.id})" style="margin-left:4px;">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

function filterMedicines() {
  const q = document.getElementById("medSearch").value.toLowerCase();
  renderMedicines(allMedicines.filter(m =>
    (m.name||"").toLowerCase().includes(q) ||
    (m.category||"").toLowerCase().includes(q)
  ));
}

// Add medicine
document.getElementById("addMedicineForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const payload = {
    name:      document.getElementById("medName").value.trim(),
    category:  document.getElementById("medCategory").value,
    price:     parseFloat(document.getElementById("medPrice").value),
    stock:     parseInt(document.getElementById("medStock").value),
    min_stock: parseInt(document.getElementById("medMinStock").value) || 10
  };
  const data = await apiRequest("POST", "/medicines", payload);
  if (data.id || data.message) {
    toast("Medicine added successfully!", "success");
    this.reset();
    document.getElementById("medMinStock").value = "10";
    loadMedicines();
  } else {
    toast(data.error || "Failed to add medicine.", "error");
  }
});

// Edit modal
async function openEditModal(id) {
  const med = allMedicines.find(m => m.id === id);
  if (!med) return;
  document.getElementById("editId").value       = med.id;
  document.getElementById("editName").value     = med.name;
  document.getElementById("editCategory").value = med.category || "";
  document.getElementById("editPrice").value    = med.price;
  document.getElementById("editStock").value    = med.total_stock ?? med.stock ?? 0;
  document.getElementById("editMinStock").value = med.min_stock ?? 10;
  document.getElementById("editModal").classList.add("open");
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("open");
}

async function saveEdit() {
  const id = document.getElementById("editId").value;
  const payload = {
    name:      document.getElementById("editName").value.trim(),
    category:  document.getElementById("editCategory").value,
    price:     parseFloat(document.getElementById("editPrice").value),
    stock:     parseInt(document.getElementById("editStock").value),
    min_stock: parseInt(document.getElementById("editMinStock").value) || 10
  };
  const data = await apiRequest("PUT", `/medicines/${id}`, payload);
  if (data.message) {
    toast("Medicine updated!", "success");
    closeEditModal();
    loadMedicines();
  } else {
    toast(data.error || "Update failed.", "error");
  }
}

async function deleteMedicine(id) {
  if (!confirm("Delete this medicine? This cannot be undone.")) return;
  const data = await apiRequest("DELETE", `/medicines/${id}`);
  if (data.message) { toast("Medicine deleted.", "success"); loadMedicines(); }
  else toast(data.error || "Delete failed.", "error");
}

// ── Dropdown helpers (for sell / batches / purchases) ──
async function loadMedicinesDropdown() {
  const data = await apiRequest("GET", "/medicines");
  allMedicines = data || [];
  const selects = ["batchMedicine","sellMedicine","purchaseMedicine"];
  selects.forEach(sid => {
    const sel = document.getElementById(sid);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">Select medicine</option>`;
    allMedicines.forEach(m => {
      const stock = m.total_stock ?? m.stock ?? 0;
      sel.innerHTML += `<option value="${m.id}" data-price="${m.price}" data-stock="${stock}">${safe(m.name)} (Stock: ${stock})</option>`;
    });
    if (cur) sel.value = cur;
  });
}

// ══════════════════════════════════════════════════════
//  BATCHES
// ══════════════════════════════════════════════════════

async function loadBatches() {
  await loadMedicinesDropdown();
  const data = await apiRequest("GET", "/batches");
  const tbody = document.getElementById("batchesTable");
  if (!data || !data.length) { tbody.innerHTML = emptyRow(7, "No batches added yet."); return; }

  tbody.innerHTML = data.map((b, i) => {
    const days = Math.ceil((new Date(b.expiry_date) - new Date()) / 86400000);
    let tag = "";
    let rowClass = "";
    if (days <= 0)        { tag = `<span class="tag tag-red">Expired</span>`;      rowClass = "row-critical"; }
    else if (days <= 7)   { tag = `<span class="tag tag-red">Critical</span>`;     rowClass = "row-critical"; }
    else if (days <= 30)  { tag = `<span class="tag tag-amber">Expiring Soon</span>`; rowClass = "row-warn"; }
    else if (days <= 60)  { tag = `<span class="tag tag-amber">Watch</span>`;       rowClass = "row-warn"; }
    else                   tag = `<span class="tag tag-green">Good</span>`;

    return `<tr class="${rowClass}">
      <td>${i+1}</td>
      <td><strong>${safe(b.medicine_name)}</strong></td>
      <td>${safe(b.batch_number)}</td>
      <td>${b.quantity}</td>
      <td>${b.expiry_date}</td>
      <td><strong>${days <= 0 ? "Expired" : days + " days"}</strong></td>
      <td>${tag}</td>
    </tr>`;
  }).join("");
}

document.getElementById("addBatchForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const payload = {
    medicine_id:  parseInt(document.getElementById("batchMedicine").value),
    batch_number: document.getElementById("batchNumber").value.trim(),
    quantity:     parseInt(document.getElementById("batchQty").value),
    expiry_date:  document.getElementById("batchExpiry").value
  };
  const data = await apiRequest("POST", "/batches", payload);
  if (data.id || data.message) {
    toast("Batch added!", "success");
    this.reset();
    loadBatches();
  } else {
    toast(data.error || "Failed to add batch.", "error");
  }
});

// ══════════════════════════════════════════════════════
//  SELL MEDICINE
// ══════════════════════════════════════════════════════

function updateSellPrice() {
  const sel = document.getElementById("sellMedicine");
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.price) {
    document.getElementById("sellPrice").value = opt.dataset.price;
    updateSellTotal();
  }
}

function updateSellTotal() {
  const qty   = parseFloat(document.getElementById("sellQty").value)   || 0;
  const price = parseFloat(document.getElementById("sellPrice").value) || 0;
  document.getElementById("sellTotal").textContent = fmt(qty * price);
}

document.getElementById("sellForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const sel      = document.getElementById("sellMedicine");
  const medId    = parseInt(sel.value);
  const medName  = sel.options[sel.selectedIndex]?.text?.split(" (")[0] || "";
  const qty      = parseInt(document.getElementById("sellQty").value);
  const price    = parseFloat(document.getElementById("sellPrice").value);
  const customer = document.getElementById("sellCustomer").value.trim() || "Walk-in Customer";

  const data = await apiRequest("POST", "/sell", {
    medicine_id: medId,
    quantity: qty,
    price_per_unit: price
  });

  if (data.message || data.total_price !== undefined) {
    const total = data.total_price ?? (qty * price);
    toast(`Sale complete! Total: ₹${fmt(total)}`, "success");
    generateBill(medName, qty, price, total, customer);
    this.reset();
    document.getElementById("sellTotal").textContent = "0.00";
    loadDashboard();
    showSection("billing");
  } else {
    toast(data.error || "Sale failed.", "error");
  }
});

// ══════════════════════════════════════════════════════
//  BILLING — AUTO-GENERATE BILL
// ══════════════════════════════════════════════════════

function generateBill(medName, qty, price, total, customer) {
  const now = new Date();
  const billNo = "PC" + now.getFullYear() +
    String(now.getMonth()+1).padStart(2,"0") +
    String(now.getDate()).padStart(2,"0") +
    String(now.getTime()).slice(-4);

  document.getElementById("billNo").textContent       = billNo;
  document.getElementById("billCustomer").textContent = customer;
  document.getElementById("billDateTime").textContent =
    now.toLocaleString("en-IN", { dateStyle:"long", timeStyle:"short" });

  document.getElementById("billItems").innerHTML = `
    <tr>
      <td>1</td>
      <td>${safe(medName)}</td>
      <td style="text-align:center;">${qty}</td>
      <td style="text-align:right;">₹${fmt(price)}</td>
      <td style="text-align:right;font-weight:700;">₹${fmt(total)}</td>
    </tr>`;

  document.getElementById("billTotal").textContent = fmt(total);
  document.getElementById("noBillMsg").style.display = "none";
  document.getElementById("billBox").style.display   = "block";
}

// ══════════════════════════════════════════════════════
//  SALES HISTORY
// ══════════════════════════════════════════════════════

async function loadSales() {
  const data = await apiRequest("GET", "/sales");
  const tbody = document.getElementById("salesTable");
  if (!data || !data.length) { tbody.innerHTML = emptyRow(5, "No sales recorded yet."); return; }

  tbody.innerHTML = data.map((s, i) => `
    <tr>
      <td>${i+1}</td>
      <td><strong>${safe(s.medicine_name)}</strong></td>
      <td>${safe(s.quantity)}</td>
      <td><strong>₹${fmt(s.total_price)}</strong></td>
      <td>${fmtDate(s.sale_date)}</td>
    </tr>`).join("");
}

// ══════════════════════════════════════════════════════
//  SALES ANALYTICS
// ══════════════════════════════════════════════════════

async function loadAnalytics() {
  const data = await apiRequest("GET", "/analytics");
  if (!data) return;

  // Daily chart
  const dailyLabels = (data.daily || []).map(d => d.date);
  const dailyVals   = (data.daily || []).map(d => d.revenue);

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(document.getElementById("dailyChart"), {
    type: "bar",
    data: {
      labels: dailyLabels,
      datasets: [{
        label: "Revenue (₹)",
        data: dailyVals,
        backgroundColor: "#1565c0cc",
        borderColor: "#1565c0",
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
  });

  // Monthly chart
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthVals = Array(12).fill(0);
  (data.monthly || []).forEach(m => { monthVals[m.month - 1] = m.revenue; });

  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(document.getElementById("monthlyChart"), {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        label: "Revenue (₹)",
        data: monthVals,
        borderColor: "#00897b",
        backgroundColor: "#00897b22",
        borderWidth: 2.5,
        pointRadius: 5,
        fill: true,
        tension: 0.4
      }]
    },
    options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
  });

  // Top medicines chart
  const topNames = (data.top_medicines || []).map(t => t.name);
  const topQtys  = (data.top_medicines || []).map(t => t.total_qty);
  const colors   = ["#1565c0","#00897b","#2e7d32","#e65100","#6a1b9a"];

  if (topMedChart) topMedChart.destroy();
  topMedChart = new Chart(document.getElementById("topMedChart"), {
    type: "doughnut",
    data: {
      labels: topNames,
      datasets: [{
        data: topQtys,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: { responsive:true, plugins:{ legend:{ position:"bottom" } } }
  });

  // Summary stats
  const totalRev = (data.daily || []).reduce((s,d) => s + d.revenue, 0);
  const totalTx  = data.total_transactions || 0;
  const avgTx    = totalTx > 0 ? (totalRev / totalTx) : 0;

  document.getElementById("salesSummary").innerHTML = `
    <div class="summary-row">
      <span class="s-label">Total Revenue (Last 7 Days)</span>
      <span class="s-val">₹${fmt(totalRev)}</span>
    </div>
    <div class="summary-row">
      <span class="s-label">Total Transactions</span>
      <span class="s-val">${totalTx}</span>
    </div>
    <div class="summary-row">
      <span class="s-label">Avg. Transaction Value</span>
      <span class="s-val">₹${fmt(avgTx)}</span>
    </div>
    <div class="summary-row">
      <span class="s-label">Best Selling Medicine</span>
      <span class="s-val">${topNames[0] || "—"}</span>
    </div>`;
}

// ══════════════════════════════════════════════════════
//  PURCHASES
// ══════════════════════════════════════════════════════

async function loadPurchases() {
  const data = await apiRequest("GET", "/purchases");
  const tbody = document.getElementById("purchasesTable");
  if (!data || !data.length) { tbody.innerHTML = emptyRow(7, "No purchases recorded yet."); return; }

  tbody.innerHTML = data.map((p, i) => `
    <tr>
      <td>${i+1}</td>
      <td><strong>${safe(p.medicine_name)}</strong></td>
      <td>${safe(p.supplier_name)}</td>
      <td>${p.quantity}</td>
      <td>₹${fmt(p.cost_per_unit)}</td>
      <td><strong>₹${fmt(p.total_cost)}</strong></td>
      <td>${p.purchase_date || "—"}</td>
    </tr>`).join("");
}

async function loadSuppliersDropdown() {
  const data = await apiRequest("GET", "/suppliers");
  const sel  = document.getElementById("purchaseSupplier");
  if (!sel) return;
  sel.innerHTML = `<option value="">Select supplier</option>`;
  (data || []).forEach(s => {
    sel.innerHTML += `<option value="${s.id}">${safe(s.name)}</option>`;
  });
}

document.getElementById("addPurchaseForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  // Set today as default date if not filled
  const dateVal = document.getElementById("purchaseDate").value ||
    new Date().toISOString().split("T")[0];

  const payload = {
    medicine_id:   parseInt(document.getElementById("purchaseMedicine").value),
    supplier_id:   parseInt(document.getElementById("purchaseSupplier").value),
    quantity:      parseInt(document.getElementById("purchaseQty").value),
    cost_per_unit: parseFloat(document.getElementById("purchaseCost").value),
    purchase_date: dateVal
  };

  const data = await apiRequest("POST", "/purchases", payload);
  if (data.id || data.message) {
    toast("Purchase recorded!", "success");
    this.reset();
    loadPurchases();
    loadDashboard();
  } else {
    toast(data.error || "Failed to record purchase.", "error");
  }
});

// ══════════════════════════════════════════════════════
//  SUPPLIERS
// ══════════════════════════════════════════════════════

async function loadSuppliers() {
  const data = await apiRequest("GET", "/suppliers");
  const tbody = document.getElementById("suppliersTable");
  if (!data || !data.length) { tbody.innerHTML = emptyRow(6, "No suppliers added yet."); return; }

  tbody.innerHTML = data.map((s, i) => `
    <tr>
      <td>${i+1}</td>
      <td><strong>${safe(s.name)}</strong></td>
      <td>${safe(s.contact_person)}</td>
      <td>${safe(s.phone)}</td>
      <td>${safe(s.email)}</td>
      <td>
        <button class="btn btn-danger btn-xs" onclick="deleteSupplier(${s.id})">🗑️ Delete</button>
      </td>
    </tr>`).join("");
}

document.getElementById("addSupplierForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const payload = {
    name:           document.getElementById("supName").value.trim(),
    contact_person: document.getElementById("supContact").value.trim(),
    phone:          document.getElementById("supPhone").value.trim(),
    email:          document.getElementById("supEmail").value.trim()
  };
  const data = await apiRequest("POST", "/suppliers", payload);
  if (data.id || data.message) {
    toast("Supplier added!", "success");
    this.reset();
    loadSuppliers();
  } else {
    toast(data.error || "Failed to add supplier.", "error");
  }
});

async function deleteSupplier(id) {
  if (!confirm("Delete this supplier?")) return;
  const data = await apiRequest("DELETE", `/suppliers/${id}`);
  if (data.message) { toast("Supplier deleted.", "success"); loadSuppliers(); }
  else toast(data.error || "Delete failed.", "error");
}

// ══════════════════════════════════════════════════════
//  EXPIRY ALERTS
// ══════════════════════════════════════════════════════

async function loadAlerts() {
  const days = document.getElementById("expiryFilter")?.value || 60;
  const data = await apiRequest("GET", `/expiry-alerts?days=${days}`);
  renderExpiryTable(data || []);
  updateAlertCounts(data || []);
}

function renderExpiryTable(list) {
  const tbody = document.getElementById("expiryTable");
  if (!list.length) { tbody.innerHTML = emptyRow(6, "✅ No medicines expiring within this period."); return; }

  tbody.innerHTML = list.map(b => {
    const days = Math.ceil((new Date(b.expiry_date) - new Date()) / 86400000);
    let tag, rowClass = "";
    if (days <= 0)        { tag = `<span class="tag tag-red">🔴 Expired</span>`;      rowClass = "row-critical"; }
    else if (days <= 7)   { tag = `<span class="tag tag-red">🔴 Critical</span>`;     rowClass = "row-critical"; }
    else if (days <= 30)  { tag = `<span class="tag tag-amber">🟠 Urgent</span>`;     rowClass = "row-warn"; }
    else                   tag = `<span class="tag tag-blue">🔵 Monitor</span>`;

    return `<tr class="${rowClass}">
      <td><strong>${safe(b.medicine_name)}</strong></td>
      <td>${safe(b.batch_number)}</td>
      <td>${b.quantity}</td>
      <td>${b.expiry_date}</td>
      <td><strong>${days <= 0 ? "Expired" : days + " days"}</strong></td>
      <td>${tag}</td>
    </tr>`;
  }).join("");
}

function updateAlertCounts(list) {
  const count = list.length;
  document.getElementById("expiryCount").textContent    = count;
  document.getElementById("expiryNavBadge").textContent = count;
  document.getElementById("expiryNavBadge").style.display = count > 0 ? "inline" : "none";
  document.getElementById("expiryPill").style.display    = count > 0 ? "inline-flex" : "none";
}

// ══════════════════════════════════════════════════════
//  LOW STOCK ALERTS
// ══════════════════════════════════════════════════════

async function loadLowStock() {
  const data = await apiRequest("GET", "/low-stock");
  const tbody = document.getElementById("lowStockTable");
  const list  = data || [];

  // Update sidebar / topbar counts
  document.getElementById("lowstockCount").textContent    = list.length;
  document.getElementById("lowstockNavBadge").textContent = list.length;
  document.getElementById("lowstockNavBadge").style.display = list.length > 0 ? "inline" : "none";
  document.getElementById("lowstockPill").style.display    = list.length > 0 ? "inline-flex" : "none";

  if (!list.length) { tbody.innerHTML = emptyRow(6, "✅ All medicines are adequately stocked."); return; }

  tbody.innerHTML = list.map(m => {
    const stock    = m.total_stock ?? m.stock ?? 0;
    const minStock = m.min_stock   ?? 10;
    const shortage = Math.max(0, minStock - stock);
    const statusTag = stock === 0
      ? `<span class="tag tag-red">🔴 Out of Stock</span>`
      : `<span class="tag tag-amber">🟠 Low Stock</span>`;

    return `<tr>
      <td><strong>${safe(m.name)}</strong></td>
      <td><span class="tag tag-blue">${safe(m.category || "—")}</span></td>
      <td><strong style="color:var(--danger);">${stock}</strong></td>
      <td>${minStock}</td>
      <td><strong>${shortage}</strong> units needed</td>
      <td>${statusTag}</td>
    </tr>`;
  }).join("");
}