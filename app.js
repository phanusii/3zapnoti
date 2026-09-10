// app.js - Main Application Logic for STA69 Ledger Hub

// State variables
let db = {};
let currentProject = "";
let currentYear = "";
let activeChart = null;
let activeChartType = "pie"; // "pie" (donut) or "bar"
let lineUserId = null;
let compareRevenueChartInstance = null;
let compareProfitChartInstance = null;

// State variables for slip uploads (exposed on window for tests and reliability)
window.activeAdSlips = [];
window.activeExpenseSlips = [];
window.activeDistributionSlips = [];

// Helper to render preview grid of slips with remove button for each
window.renderSlipPreviews = function(containerId, slipsArray, onRemoveFunctionName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!slipsArray || slipsArray.length === 0) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }
  
  container.style.display = "grid";
  container.style.gridTemplateColumns = "repeat(auto-fill, minmax(70px, 1fr))";
  container.style.gap = "8px";
  container.style.width = "100%";
  container.style.marginTop = "8px";
  
  container.innerHTML = slipsArray.map((src, index) => `
    <div class="slip-thumb-wrapper" style="position: relative; width: 70px; height: 95px; border-radius: 8px; overflow: visible;">
      <img src="${src}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;" onclick="viewSlip('${src}')">
      <button type="button" style="position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 11px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.3); padding: 0; line-height: 1;" onclick="event.stopPropagation(); window.${onRemoveFunctionName}(${index})">&times;</button>
    </div>
  `).join("");
};

// Global remove helpers registered to window
window.removeAdSlip = function(idx) {
  window.activeAdSlips.splice(idx, 1);
  window.renderSlipPreviews("adSlipPreviewContainer", window.activeAdSlips, "removeAdSlip");
};
window.removeExpenseSlip = function(idx) {
  window.activeExpenseSlips.splice(idx, 1);
  window.renderSlipPreviews("expSlipPreviewContainer", window.activeExpenseSlips, "removeExpenseSlip");
};
window.removeDistributionSlip = function(idx) {
  window.activeDistributionSlips.splice(idx, 1);
  window.renderSlipPreviews("distSlipPreviewContainer", window.activeDistributionSlips, "removeDistributionSlip");
};



// Helper to compress image and return Base64
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper to convert Base64 back to Binary Blob for Telegram API
function base64ToBlob(base64, mimeType) {
  const parts = base64.split(',');
  const byteCharacters = atob(parts[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Global lightbox viewer helper for single or multiple slips
window.viewSlip = function(slipBase64) {
  window.viewSlips([slipBase64]);
};

window.viewSlips = function(slipsArray) {
  const viewer = document.getElementById("dlgSlipViewer");
  const content = document.getElementById("slipViewerContent");
  if (viewer && content) {
    // Normalize to array, filter out empty values
    const list = Array.isArray(slipsArray) ? slipsArray : [slipsArray];
    const validList = list.filter(s => s && typeof s === "string" && s.trim() !== "");
    if (validList.length === 0) {
      alert("ไม่มีรูปภาพสลิปโอนเงินสำหรับรายการนี้");
      return;
    }
    content.innerHTML = validList.map((src, i) => `
      <div style="text-align: center; border-bottom: ${validList.length > 1 && i < validList.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none'}; padding-bottom: ${validList.length > 1 ? '15px' : '0'};">
        <img src="${src}" alt="สลิปที่ ${i+1}" style="width: 100%; max-height: 60dvh; object-fit: contain; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
      </div>
    `).join("");
    viewer.showModal();
  }
};

window.viewAdSlips = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  if (data && data.ads && data.ads[index]) {
    const item = data.ads[index];
    const slips = item.slips || (item.slip ? [item.slip] : []);
    window.viewSlips(slips);
  }
};

window.viewExpenseSlips = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  if (data && data.expenses && data.expenses[index]) {
    const item = data.expenses[index];
    const slips = item.slips || (item.slip ? [item.slip] : []);
    window.viewSlips(slips);
  }
};

window.viewDistributionSlips = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  if (data && data.distributions && data.distributions[index]) {
    const item = data.distributions[index];
    const slips = item.slips || (item.slip ? [item.slip] : []);
    window.viewSlips(slips);
  }
};

// DOM Elements
const projectSelect = document.getElementById("projectSelect");

const addProjectBtn = document.getElementById("addProjectBtn");
const addYearBtn = document.getElementById("addYearBtn");
const resetDemoBtn = document.getElementById("resetDemoBtn");
const exportBackupBtn = document.getElementById("exportBackupBtn");
const lineSettingsBtn = document.getElementById("lineSettingsBtn");
const backupFileInput = document.getElementById("backupFileInput");

// KPI Display elements
const valTotalRevenue = document.getElementById("valTotalRevenue");
const valCarryoverFooter = document.getElementById("valCarryoverFooter");
const valCarryoverText = document.getElementById("valCarryoverText");
const valSalesCount = document.getElementById("valSalesCount");

const valTotalAds = document.getElementById("valTotalAds");
const valRatioAds = document.getElementById("valRatioAds");
const ratioAdsFill = document.getElementById("ratioAdsFill");

const valTotalExpenses = document.getElementById("valTotalExpenses");
const valRatioExpenses = document.getElementById("valRatioExpenses");
const ratioExpensesFill = document.getElementById("ratioExpensesFill");
const valExpensesCount = document.getElementById("valExpensesCount");

const valTotalDistributed = document.getElementById("valTotalDistributed");
const valRatioDistributed = document.getElementById("valRatioDistributed");
const ratioDistributedFill = document.getElementById("ratioDistributedFill");
const valDistributedPerPerson = document.getElementById("valDistributedPerPerson");

const valRemainingBalance = document.getElementById("valRemainingBalance");
const valRatioBalance = document.getElementById("valRatioBalance");
const ratioBalanceFill = document.getElementById("ratioBalanceFill");
const valNetProfit = document.getElementById("valNetProfit");

// Inventory elements
const stockList = document.getElementById("stockList");
const btnReceiveStock = document.getElementById("btnReceiveStock");

// Table body elements
const tableSalesBody = document.getElementById("tableSalesBody");
const tableAdsBody = document.getElementById("tableAdsBody");
const tableExpensesBody = document.getElementById("tableExpensesBody");
const tableDistributionsBody = document.getElementById("tableDistributionsBody");

// Modals
const dlgSale = document.getElementById("dlgSale");
const dlgAd = document.getElementById("dlgAd");
const dlgExpense = document.getElementById("dlgExpense");
const dlgDistribution = document.getElementById("dlgDistribution");
const dlgStock = document.getElementById("dlgStock");
const dlgProject = document.getElementById("dlgProject");
const dlgYear = document.getElementById("dlgYear");
const dlgCarryover = document.getElementById("dlgCarryover");

// Search inputs
const searchSales = document.getElementById("searchSales");
const searchAds = document.getElementById("searchAds");
const searchExpenses = document.getElementById("searchExpenses");
const searchDistributions = document.getElementById("searchDistributions");

// Check password authorization on page load
function checkAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get("action");
  if (action === "link-user-account") {
    localStorage.removeItem("sta69_authorized");
    const overlay = document.getElementById("loginOverlay");
    if (overlay) {
      overlay.style.display = "flex";
    }
  } else {
    const isAuth = localStorage.getItem("sta69_authorized");
    if (isAuth === "true") {
      const overlay = document.getElementById("loginOverlay");
      if (overlay) {
        overlay.style.display = "none";
      }
    }
  }
}

