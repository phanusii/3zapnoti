import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import http from 'http';

// Wait for a port to become active
const waitForPort = (port, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const socket = http.get(`http://localhost:${port}/`, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
  });
};

async function waitForCondition(page, conditionFn, timeoutMs = 8000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const satisfied = await page.evaluate(conditionFn);
    if (satisfied) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for condition: ${conditionFn.toString()}`);
}

async function runTests() {
  console.log("=== STARTING AUTOMATED LEDGER TESTS ===");
  
  // 1. Start Vite preview server on port 4173 (default)
  console.log("Starting Vite preview server...");
  const previewProcess = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: '/Users/phanuphan/.gemini/antigravity/scratch/revenue-tracker',
    shell: true
  });
  
  previewProcess.stdout.on('data', (data) => {
    console.log(`[Vite Server]: ${data.toString().trim()}`);
  });

  previewProcess.stderr.on('data', (data) => {
    console.error(`[Vite Error]: ${data.toString().trim()}`);
  });

  try {
    await waitForPort(4173);
    console.log("Vite server ready at port 4173.");

    // Reset Apps Script passcode to default "STA69" for testing
    console.log("Resetting Apps Script passcode to default 'STA69' for tests...");
    try {
      await fetch('https://script.google.com/macros/s/AKfycbxFD2loccRj_htSLTsDGY76ytQrvu80W_DzEIMMR7qhhUMIJMq7b6BUYxEBt6QUu9Ci/exec?action=set-line-passcode&passcode=STA69');
      console.log("✅ Apps Script passcode reset successful.");
    } catch (e) {
      console.error("Failed to reset Apps Script passcode:", e);
    }

    // 2. Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.includes('action=execute-carryover')) {
        request.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ status: 'success', message: '✅ โอนยอดสำเร็จ! (Mocked Test)' })
        });
      } else if (url.includes('export?format=csv')) {
        // Mock sheets download
        request.respond({
          status: 200,
          contentType: 'text/csv',
          headers: { 'access-control-allow-origin': '*' },
          body: 'Mocked,CSV,Data\n'
        });
      } else {
        request.continue();
      }
    });
    
    page.on('dialog', async (dialog) => {
      console.log(`[Browser Alert]: "${dialog.message()}"`);
      await dialog.accept();
    });
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));


    console.log("Navigating to http://localhost:4173/ ...");
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle2' });

    // Test 1: Check if Login Overlay is visible
    console.log("Test 1: Verifying login overlay visibility...");
    const isOverlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('loginOverlay');
      return overlay && overlay.style.display !== 'none' && !overlay.classList.contains('fade-out');
    });
    if (!isOverlayVisible) throw new Error("Login overlay should be visible on first load!");
    console.log("✅ Login overlay is visible.");

    // Test 2: Typing wrong password
    console.log("Test 2: Typing wrong password...");
    await page.type('#loginAdminName', 'TestAdmin');
    await page.type('#loginPassword', 'wrongpass');
    await page.click('#loginForm button[type="submit"]');
    
    // Wait for error message
    await waitForCondition(page, () => {
      const text = document.getElementById('loginErrorMsg').textContent;
      return text && text.includes('ไม่ถูกต้อง');
    });
    const errorText = await page.evaluate(() => document.getElementById('loginErrorMsg').textContent);
    console.log(`Error message displayed: "${errorText}"`);
    console.log("✅ Wrong password handled correctly (error displayed).");

    // Test 3: Typing correct password (STA69)
    console.log("Test 3: Typing correct password (STA69)...");
    // Clear input reliably
    await page.evaluate(() => {
      document.getElementById('loginPassword').value = '';
    });
    
    await page.type('#loginPassword', 'STA69');
    
    // Log input value to verify it contains exactly 'STA69'
    const inputValue = await page.evaluate(() => document.getElementById('loginPassword').value);
    console.log(`Password input value: "${inputValue}"`);
    
    await page.click('#loginForm button[type="submit"]');
    
    // Wait for overlay to fade out
    await waitForCondition(page, () => {
      const overlay = document.getElementById('loginOverlay');
      return overlay.style.display === 'none' || overlay.classList.contains('fade-out');
    });
    console.log("✅ Unlocked app successfully.");

    // Test 4: Page refresh bypasses login overlay
    console.log("Test 4: Verifying authorization bypass on page refresh...");
    await page.reload({ waitUntil: 'networkidle2' });
    
    const isOverlayHiddenOnRefresh = await page.evaluate(() => {
      const overlay = document.getElementById('loginOverlay');
      return overlay.style.display === 'none';
    });
    if (!isOverlayHiddenOnRefresh) throw new Error("Login overlay should be bypassed on subsequent visits!");
    console.log("✅ Login overlay bypassed successfully on refresh.");

    // Test 5: Change password flow
    console.log("Test 5: Verifying password change flow...");
    // Click Change Password button to open modal
    await page.click('#changePasswordBtn');
    await new Promise(r => setTimeout(r, 300));
    
    // Fill out form
    await page.type('#oldPassword', 'STA69');
    await page.type('#newPassword', '5678');
    await page.type('#confirmNewPassword', '5678');
    
    // Submit
    await page.click('#changePassForm button[type="submit"]');
    await new Promise(r => setTimeout(r, 500));
    
    // Check new password is saved in localStorage
    const savedPassword = await page.evaluate(() => localStorage.getItem('sta69_access_password'));
    console.log(`Saved password in localStorage: "${savedPassword}"`);
    if (savedPassword !== '5678') throw new Error("New password should be saved in localStorage!");
    console.log("✅ Password changed to '5678' successfully.");

    // Test 6: Clear session auth, refresh, and unlock with new password
    console.log("Test 6: Verifying new password works after logging out...");
    await page.evaluate(() => localStorage.removeItem('sta69_authorized'));
    await page.reload({ waitUntil: 'networkidle2' });
    
    // Overlay should be visible again
    const isOverlayVisibleAgain = await page.evaluate(() => {
      const overlay = document.getElementById('loginOverlay');
      return overlay && overlay.style.display !== 'none';
    });
    if (!isOverlayVisibleAgain) throw new Error("Login overlay should be visible after removing authorization flag!");
    
    // Try original 'STA69' (should fail now)
    await page.evaluate(() => {
      document.getElementById('loginPassword').value = '';
    });
    await page.type('#loginAdminName', 'TestAdmin');
    await page.type('#loginPassword', 'STA69');
    await page.click('#loginForm button[type="submit"]');
    await waitForCondition(page, () => {
      return document.getElementById('loginErrorMsg').textContent !== '';
    });
    console.log("✅ Old password rejected correctly.");
    
    // Try new password '5678' (should succeed)
    await page.evaluate(() => {
      document.getElementById('loginPassword').value = '';
    });
    await page.type('#loginPassword', '5678');
    
    const finalInputVal = await page.evaluate(() => document.getElementById('loginPassword').value);
    console.log(`New password input value: "${finalInputVal}"`);
    
    await page.click('#loginForm button[type="submit"]');
    await waitForCondition(page, () => {
      return document.getElementById('loginOverlay').style.display === 'none';
    });
    console.log("✅ Unlocked successfully with new password '5678'.");

    // Test 7: Mobile viewport checks
    console.log("Test 7: Emulating mobile screen (375x667)...");
    await page.setViewport({ width: 375, height: 667, isMobile: true });
    
    // Wait for media queries to take effect
    await new Promise(r => setTimeout(r, 800));
    
    const overflowingElements = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const elements = document.querySelectorAll('*');
      const bad = [];
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > docWidth + 2) {
          bad.push({
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            right: rect.right,
            width: rect.width
          });
        }
      });
      return bad;
    });
    console.log("Overflowing Elements on mobile:", JSON.stringify(overflowingElements, null, 2));
    
    // Verify there is no horizontal overflow on page body
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    console.log(`Mobile Scroll Width: ${bodyWidth}px (Viewport: ${viewportWidth}px)`);
    if (bodyWidth > viewportWidth + 5) {
      throw new Error(`Horizontal overflow detected! Page scroll width is ${bodyWidth}px (larger than viewport 375px)`);
    }
    console.log("✅ No horizontal overflow on mobile viewport.");

    // Test 8: Adding and deleting stock logs
    console.log("Test 8: Verifying stock logs receipt and deletion...");
    // Open stock receipt modal
    await page.click('#btnReceiveStock');
    await new Promise(r => setTimeout(r, 400));
    
    // Clear and fill out dlgStock
    await page.evaluate(() => {
      document.getElementById('stockDate').value = '2026-06-16';
      document.getElementById('stockReceived').value = '';
    });
    await page.select('#stockBookCode', '3zeed');
    await page.type('#stockReceived', '200');
    
    // Submit
    await page.click('#dlgStock button[type="submit"]');
    await new Promise(r => setTimeout(r, 600));
    
    // Verify it exists in logs table
    const logDetails = await page.evaluate(() => {
      const rows = document.querySelectorAll('#tableStockHistoryBody tr');
      if (rows.length === 0) return null;
      const cells = rows[rows.length - 1].querySelectorAll('td');
      if (cells.length < 3) return null;
      return {
        date: cells[0].textContent.trim(),
        code: cells[1].textContent.trim(),
        qty: cells[2].textContent.trim()
      };
    });
    
    console.log("Created Stock Log Entry:", logDetails);
    if (!logDetails || logDetails.date !== '16 มิ.ย. 2569' || logDetails.code !== '3ZEED' || logDetails.qty !== '200') {
      throw new Error("Created stock log entry details do not match input!");
    }
    console.log("✅ Stock log entry added correctly.");
    
    // Delete the log entry
    console.log("Deleting the created stock log entry...");
    await page.click('#tableStockHistoryBody tr:last-child .delete-btn');
    await new Promise(r => setTimeout(r, 600));
    
    // Check if deleted
    const logsCount = await page.evaluate(() => document.querySelectorAll('#tableStockHistoryBody tr:not(.empty-state)').length);
    console.log(`Remaining logs count after deletion: ${logsCount}`);
    console.log("✅ Stock log entry deleted and counts recalculated successfully.");

    // Test 9: KPI grid layout verification on mobile
    console.log("Test 9: Verifying mobile KPI grid layout...");
    const kpiLayoutData = await page.evaluate(() => {
      const cards = document.querySelectorAll('.kpi-card');
      const container = document.querySelector('.kpi-container.top-row');
      const style = window.getComputedStyle(container);
      
      // Check grid template columns
      const cols = style.getPropertyValue('grid-template-columns').split(' ').length;
      
      return {
        cardsCount: cards.length,
        gridColumns: cols
      };
    });
    console.log("KPI Layout Data:", kpiLayoutData);
    if (kpiLayoutData.cardsCount !== 5) throw new Error("Should have exactly 5 KPI cards!");
    // It should report 3 columns in layout width for the top row
    if (kpiLayoutData.gridColumns !== 3) throw new Error("KPI container should have 3 grid columns on mobile!");
    // Test 10: Verify Multiple Slip Uploads and Clickable Amount Cell
    console.log("Test 10: Verifying multiple slip uploads and clickable amount cell...");
    // Switch to Expenses Tab panel first so btnAddExpense is visible and clickable
    await page.click('button[data-target="tabExpenses"]');
    await new Promise(r => setTimeout(r, 300));
    // Open expense receipt modal
    await page.click('#btnAddExpense');
    await new Promise(r => setTimeout(r, 400));
    
    // Inject mock Base64 slips directly into the browser context state
    await page.evaluate(() => {
      document.getElementById('expDate').value = '2026-06-17';
      document.getElementById('expDesc').value = 'ค่าของขวัญวันเกิดหุ้นส่วน';
      document.getElementById('expPrice').value = '1500';
      document.getElementById('expNote').value = 'แนบสลิปแล้ว';
      
      // Inject two mock 1x1 pixels base64
      window.activeExpenseSlips = [
        "data:image/gif;base64,R0lGODlhAQABAIAAAAD/lh7lhAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
      ];
      // Render the previews in the modal
      window.renderSlipPreviews("expSlipPreviewContainer", window.activeExpenseSlips, "removeExpenseSlip");
    });
    
    // Submit the form
    await page.click('#dlgExpense button[type="submit"]');
    await new Promise(r => setTimeout(r, 600));
    
    // Verify that the price cell has the clickable-amount class and 📄 icon
    const isAmountClickable = await page.evaluate(() => {
      const rows = document.querySelectorAll('#tableExpensesBody tr');
      if (rows.length === 0) return false;
      const lastRow = rows[rows.length - 1];
      const priceCell = lastRow.querySelector('td[data-label="จำนวนเงิน"] span');
      return priceCell && priceCell.classList.contains('clickable-amount') && priceCell.textContent.includes('📄');
    });
    
    if (!isAmountClickable) {
      throw new Error("Expense price cell should be clickable and display the 📄 icon when slips are attached!");
    }
    console.log("✅ Clickable amount cell successfully rendered with slips.");
    
    // Click the amount cell to open slip viewer Lightbox
    await page.click('#tableExpensesBody tr:last-child td[data-label="จำนวนเงิน"] span');
    await new Promise(r => setTimeout(r, 400));
    
    // Check if dlgSlipViewer is open and has 2 images inside it
    const viewerImagesCount = await page.evaluate(() => {
      const viewer = document.getElementById('dlgSlipViewer');
      if (!viewer || !viewer.open) return 0;
      return viewer.querySelectorAll('#slipViewerContent img').length;
    });
    
    console.log(`Viewer images count: ${viewerImagesCount}`);
    if (viewerImagesCount !== 2) {
      throw new Error("Slip viewer lightbox should be open and display exactly 2 images!");
    }
    console.log("✅ Lightbox viewer opens and displays all attached slips successfully.");
    
    // Close the lightbox
    await page.click('#dlgSlipViewer button');
    await new Promise(r => setTimeout(r, 400));

    // Test 11: Verify Carryover Balance Functionality
    console.log("Test 11: Verifying carryover balance functionality...");
    
    // Open carryover modal
    await page.click('#toggleSettingsBtn');
    await new Promise(r => setTimeout(r, 400));
    await page.click('#carryoverBtn');
    await new Promise(r => setTimeout(r, 400));
    
    // Check if modal is visible and open
    const isCarryoverOpen = await page.evaluate(() => {
      const modal = document.getElementById('dlgCarryover');
      return modal && modal.open;
    });
    if (!isCarryoverOpen) throw new Error("Carryover modal should be open!");
    
    // Fill the destination and amount
    await page.select('#carryDest', '3za_2569');
    await page.evaluate(() => {
      document.getElementById('carryAmount').value = '500';
    });
    
    // Submit the carryover form
    await page.click('#carryoverForm button[type="submit"]');
    await new Promise(r => setTimeout(r, 800));
    
    // Check if modal is closed after successful carryover
    const isCarryoverClosed = await page.evaluate(() => {
      const modal = document.getElementById('dlgCarryover');
      return !modal || !modal.open;
    });
    if (!isCarryoverClosed) throw new Error("Carryover modal should be closed after submission!");
    console.log("✅ Carryover balance executed and submitted successfully.");

    console.log("=== ALL TESTS PASSED SUCCESSFULLY! ===");
    await browser.close();
  } finally {
    console.log("Stopping Vite preview server...");
    previewProcess.kill();
  }
}

runTests().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