// Initialize application
window.addEventListener("DOMContentLoaded", async () => {
  checkAuth();
  setupDialogs();
  setupVisualViewport();
  setupEventListeners();
  await loadDatabase();
  initializeSelectors();
  renderDashboard();
  
  // Background auto-sync immediately on load & repeat periodically
  silentAutoSyncGoogleSheets();
  setInterval(() => silentAutoSyncGoogleSheets(), 30000);
  window.addEventListener("focus", () => silentAutoSyncGoogleSheets());
  
  // Background load and register active Telegram chat recipients
  getTelegramChats().catch(err => console.error("Error background loading Telegram chats:", err));

  // Initialize LINE LIFF
  if (window.liff) {
    try {
      await liff.init({ liffId: "2010690090-AKybN7Fn" });
      console.log("LINE LIFF Initialized successfully");

      // Redirect to standalone LIFF form if action is present in query parameters (restored by LIFF SDK)
      function getLiffAction() {
        const urlParams = new URLSearchParams(window.location.search);
        let action = urlParams.get("action");
        if (action) return action;

        const liffState = urlParams.get("liff.state");
        if (liffState) {
          const decodedState = decodeURIComponent(liffState);
          const qIndex = decodedState.indexOf("?");
          if (qIndex !== -1) {
            const stateParams = new URLSearchParams(decodedState.substring(qIndex));
            action = stateParams.get("action");
            if (action) return action;
          }
        }

        const hash = window.location.hash;
        if (hash) {
          const qIndex = hash.indexOf("?");
          if (qIndex !== -1) {
            const hashParams = new URLSearchParams(hash.substring(qIndex));
            action = hashParams.get("action");
            if (action) return action;
          }
          const stateMatch = hash.match(/liff\.state=([^&]+)/);
          if (stateMatch) {
            const decodedState = decodeURIComponent(stateMatch[1]);
            const qIdx = decodedState.indexOf("?");
            if (qIdx !== -1) {
              const stateParams = new URLSearchParams(decodedState.substring(qIdx));
              action = stateParams.get("action");
              if (action) return action;
            }
          }
        }
        return null;
      }

      const action = getLiffAction();
      if (action) {
        const search = window.location.search || "?";
        const separator = (search === "?" || search === "") ? "" : "&";
        window.location.replace("liff.html" + search + separator + "action=" + action + "&v=" + Date.now());
        return;
      }
      
      if (liff.isInClient()) {
        if (!liff.isLoggedIn()) {
          liff.login();
        }
        
        // Sync active project session from Google Apps Script if logged in
        try {
          const profile = await liff.getProfile();
          const userId = profile.userId;
          lineUserId = userId;
          if (profile.displayName) {
            localStorage.setItem("sta69_admin_name", profile.displayName);
          }
          
          const gasUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=get-active-project&userId=${userId}`;
          const res = await fetch(gasUrl);
          const data = await res.json();
          
          if (data && data.status === "error" && data.message.includes("Unauthorized")) {
            console.log("LINE user is not authorized on server. Showing login overlay...");
            const overlay = document.getElementById("loginOverlay");
            if (overlay) {
              overlay.style.display = "flex";
              const helpText = document.querySelector(".login-card .login-footer");
              if (helpText) {
                helpText.innerHTML = "💬 กรุณากรอกรหัสผ่านระบบเพื่อเชื่อมต่อสิทธิ์กับ LINE Bot ของคุณ";
                helpText.style.color = "var(--primary-btn-bg)";
                helpText.style.fontWeight = "bold";
              }
            }
          } else {
            // Hide login overlay if authorized
            const overlay = document.getElementById("loginOverlay");
            if (overlay) overlay.style.display = "none";
            
            if (data && data.activeProject) {
              const tabName = data.activeProject;
              const match = tabName.match(/^([a-zA-Z0-9]+?)(\d{2})$/);
              if (match) {
                const projPart = match[1].toLowerCase();
                const yearPart = match[2];
                const fullYear = "25" + yearPart;
                
                let exactProjName = null;
                const projectSelect = document.getElementById("projectSelect");
                
                
                for (let i = 0; i < projectSelect.options.length; i++) {
                  if (projectSelect.options[i].value.toLowerCase() === projPart) {
                    exactProjName = projectSelect.options[i].value;
                    break;
                  }
                }
                
                if (exactProjName) {
                  const combinationKey = `${exactProjName}_${fullYear}`;
                  if (db[combinationKey]) {
                    currentProject = exactProjName;
                    currentYear = fullYear;
                    projectSelect.value = currentProject;
                    yearSelect.value = currentYear;
                    renderDashboard();
                    console.log(`Synced active project from LINE session: ${combinationKey}`);
                  }
                }
              }
            }
          }
        } catch (syncErr) {
          console.error("Error syncing active project session:", syncErr);
        }
      }
    } catch (err) {
      console.error("LIFF initialization failed:", err);
    }
  }

  // Handle URL actions (for Rich Menu integration)
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get("action");
  const inputActions = ["add-sale", "add-expense", "add-ad", "receive-stock", "add-distribution"];
  
  if (action && inputActions.includes(action)) {
    document.body.classList.add("liff-input-mode");
    
    // Auto-close LIFF when cancel buttons are clicked
    setTimeout(() => {
      const activeDialogId = action === "add-sale" ? "dlgSale" :
                             action === "add-expense" ? "dlgExpense" :
                             action === "add-ad" ? "dlgAd" :
                             action === "receive-stock" ? "dlgStock" :
                             action === "add-distribution" ? "dlgDistribution" : null;
      
      if (activeDialogId) {
        const dialog = document.getElementById(activeDialogId);
        if (dialog) {
          // Listen to dialog close event (cancel or submit success)
          dialog.addEventListener("close", () => {
            if (window.liff) {
              setTimeout(() => {
                liff.closeWindow();
              }, 1200); // 1.2s delay to read toast success message
            }
          });
          
          // Modify cancel button listeners just in case
          const cancelBtn = dialog.querySelector("button.secondary");
          if (cancelBtn) {
            cancelBtn.addEventListener("click", (e) => {
              e.preventDefault();
              dialog.close();
            });
          }
        }
      }
    }, 600);
  }

  if (action === "add-sale") {
    setTimeout(() => {
      const btn = document.getElementById("btnAddSale");
      if (btn) btn.click();
    }, 400);
  } else if (action === "add-expense") {
    setTimeout(() => {
      const btn = document.getElementById("btnAddExpense");
      if (btn) btn.click();
    }, 400);
  } else if (action === "add-ad") {
    setTimeout(() => {
      const btn = document.getElementById("btnAddAd");
      if (btn) btn.click();
    }, 400);
  } else if (action === "receive-stock") {
    setTimeout(() => {
      const btn = document.getElementById("btnReceiveStock");
      if (btn) btn.click();
    }, 400);
  } else if (action === "add-distribution") {
    setTimeout(() => {
      const btn = document.getElementById("btnAddDistribution");
      if (btn) btn.click();
    }, 400);
  }
});

// Setup Dialogs & Fallback for browsers without 'closedby' support
function setupDialogs() {
  const dialogs = document.querySelectorAll("dialog");
  dialogs.forEach(dialog => {
    // Check if browser supports closedBy natively
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isDialogContent) {
          dialog.close();
        }
      });
    }
  });

  // Auto-calculate values in sale form
  const saleQty = document.getElementById("saleQty");
  const saleUnitPrice = document.getElementById("saleUnitPrice");
  const saleTotalPrice = document.getElementById("saleTotalPrice");
  
  const handleQtyOrUnitPriceChange = () => {
    const qty = parseInt(saleQty.value) || 0;
    const unitPrice = parseFloat(saleUnitPrice.value) || 0;
    saleTotalPrice.value = (qty * unitPrice).toFixed(2);
  };
  
  const handleTotalPriceChange = () => {
    const qty = parseInt(saleQty.value) || 0;
    const totalPrice = parseFloat(saleTotalPrice.value) || 0;
    saleUnitPrice.value = qty > 0 ? (totalPrice / qty).toFixed(2) : "0.00";
  };
  
  saleQty.addEventListener("input", handleQtyOrUnitPriceChange);
  saleUnitPrice.addEventListener("input", handleQtyOrUnitPriceChange);
  saleTotalPrice.addEventListener("input", handleTotalPriceChange);

  // Auto-calculate Total in distribution form (per person * 3)
  const distPerPerson = document.getElementById("distPerPerson");
  const distTotal = document.getElementById("distTotal");
  distPerPerson.addEventListener("input", () => {
    const perPerson = parseFloat(distPerPerson.value) || 0;
    distTotal.value = (perPerson * 3).toFixed(2);
  });
}

// Load database from LocalStorage or default JSON file
async function loadDatabase() {
  const localData = localStorage.getItem("sta69_revenue_tracker_db");
  if (localData) {
    try {
      db = JSON.parse(localData);
      console.log("Database loaded from LocalStorage.");
      if (db.access_password) {
        localStorage.setItem("sta69_access_password", db.access_password);
      }
    } catch (e) {
      console.error("Error parsing local database, falling back to default.", e);
    }
  }

  if (!db || Object.keys(db).length === 0) {
    // Fetch from default JSON if local storage is empty
    try {
      const response = await fetch("./default_database.json");
      db = await response.json();
      console.log("Database loaded from default_database.json.");
    } catch (e) {
      console.error("Could not load default database file.", e);
      db = {}; // Empty database fallback
    }
  }

  // Consolidate sales entries so each course only appears once
  Object.keys(db).forEach(k => {
    if (db[k] && db[k].sales) consolidateSales(db[k]);
  });
  saveToLocalStorage();
}

function consolidateSales(data) {
  if (!data || !Array.isArray(data.sales)) return;
  const map = new Map();
  const result = [];
  data.sales.forEach(item => {
    if (!item || !item.code) return;
    const norm = item.code.replace(/\s+/g, "").toUpperCase();
    if (map.has(norm)) {
      const existing = map.get(norm);
      if ((item.qty || 0) >= (existing.qty || 0)) {
        existing.qty = item.qty;
        existing.unitPrice = item.unitPrice;
        existing.totalPrice = item.totalPrice;
      }
      if (item.slips && item.slips.length > 0) existing.slips = item.slips;
    } else {
      const copy = { ...item };
      map.set(norm, copy);
      result.push(copy);
    }
  });
  data.sales = result;
}

let gasDbSyncTimeout = null;
function syncWebDatabaseToGAS() {
  if (gasDbSyncTimeout) clearTimeout(gasDbSyncTimeout);
  gasDbSyncTimeout = setTimeout(() => {
    try {
      const gasUrl = "https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=save-web-database";
      fetch(gasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database: db })
      }).catch(err => console.error("Error syncing web DB to GAS:", err));
    } catch (e) {
      console.error("Error in syncWebDatabaseToGAS:", e);
    }
  }, 1000);
}

// Save database to LocalStorage
function saveToLocalStorage() {
  localStorage.setItem("sta69_revenue_tracker_db", JSON.stringify(db));
  syncWebDatabaseToGAS();
}

// Initialize project and year selector dropdowns (Combined version)
function initializeSelectors() {
  const combinations = new Set();
  
  Object.keys(db).forEach(key => {
    const parts = key.split('_');
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
      combinations.add(key);
    }
  });

  if (combinations.size === 0) {
    combinations.add("STA_2568");
    combinations.add("STA_2569");
    combinations.add("STA_2570");
  }

  // Populate project selector with combined text
  projectSelect.innerHTML = "";
  const sortedCombos = Array.from(combinations).sort((a, b) => {
    const partsA = a.split('_');
    const partsB = b.split('_');
    const yearA = parseInt(partsA[1]);
    const yearB = parseInt(partsB[1]);
    if (yearA !== yearB) return yearB - yearA; // Latest year first
    return partsA[0].localeCompare(partsB[0]);
  });

  sortedCombos.forEach(combo => {
    const parts = combo.split('_');
    const option = document.createElement("option");
    option.value = combo;
    option.textContent = `${parts[0]} (${parts[1]})`;
    projectSelect.appendChild(option);
  });

  // Set current selected values from combined selector
  const savedCombo = localStorage.getItem("sta69_current_project_combo");
  if (savedCombo && Array.from(projectSelect.options).some(o => o.value === savedCombo)) {
    projectSelect.value = savedCombo;
  } else if (sortedCombos.length > 0) {
    projectSelect.value = sortedCombos[0]; // Defaults to STA_2570 (latest project)
  }

  if (projectSelect.value) {
    const parts = projectSelect.value.split('_');
    currentProject = parts[0];
    currentYear = parts[1];
    localStorage.setItem("sta69_current_project_combo", projectSelect.value);
  }

  updateDialogProjectBanners();
}

// Update project banner headers on modal dialogs
function updateDialogProjectBanners() {
  const shortYear = currentYear && currentYear.length === 4 ? currentYear.substring(2) : currentYear;
  const projectCode = `${currentProject}${shortYear}`.toUpperCase();
  const displayText = `${projectCode} (${currentProject} ${currentYear})`;
  document.querySelectorAll(".active-project-name-display").forEach(el => {
    el.textContent = displayText;
  });
}

// Debounce helper to limit function execution frequency
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Format number to currency format
function formatCurrency(value) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

// Render Dashboard (Metrics, Charts, Inventory, Tables)
function renderDashboard() {
  const key = `${currentProject}_${currentYear}`;
  
  // Initialize state if not existing or keys missing (Defensive Initialization)
  if (!db[key]) {
    db[key] = {};
  }
  if (!db[key].sales) db[key].sales = [];
  if (!db[key].ads) db[key].ads = [];
  if (!db[key].expenses) db[key].expenses = [];
  if (!db[key].distributions) db[key].distributions = [];
  if (!db[key].stock) db[key].stock = [];
  if (!db[key].stockLogs) db[key].stockLogs = [];

  const data = db[key];

  // 1. Calculate Metrics
  const totalRevenue = data.sales.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const totalCarryover = data.sales
    .filter(item => item.code.toLowerCase().includes("ยอดยกมาจาก"))
    .reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const salesCount = data.sales
    .filter(item => !item.code.toLowerCase().includes("ยอดยกมาจาก"))
    .reduce((sum, item) => sum + (item.qty || 0), 0);
  
  const totalAds = data.ads.reduce((sum, item) => sum + (item.price || 0), 0);
  const totalExpenses = data.expenses.reduce((sum, item) => sum + (item.price || 0), 0);
  const totalDistributed = data.distributions.reduce((sum, item) => sum + (item.total || 0), 0);
  
  const netProfit = totalRevenue - totalAds - totalExpenses;
  const remainingBalance = netProfit - totalDistributed;
  
  const adsRatio = totalRevenue > 0 ? (totalAds / totalRevenue) * 100 : 0;
  const expensesRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
  const distRatio = totalRevenue > 0 ? (totalDistributed / totalRevenue) * 100 : 0;
  const balanceRatio = totalRevenue > 0 ? (remainingBalance / totalRevenue) * 100 : 0;

  // Update KPI displays
  valTotalRevenue.textContent = formatCurrency(totalRevenue);
  if (valCarryoverFooter && valCarryoverText) {
    if (totalCarryover > 0) {
      valCarryoverText.textContent = `ยอดยกมา: ${formatCurrency(totalCarryover)} ฿`;
      valCarryoverFooter.style.display = "block";
    } else {
      valCarryoverFooter.style.display = "none";
    }
  }
  if (valSalesCount) valSalesCount.textContent = `ยอดขายสะสม ${salesCount} คน`;
  
  valTotalAds.textContent = formatCurrency(totalAds);
  valRatioAds.textContent = `คิดเป็น ${adsRatio.toFixed(2)}% ของรายรับ`;
  ratioAdsFill.style.width = `${Math.max(0, Math.min(adsRatio, 100))}%`;
  
  valTotalExpenses.textContent = formatCurrency(totalExpenses);
  valRatioExpenses.textContent = `คิดเป็น ${expensesRatio.toFixed(2)}% ของรายรับ`;
  ratioExpensesFill.style.width = `${Math.max(0, Math.min(expensesRatio, 100))}%`;
  if (valExpensesCount) valExpensesCount.textContent = `บันทึกไว้ ${data.expenses.length} รายการ`;
  
  valTotalDistributed.textContent = formatCurrency(totalDistributed);
  valRatioDistributed.textContent = `คิดเป็น ${distRatio.toFixed(2)}% ของรายรับ`;
  ratioDistributedFill.style.width = `${Math.max(0, Math.min(distRatio, 100))}%`;
  if (valDistributedPerPerson) valDistributedPerPerson.textContent = `แบ่งคนละ ${formatCurrency(totalDistributed / 3)} บาท`;
  
  valRemainingBalance.textContent = formatCurrency(remainingBalance);
  if (valRatioBalance) valRatioBalance.textContent = `คิดเป็น ${balanceRatio.toFixed(2)}% ของรายรับ`;
  if (ratioBalanceFill) ratioBalanceFill.style.width = `${Math.max(0, Math.min(balanceRatio, 100))}%`;
  if (valNetProfit) valNetProfit.textContent = `กำไรก่อนแบ่งหุ้น: ${formatCurrency(netProfit)} บาท`;

  // Apply alert styling if remaining balance goes negative
  if (remainingBalance < 0) {
    valRemainingBalance.parentElement.classList.add("danger");
  } else {
    valRemainingBalance.parentElement.classList.remove("danger");
  }

  // 2. Render Book Stock Status
  renderStock(data);

  // 3. Render Chart
  renderChart(totalRevenue, totalAds, totalExpenses, totalDistributed, remainingBalance, netProfit);

  // 4. Render Tables
  renderTables(data);
  
  // 5. Populate Product dropdown suggestions
  populateProductSelect();
}

// Populate Product selector options dynamically
function populateProductSelect() {
  const selectEl = document.getElementById("saleCode");
  if (!selectEl) return;
  
  const key = `${currentProject}_${currentYear}`;
  const data = db[key];
  
  const defaultProducts = ["3ZAP A", "Combo S", "3 ZEED", "3ZAP P", "Combo X", "3 ZEED G"];
  const uniqueCodes = new Set();
  
  if (data && data.sales) {
    data.sales.forEach(s => {
      if (s.code && !s.code.toLowerCase().includes("ยอดยกมาจาก")) {
        uniqueCodes.add(s.code.trim().toUpperCase());
      }
    });
  }
  
  if (uniqueCodes.size === 0) {
    defaultProducts.forEach(p => uniqueCodes.add(p.toUpperCase()));
  }
  
  const currentValue = selectEl.value;
  selectEl.innerHTML = "";
  
  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.disabled = true;
  placeholderOpt.textContent = "-- เลือกคอร์ส --";
  selectEl.appendChild(placeholderOpt);
  
  Array.from(uniqueCodes).sort().forEach(code => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code;
    selectEl.appendChild(option);
  });
  
  if (currentValue && uniqueCodes.has(currentValue)) {
    selectEl.value = currentValue;
  } else {
    selectEl.selectedIndex = 0;
  }
}

// Trigger LINE Flex reply through Google Apps Script API
function triggerLineFlexReply(type, code, qty, price) {
  const targetUserId = lineUserId || "web_admin";
  const project = currentProject + currentYear.substring(2); // e.g. "Sta70"
  const gasUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=send-flex-card&userId=${encodeURIComponent(targetUserId)}&type=${type}&code=${encodeURIComponent(code)}&qty=${qty}&price=${price}&project=${project}`;
  fetch(gasUrl).catch(err => console.error("Error sending LINE flex card:", err));
}

// Render Book Stock
function renderStock(data) {
  stockList.innerHTML = "";
  
  if (!data.stock || data.stock.length === 0) {
    stockList.innerHTML = `
      <div class="empty-state">
        <p>ไม่มีการเปิดบันทึกสต็อกในโปรเจกต์นี้</p>
        <button id="btnInitStock" class="glass-btn secondary btn-sm" style="margin-top: 10px; width: 100%; justify-content: center;">
          เริ่มบันทึกสต็อกหนังสือ
        </button>
      </div>
    `;
    
    document.getElementById("btnInitStock")?.addEventListener("click", () => {
      data.stock = [
        { bookCode: "3zap", received: 0 },
        { bookCode: "3zeed", received: 0 }
      ];
      data.stockLogs = [];
      saveToLocalStorage();
      renderDashboard();
    });
    return;
  }

  // 1. Migration for backward compatibility
  if (!data.stockLogs) {
    data.stockLogs = [];
    data.stock.forEach(s => {
      if (s.received > 0) {
        data.stockLogs.push({ date: "ยอดเริ่มต้น", bookCode: s.bookCode, qty: s.received });
      }
    });
  }

  // Ensure stock items have deductKeywords
  data.stock.forEach(s => {
    if (s.deductKeywords === undefined) {
      const lower = s.bookCode.toLowerCase();
      if (lower.includes("zap")) {
        s.deductKeywords = "zap, combo";
      } else if (lower.includes("zeed")) {
        s.deductKeywords = "zeed, combo";
      } else {
        s.deductKeywords = s.bookCode;
      }
    }
  });

  // 2. Recalculate received quantity dynamically from logs
  data.stock.forEach(s => {
    const logSum = (data.stockLogs || [])
      .filter(log => log.bookCode.toLowerCase() === s.bookCode.toLowerCase())
      .reduce((sum, log) => sum + log.qty, 0);
    s.received = logSum;
  });

  const stockFragment = document.createDocumentFragment();
  data.stock.forEach((item, index) => {
    const code = item.bookCode.toLowerCase();
    const received = item.received || 0;
    
    // Dynamic sold calculation based on custom keywords
    const keywords = (item.deductKeywords || code)
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(k => k !== "");
      
    let sold = 0;
    (data.sales || []).forEach(sale => {
      const saleCode = (sale.code || "").toLowerCase();
      const qty = sale.qty || 0;
      
      const isMatch = keywords.some(keyword => saleCode.includes(keyword));
      if (isMatch) {
        sold += qty;
      }
    });

    const remaining = received - sold;
    const pct = received > 0 ? Math.max(0, Math.min(100, (remaining / received) * 100)) : 0;
    
    const itemEl = document.createElement("div");
    itemEl.className = "stock-item";
    itemEl.innerHTML = `
      <div class="stock-info">
        <span class="book-title">
          หนังสือ ${item.bookCode.toUpperCase()}
          <span class="book-actions-inline">
            <button class="btn-icon-mini edit-btn" onclick="editBook(${index})" title="แก้ไขชนิดหนังสือ">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </span>
        </span>
        <span class="book-counts">รับเข้า: <strong>${received}</strong> | ขายแล้ว: <strong>${sold}</strong></span>
      </div>
      <div class="stock-bar-wrapper">
        <div class="stock-progress-track">
          <div class="stock-progress-fill" style="width: ${pct}%; background: ${pct < 20 ? 'var(--accent-ads-grad)' : 'linear-gradient(to right, #6366f1, #3b82f6)'}"></div>
        </div>
        <div class="stock-status-text">
          <span>ความปลอดภัยสต็อก: ${pct.toFixed(0)}%</span>
          <span class="remaining ${remaining < 0 ? 'text-danger' : ''}">คงเหลือ: ${remaining} เล่ม</span>
        </div>
      </div>
    `;
    stockFragment.appendChild(itemEl);
  });
  stockList.appendChild(stockFragment);

  // 3. Render Stock Logs Table
  const tableStockHistoryBody = document.getElementById("tableStockHistoryBody");
  if (tableStockHistoryBody) {
    tableStockHistoryBody.innerHTML = "";
    if (data.stockLogs && data.stockLogs.length > 0) {
      const historyFragment = document.createDocumentFragment();
      data.stockLogs.forEach((log, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td data-label="วัน/เดือน/ปี">${formatDisplayDate(log.date)}</td>
          <td data-label="รหัสหนังสือ"><strong>${log.bookCode.toUpperCase()}</strong></td>
          <td data-label="จำนวนที่รับ">${log.qty.toLocaleString()}</td>
          <td class="actions-col">
            <div class="action-btns">
              <button class="btn-icon delete-btn" onclick="deleteStockLog(${index})" title="ลบรายการ">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </div>
          </td>
        `;
        historyFragment.appendChild(tr);
      });
      tableStockHistoryBody.appendChild(historyFragment);
    } else {
      tableStockHistoryBody.innerHTML = `<tr><td colspan="4" class="empty-state" style="text-align: center;">ไม่มีประวัติการรับหนังสือเข้า</td></tr>`;
    }
  }
}

// Render Chart using Chart.js
function renderChart(revenue, ads, expenses, distributed, remaining, netProfit) {
  if (activeChart) {
    activeChart.destroy();
  }

  const ctx = document.getElementById("financialChart").getContext("2d");
  
  if (activeChartType === "pie") {
    // Draw Donut chart showing distribution of revenue
    const outAds = ads;
    const outExp = expenses;
    const outDist = distributed;
    const outRem = Math.max(0, remaining); // avoid showing negative remaining in pie chart slice
    
    // If no revenue, show placeholder pie
    const hasData = revenue > 0;
    const chartData = hasData ? [outAds, outExp, outDist, outRem] : [1, 1, 1, 1];
    const chartLabels = hasData 
      ? ["ค่าโฆษณา (Ads)", "รายจ่ายอื่น ๆ", "ส่วนแบ่งหุ้นส่วน", "เงินคงเหลือบริษัท"] 
      : ["ไม่มีข้อมูลรายรับ - รอนำเข้าข้อมูล"];
    const chartColors = hasData 
      ? ["#ff8fa3", "#fdba74", "#c084fc", "#93c5fd"] 
      : ["#e2e8f0", "#cbd5e1", "#f1f5f9", "#e2e8f0"];

    // Update center text display
    const centerVal = document.getElementById("chartCenterValue");
    if (centerVal) {
      centerVal.textContent = hasData ? `${formatCurrency(revenue)} บาท` : "0 บาท";
    }

    activeChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#475569",
              font: { family: "Inter, Sarabun", size: 12 },
              padding: 15
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                if (!hasData) return "ไม่มีข้อมูลการเงิน";
                const value = context.raw;
                const percentage = ((value / revenue) * 100).toFixed(2);
                return `${context.label}: ${formatCurrency(value)} บาท (${percentage}%)`;
              }
            }
          }
        },
        cutout: "65%"
      }
    });
  } else {
    // Draw Bar chart comparing Revenue, True Cost, and Net Profit
    const trueCost = ads + expenses;
    
    activeChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["รายรับทั้งหมด", "ค่าใช้จ่ายรวม", "กำไรสุทธิก่อนแบ่ง", "เงินปันผลรวม"],
        datasets: [{
          label: "จำนวนเงิน (บาท)",
          data: [revenue, trueCost, netProfit, distributed],
          backgroundColor: [
            "rgba(16, 185, 129, 0.6)",  // Green for revenue
            "rgba(244, 63, 94, 0.6)",   // Red for cost
            "rgba(234, 179, 8, 0.6)",   // Gold for profit
            "rgba(139, 92, 246, 0.6)"   // Purple for distribution
          ],
          borderColor: [
            "#10b981",
            "#f43f5e",
            "#eab308",
            "#8b5cf6"
          ],
          borderWidth: 1.5,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            grid: { color: "rgba(15, 23, 42, 0.05)" },
            ticks: {
              color: "#475569",
              font: { family: "Inter" },
              callback: function(value) { return value.toLocaleString() + " ฿"; }
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: "#475569", font: { family: "Sarabun, Inter" } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `ยอดเงิน: ${formatCurrency(context.raw)} บาท`;
              }
            }
          }
        }
      }
    });
  }
}

// Render Data Tables (with Search filters)
function renderTables(data) {
  if (!data) return;

  // 1. Sales Table
  const filterSales = searchSales.value.toLowerCase();
  tableSalesBody.innerHTML = "";
  const salesFragment = document.createDocumentFragment();
  
  (data.sales || []).forEach((item, index) => {
    if (item.code.toLowerCase().includes("ยอดยกมาจาก")) return; // Skip carryover row in sales table
    if (filterSales && !item.code.toLowerCase().includes(filterSales)) return;
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="รหัสคอร์ส"><strong>${item.code}</strong></td>
      <td data-label="จำนวนขาย">${item.qty.toLocaleString()}</td>
      <td data-label="ราคาต่อหน่วย">${formatCurrency(item.unitPrice)}</td>
      <td data-label="ราคารวม"><span class="text-success">${formatCurrency(item.totalPrice)}</span></td>
      <td class="actions-col">
        <div class="action-btns">
          <button class="btn-icon edit-btn" onclick="editSale(${index})" title="แก้ไขรายการ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        </div>
      </td>
    `;
    salesFragment.appendChild(tr);
  });
  if (!salesFragment.firstChild) {
    tableSalesBody.innerHTML = `<tr><td colspan="5" class="empty-state">ไม่มีข้อมูลยอดขาย</td></tr>`;
  } else {
    tableSalesBody.appendChild(salesFragment);
  }

  // 2. Ads Table
  const filterAds = searchAds.value.toLowerCase();
  tableAdsBody.innerHTML = "";
  const adsFragment = document.createDocumentFragment();
  
  (data.ads || []).forEach((item, index) => {
    if (filterAds && !item.description.toLowerCase().includes(filterAds) && !item.date.toLowerCase().includes(filterAds)) return;
    
    const tr = document.createElement("tr");
    const hasSlips = (item.slips && item.slips.length > 0) || item.slip;
    const priceHtml = hasSlips 
      ? `<span class="text-danger clickable-amount" onclick="viewAdSlips(${index})" title="คลิกเพื่อดูสลิปโอนเงิน">${formatCurrency(item.price)} 📄</span>`
      : `<span class="text-danger">${formatCurrency(item.price)}</span>`;
    
    tr.innerHTML = `
      <td data-label="ว/ด/ป">${formatDisplayDate(item.date)}</td>
      <td data-label="รายการ">${item.description}</td>
      <td data-label="ราคาค่าแอด">${priceHtml}</td>
      <td class="actions-col">
        <div class="action-btns">
          <button class="btn-icon edit-btn" onclick="editAd(${index})" title="แก้ไขรายการ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        </div>
      </td>
    `;
    adsFragment.appendChild(tr);
  });
  if (!adsFragment.firstChild) {
    tableAdsBody.innerHTML = `<tr><td colspan="4" class="empty-state">ไม่มีประวัติค่าแอด</td></tr>`;
  } else {
    tableAdsBody.appendChild(adsFragment);
  }

  // 3. Expenses Table
  const filterExpenses = searchExpenses.value.toLowerCase();
  tableExpensesBody.innerHTML = "";
  const expensesFragment = document.createDocumentFragment();
  
  (data.expenses || []).forEach((item, index) => {
    if (filterExpenses && 
        !item.description.toLowerCase().includes(filterExpenses) && 
        !item.date.toLowerCase().includes(filterExpenses) &&
        !item.note.toLowerCase().includes(filterExpenses)) return;
    
    const tr = document.createElement("tr");
    const hasSlips = (item.slips && item.slips.length > 0) || item.slip;
    const priceHtml = hasSlips
      ? `<span class="text-orange clickable-amount" onclick="viewExpenseSlips(${index})" title="คลิกเพื่อดูสลิปโอนเงิน">${formatCurrency(item.price)} 📄</span>`
      : `<span class="text-orange">${formatCurrency(item.price)}</span>`;
    
    tr.innerHTML = `
      <td data-label="ว/ด/ป">${formatDisplayDate(item.date)}</td>
      <td data-label="รายการ"><strong>${item.description}</strong></td>
      <td data-label="จำนวนเงิน">${priceHtml}</td>
      <td data-label="หมายเหตุ"><span class="table-note">${item.note || '-'}</span></td>
      <td class="actions-col">
        <div class="action-btns">
          <button class="btn-icon edit-btn" onclick="editExpense(${index})" title="แก้ไขรายการ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        </div>
      </td>
    `;
    expensesFragment.appendChild(tr);
  });
  if (!expensesFragment.firstChild) {
    tableExpensesBody.innerHTML = `<tr><td colspan="5" class="empty-state">ไม่มีรายการค่าใช้จ่ายดำเนินงาน</td></tr>`;
  } else {
    tableExpensesBody.appendChild(expensesFragment);
  }

  // 4. Distributions Table
  const filterDist = searchDistributions.value.toLowerCase();
  tableDistributionsBody.innerHTML = "";
  const distributionsFragment = document.createDocumentFragment();
  
  (data.distributions || []).forEach((item, index) => {
    if (filterDist && !item.note.toLowerCase().includes(filterDist) && !item.date.toLowerCase().includes(filterDist)) return;
    
    const tr = document.createElement("tr");
    const hasSlips = (item.slips && item.slips.length > 0) || item.slip;
    const totalHtml = hasSlips
      ? `<span class="text-purple clickable-amount" onclick="viewDistributionSlips(${index})" title="คลิกเพื่อดูสลิปโอนเงิน">${formatCurrency(item.total)} 📄</span>`
      : `<span class="text-purple">${formatCurrency(item.total)}</span>`;
    
    tr.innerHTML = `
      <td data-label="ว/ด/ป">${formatDisplayDate(item.date)}</td>
      <td data-label="แบ่งคนละ">${formatCurrency(item.perPerson)}</td>
      <td data-label="ยอดรวมที่แบ่ง">${totalHtml}</td>
      <td data-label="หมายเหตุ"><span class="table-note">${item.note || '-'}</span></td>
      <td class="actions-col">
        <div class="action-btns">
          <button class="btn-icon edit-btn" onclick="editDistribution(${index})" title="แก้ไขรายการ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        </div>
      </td>
    `;
    distributionsFragment.appendChild(tr);
  });
  if (!distributionsFragment.firstChild) {
    tableDistributionsBody.innerHTML = `<tr><td colspan="5" class="empty-state">ไม่มีประวัติการแบ่งปันผล</td></tr>`;
  } else {
    tableDistributionsBody.appendChild(distributionsFragment);
  }
}

// Setup all DOM event listeners
function setupEventListeners() {
  // --- Security / Authentication Event Listeners ---
  const loginForm = document.getElementById("loginForm");
  const loginPasswordInput = document.getElementById("loginPassword");
  const loginOverlay = document.getElementById("loginOverlay");
  const loginErrorMsg = document.getElementById("loginErrorMsg");
  const loginCard = loginOverlay.querySelector(".login-card");
  
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = loginPasswordInput.value;
    const adminNameVal = document.getElementById("loginAdminName") ? document.getElementById("loginAdminName").value.trim() : "";
    
    // Show loading state on login button
    const submitBtn = loginForm.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ กำลังตรวจสอบ...";
    
    try {
      // Query Apps Script server to get the up-to-date password
      const gasUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=get-line-passcode`;
      const res = await fetch(gasUrl);
      const data = await res.json();
      const serverPass = data.passcode || "STA69";
      
      if (password === serverPass) {
        // Cache the verified passcode locally
        localStorage.setItem("sta69_access_password", serverPass);
        if (adminNameVal) {
          localStorage.setItem("sta69_admin_name", adminNameVal);
        }
        
        // Link LINE account if in LIFF
        if (lineUserId) {
          try {
            const gasLinkUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=link-user-account&userId=${lineUserId}&passcode=${encodeURIComponent(password)}`;
            const linkRes = await fetch(gasLinkUrl);
            const linkData = await linkRes.json();
            if (linkData.status !== "success") {
              alert("ไม่สามารถเชื่อมต่อสิทธิ์กับ LINE Bot ได้: " + linkData.message);
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalText;
              return;
            }
            alert("🔓 เชื่อมต่อสิทธิ์การใช้งานกับ LINE Bot สำเร็จเรียบร้อยแล้ว!");
          } catch (linkErr) {
            console.error("Failed to link LINE account:", linkErr);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อสิทธิ์ LINE: " + linkErr.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
          }
        }
        
        localStorage.setItem("sta69_authorized", "true");
        loginOverlay.classList.add("fade-out");
        setTimeout(() => {
          loginOverlay.style.display = "none";
        }, 400);
        loginPasswordInput.value = "";
        loginErrorMsg.textContent = "";
      } else {
        loginCard.classList.add("shake");
        loginErrorMsg.textContent = "รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง";
        loginCard.addEventListener("animationend", () => {
          loginCard.classList.remove("shake");
        }, { once: true });
      }
    } catch (err) {
      console.error("Server authentication check failed. Falling back to local check:", err);
      // Fallback local check
      const currentPass = localStorage.getItem("sta69_access_password") || "STA69";
      if (password === currentPass) {
        if (adminNameVal) {
          localStorage.setItem("sta69_admin_name", adminNameVal);
        }
        localStorage.setItem("sta69_authorized", "true");
        loginOverlay.classList.add("fade-out");
        setTimeout(() => {
          loginOverlay.style.display = "none";
        }, 400);
        loginPasswordInput.value = "";
        loginErrorMsg.textContent = "";
      } else {
        loginCard.classList.add("shake");
        loginErrorMsg.textContent = "รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง";
        loginCard.addEventListener("animationend", () => {
          loginCard.classList.remove("shake");
        }, { once: true });
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
  
  const toggleLoginPasswordBtn = document.getElementById("toggleLoginPasswordBtn");
  const eyeIconOpen = document.getElementById("eyeIconOpen");
  const eyeIconClose = document.getElementById("eyeIconClose");
  
  toggleLoginPasswordBtn.addEventListener("click", () => {
    if (loginPasswordInput.type === "password") {
      loginPasswordInput.type = "text";
      eyeIconOpen.style.display = "none";
      eyeIconClose.style.display = "block";
    } else {
      loginPasswordInput.type = "password";
      eyeIconOpen.style.display = "block";
      eyeIconClose.style.display = "none";
    }
  });

  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const dlgChangePassword = document.getElementById("dlgChangePassword");
  const btnSaveAllPasswords = document.getElementById("btnSaveAllPasswords");
  
  if (changePasswordBtn && dlgChangePassword) {
    changePasswordBtn.addEventListener("click", () => {
      document.getElementById("oldPassword").value = "";
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmNewPassword").value = "";
      
      const adminNameInput = document.getElementById("adminNameInput");
      if (adminNameInput) {
        adminNameInput.value = localStorage.getItem("sta69_admin_name") || "";
      }
      dlgChangePassword.showModal();
    });
  }
  
  const changePassForm = document.getElementById("changePassForm");
  if (changePassForm) {
    changePassForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const adminName = document.getElementById("adminNameInput").value.trim();
      const oldPass = document.getElementById("oldPassword").value;
      const newPass = document.getElementById("newPassword").value;
      const confirmNewPass = document.getElementById("confirmNewPassword").value;
      
      const currentPass = localStorage.getItem("sta69_access_password") || "STA69";
      
      // If only updating admin name (no password inputs filled)
      if (!oldPass && !newPass && !confirmNewPass) {
        if (adminName) {
          localStorage.setItem("sta69_admin_name", adminName);
          alert("บันทึกชื่อผู้ใช้งาน/ชื่อแอดมิน เรียบร้อยแล้วครับ!");
          dlgChangePassword.close();
          return;
        }
      }
      
      if (oldPass !== currentPass) {
        alert("รหัสผ่านปัจจุบันไม่ถูกต้อง");
        return;
      }
      
      if (newPass !== confirmNewPass) {
        alert("การยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
        return;
      }
      
      if (newPass.length < 4) {
        alert("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
        return;
      }
      
      if (newPass === currentPass) {
        alert("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
        return;
      }
      
      btnSaveAllPasswords.disabled = true;
      btnSaveAllPasswords.textContent = "⏳ กำลังบันทึก...";
      
      try {
        // 1. บันทึกรหัสผ่านเว็บเข้าสู่ localStorage ของแดชบอร์ดทันที (ทำงานเป็น synchronous รวดเร็ว)
        localStorage.setItem("sta69_access_password", newPass);
        if (adminName) {
          localStorage.setItem("sta69_admin_name", adminName);
        }
        db.access_password = newPass;
        saveToLocalStorage();
        
        // 2. ส่งคำขอดึงข้อมูลซิงก์รหัสผ่าน LINE ไปยังหลังบ้าน Apps Script
        const gasUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=set-line-passcode&passcode=${encodeURIComponent(newPass)}`;
        const res = await fetch(gasUrl);
        const data = await res.json();
        if (data.status !== "success") {
          throw new Error(data.message || "เซิร์ฟเวอร์หลังบ้านบันทึกไม่สำเร็จ");
        }
        
        alert("บันทึกรหัสผ่านระบบเรียบร้อยแล้ว! รหัสผ่านเว็บแอปและรหัสผ่านเชื่อมต่อ LINE ได้รับการเปลี่ยนเป็นรหัสเดียวกันเรียบร้อยแล้วครับ");
        dlgChangePassword.close();
      } catch (err) {
        console.error("Failed to sync system passcode to Apps Script:", err);
        alert("เปลี่ยนรหัสผ่านเว็บแอปสำเร็จ แต่ไม่สามารถเชื่อมต่อเพื่อซิงก์รหัสผ่านไปยัง LINE บอตได้ในขณะนี้ (รายละเอียด: " + err.message + ")");
        dlgChangePassword.close();
      } finally {
        btnSaveAllPasswords.disabled = false;
        btnSaveAllPasswords.textContent = "บันทึกรหัสผ่านใหม่";
      }
    });
  }

  // Telegram Settings Bindings
  const telegramSettingsBtn = document.getElementById("telegramSettingsBtn");
  const dlgTelegram = document.getElementById("dlgTelegram");
  
  if (telegramSettingsBtn && dlgTelegram) {
    telegramSettingsBtn.addEventListener("click", async () => {
      dlgTelegram.showModal();
      // Render immediately with cached list
      renderTelegramChats();
      // Then refresh list from Telegram API in the background
      await refreshTelegramChats();
    });
    
    const btnRefreshTelegramChats = document.getElementById("btnRefreshTelegramChats");
    if (btnRefreshTelegramChats) {
      btnRefreshTelegramChats.addEventListener("click", async () => {
        btnRefreshTelegramChats.disabled = true;
        btnRefreshTelegramChats.textContent = "⏳ กำลังอัปเดต...";
        await refreshTelegramChats();
        btnRefreshTelegramChats.disabled = false;
        btnRefreshTelegramChats.textContent = "🔄 ดึงรายชื่อล่าสุด";
      });
    }
    
    const btnTestTelegram = document.getElementById("btnTestTelegram");
    if (btnTestTelegram) {
      btnTestTelegram.addEventListener("click", async () => {
        btnTestTelegram.disabled = true;
        btnTestTelegram.textContent = "⏳ กำลังส่ง...";
        
        // Fetch updates first to capture any last-second clicks
        const chats = await getTelegramChats();
        if (chats.length === 0) {
          alert("ไม่พบสมาชิกที่ลงทะเบียนเปิดใช้งานบอต กรุณากดปุ่มเปิดคุยกับบอตและกด Start ก่อน");
          btnTestTelegram.disabled = false;
          btnTestTelegram.textContent = "🧪 ทดสอบส่ง";
          return;
        }
        
        await sendTelegramSummaryNotification(
          "🧪 <b>[STA69 Ledger Hub - ทดสอบระบบแจ้งเตือน]</b>",
          "ระบบทำงานได้อย่างถูกต้อง! นี่คือข้อความทดสอบเพื่อเช็คความพร้อมรับการแจ้งเตือนส่วนตัวผ่านแชทบอตโดยตรง"
        );
        
        alert("ส่งข้อความทดสอบไปยังสมาชิกทุกคนแล้ว! กรุณาตรวจสอบใน Telegram ส่วนตัวของคุณ");
        btnTestTelegram.disabled = false;
        btnTestTelegram.textContent = "🧪 ทดสอบส่ง";
      });
    }
  }



  // Selector changes
  projectSelect.addEventListener("change", () => {
    if (projectSelect.value) {
      const parts = projectSelect.value.split('_');
      currentProject = parts[0];
      currentYear = parts[1];
      renderDashboard();
    }
  });

  // --- Course Comparison View Listeners ---
  const btnCompareCourses = document.getElementById("btnCompareCourses");
  const btnBackToDashboard = document.getElementById("btnBackToDashboard");
  const btnRunComparison = document.getElementById("btnRunComparison");
  
  if (btnCompareCourses) {
    btnCompareCourses.addEventListener("click", () => {
      document.querySelector(".dashboard-grid").style.display = "none";
      document.getElementById("comparisonView").style.display = "block";
      initCompareFilters();
    });
  }
  
  if (btnBackToDashboard) {
    btnBackToDashboard.addEventListener("click", () => {
      document.getElementById("comparisonView").style.display = "none";
      document.querySelector(".dashboard-grid").style.display = "";
    });
  }
  
  if (btnRunComparison) {
    btnRunComparison.addEventListener("click", () => {
      runComparison();
    });
  }
  


  // Add Project
  addProjectBtn.addEventListener("click", () => {
    dlgProject.showModal();
  });
  // Delete current project local option (Combined version)
  const deleteProjectBtn = document.getElementById("deleteProjectBtn");
  if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener("click", () => {
      if (!currentProject || !currentYear) return;
      const comboKey = `${currentProject}_${currentYear}`;
      const confirmed = confirm(`⚠️ คุณต้องการลบโปรเจกต์ "${currentProject}" ประจำปี พ.ศ. ${currentYear} และยอดบันทึกทั้งหมดของโปรเจกต์นี้บนเว็บแอปเครื่องนี้ใช่หรือไม่?\n\n(การกระทำนี้จะลบเฉพาะข้อมูลจำลองชั่วคราวบนเครื่องนี้เท่านั้น ข้อมูลจริงบน Google Sheets จะไม่หายและสามารถดึงกลับมาใหม่ได้โดยกด "ดึงข้อมูลจาก Google Sheets")`);
      if (confirmed) {
        if (db[comboKey]) {
          delete db[comboKey];
        }
        
        saveToLocalStorage();
        initializeSelectors();
        renderDashboard();
        
        // Telegram notifications
        sendTelegramSummaryNotification("🗑️ <b>ลบโปรเจกต์บนแดชบอร์ด</b>", `ทำรายการลบโปรเจกต์ <b>${currentProject} (${currentYear})</b> สำเร็จเรียบร้อยแล้ว`);
        
        alert(`ลบโปรเจกต์ "${currentProject} (${currentYear})" เรียบร้อยแล้ว`);
      }
    });
  }

  
  dlgProject.querySelector("form").addEventListener("submit", (e) => {
    const projName = document.getElementById("newProjectName").value.trim().toUpperCase();
    const projYear = document.getElementById("newProjectYear").value.trim();
    if (projName && projYear) {
      const comboKey = `${projName}_${projYear}`;
      
      if (!db[comboKey]) {
        db[comboKey] = { sales: [], ads: [], expenses: [], distributions: [], stock: [] };
      }
      
      saveToLocalStorage();
      initializeSelectors();
      
      // Select newly created combo
      projectSelect.value = comboKey;
      currentProject = projName;
      currentYear = projYear;
      
      renderDashboard();
      document.getElementById("newProjectName").value = "";
    }
  });

  

  
  if (dlgYear) {
    dlgYear.querySelector("form").addEventListener("submit", (e) => {
      const yearVal = document.getElementById("newYearVal").value.trim();
      if (yearVal) {
        const exists = Array.from(yearSelect.options).some(o => o.value === yearVal);
        if (!exists) {
          const option = document.createElement("option");
          option.value = yearVal;
          option.textContent = yearVal;
          // Sort years descending
          const options = Array.from(yearSelect.options);
          options.push(option);
          options.sort((a, b) => b.value - a.value);
          yearSelect.innerHTML = "";
          options.forEach(opt => yearSelect.appendChild(opt));
        }
        yearSelect.value = yearVal;
        currentYear = yearVal;
        
        // Initialize in db if not exists
        const key = `${currentProject}_${currentYear}`;
        if (!db[key]) {
          db[key] = { sales: [], ads: [], expenses: [], distributions: [], stock: [] };
        }
        
        saveToLocalStorage();
        renderDashboard();
        document.getElementById("newYearVal").value = "";
      }
    });
  }

  // Reset Demo button
  resetDemoBtn.addEventListener("click", async () => {
    if (confirm("คุณต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นข้อมูลเริ่มต้นจาก Excel ใช่หรือไม่? (ข้อมูลที่กรอกเพิ่มจะหายไป)")) {
      localStorage.removeItem("sta69_revenue_tracker_db");
      await loadDatabase();
      initializeSelectors();
      renderDashboard();
      alert("รีเซ็ตข้อมูลสำเร็จ!");
    }
  });

  // Backup export
  exportBackupBtn.addEventListener("click", () => {
    const dataStr = JSON.stringify(db, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Download Excel Report
  const downloadExcelBtn = document.getElementById("downloadExcelBtn");
  if (downloadExcelBtn) {
    downloadExcelBtn.addEventListener("click", async () => {
      try {
        downloadExcelBtn.disabled = true;
        const origText = downloadExcelBtn.textContent;
        downloadExcelBtn.innerHTML = `
          <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" style="margin-right: 5px; animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          กำลังสร้าง Excel...
        `;
        
        const workbook = new ExcelJS.Workbook();
        
        // Define ordered list of keys to export so sheets appear in correct order
        const orderedTabs = [
          { key: "STA_2570", name: "Sta70", color: "10B981" },
          { key: "3COOL_2569", name: "3COOL69", color: "3B82F6" },
          { key: "3za_2569", name: "3za69", color: "6366F1" },
          { key: "STA_2569", name: "Sta69", color: "10B981" },
          { key: "3COOL_2568", name: "3Cool68", color: "3B82F6" },
          { key: "3za_2568", name: "3za68", color: "6366F1" }
        ];
        
        // Add any other keys in db that are not in the list
        Object.keys(db).forEach(key => {
          if (key === "access_password" || key === "telegram_chats" || key === "line_settings") return;
          if (!orderedTabs.some(t => t.key === key)) {
            const parts = key.split('_');
            const name = parts.length === 2 ? parts[0] + parts[1].slice(2) : key;
            orderedTabs.push({ key, name, color: "475569" });
          }
        });
        
        orderedTabs.forEach(({ key, name, color }) => {
          const data = db[key];
          if (!data) return; // Skip if no data for this project
          
          const ws = workbook.addWorksheet(name, {
            views: [{ showGridLines: true }]
          });
          
          // Set columns A to J width initially
          const defaultWidths = [15, 25, 15, 15, 25, 15, 20, 15, 15, 15];
          for (let i = 1; i <= 10; i++) {
            ws.getColumn(i).width = defaultWidths[i-1];
          }
          
          // 1. Banner (A1:J1)
          ws.mergeCells('A1:J1');
          const banner = ws.getCell('A1');
          banner.value = `STA69 LEDGER REPORT - ${name.toUpperCase()}`;
          banner.font = { name: 'Angsana New', size: 18, bold: true, color: { argb: 'FFFFFF' } };
          banner.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: color }
          };
          banner.alignment = { vertical: 'middle', horizontal: 'center' };
          ws.getRow(1).height = 35;
          
          // Helpers for formatting
          const borderStyle = {
            top: { style: 'thin', color: { argb: 'D1D5DB' } },
            left: { style: 'thin', color: { argb: 'D1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
            right: { style: 'thin', color: { argb: 'D1D5DB' } }
          };
          
          const styleHeader = (cell, text, bgColor = 'F3F4F6', fgColor = '1F2937') => {
            cell.value = text;
            cell.font = { name: 'Angsana New', size: 14, bold: true, color: { argb: fgColor } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = borderStyle;
          };
          
          const styleCell = (cell, value, numFormat = null, isBold = false, align = 'left') => {
            cell.value = value;
            cell.font = { name: 'Angsana New', size: 14, bold: isBold };
            cell.alignment = { vertical: 'middle', horizontal: align };
            cell.border = borderStyle;
            if (numFormat) {
              cell.numFormat = numFormat;
            }
          };
          
          // 2. Sales Table (Cols A-C, starting Row 3)
          ws.mergeCells('A3:C3');
          styleHeader(ws.getCell('A3'), '📊 รายรับ (Sales)', 'FBCFE8', '9D174D'); // pink accent
          styleHeader(ws.getCell('A4'), 'รหัสคอร์ส');
          styleHeader(ws.getCell('B4'), 'จำนวน');
          styleHeader(ws.getCell('C4'), 'ราคา');
          
          const sales = data.sales || [];
          let currentSalesRow = 5;
          sales.forEach(item => {
            styleCell(ws.getCell(`A${currentSalesRow}`), item.code, null, false, 'left');
            styleCell(ws.getCell(`B${currentSalesRow}`), item.qty, '#,##0', false, 'right');
            styleCell(ws.getCell(`C${currentSalesRow}`), item.totalPrice, '#,##0.00', false, 'right');
            currentSalesRow++;
          });
          // Fill blank row to at least Row 10 to preserve space
          while (currentSalesRow <= 10) {
            styleCell(ws.getCell(`A${currentSalesRow}`), '');
            styleCell(ws.getCell(`B${currentSalesRow}`), '');
            styleCell(ws.getCell(`C${currentSalesRow}`), '');
            currentSalesRow++;
          }
          
          // 3. Summary Table (Cols E-F, starting Row 3)
          ws.mergeCells('E3:F3');
          styleHeader(ws.getCell('E3'), '📈 สรุปภาพรวม (Summary)', 'FCE7F3', '9D174D');
          
          const totalRev = sales.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
          const totalAds = (data.ads || []).reduce((sum, item) => sum + (item.price || 0), 0);
          const totalExp = (data.expenses || []).reduce((sum, item) => sum + (item.price || 0), 0);
          const totalDist = (data.distributions || []).reduce((sum, item) => sum + (item.total || 0), 0);
          const netProfit = totalRev - totalAds - totalExp;
          const balance = netProfit - totalDist;
          
          const metrics = [
            { label: 'รวมรายรับ', val: totalRev },
            { label: 'รวมรายจ่าย', val: totalExp + totalAds },
            { label: 'คงเหลือ', val: balance }
          ];
          
          metrics.forEach((m, idx) => {
            const r = 4 + idx;
            styleCell(ws.getCell(`E${r}`), m.label, null, true, 'left');
            styleCell(ws.getCell(`F${r}`), m.val, '#,##0.00', true, 'right');
            // Highlight remaining balance
            if (m.label === 'คงเหลือ') {
              ws.getCell(`E${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } }; // light yellow
              ws.getCell(`F${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
            }
          });
          
          // 4. Portion / Sharing (Row 8 to 10 in E-F)
          styleCell(ws.getCell('E8'), 'รายได้ทั้งหมด', null, false, 'left');
          styleCell(ws.getCell('F8'), totalRev, '#,##0.00', false, 'right');
          styleCell(ws.getCell('E9'), 'แอดทั้งหมด', null, false, 'left');
          styleCell(ws.getCell('F9'), totalAds, '#,##0.00', false, 'right');
          
          styleCell(ws.getCell('E11'), 'แบ่งแล้วรวม', null, true, 'left');
          styleCell(ws.getCell('F11'), totalDist, '#,##0.00', true, 'right');
          styleCell(ws.getCell('E12'), 'แบ่งคนละ (3 คน)', null, false, 'left');
          styleCell(ws.getCell('F12'), totalDist / 3, '#,##0.00', false, 'right');
          
          // 5. Stock Inventory (Cols E-F, Row 14)
          ws.mergeCells('E14:F14');
          styleHeader(ws.getCell('E14'), '📦 หนังสือคงเหลือ', 'FFEDD5', '9A3412'); // orange accent
          styleHeader(ws.getCell('E15'), 'รหัสหนังสือ');
          styleHeader(ws.getCell('F15'), 'คงเหลือ');
          
          const stock = data.stock || [];
          let currentStockRow = 16;
          stock.forEach(item => {
            const code = item.bookCode.toLowerCase();
            const received = item.received || 0;
            
            // Dynamic sold calculation based on custom keywords
            const keywords = (item.deductKeywords || code)
              .split(",")
              .map(k => k.trim().toLowerCase())
              .filter(k => k !== "");
              
            let sold = 0;
            (data.sales || []).forEach(sale => {
              const saleCode = (sale.code || "").toLowerCase();
              const qty = sale.qty || 0;
              
              const isMatch = keywords.some(keyword => saleCode.includes(keyword));
              if (isMatch) {
                sold += qty;
              }
            });
            
            const remaining = received - sold;
            
            styleCell(ws.getCell(`E${currentStockRow}`), item.bookCode.toUpperCase(), null, false, 'left');
            styleCell(ws.getCell(`F${currentStockRow}`), remaining, '#,##0', false, 'right');
            currentStockRow++;
          });
          while (currentStockRow <= 18) {
            styleCell(ws.getCell(`E${currentStockRow}`), '');
            styleCell(ws.getCell(`F${currentStockRow}`), '');
            currentStockRow++;
          }
          
          // 6. Section Headers for Logs (Row 20)
          ws.mergeCells('A20:C20');
          styleHeader(ws.getCell('A20'), '📣 ประวัติค่าแอด (Ads Cost)', 'DBEAFE', '1E40AF'); // blue accent
          styleHeader(ws.getCell('A21'), 'วัน/เดือน/ปี');
          styleHeader(ws.getCell('B21'), 'รายการ');
          styleHeader(ws.getCell('C21'), 'ราคา');
          
          ws.mergeCells('D20:G20');
          styleHeader(ws.getCell('D20'), '💸 รายจ่ายอื่นๆ (Other Expenses)', 'F3E8FF', '6B21A8'); // purple accent
          styleHeader(ws.getCell('D21'), 'วัน/เดือน/ปี');
          styleHeader(ws.getCell('E21'), 'รายการ');
          styleHeader(ws.getCell('F21'), 'ราคา');
          styleHeader(ws.getCell('G21'), 'หมายเหตุ');
          
          ws.mergeCells('H20:J20');
          styleHeader(ws.getCell('H20'), '🤝 ประวัติแบ่งปันผล (Profit Sharing)', 'D1FAE5', '065F46'); // green accent
          styleHeader(ws.getCell('H21'), 'วัน/เดือน/ปี');
          styleHeader(ws.getCell('I21'), 'แบ่งคนละ');
          styleHeader(ws.getCell('J21'), 'รวมทั้งหมด');
          
          // Write Ads logs (A22 onwards)
          let rAds = 22;
          (data.ads || []).forEach(item => {
            styleCell(ws.getCell(`A${rAds}`), item.date, null, false, 'center');
            styleCell(ws.getCell(`B${rAds}`), item.description, null, false, 'left');
            styleCell(ws.getCell(`C${rAds}`), item.price, '#,##0.00', false, 'right');
            rAds++;
          });
          
          // Write Expenses logs (D22 onwards)
          let rExp = 22;
          (data.expenses || []).forEach(item => {
            styleCell(ws.getCell(`D${rExp}`), item.date, null, false, 'center');
            styleCell(ws.getCell(`E${rExp}`), item.description, null, false, 'left');
            styleCell(ws.getCell(`F${rExp}`), item.price, '#,##0.00', false, 'right');
            styleCell(ws.getCell(`G${rExp}`), item.note || '', null, false, 'left');
            rExp++;
          });
          
          // Write Distributions logs (H22 onwards)
          let rDist = 22;
          (data.distributions || []).forEach(item => {
            styleCell(ws.getCell(`H${rDist}`), item.date, null, false, 'center');
            styleCell(ws.getCell(`I${rDist}`), item.perPerson, '#,##0.00', false, 'right');
            styleCell(ws.getCell(`J${rDist}`), item.total, '#,##0.00', false, 'right');
            rDist++;
          });
          
          // Make sure grid borders look nice and cover the longest column length
          const maxLogRows = Math.max(rAds, rExp, rDist, 25);
          for (let r = 22; r <= maxLogRows; r++) {
            ['A','B','C','D','E','F','G','H','I','J'].forEach(col => {
              const cell = ws.getCell(`${col}${r}`);
              if (!cell.value) {
                styleCell(cell, '');
              }
            });
          }
          
          // Autofit columns logic with padding
          ws.columns.forEach((col, idx) => {
            let maxLen = 0;
            col.eachCell({ includeEmpty: false }, cell => {
              if (cell.address === `A1`) return; // skip header banner
              const valStr = cell.value ? cell.value.toString() : '';
              if (valStr.length > maxLen) maxLen = valStr.length;
            });
            // Pad and cap column widths
            col.width = Math.min(Math.max(defaultWidths[idx], maxLen + 3), 40);
          });
        });
        
        // Write to buffer and trigger download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ledger_report_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert("ดาวน์โหลดไฟล์ Excel บัญชีทั้งหมด (.xlsx) สำเร็จเรียบร้อยแล้ว!");
      } catch (err) {
        console.error("Failed to generate Excel file:", err);
        alert("เกิดข้อผิดพลาดในการสร้างไฟล์ Excel: " + err.message);
      } finally {
        downloadExcelBtn.disabled = false;
        downloadExcelBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          ดาวน์โหลด Excel
        `;
      }
    });
  }

  // LINE Settings Modal show
  const dlgLine = document.getElementById("dlgLine");
  if (lineSettingsBtn && dlgLine) {
    lineSettingsBtn.addEventListener("click", () => {
      dlgLine.showModal();
      fetchLineQuota();
    });
  }

  async function fetchLineQuota() {
    const quotaRemainingEl = document.getElementById("lineQuotaRemaining");
    const quotaDetailsEl = document.getElementById("lineQuotaDetails");
    if (!quotaRemainingEl) return;
    
    quotaRemainingEl.textContent = "⏳ กำลังดึงข้อมูลโควตาจาก LINE...";
    quotaRemainingEl.style.color = "var(--text-secondary)";
    if (quotaDetailsEl) quotaDetailsEl.textContent = "";
    
    try {
      const gasUrl = "https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=get-line-quota";
      const res = await fetch(gasUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.status === "success") {
        const remaining = data.remaining;
        const total = data.total;
        const usage = data.usage;
        
        quotaRemainingEl.textContent = `คงเหลือโควตาฟรี: ${remaining.toLocaleString()} ข้อความ`;
        quotaRemainingEl.style.color = remaining > 0 ? "#10b981" : "#ef4444";
        
        if (quotaDetailsEl) {
          quotaDetailsEl.textContent = `(ใช้ไปแล้ว ${usage.toLocaleString()} / ทั้งหมด ${total === 999999 ? "ไม่จำกัด" : total.toLocaleString()} ข้อความในเดือนนี้)`;
        }
      } else {
        quotaRemainingEl.textContent = "❌ ดึงข้อมูลโควตาไม่สำเร็จ";
        quotaRemainingEl.style.color = "#ef4444";
      }
    } catch (err) {
      console.error("Error fetching LINE quota:", err);
      quotaRemainingEl.textContent = "❌ เกิดข้อผิดพลาดในการเชื่อมต่อระบบ";
      quotaRemainingEl.style.color = "#ef4444";
    }
  }

  // Copy LINE Link handler
  const btnCopyLineLink = document.getElementById("btnCopyLineLink");
  const lineBotFriendLink = document.getElementById("lineBotFriendLink");
  if (btnCopyLineLink && lineBotFriendLink) {
    btnCopyLineLink.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(lineBotFriendLink.value);
        
        // Temporarily change button styling to show success
        const originalText = btnCopyLineLink.textContent;
        btnCopyLineLink.textContent = "✓ คัดลอกแล้ว!";
        btnCopyLineLink.style.background = "var(--accent-revenue-grad)";
        btnCopyLineLink.style.borderColor = "var(--accent-revenue)";
        
        setTimeout(() => {
          btnCopyLineLink.textContent = originalText;
          btnCopyLineLink.style.background = "";
          btnCopyLineLink.style.borderColor = "";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy link:", err);
        // Fallback copy using select & execCommand
        lineBotFriendLink.select();
        document.execCommand("copy");
        alert("คัดลอกลิงก์เพิ่มเพื่อนสำเร็จ!");
      }
    });
  }
  
  backupFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const importedDb = JSON.parse(evt.target.result);
        // Verify format
        let isValid = true;
        Object.keys(importedDb).forEach(k => {
          if (k !== "access_password" && !k.includes('_')) isValid = false;
        });
        
        if (isValid) {
          db = importedDb;
          if (db.access_password) {
            localStorage.setItem("sta69_access_password", db.access_password);
          }
          saveToLocalStorage();
          initializeSelectors();
          renderDashboard();
          alert("นำเข้าข้อมูลสำรองเรียบร้อยแล้ว! (รหัสผ่านของระบบได้รับการซิงก์เรียบร้อยแล้ว)");
        } else {
          alert("ไฟล์ข้อมูลสำรองไม่ถูกต้อง");
        }
      } catch (err) {
        alert("ไม่สามารถอ่านไฟล์ได้: " + err.message);
      }
    };
    reader.readAsText(file);
    backupFileInput.value = ""; // reset input
  });

  // Toggle Settings actions on mobile
  document.getElementById("toggleSettingsBtn").addEventListener("click", () => {
    const dbActions = document.querySelector(".database-actions");
    dbActions.classList.toggle("show");
  });

  // --- Carryover Balance Event Listeners ---
  const carryoverBtn = document.getElementById("carryoverBtn");
  if (carryoverBtn) {
    carryoverBtn.addEventListener("click", () => {
      // Find all available projects in DB
      const projectKeys = Object.keys(db).filter(k => {
        return typeof db[k] === 'object' && 
               db[k] !== null && 
               k !== 'access_password' && 
               k !== 'line_passcode' && 
               k !== 'telegram_settings' && 
               k !== 'telegram_passcode' && 
               k !== 'telegram_chats';
      });

      const activeKey = `${currentProject}_${currentYear}`;
      if (projectKeys.length <= 1) {
        alert("กรุณาสร้างโปรเจกต์ประจำปีอื่นก่อน เพื่อทำรายการยกยอดเงินคงเหลือข้ามโปรเจกต์ครับ");
        return;
      }

      // Calculate remaining balance of the active project
      const activeData = db[activeKey] || { sales: [], ads: [], expenses: [], distributions: [], stock: [] };
      let totalRevenue = 0;
      activeData.sales.forEach(s => { if (s.status !== "Cancelled") totalRevenue += parseFloat(s.totalPrice || 0); });
      let totalAds = 0;
      activeData.ads.forEach(a => { if (a.status !== "Cancelled") totalAds += parseFloat(a.price || 0); });
      let totalExpenses = 0;
      activeData.expenses.forEach(e => { if (e.status !== "Cancelled") totalExpenses += parseFloat(e.price || 0); });
      let totalDistributed = 0;
      activeData.distributions.forEach(d => { if (d.status !== "Cancelled") totalDistributed += parseFloat(d.total || 0); });

      const netProfit = totalRevenue - totalAds - totalExpenses;
      const remainingBalance = netProfit - totalDistributed;

      // Populate source project
      const carrySource = document.getElementById("carrySource");
      carrySource.innerHTML = `<option value="${activeKey}">${currentProject} (${currentYear})</option>`;
      
      // Update available balance label
      const carryAvailableBalance = document.getElementById("carryAvailableBalance");
      if (carryAvailableBalance) {
        carryAvailableBalance.textContent = `${formatCurrency(remainingBalance)} บาท`;
        if (remainingBalance < 0) {
          carryAvailableBalance.style.color = "#f87171";
        } else {
          carryAvailableBalance.style.color = "var(--primary-btn-bg)";
        }
      }

      // Populate destination projects
      const carryDest = document.getElementById("carryDest");
      carryDest.innerHTML = `<option value="" disabled selected>-- เลือกโปรเจกต์ปลายทาง --</option>`;
      
      projectKeys.forEach(k => {
        if (k !== activeKey) {
          const match = k.match(/^([a-zA-Z0-9]+?)_(\d{4})$/);
          if (match) {
            const option = document.createElement("option");
            option.value = k;
            option.textContent = `${match[1]} (${match[2]})`;
            carryDest.appendChild(option);
          }
        }
      });

      // Set default transfer amount to max remaining balance
      const carryAmount = document.getElementById("carryAmount");
      if (carryAmount) {
        carryAmount.value = remainingBalance > 0 ? remainingBalance.toFixed(2) : "0.00";
        carryAmount.max = remainingBalance > 0 ? remainingBalance : "";
      }

      dlgCarryover.showModal();
    });
  }

  const carryoverForm = document.getElementById("carryoverForm");
  if (carryoverForm) {
    carryoverForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const carryDest = document.getElementById("carryDest");
      const carryAmountInput = document.getElementById("carryAmount");
      const destKey = carryDest.value;
      const amount = parseFloat(carryAmountInput.value) || 0;

      if (!destKey) {
        alert("กรุณาเลือกโปรเจกต์ปลายทาง");
        return;
      }
      if (amount <= 0) {
        alert("จำนวนเงินที่ต้องการโอนต้องมากกว่า 0 บาท");
        return;
      }

      const matchDest = destKey.match(/^([a-zA-Z0-9]+?)_(\d{4})$/);
      if (!matchDest) return;
      const destProjName = matchDest[1];
      const destProjYear = matchDest[2];
      const actualDestTab = destProjName + destProjYear.substring(2); // e.g. "Sta69"
      const actualSrcTab = currentProject + currentYear.substring(2);

      const confirmBtn = document.getElementById("btnConfirmCarryover");
      const originalText = confirmBtn.textContent;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "⏳ กำลังดำเนินการโอนยอด...";

      try {
        const adminName = localStorage.getItem("sta69_admin_name") || "แอดมิน";
        
        // Call Apps Script execute-carryover API
        const gasUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=execute-carryover&sourceProject=${encodeURIComponent(actualSrcTab)}&destProject=${encodeURIComponent(actualDestTab)}&amount=${amount}&adminName=${encodeURIComponent(adminName)}`;
        const res = await fetch(gasUrl);
        const data = await res.json();

        if (data.status !== "success") {
          throw new Error(data.message || "การโอนย้ายล้มเหลวบนเซิร์ฟเวอร์");
        }

        // Notify Telegram
        const telegramTitle = "🔄 <b>โอนย้ายยอดเงินคงเหลือสำเร็จ</b>";
        const telegramDetail = `• จากงาน: <b>${currentProject} (${currentYear})</b>\n` +
                               `• ไปยังงาน: <b>${destProjName} (${destProjYear})</b>\n` +
                               `• จำนวนโอน: <b>${formatCurrency(amount)} บาท</b>\n` +
                               `• ผู้ทำรายการ: <b>${adminName}</b>`;
        sendTelegramSummaryNotification(telegramTitle, telegramDetail);

        alert(`โอนย้ายยอดสำเร็จ!\nโอนเงินจำนวน ${formatCurrency(amount)} บาท จาก ${currentProject} (${currentYear}) ไปยัง ${destProjName} (${destProjYear}) เรียบร้อยแล้วครับ ระบบจะทำการดึงข้อมูลจาก Sheets เพื่ออัปเดตผลทันที`);
        
        dlgCarryover.close();

        // Automatically trigger sync sheets to pull down new transactions
        const syncSheetsBtn = document.getElementById("syncSheetsBtn");
        if (syncSheetsBtn) {
          syncSheetsBtn.click();
          // Auto fill Sheet URL and start sync if possible
          setTimeout(() => {
            const sheetUrlInput = document.getElementById("sheetUrl");
            if (sheetUrlInput && sheetUrlInput.value) {
              const syncForm = document.getElementById("syncForm");
              if (syncForm) {
                // Submit the sync form
                const submitEvent = new Event('submit', { cancelable: true });
                syncForm.dispatchEvent(submitEvent);
              }
            }
          }, 300);
        }
      } catch (err) {
        console.error("Error executing balance carryover:", err);
        alert("เกิดข้อผิดพลาดในการโอนย้ายยอด: " + err.message);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
      }
    });
  }

// Silent Background Google Sheets Sync
async function silentAutoSyncGoogleSheets() {
  // First attempt: fetch 100% live data directly from Google Apps Script endpoint
  try {
    const gasSyncUrl = `https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=sync-all-sheets&v=${Date.now()}`;
    const res = await fetch(gasSyncUrl);
    const result = await res.json();
    if (result && result.status === "success" && result.data) {
      Object.keys(result.data).forEach(tabKey => {
        if (result.data[tabKey]) {
          const tabData = result.data[tabKey];
          // Preserve local slips if present
          const oldData = db[tabKey];
          if (oldData) {
            if (oldData.sales && tabData.sales) {
              tabData.sales.forEach(newSale => {
                const match = oldData.sales.find(o => o.code && o.code.replace(/\s+/g, "").toUpperCase() === newSale.code.replace(/\s+/g, "").toUpperCase());
                if (match && match.slips) newSale.slips = match.slips;
              });
            }
            if (oldData.ads && tabData.ads) {
              tabData.ads.forEach(newAd => {
                const match = oldData.ads.find(o => o.date === newAd.date && o.description === newAd.description && o.price === newAd.price);
                if (match && match.slips) newAd.slips = match.slips;
              });
            }
            if (oldData.expenses && tabData.expenses) {
              tabData.expenses.forEach(newExp => {
                const match = oldData.expenses.find(o => o.date === newExp.date && o.description === newExp.description && o.price === newExp.price);
                if (match && match.slips) newExp.slips = match.slips;
              });
            }
            if (oldData.distributions && tabData.distributions) {
              tabData.distributions.forEach(newDist => {
                const match = oldData.distributions.find(o => o.date === newDist.date && o.total === newDist.total);
                if (match && match.slips) newDist.slips = match.slips;
              });
            }
          }
          if (Array.isArray(tabData.distributions)) {
            const unique = [];
            const seen = new Set();
            tabData.distributions.forEach(d => {
              const key = `${d.date}_${d.total}`;
              if (!seen.has(key)) {
                seen.add(key);
                unique.push(d);
              }
            });
            tabData.distributions = unique;
          }
          db[tabKey] = tabData;
        }
      });
      saveToLocalStorage();
      initializeSelectors();
      renderDashboard();
      console.log("Live Apps Script auto-sync complete.");
      return;
    }
  } catch (err) {
    console.warn("Direct Apps Script sync failed, falling back to CSV export:", err);
  }

  const sheetUrlInput = document.getElementById("sheetUrl");
  const urlInput = sheetUrlInput ? sheetUrlInput.value.trim() : "https://docs.google.com/spreadsheets/d/15PDmzbRGXocSvm42lksU9KNRcg7op31qc-b1JEo4wjQ/edit?usp=drivesdk";
  const match = urlInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return;
  const sheetId = match[1];
  
  const tabsToSync = [
    { key: "STA_2570", gid: "1976533842", name: "Sta70" },
    { key: "3COOL_2569", gid: "270727382", name: "3COOL69" },
    { key: "3za_2569", gid: "55359882", name: "3za69" },
    { key: "STA_2569", gid: "252763416", name: "Sta69" },
    { key: "3COOL_2568", gid: "881957766", name: "3Cool68" },
    { key: "3za_2568", gid: "0", name: "3za68" }
  ];

  function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i+1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',') {
        if (inQuotes) {
          row[row.length - 1] += ',';
        } else {
          row.push('');
        }
      } else if (c === '\n' || c === '\r') {
        if (inQuotes) {
          row[row.length - 1] += c;
        } else {
          if (c === '\r' && next === '\n') i++;
          lines.push(row);
          row = [''];
        }
      } else {
        row[row.length - 1] += c;
      }
    }
    if (row.length > 1 || row[0] !== '') lines.push(row);
    return lines;
  }

  function cleanNum(val) {
    if (!val) return 0.0;
    val = val.replace(/"/g, '').replace(/,/g, '').trim();
    if (!val) return 0.0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0.0 : parsed;
  }
  
  function cleanInt(val) {
    if (!val) return 0;
    val = val.replace(/"/g, '').replace(/,/g, '').trim();
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  try {
    const fetchPromises = tabsToSync.map(async (tab) => {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}&t=${Date.now()}`;
      try {
        const res = await fetch(csvUrl, { cache: "no-store" });
        if (!res.ok) return null;
        const csvText = await res.text();
        return { tab, csvText, success: true };
      } catch (err) {
        return null;
      }
    });
    
    const fetchedResults = await Promise.all(fetchPromises);
    const validResults = fetchedResults.filter(r => r && r.success);
    if (validResults.length === 0) return;

    for (const result of validResults) {
      const { tab, csvText } = result;
      const oldData = db[tab.key];
      const reader = parseCSV(csvText);
      if (!reader || reader.length === 0) continue;

      const sales = [];
      const ads = [];
      const expenses = [];
      const distributions = [];
      const stock = [];
      
      // 1. Parse Sales (Row indices 2 to 9)
      for (let r_idx = 2; r_idx < Math.min(10, reader.length); r_idx++) {
        const row = reader[r_idx];
        if (!row || row.length < 3) continue;
        const code = row[0].trim();
        const qtyStr = row[1].trim();
        const priceStr = row[2].trim();
        if (!code && !qtyStr && (!priceStr || priceStr === "0.00" || priceStr === "0")) continue;
        if (["รหัส", "จำนวน", "ราคา", ""].includes(code)) continue;
        
        const qty = cleanInt(qtyStr);
        const totalPrice = cleanNum(priceStr);
        const unitPrice = qty > 0 ? Math.round(totalPrice / qty) : totalPrice;
        if (code) sales.push({ code, qty, unitPrice, totalPrice });
      }

      // Preserve local sales if local storage has higher qty/totalPrice
      if (oldData && oldData.sales) {
        sales.forEach(newSale => {
          const normNewCode = newSale.code.replace(/\s+/g, "").toUpperCase();
          const oldMatch = oldData.sales.find(oldSale => oldSale.code && oldSale.code.replace(/\s+/g, "").toUpperCase() === normNewCode);
          if (oldMatch) {
            if ((oldMatch.qty || 0) > newSale.qty) {
              newSale.qty = oldMatch.qty;
              newSale.totalPrice = Math.max(newSale.totalPrice, oldMatch.totalPrice || 0);
              newSale.unitPrice = newSale.qty > 0 ? Math.round(newSale.totalPrice / newSale.qty) : newSale.totalPrice;
            }
          }
        });
      }

      // Ensure 3 ZEED entry in STA_2570 is populated (1 person, 1990 Baht)
      if (tab.key === "STA_2570") {
        const item3Zeed = sales.find(s => s.code && s.code.replace(/\s+/g, "").toUpperCase() === "3ZEED");
        if (item3Zeed && item3Zeed.qty === 0) {
          item3Zeed.qty = 1;
          item3Zeed.unitPrice = 1990;
          item3Zeed.totalPrice = 1990;
        }
      }

      // 2. Parse Stock (Row indices 12 to 16)
      for (let r_idx = 12; r_idx < Math.min(17, reader.length); r_idx++) {
        const row = reader[r_idx];
        if (row && row.length > 5) {
          const bookCode = row[3].trim().toLowerCase();
          const receivedStr = row[4].trim();
          if (["3zap", "3zeed", "zap", "zeed"].includes(bookCode) && receivedStr) {
            const received = cleanInt(receivedStr);
            stock.push({ bookCode, received });
          }
        }
      }

      // 3. Parse Ads, Expenses, Distributions
      for (let r_idx = 0; r_idx < reader.length; r_idx++) {
        const row = reader[r_idx];
        if (!row) continue;
        const paddedRow = [...row, ...Array(10).fill("")].slice(0, 10);
        
        const ad_date = paddedRow[0].trim();
        const ad_desc = paddedRow[1].trim();
        const ad_price_str = paddedRow[2].trim();
        if (ad_date && ad_desc && ad_price_str) {
          const price = cleanNum(ad_price_str);
          if (price > 0) ads.push({ date: formatDisplayDate(ad_date), description: ad_desc, price });
        }
        
        const exp_date = paddedRow[3].trim();
        const exp_desc = paddedRow[4].trim();
        const exp_price_str = paddedRow[5].trim();
        const exp_note = paddedRow[6].trim();
        if (exp_date && exp_desc && exp_price_str) {
          const price = cleanNum(exp_price_str);
          const isDistribution = ["แบ่ง", "คนละ", "ส่วนแบ่ง"].some(w => exp_desc.includes(w));
          if (isDistribution) {
            const matchVal = exp_desc.replace(/k/gi, '000').match(/([\d,]+)/);
            let perPerson = matchVal ? cleanNum(matchVal[1]) : 0.0;
            if (exp_desc.toLowerCase().includes('k') && perPerson < 1000) perPerson *= 1000;
            if (perPerson === 0.0) perPerson = price / 3.0;
            distributions.push({ date: formatDisplayDate(exp_date), perPerson, total: price, note: exp_desc });
          } else if (price > 0) {
            expenses.push({ date: formatDisplayDate(exp_date), description: exp_desc, price, note: exp_note });
          }
        }

        const dist_date = paddedRow[7].trim();
        const dist_per_person_str = paddedRow[8].trim();
        const dist_total_str = paddedRow[9].trim();
        if (dist_date && (dist_per_person_str || dist_total_str)) {
          let perPerson = cleanNum(dist_per_person_str);
          let total = cleanNum(dist_total_str);
          if (total === 0.0 && perPerson > 0) total = perPerson * 3;
          if (perPerson === 0.0 && total > 0) perPerson = total / 3;
          if (total > 0) {
            distributions.push({
              date: formatDisplayDate(dist_date),
              perPerson,
              total,
              note: `แบ่งคนละ ${new Intl.NumberFormat('th-TH').format(perPerson)} บาท`
            });
          }
        }
      }

      const uniqueDists = [];
      const seenDists = new Set();
      distributions.forEach(d => {
        const distKey = `${d.date}_${d.total}`;
        if (!seenDists.has(distKey)) {
          seenDists.add(distKey);
          uniqueDists.push(d);
        }
      });

      // Preserve slips
      if (oldData) {
        if (oldData.ads) {
          ads.forEach(newAd => {
            const match = oldData.ads.find(oldAd => oldAd.date === newAd.date && oldAd.description === newAd.description && oldAd.price === newAd.price);
            if (match) {
              if (match.slips) newAd.slips = match.slips;
              if (match.slip) newAd.slip = match.slip;
            }
          });
        }
        if (oldData.expenses) {
          expenses.forEach(newExp => {
            const match = oldData.expenses.find(oldExp => oldExp.date === newExp.date && oldExp.description === newExp.description && oldExp.price === newExp.price && (oldExp.note || "") === (newExp.note || ""));
            if (match) {
              if (match.slips) newExp.slips = match.slips;
              if (match.slip) newExp.slip = match.slip;
            }
          });
        }
        if (oldData.distributions) {
          uniqueDists.forEach(newDist => {
            const match = oldData.distributions.find(oldDist => oldDist.date === newDist.date && oldDist.perPerson === newDist.perPerson && oldDist.total === newDist.total);
            if (match) {
              if (match.slips) newDist.slips = match.slips;
              if (match.slip) newDist.slip = match.slip;
            }
          });
        }
      }

      db[tab.key] = { sales, ads, expenses, distributions: uniqueDists, stock };
    }

    saveToLocalStorage();
    initializeSelectors();
    renderDashboard();
    console.log("Background Google Sheets auto-sync complete.");
  } catch (err) {
    console.error("Background auto-sync error:", err);
  }
}

function fixThaiEncoding(text) {
  if (!text || typeof text !== "string") return text;
  if (/[\u00C0-\u00FF]/.test(text) || text.includes("à¸") || text.includes("à¹")) {
    try {
      return decodeURIComponent(escape(text));
    } catch (e) {
      try {
        const bytes = new Uint8Array([...text].map(c => c.charCodeAt(0) & 0xff));
        return new TextDecoder("utf-8").decode(bytes);
      } catch (err) {
        return text;
      }
    }
  }
  return text;
}

function sanitizeLogObject(log) {
  if (!log) return log;
  const cleanLog = { ...log };
  cleanLog.actionType = fixThaiEncoding(cleanLog.actionType);
  cleanLog.editor = fixThaiEncoding(cleanLog.editor);
  cleanLog.project = fixThaiEncoding(cleanLog.project);

  if (typeof cleanLog.details === "object" && cleanLog.details !== null) {
    const cleanDetails = { ...cleanLog.details };
    for (let k in cleanDetails) {
      if (typeof cleanDetails[k] === "string") {
        cleanDetails[k] = fixThaiEncoding(cleanDetails[k]);
      }
    }
    cleanLog.details = cleanDetails;
  } else if (typeof cleanLog.details === "string") {
    cleanLog.details = fixThaiEncoding(cleanLog.details);
  }
  return cleanLog;
}

let cachedAllHistoryLogs = [];

async function loadHistoryTimeline() {
  const container = document.getElementById("historyTimeline");
  if (!container) return;

  // 1. Render local logs IMMEDIATELY (0ms instant open!)
  const localLogs = (db && db.historyLogs) ? db.historyLogs : [];
  const combinedMap = new Map();

  localLogs.forEach(rawLog => {
    if (rawLog && (rawLog.logId || rawLog.timestamp)) {
      const log = sanitizeLogObject(rawLog);
      const key = log.logId || `${log.timestamp}_${log.actionType}_${log.editor}`;
      combinedMap.set(key, log);
    }
  });

  cachedAllHistoryLogs = Array.from(combinedMap.values()).sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0;
    const timeB = new Date(b.timestamp).getTime() || 0;
    return timeB - timeA;
  });

  if (cachedAllHistoryLogs.length > 0) {
    renderHistoryTimelineItems(cachedAllHistoryLogs);
  } else {
    container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 15px; color: var(--text-secondary); font-size: 12px;">⏳ กำลังโหลดประวัติการบันทึกข้อมูล...</div>';
  }

  // 2. Fetch server logs in background with fast 3s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=get-history-logs", {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const serverLogs = await res.json();
      if (Array.isArray(serverLogs) && serverLogs.length > 0) {
        serverLogs.forEach(rawLog => {
          if (rawLog && (rawLog.logId || rawLog.timestamp)) {
            const log = sanitizeLogObject(rawLog);
            const key = log.logId || `${log.timestamp}_${log.actionType}_${log.editor}`;
            combinedMap.set(key, log);
          }
        });

        cachedAllHistoryLogs = Array.from(combinedMap.values()).sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime() || 0;
          const timeB = new Date(b.timestamp).getTime() || 0;
          return timeB - timeA;
        });

        // Save to local DB cache for next time
        if (db) {
          db.historyLogs = cachedAllHistoryLogs.slice(0, 150);
          saveToLocalStorage();
        }

        renderHistoryTimelineItems(cachedAllHistoryLogs);
      }
    }
  } catch (err) {
    console.warn("Background fetch of history logs timed out or failed, using cached logs:", err);
  }

  // Bind live search box
  const searchInput = document.getElementById("searchHistoryLogs");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        renderHistoryTimelineItems(cachedAllHistoryLogs);
        return;
      }
      const filtered = cachedAllHistoryLogs.filter(log => {
        const fullTxt = `${log.project || ""} ${log.actionType || ""} ${log.editor || ""} ${JSON.stringify(log.details || "")}`.toLowerCase();
        return fullTxt.includes(query);
      });
      renderHistoryTimelineItems(filtered);
    });
  }
}

function renderHistoryTimelineItems(logs) {
  const container = document.getElementById("historyTimeline");
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 15px; color: var(--text-muted); font-size: 12px;">ยังไม่มีประวัติการบันทึกข้อมูลในระบบ</div>';
    return;
  }

  container.innerHTML = "";
  logs.forEach(log => {
    const item = document.createElement("div");
    const isCancelled = log.status === "Cancelled";
    
    let borderColor = "#6366f1";
    const action = log.actionType || "";
    if (action.includes("สมัคร") || action.includes("รับ")) borderColor = "#10b981";
    else if (action.includes("จ่าย") || action.includes("ลบ")) borderColor = "#f43f5e";
    else if (action.includes("โฆษณา") || action.includes("แอด")) borderColor = "#3b82f6";
    else if (action.includes("สต็อก")) borderColor = "#a855f7";
    else if (action.includes("แบ่ง") || action.includes("ปันผล")) borderColor = "#f59e0b";

    item.className = `history-item ${isCancelled ? "cancelled" : ""}`;
    item.style.cssText = `background: #ffffff; border: 1px solid #e2e8f0; border-left: 3px solid ${borderColor}; border-radius: 8px; padding: 6px 10px; font-size: 11px; color: #1e293b; transition: all 0.15s ease;`;
    if (isCancelled) item.style.opacity = "0.5";

    const rawTime = log.timestamp;
    let timeStr = "ไม่ระบุเวลา";
    if (rawTime) {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) {
        const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        const day = d.getDate();
        const month = thaiMonths[d.getMonth()];
        const year = (d.getFullYear() + 543).toString().slice(-2);
        const hours = String(d.getHours()).padStart(2, "0");
        const mins = String(d.getMinutes()).padStart(2, "0");
        timeStr = `${day} ${month} ${year} ${hours}:${mins}`;
      } else {
        timeStr = rawTime;
      }
    }

    const editorStr = log.editor || "แอดมิน";
    const projStr = log.project ? `[${log.project}] ` : "";
    
    let detailsText = "";
    if (typeof log.details === "object" && log.details !== null) {
      const parts = [];
      if (log.details.code) parts.push(`คอร์ส: <b>${log.details.code}</b>`);
      if (log.details.qty !== undefined && log.details.qty !== null && log.details.qty !== 0) parts.push(`จำนวน: <b>${log.details.qty} คน</b>`);
      if (log.details.price !== undefined && log.details.price !== 0) parts.push(`ยอดเงิน: <b>${Number(log.details.price).toLocaleString()} บาท</b>`);
      if (log.details.description || log.details.desc) parts.push(`รายการ: <b>${log.details.description || log.details.desc}</b>`);
      if (log.details.note) parts.push(`(หมายเหตุ: ${log.details.note})`);
      detailsText = parts.join(" | ");
    } else {
      detailsText = String(log.details || "");
    }

    item.innerHTML = `
      <div class="history-item-header" style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; margin-bottom: 2px;">
        <span class="history-item-time" style="font-weight: 500;">🕒 ${timeStr}</span>
        <span class="history-item-editor" style="font-weight: 600; color: #4f46e5; background: rgba(79, 70, 229, 0.08); padding: 1px 6px; border-radius: 4px;">👤 ${editorStr}</span>
      </div>
      <div class="history-item-body" style="line-height: 1.35; font-size: 11px;">
        <strong style="color: #1e1b4b;">${projStr}${log.actionType || "ทำรายการ"}:</strong> ${detailsText}
      </div>
    `;
    container.appendChild(item);
  });
}

  // Open History Timeline Modal
  const historyBtn = document.getElementById("historyBtn");
  const dlgHistory = document.getElementById("dlgHistory");
  if (historyBtn && dlgHistory) {
    historyBtn.addEventListener("click", () => {
      dlgHistory.showModal();
      loadHistoryTimeline();
    });
  }

  // Open Google Sheets Sync Modal
  document.getElementById("syncSheetsBtn").addEventListener("click", () => {
    document.getElementById("syncProgressSection").style.display = "none";
    document.getElementById("syncStatusList").innerHTML = "";
    document.getElementById("btnStartSync").disabled = false;
    document.getElementById("dlgSync").showModal();
  });

  // Sync Form submission
  document.getElementById("syncForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const urlInput = document.getElementById("sheetUrl").value.trim();
    // Extract Spreadsheet ID
    const match = urlInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      alert("ลิงก์ Google Sheets ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
      return;
    }
    const sheetId = match[1];
    
    const progressSection = document.getElementById("syncProgressSection");
    const statusList = document.getElementById("syncStatusList");
    const btnStart = document.getElementById("btnStartSync");
    
    if (progressSection) progressSection.style.display = "block";
    if (btnStart) btnStart.disabled = true;
    
    const tabsToSync = [
      { key: "STA_2570", gid: "1976533842", name: "Sta70" },
      { key: "3COOL_2569", gid: "270727382", name: "3COOL69" },
      { key: "3za_2569", gid: "55359882", name: "3za69" },
      { key: "STA_2569", gid: "252763416", name: "Sta69" },
      { key: "3COOL_2568", gid: "881957766", name: "3Cool68" },
      { key: "3za_2568", gid: "0", name: "3za68" }
    ];
    
    function log(message, type = "") {
      const line = document.createElement("div");
      line.textContent = message;
      if (type === "error") line.style.color = "#ef4444";
      if (type === "success") line.style.color = "#10b981";
      if (statusList) {
        statusList.appendChild(line);
        statusList.scrollTop = statusList.scrollHeight;
      }
    }
    
    function parseCSV(text) {
      const lines = [];
      let row = [""];
      let inQuotes = false;
      
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];
        
        if (c === '"') {
          if (inQuotes && next === '"') {
            row[row.length - 1] += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === ',') {
          if (inQuotes) {
            row[row.length - 1] += ',';
          } else {
            row.push('');
          }
        } else if (c === '\n' || c === '\r') {
          if (inQuotes) {
            row[row.length - 1] += c;
          } else {
            if (c === '\r' && next === '\n') {
              i++;
            }
            lines.push(row);
            row = [''];
          }
        } else {
          row[row.length - 1] += c;
        }
      }
      if (row.length > 1 || row[0] !== '') {
        lines.push(row);
      }
      return lines;
    }

    function cleanNum(val) {
      if (!val) return 0.0;
      val = val.replace(/"/g, '').replace(/,/g, '').trim();
      if (!val) return 0.0;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0.0 : parsed;
    }
    
    function cleanInt(val) {
      if (!val) return 0;
      val = val.replace(/"/g, '').replace(/,/g, '').trim();
      if (!val) return 0;
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? 0 : parsed;
    }

    try {
      log("⏳ กำลังเริ่มดาวน์โหลดข้อมูลจาก Google Sheets (ทุกแท็บพร้อมกัน)...");
      
      const fetchPromises = tabsToSync.map(async (tab) => {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}&t=${Date.now()}`;
        try {
          const res = await fetch(csvUrl, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const csvText = await res.text();
          return { tab, csvText, success: true };
        } catch (err) {
          return { tab, error: err.message, success: false };
        }
      });
      
      const fetchedResults = await Promise.all(fetchPromises);
      
      // Check for errors
      const failed = fetchedResults.filter(r => !r.success);
      if (failed.length > 0) {
        const errorNames = failed.map(r => `${r.tab.name} (${r.error})`).join(", ");
        throw new Error(`เกิดข้อผิดพลาดในการดึงข้อมูลแท็บ: ${errorNames}`);
      }
      
      // Parse each tab locally
      for (const result of fetchedResults) {
        const { tab, csvText } = result;
        log(`⏳ กำลังวิเคราะห์ข้อมูลแท็บ ${tab.name}...`);
        const oldData = db[tab.key];
        
        const reader = parseCSV(csvText);
        
        if (reader.length === 0) {
          throw new Error(`แท็บ ${tab.name} ไม่มีข้อมูล`);
        }
        
        const sales = [];
        const ads = [];
        const expenses = [];
        const distributions = [];
        const stock = [];
        
        // 1. Parse Sales (Row indices 2 to 9)
        for (let r_idx = 2; r_idx < Math.min(10, reader.length); r_idx++) {
          const row = reader[r_idx];
          if (!row || row.length < 3) continue;
          
          const code = row[0].trim();
          const qtyStr = row[1].trim();
          const priceStr = row[2].trim();
          
          if (!code && !qtyStr && (!priceStr || priceStr === "0.00" || priceStr === "0")) continue;
          if (["รหัส", "จำนวน", "ราคา", ""].includes(code)) continue;
          
          const qty = cleanInt(qtyStr);
          const totalPrice = cleanNum(priceStr);
          const unitPrice = qty > 0 ? Math.round(totalPrice / qty) : totalPrice;
          
          if (code) {
            sales.push({ code, qty, unitPrice, totalPrice });
          }
        }
        
        // 2. Parse Book Stock (Row indices 12 to 16)
        for (let r_idx = 12; r_idx < Math.min(17, reader.length); r_idx++) {
          const row = reader[r_idx];
          if (row && row.length > 5) {
            const bookCode = row[3].trim().toLowerCase();
            const receivedStr = row[4].trim();
            if (["3zap", "3zeed", "zap", "zeed"].includes(bookCode) && receivedStr) {
              const received = cleanInt(receivedStr);
              stock.push({ bookCode, received });
            }
          }
        }
        
        // Fallback for stock if empty
        if (stock.length === 0) {
          for (let r_idx = 0; r_idx < reader.length; r_idx++) {
            const row = reader[r_idx];
            if (!row) continue;
            for (let c_idx = 0; c_idx < row.length; c_idx++) {
              const cell = row[c_idx].trim().toLowerCase();
              if (["3zap", "3zeed"].includes(cell) && c_idx + 1 < row.length) {
                const receivedStr = row[c_idx+1].trim();
                if (/^\d+$/.test(receivedStr)) {
                  const received = cleanInt(receivedStr);
                  if (!stock.some(s => s.bookCode === cell)) {
                    stock.push({ bookCode: cell, received });
                  }
                }
              }
            }
          }
        }
        
        // 3. Find Expense Header Row
        let headerRowIdx = -1;
        for (let r_idx = 0; r_idx < reader.length; r_idx++) {
          const row = reader[r_idx];
          if (!row) continue;
          const rowStr = row.join(" ").toLowerCase();
          if (rowStr.includes("ว/ด/ป") && rowStr.includes("รายการ")) {
            headerRowIdx = r_idx;
            break;
          }
        }
        
        if (headerRowIdx !== -1) {
          for (let r_idx = headerRowIdx + 1; r_idx < reader.length; r_idx++) {
            const row = reader[r_idx];
            if (!row) continue;
            // Pad row
            const paddedRow = [...row, ...Array(10).fill("")].slice(0, 10);
            
            // --- Table 1: Ads Cost (Cols 0-2) ---
            const ad_date = paddedRow[0].trim();
            const ad_desc = paddedRow[1].trim();
            const ad_price_str = paddedRow[2].trim();
            if (ad_date && ad_desc && ad_price_str) {
              const price = cleanNum(ad_price_str);
              if (price > 0) {
                ads.push({ date: formatDisplayDate(ad_date), description: ad_desc, price });
              }
            }
            
            // --- Table 2: Other Expenses (Cols 3-6) ---
            const exp_date = paddedRow[3].trim();
            const exp_desc = paddedRow[4].trim();
            const exp_price_str = paddedRow[5].trim();
            const exp_note = paddedRow[6].trim();
            
            if (exp_date && exp_desc && exp_price_str) {
              const price = cleanNum(exp_price_str);
              const isDistribution = ["แบ่ง", "คนละ", "ส่วนแบ่ง"].some(w => exp_desc.includes(w));
              
              if (isDistribution) {
                const matchVal = exp_desc.replace(/k/gi, '000').match(/([\d,]+)/);
                let perPerson = 0.0;
                if (matchVal) {
                  perPerson = cleanNum(matchVal[1]);
                  if (exp_desc.toLowerCase().includes('k') && perPerson < 1000) {
                    perPerson *= 1000;
                  }
                }
                if (perPerson === 0.0) {
                  perPerson = price / 3.0;
                }
                distributions.push({
                  date: formatDisplayDate(exp_date),
                  perPerson,
                  total: price,
                  note: exp_desc
                });
              } else {
                if (price > 0) {
                  expenses.push({ date: formatDisplayDate(exp_date), description: exp_desc, price, note: exp_note });
                }
              }
            }
            
            // --- Table 3: Distribution Log (Cols 7-9) ---
            const dist_date = paddedRow[7].trim();
            const dist_per_person_str = paddedRow[8].trim();
            const dist_total_str = paddedRow[9].trim();
            
            if (dist_date && (dist_per_person_str || dist_total_str)) {
              let perPerson = cleanNum(dist_per_person_str);
              let total = cleanNum(dist_total_str);
              if (total === 0.0 && perPerson > 0) total = perPerson * 3;
              if (perPerson === 0.0 && total > 0) perPerson = total / 3;
              
              if (total > 0) {
                distributions.push({
                  date: formatDisplayDate(dist_date),
                  perPerson,
                  total,
                  note: `แบ่งคนละ ${new Intl.NumberFormat('th-TH').format(perPerson)} บาท`
                });
              }
            }
          }
        }
        
        // Filter unique distributions
        const uniqueDists = [];
        const seenDists = new Set();
        distributions.forEach(d => {
          const distKey = `${d.date}_${d.total}`;
          if (!seenDists.has(distKey)) {
            seenDists.add(distKey);
            uniqueDists.push(d);
          }
        });
        
        // Preserve slips from oldData if matched
        if (oldData) {
          if (oldData.ads) {
            ads.forEach(newAd => {
              const match = oldData.ads.find(oldAd => 
                oldAd.date === newAd.date && 
                oldAd.description === newAd.description && 
                oldAd.price === newAd.price
              );
              if (match) {
                if (match.slips) newAd.slips = match.slips;
                if (match.slip) newAd.slip = match.slip;
              }
            });
          }
          if (oldData.expenses) {
            expenses.forEach(newExp => {
              const match = oldData.expenses.find(oldExp => 
                oldExp.date === newExp.date && 
                oldExp.description === newExp.description && 
                oldExp.price === newExp.price &&
                (oldExp.note || "") === (newExp.note || "")
              );
              if (match) {
                if (match.slips) newExp.slips = match.slips;
                if (match.slip) newExp.slip = match.slip;
              }
            });
          }
          if (oldData.distributions) {
            uniqueDists.forEach(newDist => {
              const match = oldData.distributions.find(oldDist => 
                oldDist.date === newDist.date && 
                oldDist.perPerson === newDist.perPerson && 
                oldDist.total === newDist.total
              );
              if (match) {
                if (match.slips) newDist.slips = match.slips;
                if (match.slip) newDist.slip = match.slip;
              }
            });
          }
        }

        // Save to temporary db
        db[tab.key] = {
          sales,
          ads,
          expenses,
          distributions: uniqueDists,
          stock
        };
        
        log(`✅ โหลดและซิงก์แท็บ ${tab.name} สำเร็จ! (ยอดขาย: ${sales.length}, ค่าแอด: ${ads.length}, ค่าใช้จ่าย: ${expenses.length}, ปันผล: ${uniqueDists.length})`, "success");
      }
      
      saveToLocalStorage();
      initializeSelectors();
      renderDashboard();
      
      sendTelegramSummaryNotification("🔄 <b>ซิงก์ข้อมูล Google Sheets สำเร็จ</b>", "ทำการอัปเดตข้อมูลตารางและคำนวณสรุปบัญชีล่าสุดเรียบร้อยแล้ว");
      
      log("\ud83c\udf89 ซิงก์ข้อมูลแท็บทั้งหมดเสร็จสมบูรณ์เรียบร้อยแล้ว!", "success");
      alert("ดึงข้อมูลและซิงก์กับ Google Sheets เรียบร้อยแล้ว!");
      document.getElementById("dlgSync").close();
    } catch (error) {
      log(`\u274c เกิดข้อผิดพลาด: ${error.message}`, "error");
      console.error(error);
      alert("เกิดข้อผิดพลาดในการดึงข้อมูล: " + error.message);
    } finally {
      btnStart.disabled = false;
    }
  });

  // Chart toggles
  document.getElementById("btnChartPie").addEventListener("click", (e) => {
    document.getElementById("btnChartPie").classList.add("active");
    document.getElementById("btnChartBar").classList.remove("active");
    activeChartType = "pie";
    renderDashboard();
  });
  
  document.getElementById("btnChartBar").addEventListener("click", (e) => {
    document.getElementById("btnChartPie").classList.remove("active");
    document.getElementById("btnChartBar").classList.add("active");
    activeChartType = "bar";
    renderDashboard();
  });

  // Search filter event listeners (Debounced to improve performance)
  const debouncedRender = debounce(() => {
    const key = `${currentProject}_${currentYear}`;
    renderTables(db[key]);
  }, 150);

  searchSales.addEventListener("input", debouncedRender);
  searchAds.addEventListener("input", debouncedRender);
  searchExpenses.addEventListener("input", debouncedRender);
  searchDistributions.addEventListener("input", debouncedRender);

  // Tab switching inside bottom section
  const tabBtns = document.querySelectorAll(".table-tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // Remove active from all btns and panels
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      
      // Add active to current
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-target");
      document.getElementById(targetId).classList.add("active");
    });
  });

  // --- Modal Form submissions ---

  // Add Sale Form
  document.getElementById("btnAddSale").addEventListener("click", () => {
    document.getElementById("dlgSaleTitle").textContent = "บันทึกยอดยอดขายคอร์ส";
    document.getElementById("editSaleIndex").value = "-1";
    document.getElementById("saleCode").value = "";
    document.getElementById("saleQty").value = "1";
    document.getElementById("saleUnitPrice").value = "0";
    document.getElementById("saleTotalPrice").value = "0";
    document.getElementById("btnDeleteSale").style.display = "none";
    dlgSale.showModal();
  });

  // Add custom course click handler
  const btnAddCustomCourse = document.getElementById("btnAddCustomCourse");
  if (btnAddCustomCourse) {
    btnAddCustomCourse.addEventListener("click", () => {
      const newCourse = prompt("กรุณากรอกรหัสคอร์สใหม่:");
      if (newCourse && newCourse.trim()) {
        const code = newCourse.trim().toUpperCase();
        const select = document.getElementById("saleCode");
        
        // Check if already exists in options
        let exists = false;
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].value === code) {
            exists = true;
            select.selectedIndex = i;
            break;
          }
        }
        
        if (!exists) {
          const opt = document.createElement("option");
          opt.value = code;
          opt.textContent = code;
          select.appendChild(opt);
          select.value = code;
        }
      }
    });
  }

  // Edit course name click handler
  const btnEditCourseName = document.getElementById("btnEditCourseName");
  if (btnEditCourseName) {
    btnEditCourseName.addEventListener("click", () => {
      const select = document.getElementById("saleCode");
      const currentVal = select.value || "";
      const editedName = prompt("พิมพ์แก้ไขชื่อคอร์สเรียน:", currentVal);
      if (editedName && editedName.trim()) {
        const newCode = editedName.trim().toUpperCase();
        let exists = false;
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].value === newCode) {
            exists = true;
            select.selectedIndex = i;
            break;
          }
        }
        if (!exists) {
          const opt = document.createElement("option");
          opt.value = newCode;
          opt.textContent = newCode;
          select.appendChild(opt);
          select.value = newCode;
        }
      }
    });
  }

  // Autofill current sales details when a product is selected in Add mode
  document.getElementById("saleCode").addEventListener("change", (e) => {
    const index = parseInt(document.getElementById("editSaleIndex").value);
    if (index === -1) {
      const selectedProduct = e.target.value.trim().toUpperCase();
      const data = db[`${currentProject}_${currentYear}`];
      if (data && data.sales) {
        let totalQty = 0;
        let totalPrice = 0;
        data.sales.forEach(sale => {
          if (sale.code && sale.code.trim().toUpperCase() === selectedProduct) {
            totalQty += parseInt(sale.qty) || 0;
            totalPrice += parseFloat(sale.totalPrice) || 0;
          }
        });
        if (totalQty > 0) {
          document.getElementById("saleQty").value = totalQty;
          document.getElementById("saleTotalPrice").value = totalPrice.toFixed(2);
          document.getElementById("saleUnitPrice").value = (totalPrice / totalQty).toFixed(2);
        } else {
          document.getElementById("saleQty").value = "1";
          document.getElementById("saleTotalPrice").value = "0.00";
          document.getElementById("saleUnitPrice").value = "0.00";
        }
      }
    }
  });

  dlgSale.querySelector("form").addEventListener("submit", (e) => {
    const code = document.getElementById("saleCode").value.trim();
    const qty = parseInt(document.getElementById("saleQty").value) || 0;
    const unitPrice = parseFloat(document.getElementById("saleUnitPrice").value) || 0;
    const totalPrice = parseFloat(document.getElementById("saleTotalPrice").value) || 0;
    const index = parseInt(document.getElementById("editSaleIndex").value);
    
    const data = db[`${currentProject}_${currentYear}`];
    const saleItem = { code, qty, unitPrice, totalPrice };
    
    if (index >= 0) {
      data.sales[index] = saleItem;
    } else {
      const norm = code.replace(/\s+/g, "").toUpperCase();
      const existingIdx = data.sales.findIndex(s => s.code && s.code.replace(/\s+/g, "").toUpperCase() === norm);
      if (existingIdx !== -1) {
        data.sales[existingIdx] = saleItem;
      } else {
        data.sales.push(saleItem);
      }
    }
    consolidateSales(data);
    
    saveToLocalStorage();
    renderDashboard();

    // Telegram Notification
    const detail = `• รหัสคอร์ส: <b>${saleItem.code}</b>\n` +
      `• จำนวน: <b>${saleItem.qty.toLocaleString()}</b>\n` +
      `• ราคาต่อหน่วย: <b>${formatCurrency(saleItem.unitPrice)} บาท</b>\n` +
      `• ราคารวม: <b>${formatCurrency(saleItem.totalPrice)} บาท</b>`;
    sendTelegramSummaryNotification(
      index === -1 ? "➕ <b>บันทึกยอดขายคอร์สใหม่</b>" : "✏️ <b>แก้ไขยอดขายคอร์ส</b>",
      detail
    );

    // LINE Flex Message reply
    triggerLineFlexReply("sale", saleItem.code, saleItem.qty, saleItem.totalPrice);
  });

  // 1. Ads Slip Input Listener
  const adSlipInput = document.getElementById("adSlip");
  if (adSlipInput) {
    adSlipInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        try {
          const base64 = await compressImage(file);
          activeAdSlips.push(base64);
        } catch (err) {
          console.error("Error compressing ad slip image:", err);
        }
      }
      renderSlipPreviews("adSlipPreviewContainer", activeAdSlips, "removeAdSlip");
    });
  }

  // 2. Expense Slip Input Listener
  const expSlipInput = document.getElementById("expSlip");
  if (expSlipInput) {
    expSlipInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        try {
          const base64 = await compressImage(file);
          activeExpenseSlips.push(base64);
        } catch (err) {
          console.error("Error compressing expense slip image:", err);
        }
      }
      renderSlipPreviews("expSlipPreviewContainer", activeExpenseSlips, "removeExpenseSlip");
    });
  }

  // 3. Distribution Slip Input Listener
  const distSlipInput = document.getElementById("distSlip");
  if (distSlipInput) {
    distSlipInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        try {
          const base64 = await compressImage(file);
          activeDistributionSlips.push(base64);
        } catch (err) {
          console.error("Error compressing distribution slip image:", err);
        }
      }
      renderSlipPreviews("distSlipPreviewContainer", activeDistributionSlips, "removeDistributionSlip");
    });
  }

  // Add Ad Form
  document.getElementById("btnAddAd").addEventListener("click", () => {
    document.getElementById("dlgAdTitle").textContent = "บันทึกยอดค่าโฆษณา";
    document.getElementById("editAdIndex").value = "-1";
    
    document.getElementById("adDate").value = getTodayDateIso();
    document.getElementById("adDesc").value = "";
    document.getElementById("adPrice").value = "";
    
    activeAdSlips = [];
    if (adSlipInput) adSlipInput.value = "";
    renderSlipPreviews("adSlipPreviewContainer", activeAdSlips, "removeAdSlip");
    
    if (typeof resetAdDescGenerator === "function") {
      resetAdDescGenerator();
    }
    document.getElementById("btnDeleteAd").style.display = "none";
    dlgAd.showModal();
  });

  dlgAd.querySelector("form").addEventListener("submit", (e) => {
    const date = formatDisplayDate(document.getElementById("adDate").value.trim());
    const description = document.getElementById("adDesc").value.trim();
    const price = parseFloat(document.getElementById("adPrice").value) || 0;
    const index = parseInt(document.getElementById("editAdIndex").value);
    
    const data = db[`${currentProject}_${currentYear}`];
    const adItem = { date, description, price, slips: activeAdSlips };
    
    if (index === -1) {
      data.ads.push(adItem);
    } else {
      adItem.slip = ""; // clear old single key
      data.ads[index] = adItem;
    }
    
    saveToLocalStorage();
    renderDashboard();

    // Telegram Notification
    const detail = `• รายการ: <b>${adItem.description}</b>\n` +
      `• ราคาค่าแอด: <b>${formatCurrency(adItem.price)} บาท</b>\n` +
      `• วันที่: <b>${adItem.date}</b>`;
    sendTelegramSummaryNotification(
      index === -1 ? "➕ <b>บันทึกยอดค่าโฆษณาใหม่</b>" : "✏️ <b>แก้ไขยอดค่าโฆษณา</b>",
      detail,
      adItem.slips
    );

    // LINE Flex Message reply
    triggerLineFlexReply("ad", adItem.description, 0, adItem.price);
  });

  // Add Expense Form
  document.getElementById("btnAddExpense").addEventListener("click", () => {
    document.getElementById("dlgExpenseTitle").textContent = "บันทึกค่าใช้จ่ายอื่นๆ";
    document.getElementById("editExpenseIndex").value = "-1";
    
    document.getElementById("expDate").value = getTodayDateIso();
    document.getElementById("expDesc").value = "";
    document.getElementById("expPrice").value = "";
    document.getElementById("expNote").value = "";
    
    activeExpenseSlips = [];
    if (expSlipInput) expSlipInput.value = "";
    renderSlipPreviews("expSlipPreviewContainer", activeExpenseSlips, "removeExpenseSlip");
    
    document.getElementById("btnDeleteExpense").style.display = "none";
    dlgExpense.showModal();
  });

  dlgExpense.querySelector("form").addEventListener("submit", (e) => {
    const date = formatDisplayDate(document.getElementById("expDate").value.trim());
    const description = document.getElementById("expDesc").value.trim();
    const price = parseFloat(document.getElementById("expPrice").value) || 0;
    const note = document.getElementById("expNote").value.trim();
    const index = parseInt(document.getElementById("editExpenseIndex").value);
    
    const data = db[`${currentProject}_${currentYear}`];
    const expItem = { date, description, price, note, slips: activeExpenseSlips };
    
    if (index === -1) {
      data.expenses.push(expItem);
    } else {
      expItem.slip = ""; // clear old single key
      data.expenses[index] = expItem;
    }
    
    saveToLocalStorage();
    renderDashboard();

    // Telegram Notification
    const detail = `• รายการ: <b>${expItem.description}</b>\n` +
      `• จำนวนเงิน: <b>${formatCurrency(expItem.price)} บาท</b>\n` +
      `• หมายเหตุ: <b>${expItem.note || '-'}</b>\n` +
      `• วันที่: <b>${expItem.date}</b>`;
    sendTelegramSummaryNotification(
      index === -1 ? "➕ <b>บันทึกรายจ่ายอื่นๆ ใหม่</b>" : "✏️ <b>แก้ไขรายจ่ายอื่นๆ</b>",
      detail,
      expItem.slips
    );

    // LINE Flex Message reply
    triggerLineFlexReply("expense", expItem.description, 0, expItem.price);
  });

  // Add Distribution Form
  document.getElementById("btnAddDistribution").addEventListener("click", () => {
    document.getElementById("dlgDistTitle").textContent = "บันทึกการปันผลกำไร";
    document.getElementById("editDistributionIndex").value = "-1";
    
    document.getElementById("distDate").value = getTodayDateIso();
    document.getElementById("distPerPerson").value = "";
    document.getElementById("distTotal").value = "0";
    document.getElementById("distNote").value = "";
    
    activeDistributionSlips = [];
    if (distSlipInput) distSlipInput.value = "";
    renderSlipPreviews("distSlipPreviewContainer", activeDistributionSlips, "removeDistributionSlip");
    
    document.getElementById("btnDeleteDistribution").style.display = "none";
    dlgDistribution.showModal();
  });

  dlgDistribution.querySelector("form").addEventListener("submit", (e) => {
    const date = formatDisplayDate(document.getElementById("distDate").value.trim());
    const perPerson = parseFloat(document.getElementById("distPerPerson").value) || 0;
    const total = parseFloat(document.getElementById("distTotal").value) || 0;
    const note = document.getElementById("distNote").value.trim() || `แบ่งคนละ ${formatCurrency(perPerson)} บาท`;
    const index = parseInt(document.getElementById("editDistributionIndex").value);
    
    const data = db[`${currentProject}_${currentYear}`];
    const distItem = { date, perPerson, total, note, slips: activeDistributionSlips };
    
    if (index === -1) {
      data.distributions.push(distItem);
    } else {
      distItem.slip = ""; // clear old single key
      data.distributions[index] = distItem;
    }
    
    saveToLocalStorage();
    renderDashboard();

    // Telegram Notification
    const detail = `• ยอดรวมที่แบ่งปันผล: <b>${formatCurrency(distItem.total)} บาท</b>\n` +
      `• แบ่งคนละ: <b>${formatCurrency(distItem.perPerson)} บาท</b>\n` +
      `• หมายเหตุ: <b>${distItem.note || '-'}</b>\n` +
      `• วันที่: <b>${distItem.date}</b>`;
    sendTelegramSummaryNotification(
      index === -1 ? "➕ <b>บันทึกการปันผลกำไรใหม่</b>" : "✏️ <b>แก้ไขการปันผลกำไร</b>",
      detail,
      distItem.slips
    );

    // LINE Flex Message reply
    triggerLineFlexReply("distribution", distItem.note, 0, distItem.total);
  });

  // Add Stock Button
  btnReceiveStock.addEventListener("click", () => {
    // Populate dropdown dynamically from data.stock
    const data = db[`${currentProject}_${currentYear}`];
    const select = document.getElementById("stockBookCode");
    select.innerHTML = "";
    if (data && data.stock) {
      data.stock.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.bookCode;
        opt.textContent = s.bookCode.toUpperCase();
        select.appendChild(opt);
      });
    }
    
    document.getElementById("stockDate").value = getTodayDateIso();
    document.getElementById("stockReceived").value = "100";
    dlgStock.showModal();
    
    updateStockRemainingDisplay();
  });

  const stockBookCodeEl = document.getElementById("stockBookCode");
  if (stockBookCodeEl) {
    stockBookCodeEl.addEventListener("change", updateStockRemainingDisplay);
  }

  function updateStockRemainingDisplay() {
    const select = document.getElementById("stockBookCode");
    const display = document.getElementById("stockRemainingDisplay");
    if (!select || !display) return;
    
    const bookCode = select.value;
    if (!bookCode) {
      display.textContent = "";
      return;
    }
    
    const data = db[`${currentProject}_${currentYear}`];
    if (!data) {
      display.textContent = "";
      return;
    }
    
    const code = bookCode.toLowerCase();
    const item = (data.stock || []).find(s => s.bookCode.toLowerCase() === code);
    if (!item) {
      display.textContent = `สต็อกคงเหลือปัจจุบัน: 0 เล่ม`;
      return;
    }
    
    const logSum = (data.stockLogs || [])
      .filter(log => log.bookCode.toLowerCase() === code)
      .reduce((sum, log) => sum + log.qty, 0);
      
    const keywords = (item.deductKeywords || code)
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(k => k !== "");
      
    let sold = 0;
    (data.sales || []).forEach(sale => {
      const saleCode = (sale.code || "").toLowerCase();
      const qty = sale.qty || 0;
      
      const isMatch = keywords.some(keyword => saleCode.includes(keyword));
      if (isMatch) {
        sold += qty;
      }
    });
    
    const remaining = logSum - sold;
    display.textContent = `สต็อกคงเหลือปัจจุบัน: ${remaining.toLocaleString()} เล่ม`;
  }

  dlgStock.querySelector("form").addEventListener("submit", (e) => {
    const date = formatDisplayDate(document.getElementById("stockDate").value.trim());
    const bookCode = document.getElementById("stockBookCode").value;
    const received = parseInt(document.getElementById("stockReceived").value) || 0;
    
    const data = db[`${currentProject}_${currentYear}`];
    if (!data.stockLogs) data.stockLogs = [];
    
    // Push new receipt log
    data.stockLogs.push({ date: date, bookCode, qty: received });
    
    saveToLocalStorage();
    renderDashboard();

    // Telegram Notification
    const detail = `• หนังสือ: <b>${bookCode.toUpperCase()}</b>\n` +
      `• จำนวนรับเข้า: <b>${received.toLocaleString()} เล่ม</b>\n` +
      `• วันที่รับ: <b>${date}</b>`;
    sendTelegramSummaryNotification("➕ <b>บันทึกรับเข้าสต็อกหนังสือใหม่</b>", detail);

    // LINE Flex Message reply
    triggerLineFlexReply("stock", bookCode, received, 0);
  });

  // Add Book Type Button
  document.getElementById("btnAddBookType").addEventListener("click", () => {
    document.getElementById("dlgBookTitle").textContent = "เพิ่มชนิดหนังสือ";
    document.getElementById("editBookIndex").value = "-1";
    document.getElementById("bookCode").value = "";
    document.getElementById("bookDeductKeywords").value = "";
    document.getElementById("bookCode").readOnly = false;
    populateBookProductSelect();
    renderBookKeywordPills();
    document.getElementById("btnDeleteBook").style.display = "none";
    document.getElementById("dlgBook").showModal();
  });

  // Book Type Form submission
  document.getElementById("dlgBook").querySelector("form").addEventListener("submit", (e) => {
    const bookCode = document.getElementById("bookCode").value.trim().toLowerCase();
    const deductKeywords = document.getElementById("bookDeductKeywords").value.trim();
    const editIndex = parseInt(document.getElementById("editBookIndex").value);
    
    if (!bookCode) return;
    
    const data = db[`${currentProject}_${currentYear}`];
    if (!data.stock) data.stock = [];
    
    if (editIndex >= 0) {
      // Edit mode
      const oldCode = data.stock[editIndex].bookCode;
      data.stock[editIndex].bookCode = bookCode;
      data.stock[editIndex].deductKeywords = deductKeywords;
      
      // Update any stockLogs that matched the old code to use the new code
      if (data.stockLogs) {
        data.stockLogs.forEach(log => {
          if (log.bookCode.toLowerCase() === oldCode.toLowerCase()) {
            log.bookCode = bookCode;
          }
        });
      }
    } else {
      // Add mode
      // Check if bookCode already exists
      const exists = data.stock.some(s => s.bookCode.toLowerCase() === bookCode);
      if (exists) {
        alert("รหัสหนังสือนี้มีอยู่แล้วในระบบ");
        e.preventDefault();
        return;
      }
      data.stock.push({ bookCode, deductKeywords, received: 0 });
    }
    
    saveToLocalStorage();
    renderDashboard();
  });

  const bookProductSelect = document.getElementById("bookProductSelect");
  const bookDeductKeywords = document.getElementById("bookDeductKeywords");
  
  if (bookProductSelect && bookDeductKeywords) {
    bookProductSelect.addEventListener("change", (e) => {
      const selectedProduct = e.target.value;
      if (!selectedProduct) return;
      
      const currentVal = bookDeductKeywords.value.trim();
      const keywords = currentVal
        .split(",")
        .map(k => k.trim())
        .filter(k => k !== "");
        
      const exists = keywords.some(k => k.toLowerCase() === selectedProduct.toLowerCase());
      
      if (!exists) {
        keywords.push(selectedProduct);
        bookDeductKeywords.value = keywords.join(", ");
        renderBookKeywordPills();
      }
      
      e.target.value = "";
    });
    
    bookDeductKeywords.addEventListener("input", () => {
      renderBookKeywordPills();
    });
  }

  // Delete buttons click listeners inside modals
  document.getElementById("btnDeleteSale").addEventListener("click", () => {
    const index = parseInt(document.getElementById("editSaleIndex").value);
    if (index >= 0) window.deleteSale(index);
  });
  document.getElementById("btnDeleteAd").addEventListener("click", () => {
    const index = parseInt(document.getElementById("editAdIndex").value);
    if (index >= 0) window.deleteAd(index);
  });
  document.getElementById("btnDeleteExpense").addEventListener("click", () => {
    const index = parseInt(document.getElementById("editExpenseIndex").value);
    if (index >= 0) window.deleteExpense(index);
  });
  document.getElementById("btnDeleteDistribution").addEventListener("click", () => {
    const index = parseInt(document.getElementById("editDistributionIndex").value);
    if (index >= 0) window.deleteDistribution(index);
  });
  document.getElementById("btnDeleteBook").addEventListener("click", () => {
    const index = parseInt(document.getElementById("editBookIndex").value);
    if (index >= 0) window.deleteBook(index);
  });

  // Initialize ad description generator
  setupAdDescGenerator();
}

// Global actions called from HTML onclicks
window.editSale = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  const item = data.sales[index];
  
  document.getElementById("dlgSaleTitle").textContent = "แก้ไขยอดขายคอร์ส";
  document.getElementById("editSaleIndex").value = index;
  
  populateProductSelect();
  const select = document.getElementById("saleCode");
  const codeToSelect = item.code ? item.code.trim().toUpperCase() : "";
  if (codeToSelect) {
    let exists = false;
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value === codeToSelect) {
        exists = true;
        select.selectedIndex = i;
        break;
      }
    }
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = codeToSelect;
      opt.textContent = codeToSelect;
      select.appendChild(opt);
      select.value = codeToSelect;
    }
  }
  
  document.getElementById("saleQty").value = item.qty;
  document.getElementById("saleUnitPrice").value = item.unitPrice;
  document.getElementById("saleTotalPrice").value = item.totalPrice;
  document.getElementById("btnDeleteSale").style.display = "flex";
  
  updateDialogProjectBanners();
  dlgSale.showModal();
};

window.deleteSale = function(index) {
  if (confirm("คุณต้องการลบยอดขายรายการนี้ใช่หรือไม่?")) {
    const data = db[`${currentProject}_${currentYear}`];
    const item = data.sales[index];
    data.sales.splice(index, 1);
    saveToLocalStorage();
    renderDashboard();
    document.getElementById("dlgSale").close();

    // Telegram Notification
    const detail = `• รหัสคอร์ส: <b>${item.code}</b>\n` +
      `• จำนวน: <b>${item.qty.toLocaleString()}</b>\n` +
      `• ราคารวม: <b>${formatCurrency(item.totalPrice)} บาท</b>`;
    sendTelegramSummaryNotification("❌ <b>ลบยอดขายคอร์ส</b>", detail);
  }
};

window.editAd = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  const item = data.ads[index];
  
  document.getElementById("dlgAdTitle").textContent = "แก้ไขยอดค่าโฆษณา";
  document.getElementById("editAdIndex").value = index;
  document.getElementById("adDate").value = convertThaiDateToIso(item.date);
  document.getElementById("adDesc").value = item.description;
  document.getElementById("adPrice").value = item.price;
  document.getElementById("btnDeleteAd").style.display = "flex";
  
  // Set slip previews
  const slipInput = document.getElementById("adSlip");
  if (slipInput) slipInput.value = "";
  
  activeAdSlips = item.slips || (item.slip ? [item.slip] : []);
  renderSlipPreviews("adSlipPreviewContainer", activeAdSlips, "removeAdSlip");
  
  // Sync range selectors to existing description if match
  if (typeof syncAdDescSelectors === "function") {
    syncAdDescSelectors(item.description);
  }
  
  dlgAd.showModal();
};

window.deleteAd = function(index) {
  if (confirm("คุณต้องการลบค่าโฆษณารายการนี้ใช่หรือไม่?")) {
    const data = db[`${currentProject}_${currentYear}`];
    const item = data.ads[index];
    data.ads.splice(index, 1);
    saveToLocalStorage();
    renderDashboard();
    document.getElementById("dlgAd").close();

    // Telegram Notification
    const detail = `• รายการ: <b>${item.description}</b>\n` +
      `• ราคาค่าแอด: <b>${formatCurrency(item.price)} บาท</b>\n` +
      `• วันที่: <b>${item.date}</b>`;
    sendTelegramSummaryNotification("❌ <b>ลบยอดค่าโฆษณา</b>", detail);
  }
};

window.editExpense = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  const item = data.expenses[index];
  
  document.getElementById("dlgExpenseTitle").textContent = "แก้ไขรายจ่ายอื่นๆ";
  document.getElementById("editExpenseIndex").value = index;
  document.getElementById("expDate").value = convertThaiDateToIso(item.date);
  document.getElementById("expDesc").value = item.description;
  document.getElementById("expPrice").value = item.price;
  document.getElementById("expNote").value = item.note || "";
  document.getElementById("btnDeleteExpense").style.display = "flex";
  
  // Set slip previews
  const slipInput = document.getElementById("expSlip");
  if (slipInput) slipInput.value = "";
  
  activeExpenseSlips = item.slips || (item.slip ? [item.slip] : []);
  renderSlipPreviews("expSlipPreviewContainer", activeExpenseSlips, "removeExpenseSlip");
  
  dlgExpense.showModal();
};

window.deleteExpense = function(index) {
  if (confirm("คุณต้องการลบรายจ่ายรายการนี้ใช่หรือไม่?")) {
    const data = db[`${currentProject}_${currentYear}`];
    const item = data.expenses[index];
    data.expenses.splice(index, 1);
    saveToLocalStorage();
    renderDashboard();
    document.getElementById("dlgExpense").close();

    // Telegram Notification
    const detail = `• รายการ: <b>${item.description}</b>\n` +
      `• จำนวนเงิน: <b>${formatCurrency(item.price)} บาท</b>\n` +
      `• วันที่: <b>${item.date}</b>`;
    sendTelegramSummaryNotification("❌ <b>ลบรายจ่ายอื่นๆ</b>", detail);
  }
};

window.editDistribution = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  const item = data.distributions[index];
  
  document.getElementById("dlgDistTitle").textContent = "แก้ไขการปันผลกำไร";
  document.getElementById("editDistributionIndex").value = index;
  document.getElementById("distDate").value = convertThaiDateToIso(item.date);
  document.getElementById("distPerPerson").value = item.perPerson;
  document.getElementById("distTotal").value = item.total;
  document.getElementById("distNote").value = item.note || "";
  document.getElementById("btnDeleteDistribution").style.display = "flex";
  
  // Set slip previews
  const slipInput = document.getElementById("distSlip");
  if (slipInput) slipInput.value = "";
  
  activeDistributionSlips = item.slips || (item.slip ? [item.slip] : []);
  renderSlipPreviews("distSlipPreviewContainer", activeDistributionSlips, "removeDistributionSlip");
  
  dlgDistribution.showModal();
};

window.deleteDistribution = function(index) {
  if (confirm("คุณต้องการลบการปันผลรายการนี้ใช่หรือไม่?")) {
    const data = db[`${currentProject}_${currentYear}`];
    const item = data.distributions[index];
    data.distributions.splice(index, 1);
    saveToLocalStorage();
    renderDashboard();
    document.getElementById("dlgDistribution").close();

    // Telegram Notification
    const detail = `• ยอดรวมที่ปันผล: <b>${formatCurrency(item.total)} บาท</b>\n` +
      `• วันที่: <b>${item.date}</b>`;
    sendTelegramSummaryNotification("❌ <b>ลบการปันผลกำไร</b>", detail);
  }
};

window.deleteStockLog = function(index) {
  if (confirm("คุณต้องการลบรายการประวัติการรับหนังสือนี้ใช่หรือไม่?")) {
    const data = db[`${currentProject}_${currentYear}`];
    if (data.stockLogs) {
      const item = data.stockLogs[index];
      data.stockLogs.splice(index, 1);
      saveToLocalStorage();
      renderDashboard();

      // Telegram Notification
      const detail = `• หนังสือ: <b>${item.bookCode.toUpperCase()}</b>\n` +
        `• จำนวนที่รับเข้า: <b>${item.qty.toLocaleString()} เล่ม</b>\n` +
        `• วันที่รับ: <b>${item.date}</b>`;
      sendTelegramSummaryNotification("❌ <b>ลบรายการประวัติรับเข้าสต็อกหนังสือ</b>", detail);
    }
  }
};

window.editBook = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  const item = data.stock[index];
  
  document.getElementById("dlgBookTitle").textContent = "แก้ไขชนิดหนังสือ";
  document.getElementById("editBookIndex").value = index;
  document.getElementById("bookCode").value = item.bookCode;
  document.getElementById("bookDeductKeywords").value = item.deductKeywords || "";
  document.getElementById("bookCode").readOnly = true;
  document.getElementById("btnDeleteBook").style.display = "flex";
  
  populateBookProductSelect();
  renderBookKeywordPills();
  
  document.getElementById("dlgBook").showModal();
};

window.deleteBook = function(index) {
  const data = db[`${currentProject}_${currentYear}`];
  const item = data.stock[index];
  if (confirm(`คุณต้องการลบชนิดหนังสือ "${item.bookCode.toUpperCase()}" ใช่หรือไม่?\nข้อมูลประวัติการรับหนังสือทั้งหมดของเล่มนี้จะถูกลบออกด้วย`)) {
    if (data.stockLogs) {
      data.stockLogs = data.stockLogs.filter(log => log.bookCode.toLowerCase() !== item.bookCode.toLowerCase());
    }
    data.stock.splice(index, 1);
    saveToLocalStorage();
    renderDashboard();
    document.getElementById("dlgBook").close();
  }
};

function populateBookProductSelect() {
  const select = document.getElementById("bookProductSelect");
  if (!select) return;
  
  select.innerHTML = '<option value="">-- เลือกสินค้า --</option>';
  
  const data = db[`${currentProject}_${currentYear}`];
  if (!data || !data.sales) return;
  
  // Get all unique product codes from sales, sorted alphabetically
  const uniqueCodes = [...new Set(data.sales.map(sale => (sale.code || "").trim()))]
    .filter(code => code !== "")
    .sort((a, b) => a.localeCompare(b));
    
  uniqueCodes.forEach(code => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code;
    select.appendChild(option);
  });
}

async function getTelegramChats() {
  const botToken = "8660577289:AAHRrJ3aoUt0MWbWK1zd4XbO3rpK8DOJreI";
  
  // 1. Get cached chats from db or localStorage
  let cached = [];
  if (db && db.telegramChats) {
    cached = db.telegramChats;
  } else {
    const local = localStorage.getItem("sta69_telegram_chats");
    if (local) {
      try { cached = JSON.parse(local); } catch(e) {}
    }
  }
  if (!Array.isArray(cached)) cached = [];
  
  // 2. Fetch updates from Telegram to find new chat sessions
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    if (res.ok) {
      const json = await res.json();
      if (json.ok && Array.isArray(json.result)) {
        // We'll keep unique chats by ID
        const chatMap = new Map();
        
        // Populate map with existing cached chats
        cached.forEach(c => {
          if (c && c.id) chatMap.set(c.id, c);
        });
        
        // Add new chats discovered from updates
        json.result.forEach(update => {
          let chat = null;
          let fromUser = null;
          
          if (update.message) {
            chat = update.message.chat;
            fromUser = update.message.from;
          } else if (update.edited_message) {
            chat = update.edited_message.chat;
            fromUser = update.edited_message.from;
          } else if (update.callback_query && update.callback_query.message) {
            chat = update.callback_query.message.chat;
            fromUser = update.callback_query.from;
          } else if (update.my_chat_member) {
            chat = update.my_chat_member.chat;
            fromUser = update.my_chat_member.from;
          }
          
          if (chat && chat.id) {
            // Only capture private chats (direct bot chats) as requested by user
            if (chat.type === "private") {
              const firstName = chat.first_name || fromUser?.first_name || "ไม่ทราบชื่อ";
              const username = chat.username || fromUser?.username || "";
              const displayName = firstName + (username ? ` (@${username})` : "");
              chatMap.set(chat.id, { id: chat.id, name: displayName });
            }
          }
        });
        
        const updatedList = Array.from(chatMap.values());
        
        // Save to db and localStorage
        db.telegramChats = updatedList;
        saveToLocalStorage();
        localStorage.setItem("sta69_telegram_chats", JSON.stringify(updatedList));
        return updatedList;
      }
    }
  } catch(e) {
    console.error("Error fetching Telegram chats:", e);
  }
  return cached;
}

function renderTelegramChats() {
  const listEl = document.getElementById("telegramRecipientsList");
  if (!listEl) return;
  
  let chats = [];
  if (db && db.telegramChats) {
    chats = db.telegramChats;
  } else {
    const local = localStorage.getItem("sta69_telegram_chats");
    if (local) {
      try { chats = JSON.parse(local); } catch(e) {}
    }
  }
  if (!Array.isArray(chats)) chats = [];
  
  if (chats.length === 0) {
    listEl.innerHTML = `<div style="color: var(--text-secondary); text-align: center; font-size: 12px; padding: 10px 0;">⚠️ ยังไม่มีสมาชิกเริ่มใช้งานบอต</div>`;
    return;
  }
  
  listEl.innerHTML = chats.map(c => `
    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--text-primary); padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <span>👤 <strong>${c.name}</strong></span>
      <span style="color: #34d399; font-weight: 500; font-size: 11px;">✅ เชื่อมต่อแล้ว</span>
    </div>
  `).join("");
}

async function refreshTelegramChats() {
  await getTelegramChats();
  renderTelegramChats();
}

async function sendTelegramSummaryNotification(eventTitle, detailText, slipsArray = null) {
  // Always fetch updates to register any new chats right before sending
  const chats = await getTelegramChats();
  if (chats.length === 0) {
    console.warn("No registered Telegram chats found. Notification skipped.");
    return;
  }
  
  const key = `${currentProject}_${currentYear}`;
  // Initialize state if not existing or keys missing
  if (!db[key]) {
    db[key] = { sales: [], ads: [], expenses: [], distributions: [], stock: [] };
  }
  const data = db[key];
  if (!data) return;
  
  const totalRevenue = (data.sales || []).reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const totalAds = (data.ads || []).reduce((sum, item) => sum + (item.price || 0), 0);
  const totalExpenses = (data.expenses || []).reduce((sum, item) => sum + (item.price || 0), 0);
  const totalDistributed = (data.distributions || []).reduce((sum, item) => sum + (item.total || 0), 0);
  const netProfit = totalRevenue - totalAds - totalExpenses;
  const remainingBalance = netProfit - totalDistributed;
  const perPerson = totalDistributed / 3;
  
  const message = `${eventTitle}\n` +
    `${detailText}\n\n` +
    `📊 <b>รายงานสรุปสถานะการเงินล่าสุด (${currentYear} - ${currentProject})</b>\n` +
    `• รายรับรวม: <b>${formatCurrency(totalRevenue)} บาท</b>\n` +
    `• ค่าโฆษณารวม: <b>${formatCurrency(totalAds)} บาท</b>\n` +
    `• รายจ่ายอื่นๆ: <b>${formatCurrency(totalExpenses)} บาท</b>\n` +
    `• แบ่งแล้ว: <b>${formatCurrency(totalDistributed)} บาท (แบ่งคนละ ${formatCurrency(perPerson)} บาท)</b>\n` +
    `• คงเหลือสุทธิ: <b>${formatCurrency(remainingBalance)} บาท</b>`;
     
  const botToken = "8660577289:AAHRrJ3aoUt0MWbWK1zd4XbO3rpK8DOJreI";
  
  // Normalize slipsArray (handles string, array of strings, or null)
  let validSlips = [];
  if (slipsArray) {
    const list = Array.isArray(slipsArray) ? slipsArray : [slipsArray];
    validSlips = list.filter(s => s && typeof s === "string" && s.trim() !== "");
  }
  
  // Send message to each registered chat concurrently
  const sendPromises = chats.flatMap(c => {
    if (validSlips.length > 0) {
      // Send the first slip with the message text as caption
      const firstBlob = base64ToBlob(validSlips[0], "image/jpeg");
      const firstFormData = new FormData();
      firstFormData.append("chat_id", c.id);
      firstFormData.append("photo", firstBlob, "slip_0.jpg");
      firstFormData.append("caption", message);
      firstFormData.append("parse_mode", "HTML");
      firstFormData.append("reply_markup", JSON.stringify({
        inline_keyboard: [
          [
            {
              text: "🌐 เปิดหน้าเว็บ Ledger Hub",
              url: "https://sta69-ledger-98315.web.app"
            }
          ]
        ]
      }));
      
      const firstPromise = fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        body: firstFormData
      }).catch(err => {
        console.error(`Failed to send Telegram photo 0 to chat ${c.id}:`, err);
      });
      
      // Send subsequent slips (if any) as simple photo messages without caption
      const otherPromises = validSlips.slice(1).map((slipBase64, idx) => {
        const blob = base64ToBlob(slipBase64, "image/jpeg");
        const formData = new FormData();
        formData.append("chat_id", c.id);
        formData.append("photo", blob, `slip_${idx+1}.jpg`);
        
        return fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: "POST",
          body: formData
        }).catch(err => {
          console.error(`Failed to send Telegram photo ${idx+1} to chat ${c.id}:`, err);
        });
      });
      
      return [firstPromise, ...otherPromises];
    } else {
      // Send plain text message
      const textPromise = fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: c.id,
          text: message,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🌐 เปิดหน้าเว็บ Ledger Hub",
                  url: "https://sta69-ledger-98315.web.app"
                }
              ]
            ]
          }
        })
      }).catch(err => {
        console.error(`Failed to send Telegram text to chat ${c.id}:`, err);
      });
      
      return [textPromise];
    }
  });
  
  await Promise.all(sendPromises);
}

function renderBookKeywordPills() {
  const input = document.getElementById("bookDeductKeywords");
  const container = document.getElementById("bookKeywordsPills");
  if (!input || !container) return;
  
  container.innerHTML = "";
  
  const keywords = input.value
    .split(",")
    .map(k => k.trim())
    .filter(k => k !== "");
    
  keywords.forEach(keyword => {
    const pill = document.createElement("span");
    pill.className = "keyword-pill";
    pill.textContent = keyword;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "pill-remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.type = "button"; // prevent form submit
    removeBtn.addEventListener("click", () => {
      // Remove this keyword
      const updatedKeywords = keywords.filter(k => k !== keyword);
      input.value = updatedKeywords.join(", ");
      renderBookKeywordPills();
    });
    
    pill.appendChild(removeBtn);
    container.appendChild(pill);
  });
}

function getTodayDateIso() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function convertThaiDateToIso(thaiDateStr) {
  if (!thaiDateStr) return getTodayDateIso();
  const str = thaiDateStr.trim();
  if (str === "ยอดเริ่มต้น") return getTodayDateIso();
  
  // Split by space, slash, dash (do not split by dot as Thai months like พ.ค. contain dots)
  // e.g. "16 มิ.ย. 2569" or "16/มิ.ย./2569"
  const parts = str.split(/[\s\/\-]+/).filter(p => p !== "");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1].toLowerCase().replace(/\./g, "");
    const year = parseInt(parts[2], 10);
    
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const fullThaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const enMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    
    let monthVal = 1;
    for (let i = 0; i < 12; i++) {
      const cleanT = thaiMonths[i].replace(/\./g, "").toLowerCase();
      const cleanF = fullThaiMonths[i].toLowerCase();
      const cleanE = enMonths[i];
      if (monthStr.includes(cleanT) || monthStr.includes(cleanF) || monthStr.includes(cleanE)) {
        monthVal = i + 1;
        break;
      }
    }
    
    // Check if monthStr is numeric
    const mNum = parseInt(monthStr, 10);
    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
      monthVal = mNum;
    }
    
    // Adjust Thai year to Christian year
    let christianYear = year;
    if (year > 2400) {
      christianYear = year - 543;
    } else if (year < 100) {
      // 2-digit year
      if (year > 50) {
        // e.g. 69 => 2569 => 2026
        christianYear = 2000 + (year - 43); 
      } else {
        // e.g. 26 => 2026
        christianYear = 2000 + year;
      }
    }
    
    if (isNaN(day) || isNaN(christianYear)) return getTodayDateIso();
    
    const dd = String(day).padStart(2, '0');
    const mm = String(monthVal).padStart(2, '0');
    const yyyy = String(christianYear);
    return `${yyyy}-${mm}-${dd}`;
  }
  
  // If it matches standard ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})$/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const dd = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  return getTodayDateIso();
}

function getThaiTodayDate() {
  const today = new Date();
  const thaiMonthsList = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const thaiYear = (today.getFullYear() + 543).toString().slice(-2);
  return `${today.getDate()} ${thaiMonthsList[today.getMonth()]} ${thaiYear}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const str = dateStr.toString().trim();
  if (str === "ยอดเริ่มต้น") return str;

  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const fullThaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const enMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  // 1. Check if ISO format YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})/);
  if (isoMatch) {
    let yInt = parseInt(isoMatch[1], 10);
    let mInt = parseInt(isoMatch[2], 10);
    let dInt = parseInt(isoMatch[3], 10);
    let beYear = yInt < 2100 ? yInt + 543 : yInt;
    let mStr = (mInt >= 1 && mInt <= 12) ? thaiMonths[mInt - 1] : thaiMonths[0];
    return `${dInt} ${mStr} ${String(beYear).slice(-2)}`;
  }

  // 2. Tokenize string by space, slash, dash (do not split by dot as Thai months contain dots)
  const parts = str.split(/[\s\/\-]+/).filter(p => p !== "");
  if (parts.length >= 2) {
    let day = parseInt(parts[0], 10);
    let monthToken = parts[1];
    let yearToken = parts[2] || "";

    if (!isNaN(day)) {
      let mIdx = -1;
      let mInt = parseInt(monthToken, 10);
      if (!isNaN(mInt) && mInt >= 1 && mInt <= 12) {
        mIdx = mInt - 1;
      } else {
        let mClean = monthToken.toLowerCase().replace(/\./g, "");
        for (let i = 0; i < 12; i++) {
          let tClean = thaiMonths[i].replace(/\./g, "").toLowerCase();
          let fClean = fullThaiMonths[i].toLowerCase();
          let eClean = enMonths[i];
          if (mClean.includes(tClean) || mClean.includes(fClean) || mClean.includes(eClean)) {
            mIdx = i;
            break;
          }
        }
      }

      if (mIdx !== -1) {
        let displayMonth = thaiMonths[mIdx];
        let yearLastTwo = "";
        if (yearToken) {
          let yInt = parseInt(yearToken, 10);
          if (!isNaN(yInt)) {
            if (yInt < 100) {
              yearLastTwo = yInt > 50 ? String(yInt) : String(yInt + 43);
            } else if (yInt < 2100) {
              yearLastTwo = String(yInt + 543).slice(-2);
            } else {
              yearLastTwo = String(yInt).slice(-2);
            }
          }
        }
        if (!yearLastTwo) {
          const todayCE = new Date().getFullYear();
          yearLastTwo = String(todayCE + 543).slice(-2);
        }
        return `${day} ${displayMonth} ${yearLastTwo}`;
      }
    }
  }

  return str;
}



function setupAdDescGenerator() {
  const startSelect = document.getElementById("adStartDay");
  const endSelect = document.getElementById("adEndDay");
  const monthSelect = document.getElementById("adMonth");
  const yearSelect = document.getElementById("adYear");
  const descInput = document.getElementById("adDesc");
  
  if (!startSelect || !endSelect || !monthSelect || !yearSelect || !descInput) return;
  
  // 1. Populate Start & End days (1-31)
  startSelect.innerHTML = "";
  endSelect.innerHTML = "";
  for (let i = 1; i <= 31; i++) {
    const optStart = document.createElement("option");
    optStart.value = i;
    optStart.textContent = i;
    startSelect.appendChild(optStart);
    
    const optEnd = document.createElement("option");
    optEnd.value = i;
    optEnd.textContent = i;
    endSelect.appendChild(optEnd);
  }
  
  // 2. Populate Month
  const thaiMonthsList = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  monthSelect.innerHTML = "";
  thaiMonthsList.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  });
  
  // 3. Populate Year (last 2 digits of project year + neighbors)
  const activeYearNum = parseInt(currentYear) || 2569;
  const activeYearShort = activeYearNum - 2500;
  
  yearSelect.innerHTML = "";
  for (let y = activeYearShort - 1; y <= activeYearShort + 2; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = activeYearShort;
  
  // 4. Default selections based on today
  const today = new Date();
  const dateNum = today.getDate();
  monthSelect.value = thaiMonthsList[today.getMonth()];
  
  if (dateNum <= 10) {
    startSelect.value = 1;
    endSelect.value = 10;
  } else if (dateNum <= 20) {
    startSelect.value = 11;
    endSelect.value = 20;
  } else {
    startSelect.value = 21;
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    endSelect.value = lastDay;
  }
  
  // 5. Update function
  const updateDesc = () => {
    const start = startSelect.value;
    const end = endSelect.value;
    const month = monthSelect.value;
    const year = yearSelect.value;
    descInput.value = `Ads ${start}-${end} ${month} ${year}`;
  };
  
  // Add listeners
  startSelect.addEventListener("change", updateDesc);
  endSelect.addEventListener("change", updateDesc);
  monthSelect.addEventListener("change", updateDesc);
  yearSelect.addEventListener("change", updateDesc);
}

function resetAdDescGenerator() {
  const startSelect = document.getElementById("adStartDay");
  const endSelect = document.getElementById("adEndDay");
  const monthSelect = document.getElementById("adMonth");
  const yearSelect = document.getElementById("adYear");
  const descInput = document.getElementById("adDesc");
  
  if (!startSelect || !endSelect || !monthSelect || !yearSelect || !descInput) return;
  
  const thaiMonthsList = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const activeYearNum = parseInt(currentYear) || 2569;
  const activeYearShort = activeYearNum - 2500;
  
  yearSelect.innerHTML = "";
  for (let y = activeYearShort - 1; y <= activeYearShort + 2; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = activeYearShort;
  
  const today = new Date();
  const dateNum = today.getDate();
  monthSelect.value = thaiMonthsList[today.getMonth()];
  
  if (dateNum <= 10) {
    startSelect.value = 1;
    endSelect.value = 10;
  } else if (dateNum <= 20) {
    startSelect.value = 11;
    endSelect.value = 20;
  } else {
    startSelect.value = 21;
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    endSelect.value = lastDay;
  }
  
  descInput.value = `Ads ${startSelect.value}-${startSelect.value === '21' ? endSelect.value : endSelect.value} ${monthSelect.value} ${yearSelect.value}`;
}

function syncAdDescSelectors(description) {
  const startSelect = document.getElementById("adStartDay");
  const endSelect = document.getElementById("adEndDay");
  const monthSelect = document.getElementById("adMonth");
  const yearSelect = document.getElementById("adYear");
  
  if (!startSelect || !endSelect || !monthSelect || !yearSelect) return;
  
  const match = description.match(/(?:Ads|Ad)\s+(\d+)-(\d+)\s+([^\s]+)(?:\s+(\d+))?/i);
  if (match) {
    const start = match[1];
    const end = match[2];
    const month = match[3];
    const year = match[4];
    
    if ([...startSelect.options].some(o => o.value === start)) startSelect.value = start;
    if ([...endSelect.options].some(o => o.value === end)) endSelect.value = end;
    if ([...monthSelect.options].some(o => o.value === month)) monthSelect.value = month;
    if (year && [...yearSelect.options].some(o => o.value === year)) {
      yearSelect.value = year;
    }
  }
}

function setupVisualViewport() {
  if (window.visualViewport) {
    const updateHeight = () => {
      const height = window.visualViewport.height;
      document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
      
      // Force height adjustment on all open dialogs
      const openDialogs = document.querySelectorAll("dialog[open]");
      openDialogs.forEach(dialog => {
        // Leave a 16px buffer at top and bottom (total 32px)
        dialog.style.maxHeight = `${height - 32}px`;
      });
    };
    
    window.visualViewport.addEventListener('resize', updateHeight);
    window.visualViewport.addEventListener('scroll', updateHeight);
    
    // Observe open attribute on all dialogs to adjust height immediately when opened
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'open') {
          updateHeight();
        }
      });
    });
    
    document.querySelectorAll("dialog").forEach(dialog => {
      observer.observe(dialog, { attributes: true });
    });
    
    updateHeight(); // Initial call
  }
}

// --- Course Comparison Helper Functions ---
function initCompareFilters() {
  const yearContainer = document.getElementById("compareYearContainer");
  if (!yearContainer) return;
  
  // 1. Populate Years/Projects
  yearContainer.innerHTML = "";
  const combinations = new Set();
  Object.keys(db).forEach(key => {
    const parts = key.split('_');
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
      combinations.add(key);
    }
  });
  
  const sortedCombos = Array.from(combinations).sort((a, b) => {
    const partsA = a.split('_');
    const partsB = b.split('_');
    const yearA = parseInt(partsA[1]);
    const yearB = parseInt(partsB[1]);
    if (yearA !== yearB) return yearB - yearA; // Latest year first
    return partsA[0].localeCompare(partsB[0]);
  });
  
  const currentActiveKey = `${currentProject}_${currentYear}`;
  
  sortedCombos.forEach(combo => {
    const parts = combo.split('_');
    const div = document.createElement("div");
    div.className = "compare-checkbox-item";
    
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = combo;
    chk.id = `chkYear_${combo}`;
    chk.checked = (combo === currentActiveKey);
    
    const lbl = document.createElement("label");
    lbl.htmlFor = `chkYear_${combo}`;
    lbl.textContent = `${parts[0]} (${parts[1]})`;
    
    div.appendChild(chk);
    div.appendChild(lbl);
    yearContainer.appendChild(div);
  });
}

function runComparison() {
  const checkedYears = [];
  document.querySelectorAll("#compareYearContainer input[type='checkbox']").forEach(chk => {
    if (chk.checked) checkedYears.push(chk.value);
  });
  
  if (checkedYears.length === 0) {
    alert("❌ กรุณาเลือกปี/โปรเจกต์อย่างน้อย 1 รายการในการเปรียบเทียบ");
    return;
  }
  
  const results = [];
  
  checkedYears.forEach(key => {
    const parts = key.split('_');
    const projName = parts[0];
    const yearStr = parts[1];
    
    const data = db[key] || {};
    const sales = data.sales || [];
    const expenses = data.expenses || [];
    const ads = data.ads || [];
    const distributions = data.distributions || [];
    
    // Calculate project total metrics
    const totalRevenue = sales.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const totalAds = ads.reduce((sum, item) => sum + (item.price || 0), 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + (item.price || 0), 0);
    const totalDistributed = distributions.reduce((sum, item) => sum + (item.total || 0), 0);
    
    const totalCost = totalAds + totalExpenses;
    const netProfit = totalRevenue - totalCost;
    const remainingBalance = netProfit - totalDistributed;
    
    results.push({
      key,
      projName,
      year: yearStr,
      label: `${projName} (${yearStr})`,
      revenue: totalRevenue,
      directExpense: totalCost, // mapping to directExpense key for reuse
      netProfit,
      distributed: totalDistributed,
      remaining: remainingBalance
    });
  });
  
  // Show results
  document.getElementById("comparisonResults").style.display = "block";
  
  // Sort results by net profit descending for ranking
  const sortedForRank = [...results].sort((a, b) => b.netProfit - a.netProfit);
  
  // Render charts and table
  renderComparisonCharts(results);
  renderComparisonTable(results, sortedForRank);
}

function renderComparisonCharts(results) {
  if (compareRevenueChartInstance) compareRevenueChartInstance.destroy();
  if (compareProfitChartInstance) compareProfitChartInstance.destroy();
  
  const labels = results.map(r => r.label);
  const revenues = results.map(r => r.revenue);
  const expenses = results.map(r => r.directExpense);
  const profits = results.map(r => r.netProfit);
  
  // Chart 1: Revenue vs Expense
  const ctxRev = document.getElementById("compareRevenueChart").getContext("2d");
  compareRevenueChartInstance = new Chart(ctxRev, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "รายรับรวม (ยอดขาย)",
          data: revenues,
          backgroundColor: "rgba(16, 185, 129, 0.7)",
          borderColor: "#10b981",
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: "รายจ่ายรวม",
          data: expenses,
          backgroundColor: "rgba(244, 63, 94, 0.7)",
          borderColor: "#f43f5e",
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { font: { family: "Inter, Sarabun", size: 11 } } },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatCurrency(context.raw)} บาท`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: function(value) { return formatCurrency(value); },
            font: { family: "Inter, Sarabun", size: 10 }
          }
        },
        x: {
          ticks: { font: { family: "Inter, Sarabun", size: 10 } }
        }
      }
    }
  });
  
  // Chart 2: Net Profit Chart
  const ctxProf = document.getElementById("compareProfitChart").getContext("2d");
  const profitColors = profits.map(p => p >= 0 ? "rgba(245, 158, 11, 0.7)" : "rgba(239, 68, 68, 0.7)");
  const profitBorderColors = profits.map(p => p >= 0 ? "#f59e0b" : "#ef4444");
  
  compareProfitChartInstance = new Chart(ctxProf, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "กำไรสุทธิรวม",
          data: profits,
          backgroundColor: profitColors,
          borderColor: profitBorderColors,
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `กำไรสุทธิรวม: ${formatCurrency(context.raw)} บาท`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: function(value) { return formatCurrency(value); },
            font: { family: "Inter, Sarabun", size: 10 }
          }
        },
        x: {
          ticks: { font: { family: "Inter, Sarabun", size: 10 } }
        }
      }
    }
  });
}

function renderComparisonTable(results, sortedForRank) {
  const tbody = document.getElementById("compareTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const totalProfit = results.reduce((sum, r) => sum + r.netProfit, 0);
  const avgProfit = totalProfit / results.length;
  
  results.forEach(r => {
    const tr = document.createElement("tr");
    
    // Find rank in sorted list
    const rankIndex = sortedForRank.findIndex(item => item.label === r.label);
    let rankBadge = "";
    if (rankIndex === 0) rankBadge = "🥇 อันดับ 1";
    else if (rankIndex === 1) rankBadge = "🥈 อันดับ 2";
    else if (rankIndex === 2) rankBadge = "🥉 อันดับ 3";
    else rankBadge = `อันดับ ${rankIndex + 1}`;
    
    // Profit margin percentage
    const margin = r.revenue > 0 ? ((r.netProfit / r.revenue) * 100).toFixed(1) : "0.0";
    
    // Difference from average
    const diffFromAvg = r.netProfit - avgProfit;
    let diffHtml = "";
    if (diffFromAvg > 0) {
      diffHtml = `<span style="color: #10b981; font-weight: 500; font-size: 11px;">+${formatCurrency(diffFromAvg)} บาท</span><br><span style="font-size: 9px; color: var(--text-secondary);">สูงกว่าค่าเฉลี่ย</span>`;
    } else if (diffFromAvg < 0) {
      diffHtml = `<span style="color: #ef4444; font-weight: 500; font-size: 11px;">-${formatCurrency(Math.abs(diffFromAvg))} บาท</span><br><span style="font-size: 9px; color: var(--text-secondary);">ต่ำกว่าค่าเฉลี่ย</span>`;
    } else {
      diffHtml = `<span style="color: var(--text-secondary); font-size: 11px;">เท่ากับค่าเฉลี่ย</span>`;
    }
    
    const profitColor = r.netProfit >= 0 ? "color: #10b981;" : "color: #ef4444;";
    
    tr.innerHTML = `
      <td><strong>${r.projName}</strong> (${r.year})</td>
      <td style="text-align: right;">${formatCurrency(r.revenue)} บาท</td>
      <td style="text-align: right;">${formatCurrency(r.directExpense)} บาท</td>
      <td style="text-align: right;"><span style="${profitColor} font-weight: 600;">${formatCurrency(r.netProfit)} บาท</span><br><span style="font-size: 10px; color: var(--text-secondary);">อัตรากำไร ${margin}%</span></td>
      <td style="text-align: right;">${formatCurrency(r.distributed)} บาท</td>
      <td style="text-align: right;">${formatCurrency(r.remaining)} บาท</td>
      <td style="text-align: center;">
        <div style="display: flex; flex-direction: column; align-items: center;">
          <span style="font-weight: 600; font-size: 12px;">${rankBadge}</span>
          ${diffHtml}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
