// ใส่ Channel Access Token จาก LINE Developers Console ที่นี่
const LINE_ACCESS_TOKEN = "NHjsvK4l1ngTXVEJPucy7R1c1uUJ5Ux79tU/WLcQSc7ms8C80urt9K7IpubGum9/Q9RIEWUtfMGzk8wn7OKSglhwu64Ig6Xn+YIC1irfOU/BzQsmlyDswjEhbOLdAJyahfSKRdgBQk3yVvAtB8NxPAdB04t89/1O/w1cDnyilFU=";
const SPREADSHEET_ID = "15PDmzbRGXocSvm42lksU9KNRcg7op31qc-b1JEo4wjQ";

function getAuthPassword() {
  let pass = PropertiesService.getScriptProperties().getProperty("AUTH_PASSWORD");
  if (!pass) {
    pass = "STA69"; // รหัสผ่านเริ่มต้น
  }
  return pass;
}

function doPost(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;
    if (action) {
      return handleApiAction(e);
    }

    let json = {};
    if (e && e.postData && e.postData.contents) {
      try {
        json = JSON.parse(e.postData.contents);
      } catch (err) {}
    }

    if (!json.events || !json.events[0]) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "No LINE events to process" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const event = json.events[0];

    const replyToken = event.replyToken;
    const userId = event.source.userId || "default_user";

    if (event.type !== "message" || event.message.type !== "text") {
      return ContentService.createTextOutput("OK");
    }

    const userMessage = event.message.text.trim();
    
    // ตรวจสอบความปลอดภัยการเชื่อมต่อสิทธิ์ (Authorization Status)
    const authKey = "authorized_" + userId;
    const isAuthorized = PropertiesService.getScriptProperties().getProperty(authKey) === "true";
    
    // ดักตรวจสอบการกรอกรหัสผ่านเพื่อเชื่อมต่อสิทธิ์ (เช่น พิมพ์: รหัสผ่าน STA69 หรือ รหัส STA69 หรือพิมพ์ STA69 ตรงๆ)
    const currentPasscode = getAuthPassword();
    const cleanMsg = userMessage.trim().toUpperCase();
    const cleanPass = currentPasscode.trim().toUpperCase();
    const authRegex = /^(?:รหัสผ่าน|รหัส)\s+(\S+)/i;
    let inputPass = null;
    
    if (cleanMsg === cleanPass || cleanMsg.includes(cleanPass)) {
      inputPass = currentPasscode;
    } else if (authRegex.test(userMessage)) {
      const match = userMessage.match(authRegex);
      inputPass = match[1];
    }
    
    if (inputPass !== null) {
      if (inputPass.trim().toUpperCase() === cleanPass) {
        PropertiesService.getScriptProperties().setProperty(authKey, "true");
        replyMessage(replyToken, "🔓 ยืนยันรหัสผ่านถูกต้อง! บัญชี LINE ของคุณได้รับการเชื่อมต่อสิทธิ์เข้าใช้งานระบบเรียบร้อยแล้ว (ทำครั้งแรกครั้งเดียว) ต่อไปคุณสามารถพิมพ์ทำรายการหรือกดเมนูบัญชีในไลน์บอทเพื่อบันทึกงานได้ทันทีครับ", "Sta69");
        return ContentService.createTextOutput("OK");
      } else {
        replyMessage(replyToken, "❌ รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้งครับ (พิมพ์: `รหัสผ่าน [รหัสผ่านของคุณ]`)", "Sta69");
        return ContentService.createTextOutput("OK");
      }
    }
    
    // ดักจับคำสั่ง ออกจากระบบ (Logout)
    if (/^(?:ออกจากระบบ|logout|ยกเลิกการเชื่อมต่อ)/i.test(userMessage.trim())) {
      PropertiesService.getScriptProperties().deleteProperty(authKey);
      replyMessage(replyToken, "🔒 คุณได้ทำการออกจากระบบเรียบร้อยแล้ว บัญชี LINE ของคุณถูกยกเลิกการเชื่อมต่อสิทธิ์จากระบบแล้วครับ\n\nหากต้องการกลับเข้าใช้งาน สามารถกดปุ่มบนเมนูเพื่อกรอกชื่อและรหัสผ่านเข้าใช้งานใหม่อีกครั้งครับ", "Sta69");
      return ContentService.createTextOutput("OK");
    }

    // หากยังไม่เชื่อมต่อสิทธิ์ ให้ส่งการ์ดเชื่อมสิทธิ์เพื่อให้กรอกรหัสผ่านบนเว็บวิวของ LINE
    if (!isAuthorized) {
      replyUnauthorizedFlex(replyToken);
      return ContentService.createTextOutput("OK");
    }

    const incomeRegex = /^รายรับ\s+(\S+)\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?/i;
    const expenseRegex = /^รายจ่าย\s+(\S+)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?/i;
    const stockRegex = /^รับหนังสือ\s+(\S+)\s+(\d+)/i;
    const switchRegex = /^สลับ\s+(\S+)/i;

    // Load active tab for the user
    let activeTabName = PropertiesService.getScriptProperties().getProperty("activeProject_" + userId);
    if (!activeTabName) {
      activeTabName = "Sta69"; // default tab
    }

    let responseText = "";

    if (switchRegex.test(userMessage)) {
      const match = userMessage.match(switchRegex);
      const targetTabName = match[1];
      
      let foundTabName = targetTabName;
      const webDb = getWebDatabase();
      if (webDb) {
        const keys = Object.keys(webDb);
        for (let i = 0; i < keys.length; i++) {
          const normKey = keys[i].replace("_25", "").toLowerCase();
          const normTarget = targetTabName.toLowerCase();
          if (keys[i].toLowerCase() === normTarget || normKey === normTarget || normKey === ("sta" + normTarget)) {
            const m = keys[i].match(/^([a-zA-Z0-9]+?)_25(\d{2})$/);
            if (m) {
              const prefix = m[1].toLowerCase();
              foundTabName = (prefix === "sta" ? "Sta" : prefix.toUpperCase()) + m[2];
            } else {
              foundTabName = keys[i];
            }
            break;
          }
        }
      }

      PropertiesService.getScriptProperties().setProperty("activeProject_" + userId, foundTabName);
      activeTabName = foundTabName;
      replyLINEFlexCard(replyToken, "overview", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (userMessage === "สรุปข้อความ") {
      responseText = getProjectSummary(activeTabName);
    } else if (userMessage === "สำรองข้อมูล") {
      responseText = backupSpreadsheet();
    } else if (userMessage === "ยอดสมัคร" || userMessage === "บันทึกออเดอร์") {
      replyLINEFlexCard(replyToken, "sale", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (userMessage === "รายจ่าย" || userMessage === "บันทึกรายจ่าย") {
      replyLINEFlexCard(replyToken, "expense", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (userMessage === "ค่าโฆษณา" || userMessage === "บันทึกค่าแอด") {
      replyLINEFlexCard(replyToken, "ad", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (userMessage === "สต็อกหนังสือ" || userMessage === "รับหนังสือเข้าสต็อก") {
      replyLINEFlexCard(replyToken, "stock", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (userMessage === "ส่วนแบ่ง" || userMessage === "บันทึกส่วนแบ่ง") {
      replyLINEFlexCard(replyToken, "distribution", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (userMessage === "สรุป" || userMessage === "ดูภาพรวมทั้งหมด") {
      replyLINEFlexCard(replyToken, "overview", activeTabName);
      return ContentService.createTextOutput("OK");
    } else if (incomeRegex.test(userMessage)) {
      responseText = handleIncome(activeTabName, userMessage, incomeRegex);
      if (responseText.indexOf("✅") === 0) {
        broadcastTextMessage(`📢 [แจ้งเตือน] มีรายการใหม่บันทึกเข้ามาโดยผู้ใช้ใน LINE:\n\n${responseText}`, userId);
      }
    } else if (expenseRegex.test(userMessage)) {
      responseText = handleExpense(activeTabName, userMessage, expenseRegex);
      if (responseText.indexOf("✅") === 0) {
        broadcastTextMessage(`📢 [แจ้งเตือน] มีรายการใหม่บันทึกเข้ามาโดยผู้ใช้ใน LINE:\n\n${responseText}`, userId);
      }
    } else if (stockRegex.test(userMessage)) {
      responseText = handleStock(activeTabName, userMessage, stockRegex);
      if (responseText.indexOf("✅") === 0) {
        broadcastTextMessage(`📢 [แจ้งเตือน] มีรายการใหม่บันทึกเข้ามาโดยผู้ใช้ใน LINE:\n\n${responseText}`, userId);
      }
    } else {
      responseText = `📍 กำลังคุยกับหน้างาน: ${activeTabName}\n\n` +
        "ℹ️ วิธีการกรอกบัญชีผ่านแชท LINE:\n\n" +
        "📈 1. บันทึกรายรับ (สล็อตแถว 3-10):\n" +
        "พิมพ์: `รายรับ [รหัสสินค้า] [จำนวน] [ราคารวม]`\n" +
        "👉 ตัวอย่าง: `รายรับ 3ZEED 10 3200`\n\n" +
        "💸 2. บันทึกรายจ่าย:\n" +
        "พิมพ์: `รายจ่าย [รายการ] [ยอดเงิน] [โน้ต]`\n" +
        "👉 ตัวอย่าง: `รายจ่าย ค่าแอด facebook 5000`\n\n" +
        "📦 3. บันทึกรับหนังสือเข้าสต็อก (แถว 12-16):\n" +
        "พิมพ์: `รับหนังสือ [รหัสหนังสือ] [จำนวน]`\n" +
        "👉 ตัวอย่าง: `รับหนังสือ 3ZEED 200`";
    }

    replyMessage(replyToken, responseText, activeTabName);
    return ContentService.createTextOutput("OK");
  } catch (err) {
    Logger.log(err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApiAction(e) {
  const action = e.parameter ? e.parameter.action : "";
  const rawProject = e.parameter ? (e.parameter.project || "Sta70") : "Sta70";
  const userId = e.parameter ? (e.parameter.userId || "") : "";
  const adminName = e.parameter ? (e.parameter.adminName || "LINE หุ้นส่วน") : "LINE หุ้นส่วน";

  if (action === "save-web-database") {
    let jsonStr = "";
    if (e.postData && e.postData.contents) {
      try {
        const body = JSON.parse(e.postData.contents);
        if (body && body.database) {
          jsonStr = typeof body.database === "string" ? body.database : JSON.stringify(body.database);
        } else {
          jsonStr = e.postData.contents;
        }
      } catch (err) {
        jsonStr = e.postData.contents;
      }
    } else if (e.parameter && e.parameter.database) {
      jsonStr = e.parameter.database;
    }

    if (jsonStr) {
      PropertiesService.getScriptProperties().setProperty("WEB_APP_DATABASE_JSON", jsonStr);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Web database saved" }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No database payload provided" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "get-web-database") {
    const jsonStr = PropertiesService.getScriptProperties().getProperty("WEB_APP_DATABASE_JSON") || "{}";
    return ContentService.createTextOutput(jsonStr)
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "send-flex-card") {
    const type = e.parameter ? e.parameter.type || "sale" : "sale";
    const code = e.parameter ? e.parameter.code || "" : "";
    const qty = e.parameter ? parseInt(e.parameter.qty || "0", 10) : 0;
    const price = e.parameter ? parseFloat(e.parameter.price || "0") : 0;
    const project = e.parameter ? e.parameter.project || "Sta70" : "Sta70";
    const senderUserId = e.parameter ? e.parameter.userId || "" : "";

    broadcastFlexCard(senderUserId, type, code, qty, price, project);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Flex card broadcasted" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (userId && userId.length > 5) {
    PropertiesService.getScriptProperties().setProperty("authorized_" + userId, "true");
  }

  let activeTabName = "Sta70";
  if (rawProject) {
    const match = rawProject.match(/^([a-zA-Z0-9]+?)(\d{2})$/);
    if (match) {
      const prefix = match[1].toLowerCase();
      const year = match[2];
      activeTabName = (prefix === "sta" ? "Sta" : prefix.toUpperCase()) + year;
    } else if (rawProject.includes("_")) {
      const parts = rawProject.split("_");
      const prefix = parts[0].toLowerCase();
      const year = parts[1].length === 4 ? parts[1].substring(2) : parts[1];
      activeTabName = (prefix === "sta" ? "Sta" : prefix.toUpperCase()) + year;
    }
  }

  if (action === "add-sale") {
    const code = e.parameter.code || "";
    const qty = parseInt(e.parameter.qty || "1", 10);
    const totalPrice = parseFloat(e.parameter.totalPrice || "0");
    const msg = `รายรับ ${code} ${qty} ${totalPrice}`;
    const result = handleIncome(activeTabName, msg, /^รายรับ\s+(\S+)\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?/i, adminName);
    
    try {
      broadcastFlexCard(userId, "sale", code, qty, totalPrice, activeTabName);
    } catch (err) {
      Logger.log("Error broadcasting flex card: " + err);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "add-expense" || action === "add-ad") {
    const desc = e.parameter.description || e.parameter.desc || "ค่าใช้จ่าย";
    const price = parseFloat(e.parameter.price || "0");
    const note = e.parameter.note || "";
    const msg = `รายจ่าย ${desc} ${price} ${note}`;
    const result = handleExpense(activeTabName, msg, /^รายจ่าย\s+(\S+)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?/i, adminName);
    
    const cardType = action === "add-ad" ? "ad" : "expense";
    try {
      broadcastFlexCard(userId, cardType, desc, 0, price, activeTabName);
    } catch (err) {
      Logger.log("Error broadcasting flex card: " + err);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "receive-stock") {
    const code = e.parameter.code || "";
    const qty = parseInt(e.parameter.qty || "0", 10);
    const msg = `รับหนังสือ ${code} ${qty}`;
    const result = handleStock(activeTabName, msg, /^รับหนังสือ\s+(\S+)\s+(\d+)/i, adminName);
    
    try {
      broadcastFlexCard(userId, "stock", code, qty, 0, activeTabName);
    } catch (err) {
      Logger.log("Error broadcasting flex card: " + err);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "add-distribution") {
    const perPerson = parseFloat(e.parameter.perPerson || "0");
    const total = parseFloat(e.parameter.total || "0");
    const note = e.parameter.note || `แบ่งคนละ ${perPerson} บาท`;
    const desc = `ส่วนแบ่งปันผล (${note})`;
    const msg = `รายจ่าย ${desc} ${total} ${note}`;
    const result = handleExpense(activeTabName, msg, /^รายจ่าย\s+(\S+)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?/i, adminName);
    
    try {
      broadcastFlexCard(userId, "distribution", desc, 0, total, activeTabName);
    } catch (err) {
      Logger.log("Error broadcasting flex card: " + err);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Action processed" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWebDatabase() {
  const jsonStr = PropertiesService.getScriptProperties().getProperty("WEB_APP_DATABASE_JSON");
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    Logger.log("Error parsing WEB_APP_DATABASE_JSON: " + e);
    return null;
  }
}

function saveWebDatabase(webDbObj) {
  if (!webDbObj) return;
  try {
    PropertiesService.getScriptProperties().setProperty("WEB_APP_DATABASE_JSON", JSON.stringify(webDbObj));
  } catch (e) {
    Logger.log("Error saving WEB_APP_DATABASE_JSON: " + e);
  }
}

function getDbKeyFromTabName(tabName) {
  if (!tabName) return "STA_2570";
  const norm = tabName.trim();
  if (norm.includes("_")) return norm.toUpperCase();
  
  const match = norm.match(/^([a-zA-Z0-9]+?)(\d{2})$/);
  if (match) {
    const prefix = match[1].toUpperCase();
    const yearShort = match[2];
    return prefix + "_25" + yearShort;
  }
  return norm;
}

function updateWebDatabaseIncome(tabName, code, qty, totalPrice) {
  try {
    const webDb = getWebDatabase() || {};
    const dbKey = getDbKeyFromTabName(tabName);
    if (!webDb[dbKey]) webDb[dbKey] = {};
    if (!Array.isArray(webDb[dbKey].sales)) webDb[dbKey].sales = [];
    
    const normCode = code.replace(/\s+/g, "").toUpperCase();
    const existing = webDb[dbKey].sales.find(s => s.code && s.code.replace(/\s+/g, "").toUpperCase() === normCode);
    if (existing) {
      existing.qty = (parseInt(existing.qty || 0, 10)) + qty;
      existing.totalPrice = (parseFloat(existing.totalPrice || existing.price || 0)) + totalPrice;
      existing.price = existing.totalPrice;
    } else {
      webDb[dbKey].sales.push({
        code: code.toUpperCase(),
        qty: qty,
        price: totalPrice,
        totalPrice: totalPrice
      });
    }
    saveWebDatabase(webDb);
  } catch (e) {
    Logger.log("Error updating web database income: " + e);
  }
}

function updateWebDatabaseExpense(tabName, description, price, note, isAds) {
  try {
    const webDb = getWebDatabase() || {};
    const dbKey = getDbKeyFromTabName(tabName);
    if (!webDb[dbKey]) webDb[dbKey] = {};
    
    const dateStr = formatThaiDate(new Date());
    
    if (isAds) {
      if (!Array.isArray(webDb[dbKey].ads)) webDb[dbKey].ads = [];
      webDb[dbKey].ads.push({
        date: dateStr,
        channel: "LINE",
        description: description,
        desc: description,
        price: price,
        note: note
      });
    } else {
      if (!Array.isArray(webDb[dbKey].expenses)) webDb[dbKey].expenses = [];
      webDb[dbKey].expenses.push({
        date: dateStr,
        description: description,
        desc: description,
        price: price,
        note: note
      });
    }
    saveWebDatabase(webDb);
  } catch (e) {
    Logger.log("Error updating web database expense: " + e);
  }
}

function updateWebDatabaseStock(tabName, code, qty) {
  try {
    const webDb = getWebDatabase() || {};
    const dbKey = getDbKeyFromTabName(tabName);
    if (!webDb[dbKey]) webDb[dbKey] = {};
    if (!Array.isArray(webDb[dbKey].stock)) webDb[dbKey].stock = [];
    if (!Array.isArray(webDb[dbKey].stockLogs)) webDb[dbKey].stockLogs = [];
    
    const dateStr = formatThaiDate(new Date());
    
    const normCode = code.trim().toLowerCase();
    const existing = webDb[dbKey].stock.find(s => s.code && s.code.trim().toLowerCase() === normCode);
    if (existing) {
      existing.add = (parseInt(existing.add || 0, 10)) + qty;
      existing.remaining = (parseInt(existing.remaining || 0, 10)) + qty;
    } else {
      webDb[dbKey].stock.push({
        code: code.toUpperCase(),
        initial: 0,
        add: qty,
        sold: 0,
        remaining: qty
      });
    }
    webDb[dbKey].stockLogs.push({
      date: dateStr,
      code: code.toUpperCase(),
      qty: qty,
      type: "รับเข้า"
    });
    saveWebDatabase(webDb);
  } catch (e) {
    Logger.log("Error updating web database stock: " + e);
  }
}

function handleIncome(activeTabName, message, regex, editor) {
  if (!editor) editor = "LINE หุ้นส่วน";
  const match = message.match(regex);
  const code = match[1].toUpperCase();
  const qty = parseInt(match[2], 10);
  const totalPrice = match[3] ? parseFloat(match[3]) : 0;

  updateWebDatabaseIncome(activeTabName, code, qty, totalPrice);

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(activeTabName);
  if (!sheet) return `❌ ไม่พบหน้าชีต "${activeTabName}"`;

  const values = sheet.getRange("A1:C15").getValues();
  let rowIdx = -1;

  for (let i = 2; i < Math.min(10, values.length); i++) {
    if (values[i][0] && values[i][0].toString().replace(/\s+/g, "").toUpperCase() === code.replace(/\s+/g, "").toUpperCase()) {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx === -1) return `❌ ไม่พบรหัสสินค้า "${code}" ในแถวที่ 3-10`;

  const currentQty = parseInt(values[rowIdx - 1][1] || "0", 10);
  const currentPrice = parseFloat((values[rowIdx - 1][2] || "0").toString().replace(/,/g, ""));

  sheet.getRange(rowIdx, 2).setValue(currentQty + qty);
  sheet.getRange(rowIdx, 3).setValue(currentPrice + totalPrice);
  logSystemAction(activeTabName, "ยอดสมัคร", editor, { code: code, qty: qty, price: totalPrice });

  return `✅ บันทึกรายรับสำเร็จ!\n\n🛍️ สินค้า: ${code}\n➕ จำนวนเพิ่ม: ${qty} คน (รวมสะสม: ${currentQty + qty} คน)\n💰 ยอดเพิ่ม: ${totalPrice.toLocaleString()} บาท`;
}

function handleExpense(activeTabName, message, regex, editor) {
  if (!editor) editor = "LINE หุ้นส่วน";
  const match = message.match(regex);
  const description = match[1];
  const price = parseFloat(match[2]);
  const note = match[3] || "";

  const dateStr = formatThaiDate(new Date());

  const isAdsCost = description.toLowerCase().includes("โฆษณา") || description.toLowerCase().includes("แอด");
  updateWebDatabaseExpense(activeTabName, description, price, note, isAdsCost);

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(activeTabName);
  if (!sheet) return `❌ ไม่พบหน้าชีต "${activeTabName}"`;

  const values = sheet.getRange("A1:J150").getValues();

  let headerRowIdx = -1;
  for (let i = 0; i < values.length; i++) {
    const rowText = values[i].join(" ").toLowerCase();
    if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) return "❌ ไม่พบแถวหัวตารางรายจ่ายหลัก";

  let targetRow = -1;

  if (isAdsCost) {
    for (let i = headerRowIdx + 1; i < values.length; i++) {
      if (!values[i][0] && !values[i][1] && !values[i][2]) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) targetRow = values.length + 1;
    sheet.getRange(targetRow, 1, 1, 3).setValues([[dateStr, description, price]]);
    logSystemAction(activeTabName, "ค่าโฆษณา", editor, { description: description, price: price });
  } else {
    for (let i = headerRowIdx + 1; i < values.length; i++) {
      if (!values[i][3] && !values[i][4] && !values[i][5] && !values[i][6]) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) targetRow = values.length + 1;
    sheet.getRange(targetRow, 4, 1, 4).setValues([[dateStr, description, price, note]]);
    logSystemAction(activeTabName, "รายจ่าย", editor, { description: description, price: price, note: note });
  }

  return `✅ บันทึกรายจ่ายสำเร็จ!\n\n📅 วันที่: ${dateStr}\n🏷️ หมวด: ${isAdsCost ? "ค่าแอด/โฆษณา" : "รายจ่ายอื่นๆ"}\n📝 รายการ: ${description}\n💸 ยอดเงิน: ${price.toLocaleString()} บาท`;
}

function handleStock(activeTabName, message, regex, editor) {
  if (!editor) editor = "LINE หุ้นส่วน";
  const match = message.match(regex);
  const code = match[1].toLowerCase();
  const qty = parseInt(match[2], 10);

  updateWebDatabaseStock(activeTabName, code, qty);

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(activeTabName);
  if (!sheet) return `❌ ไม่พบหน้าชีต "${activeTabName}"`;

  const values = sheet.getRange("D1:E20").getValues();
  let rowIdx = -1;

  for (let i = 11; i < Math.min(16, values.length); i++) {
    if (values[i][0] && values[i][0].toString().trim().toLowerCase() === code) {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx === -1) return `❌ ไม่พบรหัสหนังสือ "${code.toUpperCase()}" ในสต็อก (แถว 12-16)`;

  const currentReceived = parseInt(values[rowIdx - 1][1] || "0", 10);
  sheet.getRange(rowIdx, 5).setValue(currentReceived + qty);
  logSystemAction(activeTabName, "สต็อกหนังสือ", editor, { code: code, qty: qty });

  return `✅ บันทึกรับหนังสือเข้าสต็อกสำเร็จ!\n\n📚 หนังสือ: ${code.toUpperCase()}\n➕ จำนวนรับเข้าเพิ่ม: ${qty.toLocaleString()} เล่ม\n📦 สต็อกสะสมทั้งหมด: ${currentReceived + qty} เล่ม`;
}

function getProjectSummary(tabName) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) return `❌ ไม่พบหน้าชีต "${tabName}"`;

  const values = sheet.getRange("A1:J150").getValues();

  // 1. Calculate Product Sales (Row 3 to 10 is index 2 to 9)
  let totalSales = 0;
  let salesDetails = [];
  for (let i = 2; i < Math.min(10, values.length); i++) {
    const code = values[i][0] ? values[i][0].toString().trim() : "";
    const qty = parseInt(values[i][1] || "0", 10);
    const price = parseFloat((values[i][2] || "0").toString().replace(/,/g, ""));
    if (code && (qty > 0 || price > 0)) {
      totalSales += price;
      salesDetails.push(`• ${code}: ${qty} คน | ${price.toLocaleString()} บาท`);
    }
  }

  // 2. Find expense header row
  let headerRowIdx = -1;
  for (let i = 0; i < values.length; i++) {
    const rowText = values[i].join(" ").toLowerCase();
    if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
      headerRowIdx = i;
      break;
    }
  }

  let totalAds = 0;
  let totalOtherExpenses = 0;

  if (headerRowIdx !== -1) {
    // 3. Calculate Ads Cost (Col A-C: index 0-2) and Other Expenses (Col D-G: index 3-6)
    for (let i = headerRowIdx + 1; i < values.length; i++) {
      // Ads cost (Col C)
      const adPrice = parseFloat((values[i][2] || "0").toString().replace(/,/g, ""));
      if (adPrice > 0) {
        totalAds += adPrice;
      }
      // Other expenses (Col F / index 5)
      const expPrice = parseFloat((values[i][5] || "0").toString().replace(/,/g, ""));
      if (expPrice > 0) {
        totalOtherExpenses += expPrice;
      }
    }
  }

  const balance = totalSales - totalAds - totalOtherExpenses;

  return `📊 รายงานสรุปงาน [ ${tabName} ]\n` +
         `━━━━━━━━━━━━━━━━\n` +
         `🛍️ ยอดขายสินค้ารวม: ${totalSales.toLocaleString()} บาท\n` +
         (salesDetails.length > 0 ? salesDetails.join("\n") + "\n" : "") +
         `━━━━━━━━━━━━━━━━\n` +
         `📢 ค่าแอดรวม: ${totalAds.toLocaleString()} บาท\n` +
         `💸 รายจ่ายอื่นๆ: ${totalOtherExpenses.toLocaleString()} บาท\n` +
         `━━━━━━━━━━━━━━━━\n` +
         `${balance >= 0 ? "💰 กำไรสุทธิ" : "⚠️ ขาดทุนสุทธิ"}: ${balance.toLocaleString()} บาท`;
}

function replyMessage(replyToken, text, activeTabName) {
  const url = "https://api.line.me/v2/bot/message/reply";
  
  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: text,
        quickReply: getMenuQuickReplies()
      }
    ]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const userId = e.parameter.userId;
    
    // 1. การทำงานสำหรับ LINE LIFF (ต้องเช็กสิทธิ์รายบุคคล)
    if (action === "send-flex-card") {
      const type = e.parameter.type || "sale";
      const code = e.parameter.code || "";
      const qty = parseInt(e.parameter.qty || "0", 10);
      const price = parseFloat(e.parameter.price || "0");
      const project = e.parameter.project || "Sta70";
      
      broadcastFlexCard(userId, type, code, qty, price, project);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "get-active-project") {
      if (!userId) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing userId" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const authKey = "authorized_" + userId;
      const isAuthorized = PropertiesService.getScriptProperties().getProperty(authKey) === "true";
      if (!isAuthorized) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized: Account not linked" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      let activeProject = PropertiesService.getScriptProperties().getProperty("activeProject_" + userId);
      if (!activeProject) {
        activeProject = "Sta69"; // default
      }
      return ContentService.createTextOutput(JSON.stringify({ activeProject: activeProject }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "link-user-account") {
      const passcode = e.parameter.passcode;
      const userId = e.parameter.userId;
      if (!userId || !passcode) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing parameter" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      const currentPasscode = getAuthPassword();
      if (passcode.trim() === currentPasscode) {
        const authKey = "authorized_" + userId;
        PropertiesService.getScriptProperties().setProperty(authKey, "true");
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Authorized successfully" }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid passcode" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 2. การทำงานปรับแต่งรหัสผ่าน LINE จากหน้าเว็บแอป (ไม่ต้องใช้ LINE userId)
    if (action === "get-line-passcode") {
      const passcode = getAuthPassword();
      return ContentService.createTextOutput(JSON.stringify({ passcode: passcode }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "set-line-passcode") {
      const passcode = e.parameter.passcode;
      if (passcode) {
        PropertiesService.getScriptProperties().setProperty("AUTH_PASSWORD", passcode.trim());
        return ContentService.createTextOutput(JSON.stringify({ status: "success", passcode: passcode.trim() }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing passcode parameter" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "get-line-quota") {
      const quota = getLineQuotaData();
      return ContentService.createTextOutput(JSON.stringify(quota))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "backup-sheet") {
      const msg = backupSpreadsheet();
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: msg }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "get-history-logs") {
      const logs = getHistoryLogs();
      return ContentService.createTextOutput(JSON.stringify(logs))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "cancel-history-log") {
      const logId = e.parameter.logId;
      const adminName = e.parameter.adminName || "";
      const res = cancelHistoryLog(logId, adminName);
      return ContentService.createTextOutput(JSON.stringify({ status: res.indexOf("✅") !== -1 ? "success" : "error", message: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "restore-to-log") {
      const logId = e.parameter.logId;
      const adminName = e.parameter.adminName || "";
      const res = restoreToLog(logId, adminName);
      return ContentService.createTextOutput(JSON.stringify({ status: res.indexOf("✅") !== -1 ? "success" : "error", message: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "execute-carryover") {
      const sourceProj = e.parameter.sourceProject;
      const destProj = e.parameter.destProject;
      const amount = parseFloat(e.parameter.amount);
      const adminName = e.parameter.adminName || "แอดมิน";
      const res = executeCarryover(sourceProj, destProj, amount, adminName);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "sync-all-sheets") {
      const data = getAllSheetsData();
      return ContentService.createTextOutput(JSON.stringify({ status: "success", data: data }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action or parameters" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getAllSheetsData() {
  const tabs = [
    { key: "STA_2570", name: "Sta70" },
    { key: "3COOL_2569", name: "3COOL69" },
    { key: "3za_2569", name: "3za69" },
    { key: "STA_2569", name: "Sta69" },
    { key: "3COOL_2568", name: "3Cool68" },
    { key: "3za_2568", name: "3za68" }
  ];
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const result = {};

  tabs.forEach(function(t) {
    const sheet = spreadsheet.getSheetByName(t.name);
    if (!sheet) return;

    const values = sheet.getRange("A1:J150").getValues();

    // 1. Sales (Rows 3-10)
    const sales = [];
    for (let i = 2; i < Math.min(10, values.length); i++) {
      const code = values[i][0] ? values[i][0].toString().trim() : "";
      const qty = parseInt(values[i][1] || "0", 10);
      const price = parseFloat((values[i][2] || "0").toString().replace(/,/g, ""));
      if (code && (qty > 0 || price > 0)) {
        const unitPrice = qty > 0 ? Math.round(price / qty) : price;
        sales.push({ code: code, qty: qty, unitPrice: unitPrice, totalPrice: price });
      }
    }

    // 2. Stock (Rows 13-17)
    const stock = [];
    for (let i = 11; i < Math.min(16, values.length); i++) {
      const bookCode = values[i][3] ? values[i][3].toString().trim().toLowerCase() : "";
      const received = parseInt(values[i][4] || "0", 10);
      if (bookCode && received >= 0) {
        stock.push({ bookCode: bookCode, received: received });
      }
    }

    // 3. Header row for Ads, Expenses, Distributions
    let headerRowIdx = -1;
    for (let i = 0; i < values.length; i++) {
      const rowText = values[i].join(" ").toLowerCase();
      if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
        headerRowIdx = i;
        break;
      }
    }

    const ads = [];
    const expenses = [];
    const distributions = [];

    if (headerRowIdx !== -1) {
      for (let i = headerRowIdx + 1; i < values.length; i++) {
        const row = values[i];
        
        // Ads (Col A-C)
        const adDate = row[0] ? row[0].toString().trim() : "";
        const adDesc = row[1] ? row[1].toString().trim() : "";
        const adPrice = parseFloat((row[2] || "0").toString().replace(/,/g, ""));
        if (adDate && adDesc && adPrice > 0) {
          ads.push({ date: adDate, description: adDesc, price: adPrice });
        }

        // Expenses (Col D-G)
        const expDate = row[3] ? row[3].toString().trim() : "";
        const expDesc = row[4] ? row[4].toString().trim() : "";
        const expPrice = parseFloat((row[5] || "0").toString().replace(/,/g, ""));
        const expNote = row[6] ? row[6].toString().trim() : "";
        if (expDate && expDesc && expPrice > 0) {
          const isDistribution = ["แบ่ง", "คนละ", "ส่วนแบ่ง"].some(function(w) { return expDesc.includes(w); });
          if (isDistribution) {
            const matchVal = expDesc.replace(/k/gi, '000').match(/([\d,]+)/);
            let perPerson = matchVal ? parseFloat(matchVal[1].replace(/,/g, '')) : 0.0;
            if (expDesc.toLowerCase().includes('k') && perPerson < 1000) perPerson *= 1000;
            if (perPerson === 0.0) perPerson = expPrice / 3.0;
            distributions.push({ date: expDate, perPerson: perPerson, total: expPrice, note: expDesc });
          } else {
            expenses.push({ date: expDate, description: expDesc, price: expPrice, note: expNote });
          }
        }

        // Distributions (Col H-J)
        const distDate = row[7] ? row[7].toString().trim() : "";
        const distPerPerson = parseFloat((row[8] || "0").toString().replace(/,/g, ""));
        const distTotal = parseFloat((row[9] || "0").toString().replace(/,/g, ""));
        if (distDate && (distPerPerson > 0 || distTotal > 0)) {
          let perPerson = distPerPerson;
          let total = distTotal;
          if (total === 0 && perPerson > 0) total = perPerson * 3;
          if (perPerson === 0 && total > 0) perPerson = total / 3;
          if (total > 0) {
            distributions.push({ date: distDate, perPerson: perPerson, total: total, note: "ส่วนแบ่งหุ้นส่วน" });
          }
        }
      }
    }

    const uniqueDists = [];
    const seenDists = {};
    distributions.forEach(function(d) {
      const distKey = d.date + "_" + d.total;
      if (!seenDists[distKey]) {
        seenDists[distKey] = true;
        uniqueDists.push(d);
      }
    });

    result[t.key] = { sales: sales, ads: ads, expenses: expenses, distributions: uniqueDists, stock: stock };
  });

  return result;
}

function triggerLINEFlexCard(userId, type, code, qty, price, project) {
  try {
    const summary = getProjectSummaryData(project) || { totalSales: 0, salesCount: 0, salesBreakdown: [], totalAds: 0, adsCount: 0, totalOtherExpenses: 0, expensesCount: 0, balance: 0 };
    
    let title = "บันทึกรายการสำเร็จ";
    let typeName = "";
    let startColor = "#10b981";
    let endColor = "#064e3b";
    let rows = [];
    
    if (type === "sale") {
      title = "ยอดสมัครสำเร็จ";
      typeName = "ยอดสมัคร";
      startColor = "#10b981";
      endColor = "#064e3b";
      rows = [
        { label: "📦 รหัสสินค้า", value: code.toUpperCase() },
        { label: "🔢 จำนวนคนสมัคร", value: qty.toLocaleString() + " คน" },
        { label: "💰 ราคารวม", value: price.toLocaleString() + " บาท", isAmount: true }
      ];
    } else if (type === "expense") {
      title = "รายจ่ายสำเร็จ";
      typeName = "รายจ่าย";
      startColor = "#f43f5e";
      endColor = "#881337";
      rows = [
        { label: "💸 รายการ", value: code },
        { label: "💵 ยอดเงิน", value: price.toLocaleString() + " บาท", isAmount: true }
      ];
    } else if (type === "ad") {
      title = "ค่าโฆษณาสำเร็จ";
      typeName = "ค่าโฆษณา";
      startColor = "#3b82f6";
      endColor = "#1e3a8a";
      rows = [
        { label: "📢 รายการ", value: code },
        { label: "💵 ยอดเงิน", value: price.toLocaleString() + " บาท", isAmount: true }
      ];
    } else if (type === "stock") {
      title = "สต็อกหนังสือสำเร็จ";
      typeName = "สต็อกหนังสือ";
      startColor = "#a855f7";
      endColor = "#581c87";
      rows = [
        { label: "📚 รหัสหนังสือ", value: code.toUpperCase() },
        { label: "📥 จำนวนรับเข้า", value: qty.toLocaleString() + " เล่ม" }
      ];
    } else if (type === "distribution") {
      title = "ส่วนแบ่งสำเร็จ";
      typeName = "ส่วนแบ่ง";
      startColor = "#f59e0b";
      endColor = "#78350f";
      rows = [
        { label: "👤 ผู้รับ/รายการ", value: code },
        { label: "💵 ยอดเงินรวม", value: price.toLocaleString() + " บาท", isAmount: true }
      ];
    }
    
    // Construct Card 1 contents
    const card1BodyContents = [
      {
        "type": "text",
        "text": "ประเภท: " + typeName,
        "weight": "bold",
        "size": "xs",
        "color": "#111827"
      },
      {
        "type": "separator",
        "margin": "xs"
      },
      {
        "type": "box",
        "layout": "vertical",
        "margin": "xs",
        "spacing": "xs",
        "contents": rows.map(r => {
          return {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              {
                "type": "text",
                "text": r.label,
                "color": "#6b7280",
                "size": "xs"
              },
              {
                "type": "text",
                "text": r.value,
                "align": "end",
                "weight": "bold",
                "size": "xs",
                "color": r.isAmount ? startColor : "#374151"
              }
            ]
          };
        })
      }
    ];
    
    const card1 = {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "✨ " + title,
            "weight": "bold",
            "size": "md",
            "color": "#ffffff"
          },
          {
            "type": "text",
            "text": "📅 ทำรายการสำเร็จเรียบร้อยแล้ว",
            "size": "xxs",
            "color": "#f3f4f6",
            "margin": "xs"
          }
        ],
        "background": {
          "type": "linearGradient",
          "angle": "45deg",
          "startColor": startColor,
          "endColor": endColor
        },
        "paddingAll": "6px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": card1BodyContents,
        "paddingAll": "6px"
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": "เปิดหน้าแดชบอร์ด",
              "uri": "https://sta69-ledger-98315.web.app/"
            },
            "style": "primary",
            "color": startColor,
            "height": "sm"
          }
        ],
        "paddingAll": "6px"
      }
    };
    
    // Card 2 body elements
    const adsRatio = summary.totalSales > 0 ? (summary.totalAds / summary.totalSales) * 100 : 0;
    const expRatio = summary.totalSales > 0 ? (summary.totalOtherExpenses / summary.totalSales) * 100 : 0;
    
    const card2BodyContents = [
      {
        "type": "box",
        "layout": "vertical",
        "spacing": "xs",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "🛍️ ยอดขายรวม", "color": "#4b5563", "size": "xs", "weight": "bold" },
              { "type": "text", "text": summary.totalSales.toLocaleString() + " บาท", "align": "end", "weight": "bold", "size": "xs", "color": "#111827" }
            ]
          },
          {
            "type": "text",
            "text": "   • ผู้สมัครเรียนสะสม: " + summary.salesCount.toLocaleString() + " คน",
            "size": "xxs",
            "color": "#6b7280",
            "margin": "none"
          },
          { "type": "separator", "margin": "xs" },
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "📢 ค่าแอดรวม", "color": "#4b5563", "size": "xs", "weight": "bold" },
              { "type": "text", "text": summary.totalAds.toLocaleString() + " บาท", "align": "end", "weight": "bold", "size": "xs", "color": "#ef4444" }
            ]
          },
          {
            "type": "text",
            "text": "   • สัดส่วนค่าแอด: " + adsRatio.toFixed(1) + "% ของยอดขาย (" + summary.adsCount + " บิล)",
            "size": "xxs",
            "color": "#6b7280",
            "margin": "none"
          },
          { "type": "separator", "margin": "xs" },
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "💸 รายจ่ายอื่นๆ", "color": "#4b5563", "size": "xs", "weight": "bold" },
              { "type": "text", "text": summary.totalOtherExpenses.toLocaleString() + " บาท", "align": "end", "weight": "bold", "size": "xs", "color": "#ef4444" }
            ]
          },
          {
            "type": "text",
            "text": "   • สัดส่วนรายจ่าย: " + expRatio.toFixed(1) + "% ของยอดขาย (" + summary.expensesCount + " บิล)",
            "size": "xxs",
            "color": "#6b7280",
            "margin": "none"
          }
        ]
      }
    ];
    
    // Add product breakdown section
    const breakdownBoxContents = [];
    breakdownBoxContents.push({
      "type": "text",
      "text": "📦 รายละเอียดออเดอร์ยอดขายรายคน:",
      "weight": "bold",
      "size": "xxs",
      "color": "#374151",
      "margin": "xs"
    });
    
    if (summary.salesBreakdown && summary.salesBreakdown.length > 0) {
      summary.salesBreakdown.forEach(item => {
        breakdownBoxContents.push({
          "type": "box",
          "layout": "horizontal",
          "margin": "xs",
          "contents": [
            { "type": "text", "text": "   • " + item.code, "size": "xxs", "color": "#6b7280" },
            { "type": "text", "text": item.qty.toLocaleString() + " คน | " + item.price.toLocaleString() + " บาท", "align": "end", "size": "xxs", "color": "#374151", "weight": "bold" }
          ]
        });
      });
    } else {
      breakdownBoxContents.push({
        "type": "text",
        "text": "   ไม่มีข้อมูลยอดขายรายคน",
        "size": "xxs",
        "color": "#9ca3af",
        "style": "italic",
        "margin": "xs"
      });
    }
    
    card2BodyContents.push({
      "type": "box",
      "layout": "vertical",
      "margin": "xs",
      "contents": breakdownBoxContents
    });
    
    card2BodyContents.push({ "type": "separator", "margin": "xs" });
    
    // Add final net profit/loss row
    card2BodyContents.push({
      "type": "box",
      "layout": "horizontal",
      "margin": "xs",
      "contents": [
        { "type": "text", "text": "💰 กำไรสุทธิคงเหลือ", "weight": "bold", "color": "#111827", "size": "xs" },
        {
          "type": "text",
          "text": summary.balance.toLocaleString() + " บาท",
          "align": "end",
          "weight": "bold",
          "size": "sm",
          "color": summary.balance >= 0 ? "#10b981" : "#ef4444"
        }
      ]
    });
    
    const card2 = {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "📊 สรุปภาพรวมบัญชีสะสม",
            "weight": "bold",
            "size": "md",
            "color": "#ffffff"
          },
          {
            "type": "text",
            "text": "📌 ชื่องาน: " + project.toUpperCase(),
            "size": "xxs",
            "color": "#f3f4f6",
            "margin": "xs"
          }
        ],
        "background": {
          "type": "linearGradient",
          "angle": "45deg",
          "startColor": "#374151",
          "endColor": "#111827"
        },
        "paddingAll": "6px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": card2BodyContents,
        "paddingAll": "6px"
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": "ดูตารางบัญชีและสลิป",
              "uri": "https://sta69-ledger-98315.web.app/"
            },
            "style": "secondary",
            "height": "sm"
          }
        ],
        "paddingAll": "6px"
      }
    };
    
    const flexPayload = {
      "type": "carousel",
      "contents": [card1, card2]
    };
    
    pushFlexMessage(userId, flexPayload);
    return true;
  } catch (err) {
    Logger.log("Error sending flex message: " + err.toString());
    return false;
  }
}

function getProjectSummaryData(tabName) {
  try {
    const webDb = getWebDatabase();
    if (webDb) {
      const dbKey = getDbKeyFromTabName(tabName);
      const data = webDb[dbKey];
      if (data) {
        let totalSales = 0;
        let salesCount = 0;
        let salesBreakdown = [];
        
        if (Array.isArray(data.sales)) {
          data.sales.forEach(function(item) {
            const code = (item.code || "").trim().toUpperCase();
            const qty = parseInt(item.qty || 0, 10);
            const price = parseFloat(item.totalPrice !== undefined ? item.totalPrice : (item.price || 0));
            if (code && (qty > 0 || price > 0)) {
              totalSales += price;
              if (!code.toLowerCase().includes("ยอดยกมาจาก")) {
                salesCount += qty;
                salesBreakdown.push({ code: code, qty: qty, price: price });
              }
            }
          });
        }

        let totalAds = 0;
        let adsCount = 0;
        if (Array.isArray(data.ads)) {
          data.ads.forEach(function(item) {
            const p = parseFloat(item.price || 0);
            if (p > 0) {
              totalAds += p;
              adsCount++;
            }
          });
        }

        let totalOtherExpenses = 0;
        let expensesCount = 0;
        if (Array.isArray(data.expenses)) {
          data.expenses.forEach(function(item) {
            const p = parseFloat(item.price || 0);
            if (p > 0) {
              totalOtherExpenses += p;
              expensesCount++;
            }
          });
        }

        let totalDistributions = 0;
        if (Array.isArray(data.distributions)) {
          const seenDists = {};
          data.distributions.forEach(function(item) {
            const total = parseFloat(item.total || 0);
            const perPerson = parseFloat(item.perPerson || 0);
            const t = total > 0 ? total : (perPerson * 3);
            if (t > 0) {
              const distKey = (item.date || "") + "_" + t;
              if (!seenDists[distKey]) {
                seenDists[distKey] = true;
                totalDistributions += t;
              }
            }
          });
        }

        const netProfit = totalSales - totalAds - totalOtherExpenses;
        const balance = netProfit - totalDistributions;

        return {
          totalSales: totalSales,
          salesCount: salesCount,
          salesBreakdown: salesBreakdown,
          totalAds: totalAds,
          adsCount: adsCount,
          totalOtherExpenses: totalOtherExpenses,
          expensesCount: expensesCount,
          totalDistributions: totalDistributions,
          netProfit: netProfit,
          balance: balance
        };
      }
    }
  } catch (err) {
    Logger.log("Error reading summary from WEB_APP_DATABASE_JSON: " + err);
  }

  // Fallback to Google Sheets
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) return null;

    const values = sheet.getRange("A1:J150").getValues();

    // 1. Calculate Product Sales
    let totalSales = 0;
    let salesCount = 0;
    let salesBreakdown = [];
    for (let i = 2; i < Math.min(10, values.length); i++) {
      const code = values[i][0] ? values[i][0].toString().trim().toUpperCase() : "";
      const qty = parseInt(values[i][1] || "0", 10);
      const price = parseFloat((values[i][2] || "0").toString().replace(/,/g, ""));
      if (code && (qty > 0 || price > 0)) {
        totalSales += price;
        salesCount += qty;
        if (!code.toLowerCase().includes("ยอดยกมาจาก")) {
          salesBreakdown.push({ code: code, qty: qty, price: price });
        }
      }
    }

    // 2. Find expense header row
    let headerRowIdx = -1;
    for (let i = 0; i < values.length; i++) {
      const rowText = values[i].join(" ").toLowerCase();
      if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
        headerRowIdx = i;
        break;
      }
    }

    let totalAds = 0;
    let totalOtherExpenses = 0;
    let totalDistributions = 0;
    let adsCount = 0;
    let expensesCount = 0;

    if (headerRowIdx !== -1) {
      for (let i = headerRowIdx + 1; i < values.length; i++) {
        // Ads cost (Col C / index 2)
        const adPrice = parseFloat((values[i][2] || "0").toString().replace(/,/g, ""));
        if (adPrice > 0) {
          totalAds += adPrice;
          adsCount++;
        }

        // Other expenses & distributions (Col F / index 5)
        const expDesc = values[i][4] ? values[i][4].toString().trim() : "";
        const expPrice = parseFloat((values[i][5] || "0").toString().replace(/,/g, ""));
        if (expPrice > 0) {
          const isDistribution = ["แบ่ง", "คนละ", "ส่วนแบ่ง", "ปันผล"].some(function(w) { return expDesc.includes(w); });
          if (isDistribution) {
            totalDistributions += expPrice;
          } else {
            totalOtherExpenses += expPrice;
            expensesCount++;
          }
        }

        // Distributions Table (Col H-J)
        const distPerPerson = parseFloat((values[i][8] || "0").toString().replace(/,/g, ""));
        const distTotal = parseFloat((values[i][9] || "0").toString().replace(/,/g, ""));
        if (distPerPerson > 0 || distTotal > 0) {
          let total = distTotal > 0 ? distTotal : distPerPerson * 3;
          totalDistributions += total;
        }
      }
    }

    const netProfit = totalSales - totalAds - totalOtherExpenses;
    const balance = netProfit - totalDistributions;

    return {
      totalSales: totalSales,
      salesCount: salesCount,
      salesBreakdown: salesBreakdown,
      totalAds: totalAds,
      adsCount: adsCount,
      totalOtherExpenses: totalOtherExpenses,
      expensesCount: expensesCount,
      totalDistributions: totalDistributions,
      netProfit: netProfit,
      balance: balance
    };
  } catch (e) {
    return { totalSales: 0, salesCount: 0, salesBreakdown: [], totalAds: 0, adsCount: 0, totalOtherExpenses: 0, expensesCount: 0, totalDistributions: 0, netProfit: 0, balance: 0 };
  }
}

function pushFlexMessage(userId, flexPayload) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: userId,
    messages: [
      {
        type: "flex",
        altText: "สรุปบันทึกรายการบัญชี",
        contents: flexPayload
      }
    ]
  };
  
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}

function replyLINEFlexCard(replyToken, type, project) {
  try {
    const summary = getProjectSummaryData(project) || { totalSales: 0, salesCount: 0, salesBreakdown: [], totalAds: 0, adsCount: 0, totalOtherExpenses: 0, expensesCount: 0, totalDistributions: 0, netProfit: 0, balance: 0 };
    
    let expensesOnlyTotal = summary.totalOtherExpenses;
    let distributionsTotal = summary.totalDistributions;
    let expensesCount = summary.expensesCount;
    let distributionsCount = 0;
    let profitBeforeDist = summary.netProfit;
    let remainingBalance = summary.balance;

    let expenseHistory = [];
    let distHistory = [];
    let adsHistory = [];
    let stockStatus = [];

    const webDb = getWebDatabase();
    const dbKey = getDbKeyFromTabName(project);
    const data = (webDb && webDb[dbKey]) ? webDb[dbKey] : null;

    if (data) {
      if (Array.isArray(data.expenses)) {
        expenseHistory = data.expenses.slice().reverse().map(function(item) {
          return {
            date: formatThaiDate(item.date || "") + (item.note ? " | " + item.note : ""),
            desc: item.description || item.desc || "รายจ่าย",
            amount: parseFloat(item.price || 0)
          };
        });
      }
      if (Array.isArray(data.distributions)) {
        const seenDist = {};
        const uniqueD = [];
        data.distributions.forEach(function(item) {
          const total = parseFloat(item.total || 0);
          const perPerson = parseFloat(item.perPerson || 0);
          const amt = total > 0 ? total : (perPerson * 3);
          const k = (item.date || "") + "_" + amt;
          if (!seenDist[k]) {
            seenDist[k] = true;
            uniqueD.push(item);
          }
        });
        distributionsCount = uniqueD.length;
        distHistory = uniqueD.slice().reverse().map(function(item) {
          const total = parseFloat(item.total || 0);
          const perPerson = parseFloat(item.perPerson || 0);
          const amt = total > 0 ? total : (perPerson * 3);
          const ppFormat = perPerson > 0 ? perPerson.toLocaleString() : Math.round(amt / 3).toLocaleString();
          return {
            date: formatThaiDate(item.date || ""),
            desc: "แบ่งปันผลกำไร (คนละ " + ppFormat + " ฿)",
            amount: amt
          };
        });
      }
      if (Array.isArray(data.ads)) {
        adsHistory = data.ads.slice().reverse().map(function(item) {
          return {
            date: formatThaiDate(item.date || ""),
            desc: item.description || item.desc || "ค่าโฆษณา",
            amount: parseFloat(item.price || 0)
          };
        });
      }
      if (Array.isArray(data.stock)) {
        const salesMap = {};
        summary.salesBreakdown.forEach(function(item) {
          salesMap[item.code] = item.qty;
        });
        stockStatus = data.stock.map(function(item) {
          const code = (item.code || "").toUpperCase();
          const rec = (parseInt(item.initial || 0, 10)) + (parseInt(item.add || 0, 10));
          const sld = salesMap[code] !== undefined ? salesMap[code] : parseInt(item.sold || 0, 10);
          const rem = rec - sld;
          return { code: code, received: rec, sold: sld, remaining: rem };
        });
      }
    } else {
      try {
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = spreadsheet.getSheetByName(project);
        if (sheet) {
          const values = sheet.getRange("A1:J150").getValues();
          let headerRowIdx = -1;
          for (let i = 0; i < values.length; i++) {
            const rowText = values[i].join(" ").toLowerCase();
            if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
              headerRowIdx = i;
              break;
            }
          }

          if (headerRowIdx !== -1) {
            for (let i = values.length - 1; i > headerRowIdx; i--) {
              const dateVal = values[i][3];
              const descVal = values[i][4] ? values[i][4].toString().trim() : "";
              const amountVal = parseFloat((values[i][5] || "0").toString().replace(/,/g, ""));
              const noteVal = values[i][6] ? values[i][6].toString().trim() : "";
              
              if (descVal && amountVal > 0) {
                const dateStr = formatThaiDate(dateVal);
                const isDist = descVal.includes("แบ่ง") || descVal.includes("หุ้น") || descVal.includes("ปันผล");
                const dateAndNote = dateStr + (noteVal ? " | " + noteVal : "");
                if (isDist) {
                  distHistory.push({ date: dateAndNote, desc: descVal, amount: amountVal });
                } else {
                  expenseHistory.push({ date: dateAndNote, desc: descVal, amount: amountVal });
                }
              }

              const distDateVal = values[i][7];
              const distPerPerson = parseFloat((values[i][8] || "0").toString().replace(/,/g, ""));
              const distTotalVal = parseFloat((values[i][9] || "0").toString().replace(/,/g, ""));
              
              if (distDateVal && distTotalVal > 0) {
                const distDateStr = formatThaiDate(distDateVal);
                const formatPerPerson = distPerPerson > 0 ? distPerPerson.toLocaleString() : (distTotalVal / 3).toLocaleString();
                distHistory.push({
                  date: distDateStr,
                  desc: "แบ่งปันผลกำไร (คนละ " + formatPerPerson + " ฿)",
                  amount: distTotalVal
                });
              }
            }

            for (let i = values.length - 1; i > headerRowIdx; i--) {
              const dateVal = values[i][0];
              const descVal = values[i][1] ? values[i][1].toString().trim() : "";
              const amountVal = parseFloat((values[i][2] || "0").toString().replace(/,/g, ""));
              if (descVal && amountVal > 0) {
                const dateStr = formatThaiDate(dateVal);
                adsHistory.push({ date: dateStr, desc: descVal, amount: amountVal });
              }
            }
          }

          const salesMap = {};
          summary.salesBreakdown.forEach(item => {
            salesMap[item.code] = item.qty;
          });
          for (let i = 11; i < Math.min(16, values.length); i++) {
            const code = values[i][3] ? values[i][3].toString().trim().toUpperCase() : "";
            const receivedQty = parseInt(values[i][4] || "0", 10);
            if (code) {
              const soldQty = salesMap[code] || 0;
              const remaining = receivedQty - soldQty;
              stockStatus.push({ code: code, received: receivedQty, sold: soldQty, remaining: remaining });
            }
          }
        }
      } catch (sheetErr) {
        Logger.log("Error in fallback sheet parse in replyLINEFlexCard: " + sheetErr);
      }
    }
    
    let title = "บันทึกรายการสำเร็จ";
    let typeName = "";
    let startColor = "#10b981";
    let endColor = "#064e3b";
    let actionUrl = "https://sta69-ledger-98315.web.app/";
    let buttonLabel = "📝 กรอกข้อมูล / เพิ่มข้อมูล";
    let bodyText = "";
    
    if (type === "sale") {
      title = "ยอดสมัคร";
      typeName = "ยอดสมัคร";
      startColor = "#10b981"; // Green
      endColor = "#064e3b";
      actionUrl = "https://liff.line.me/2010690090-AKybN7Fn?action=add-sale";
      buttonLabel = "📝 กรอกยอดสมัครคอร์สเรียน";
      bodyText = `📌 งาน: ${project}\n🛍️ ยอดขายสะสม: ${summary.totalSales.toLocaleString()} บาท\n🔢 จำนวนผู้สมัครเรียน: ${summary.salesCount.toLocaleString()} คน`;
    } else if (type === "expense") {
      title = "รายจ่าย";
      typeName = "รายจ่าย";
      startColor = "#f43f5e"; // Rose/Pink
      endColor = "#881337";
      actionUrl = "https://liff.line.me/2010690090-AKybN7Fn?action=add-expense";
      buttonLabel = "📝 บันทึกบิลรายจ่าย";
      bodyText = `📌 งาน: ${project}\n💸 รายจ่ายสะสม: ${expensesOnlyTotal.toLocaleString()} บาท\n🧾 บันทึกแล้ว: ${expensesCount} บิล`;
    } else if (type === "ad") {
      title = "ค่าโฆษณา";
      typeName = "ค่าโฆษณา";
      startColor = "#3b82f6"; // Blue
      endColor = "#1e3a8a";
      actionUrl = "https://liff.line.me/2010690090-AKybN7Fn?action=add-ad";
      buttonLabel = "📝 กรอกยอดค่าแอด";
      bodyText = `📌 งาน: ${project}\n📢 ค่าแอด: ${summary.totalAds.toLocaleString()} บาท\n📊 สัดส่วนค่าแอด: ${summary.totalSales > 0 ? ((summary.totalAds / summary.totalSales) * 100).toFixed(1) : 0}%`;
    } else if (type === "stock") {
      title = "สต็อกหนังสือ";
      typeName = "สต็อกหนังสือ";
      startColor = "#a855f7"; // Purple
      endColor = "#581c87";
      actionUrl = "https://liff.line.me/2010690090-AKybN7Fn?action=receive-stock";
      buttonLabel = "📝 รับหนังสือเข้าคลัง";
      
      let totalStockReceived = 0;
      let totalStockSold = 0;
      stockStatus.forEach(item => {
        totalStockReceived += item.received;
        totalStockSold += item.sold;
      });
      const totalStockRemaining = totalStockReceived - totalStockSold;
      bodyText = `📌 งาน: ${project}\n📥 รับเข้าคลังสะสม: ${totalStockReceived.toLocaleString()} เล่ม\n🛍️ ยอดขายสะสม: ${totalStockSold.toLocaleString()} เล่ม\n📦 คงเหลือพร้อมส่ง: ${totalStockRemaining.toLocaleString()} เล่ม`;
    } else if (type === "distribution") {
      title = "ส่วนแบ่ง";
      typeName = "ส่วนแบ่ง";
      startColor = "#f59e0b"; // Orange
      endColor = "#78350f";
      actionUrl = "https://liff.line.me/2010690090-AKybN7Fn?action=add-distribution";
      buttonLabel = "📝 กรอกแบ่งปันผลกำไร";
      bodyText = `📌 งาน: ${project}\n💰 กำไรก่อนแบ่งหุ้น: ${profitBeforeDist.toLocaleString()} บาท\n💵 ยอดปันผลสะสม: ${distributionsTotal.toLocaleString()} บาท\n👤 แบ่งปันคนละ: ${(distributionsTotal / 3).toLocaleString()} บาท`;
    } else if (type === "overview") {
      title = "สรุป";
      typeName = "สรุป";
      startColor = "#374151"; // Slate Dark
      endColor = "#111827";
      actionUrl = "https://sta69-ledger-98315.web.app/";
      buttonLabel = "📊 เปิดดูภาพรวมเว็บแอป";
      bodyText = `📌 งาน: ${project}\n🛍️ ยอดขาย: ${summary.totalSales.toLocaleString()} บาท\n📢 ค่าแอด: ${summary.totalAds.toLocaleString()} บาท\n💸 รายจ่ายอื่น: ${summary.totalOtherExpenses.toLocaleString()} บาท\n💰 กำไร: ${summary.netProfit.toLocaleString()} บาท\n💵 ส่วนแบ่ง: ${summary.totalDistributions.toLocaleString()} บาท\n👥 (คนละ ${Math.round(summary.totalDistributions / 3).toLocaleString()} บาท)\n⚖️ คงเหลือ: ${summary.balance.toLocaleString()} บาท`;
    }
    
    const bubble1 = {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "✨ " + title,
            "weight": "bold",
            "size": "md",
            "color": "#ffffff"
          },
          {
            "type": "text",
            "text": "⚙️ กดปุ่มด้านล่างเพื่อเพิ่มข้อมูล",
            "size": "xxs",
            "color": "#f3f4f6",
            "margin": "xs"
          }
        ],
        "background": {
          "type": "linearGradient",
          "angle": "45deg",
          "startColor": startColor,
          "endColor": endColor
        },
        "paddingAll": "6px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": bodyText,
            "wrap": true,
            "size": "xs",
            "color": "#374151",
            "lineSpacing": "2px"
          }
        ],
        "paddingAll": "6px"
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": buttonLabel,
              "uri": actionUrl
            },
            "style": "primary",
            "color": startColor,
            "height": "sm"
          }
        ],
        "paddingAll": "6px"
      }
    };

    // 4. Build secondary bubbles based on type
    const secondaryBubbles = [];
    const secondaryStart = "#374151";
    const secondaryEnd = "#111827";
    
    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };
    
    if (type === "sale") {
      const rowContents = summary.salesBreakdown.map(item => {
        return {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            { "type": "text", "text": "🛍️ " + item.code, "weight": "bold", "size": "xs", "color": "#111827", "flex": 4 },
            { "type": "text", "text": item.qty.toLocaleString() + " คน", "size": "xs", "color": "#4b5563", "align": "end", "flex": 3 },
            { "type": "text", "text": item.price.toLocaleString() + " ฿", "weight": "bold", "size": "xs", "color": "#10b981", "align": "end", "flex": 4 }
          ],
          "margin": "xs"
        };
      });
      secondaryBubbles.push(createSecondaryBubble("ยอดขายแยกตามสินค้า", "ยอดขายสะสมของแต่ละสินค้าในหน้าบัญชี", secondaryStart, secondaryEnd, rowContents));
    } else if (type === "expense") {
      const chunks = chunkArray(expenseHistory, 4);
      if (chunks.length === 0) {
        secondaryBubbles.push(createSecondaryBubble("ประวัติรายจ่ายล่าสุด", "ยังไม่มีประวัติบันทึกรายการในระบบ", secondaryStart, secondaryEnd, []));
      } else {
        chunks.slice(0, 9).forEach((chunk, chunkIdx) => {
          const title = `ประวัติรายจ่าย (${chunkIdx + 1}/${chunks.length})`;
          const rowContents = chunk.map(item => {
            return {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "box",
                      "layout": "vertical",
                      "contents": [
                        { "type": "text", "text": "💸 " + item.desc, "weight": "bold", "size": "xs", "color": "#111827", "wrap": true },
                        { "type": "text", "text": item.date || "ไม่ระบุวันที่", "size": "xxs", "color": "#9ca3af" }
                      ],
                      "flex": 4
                    },
                    { "type": "text", "text": item.amount.toLocaleString() + " ฿", "weight": "bold", "size": "xs", "color": "#f43f5e", "align": "end", "gravity": "center", "flex": 2 }
                  ]
                },
                { "type": "separator", "margin": "xs", "color": "#f3f4f6" }
              ],
              "margin": "xs"
            };
          });
          secondaryBubbles.push(createSecondaryBubble(title, "รายการจ่ายเงินทั่วไปเรียงตามล่าสุด", secondaryStart, secondaryEnd, rowContents));
        });
      }
    } else if (type === "ad") {
      const chunks = chunkArray(adsHistory, 4);
      if (chunks.length === 0) {
        secondaryBubbles.push(createSecondaryBubble("ประวัติค่าแอดล่าสุด", "ยังไม่มีประวัติบันทึกรายการในระบบ", secondaryStart, secondaryEnd, []));
      } else {
        chunks.slice(0, 9).forEach((chunk, chunkIdx) => {
          const title = `ประวัติค่าแอด (${chunkIdx + 1}/${chunks.length})`;
          const rowContents = chunk.map(item => {
            return {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "box",
                      "layout": "vertical",
                      "contents": [
                        { "type": "text", "text": "📢 " + item.desc, "weight": "bold", "size": "xs", "color": "#111827", "wrap": true },
                        { "type": "text", "text": item.date || "ไม่ระบุวันที่", "size": "xxs", "color": "#9ca3af" }
                      ],
                      "flex": 4
                    },
                    { "type": "text", "text": item.amount.toLocaleString() + " ฿", "weight": "bold", "size": "xs", "color": "#3b82f6", "align": "end", "gravity": "center", "flex": 2 }
                  ]
                },
                { "type": "separator", "margin": "xs", "color": "#f3f4f6" }
              ],
              "margin": "xs"
            };
          });
          secondaryBubbles.push(createSecondaryBubble(title, "รายการค่าโฆษณาสะสมเรียงตามล่าสุด", secondaryStart, secondaryEnd, rowContents));
        });
      }
    } else if (type === "stock") {
      const rowContents = stockStatus.map(item => {
        return {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            { "type": "text", "text": "📚 " + item.code, "weight": "bold", "size": "xs", "color": "#111827", "flex": 5 },
            { "type": "text", "text": "รับ " + item.received.toLocaleString() + " | ขาย " + item.sold.toLocaleString(), "size": "xxs", "color": "#6b7280", "align": "end", "flex": 8 },
            { "type": "text", "text": "เหลือ " + item.remaining.toLocaleString(), "weight": "bold", "size": "xs", "color": item.remaining > 0 ? "#8b5cf6" : "#ef4444", "align": "end", "flex": 5 }
          ],
          "margin": "xs"
        };
      });
      secondaryBubbles.push(createSecondaryBubble("คลังหนังสือคงเหลือ", "เปรียบเทียบยอดรับเข้าและยอดขายสะสม", secondaryStart, secondaryEnd, rowContents));
    } else if (type === "distribution") {
      const chunks = chunkArray(distHistory, 4);
      if (chunks.length === 0) {
        secondaryBubbles.push(createSecondaryBubble("ประวัติแบ่งผลกำไรล่าสุด", "ยังไม่มีประวัติบันทึกรายการในระบบ", secondaryStart, secondaryEnd, []));
      } else {
        chunks.slice(0, 9).forEach((chunk, chunkIdx) => {
          const title = `ประวัติแบ่งกำไร (${chunkIdx + 1}/${chunks.length})`;
          const rowContents = chunk.map(item => {
            return {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "box",
                      "layout": "vertical",
                      "contents": [
                        { "type": "text", "text": "👤 " + item.desc, "weight": "bold", "size": "xs", "color": "#111827", "wrap": true },
                        { "type": "text", "text": item.date || "ไม่ระบุวันที่", "size": "xxs", "color": "#9ca3af" }
                      ],
                      "flex": 4
                    },
                    { "type": "text", "text": item.amount.toLocaleString() + " ฿", "weight": "bold", "size": "xs", "color": "#f59e0b", "align": "end", "gravity": "center", "flex": 2 }
                  ]
                },
                { "type": "separator", "margin": "xs", "color": "#f3f4f6" }
              ],
              "margin": "xs"
            };
          });
          secondaryBubbles.push(createSecondaryBubble(title, "ประวัติแบ่งส่วนแบ่งของหุ้นส่วนเรียงตามล่าสุด", secondaryStart, secondaryEnd, rowContents));
        });
      }
    } else if (type === "overview") {
      const salesVal = summary.totalSales || 0;
      const adsPct = salesVal > 0 ? (summary.totalAds / salesVal) * 100 : 0;
      const expPct = salesVal > 0 ? (expensesOnlyTotal / salesVal) * 100 : 0;
      const distPct = salesVal > 0 ? (distributionsTotal / salesVal) * 100 : 0;
      const profitPct = salesVal > 0 ? (remainingBalance / salesVal) * 100 : 0;
      
      const rowContents = [
        { label: "📢 ค่าโฆษณา", val: adsPct.toFixed(1) + "%", color: "#3b82f6" },
        { label: "💸 รายจ่ายอื่น", val: expPct.toFixed(1) + "%", color: "#f43f5e" },
        { label: "💵 ส่วนแบ่ง", val: distPct.toFixed(1) + "%", color: "#f59e0b" },
        { label: "⚖️ คงเหลือ", val: profitPct.toFixed(1) + "%", color: "#10b981" }
      ].map(item => {
        return {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            { "type": "text", "text": item.label, "weight": "bold", "size": "xs", "color": "#111827", "flex": 3 },
            { "type": "text", "text": item.val, "weight": "bold", "size": "xs", "color": item.color, "align": "end", "flex": 2 }
          ],
          "margin": "xs"
        };
      });
      secondaryBubbles.push(createSecondaryBubble("สัดส่วนทางการเงินสะสม", "คิดเป็นเปอร์เซ็นต์เปรียบเทียบกับรายรับรวม", secondaryStart, secondaryEnd, rowContents));
    }

    let contents = [bubble1].concat(secondaryBubbles);
    if (type === "overview") {
      let sheetsList = [];
      if (webDb && Object.keys(webDb).length > 0) {
        sheetsList = Object.keys(webDb).map(function(key) {
          const match = key.match(/^([a-zA-Z0-9]+?)_25(\d{2})$/);
          if (match) {
            const prefix = match[1].toLowerCase();
            const p = (prefix === "sta" ? "Sta" : prefix.toUpperCase());
            return p + match[2];
          }
          return key;
        });
      } else {
        try {
          const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
          sheetsList = spreadsheet.getSheets()
            .map(s => s.getName())
            .filter(n => {
              const nameLower = n.toLowerCase();
              return nameLower.indexOf("sheet") === -1 && 
                     nameLower.indexOf("log") === -1 && 
                     nameLower.indexOf("config") === -1 && 
                     nameLower.indexOf("backup") === -1 &&
                     nameLower.indexOf("passcode") === -1;
            });
        } catch (e) {
          sheetsList = ["Sta70", "Sta69", "Sta68"];
        }
      }
      const switchBubble = createSwitchProjectBubble(sheetsList, project);
      contents.push(switchBubble);
    }

    const carousel = {
      "type": "carousel",
      "contents": contents
    };
    
    const payload = {
      replyToken: replyToken,
      messages: [
        {
          type: "flex",
          altText: title,
          contents: carousel,
          quickReply: getMenuQuickReplies()
        }
      ]
    };
    
    const url = "https://api.line.me/v2/bot/message/reply";
    UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + LINE_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload)
    });
  } catch (err) {
    Logger.log("Error in replyLINEFlexCard: " + err.toString());
  }
}

function createSecondaryBubble(title, subtitle, startColor, endColor, rowContents) {
  return {
    "type": "bubble",
    "size": "mega",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "📊 " + title,
          "weight": "bold",
          "size": "sm",
          "color": "#ffffff"
        },
        {
          "type": "text",
          "text": subtitle,
          "size": "xxs",
          "color": "#ffe4e6",
          "margin": "xs"
        }
      ],
      "background": {
        "type": "linearGradient",
        "angle": "45deg",
        "startColor": startColor,
        "endColor": endColor
      },
      "paddingAll": "6px"
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": rowContents.length > 0 ? rowContents : [
        {
          "type": "text",
          "text": "📭 ยังไม่มีประวัติบันทึกรายการในระบบ",
          "size": "xs",
          "color": "#9ca3af",
          "align": "center",
          "margin": "xs"
        }
      ],
      "paddingAll": "6px"
    }
  };
}

function createSwitchProjectBubble(sheetsList, activeTabName) {
  const buttonElements = sheetsList.map(name => {
    const isActive = name.toLowerCase() === activeTabName.toLowerCase();
    return {
      "type": "button",
      "action": {
        "type": "message",
        "label": (isActive ? "✅ " : "📁 ") + name,
        "text": "สลับ " + name
      },
      "style": isActive ? "primary" : "secondary",
      "color": isActive ? "#10b981" : "#4b5563",
      "height": "sm",
      "flex": 1
    };
  });

  const rows = [];
  for (let i = 0; i < buttonElements.length; i += 2) {
    const rowContents = [buttonElements[i]];
    if (i + 1 < buttonElements.length) {
      rowContents.push(buttonElements[i + 1]);
    } else {
      rowContents.push({ "type": "filler" });
    }
    rows.push({
      "type": "box",
      "layout": "horizontal",
      "spacing": "xs",
      "margin": "xs",
      "contents": rowContents
    });
  }

  return {
    "type": "bubble",
    "size": "mega",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "🔄 เลือกสลับโปรเจกต์",
          "weight": "bold",
          "size": "sm",
          "color": "#ffffff"
        },
        {
          "type": "text",
          "text": "แตะชื่องานด้านล่างเพื่อสลับแท็บบันทึกข้อมูล",
          "size": "xxs",
          "color": "#f3f4f6",
          "margin": "xs"
        }
      ],
      "background": {
        "type": "linearGradient",
        "angle": "45deg",
        "startColor": "#374151",
        "endColor": "#111827"
      },
      "paddingAll": "6px"
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": rows,
      "paddingAll": "6px"
    }
  };
}

function replyUnauthorizedFlex(replyToken) {
  try {
    const bubble = {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "🔒 ยังไม่ได้เชื่อมต่อสิทธิ์",
            "weight": "bold",
            "size": "md",
            "color": "#ffffff"
          },
          {
            "type": "text",
            "text": "ระบบความปลอดภัยบัญชี STA69",
            "size": "xxs",
            "color": "#ffe4e6",
            "margin": "xs"
          }
        ],
        "background": {
          "type": "linearGradient",
          "angle": "45deg",
          "startColor": "#f43f5e",
          "endColor": "#be123c"
        },
        "paddingAll": "6px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "ขออภัยครับ บัญชี LINE ของคุณยังไม่ได้เชื่อมต่อสิทธิ์การใช้งานเข้ากับระบบบัญชีหลังบ้าน\n\nกรุณาแตะปุ่มด้านล่างเพื่อป้อนรหัสผ่านปลดล็อกความปลอดภัยในการเริ่มบันทึกข้อมูลครับ",
            "wrap": true,
            "size": "xs",
            "color": "#374151",
            "lineSpacing": "2px"
          }
        ],
        "paddingAll": "6px"
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": "🔓 ป้อนรหัสผ่านเพื่อเชื่อมสิทธิ์",
              "uri": "https://liff.line.me/2010690090-AKybN7Fn?action=link-user-account"
            },
            "style": "primary",
            "color": "#e11d48",
            "height": "sm"
          }
        ],
        "paddingAll": "6px"
      }
    };
    
    const payload = {
      replyToken: replyToken,
      messages: [
        {
          type: "flex",
          altText: "🔒 กรุณาเชื่อมสิทธิ์เข้าใช้งานระบบบัญชี",
          contents: bubble
        }
      ]
    };
    
    const url = "https://api.line.me/v2/bot/message/reply";
    UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + LINE_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload)
    });
  } catch (err) {
    Logger.log("Error in replyUnauthorizedFlex: " + err.toString());
  }
}


function formatThaiDate(dateVal) {
  if (!dateVal) return "";
  
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const fullThaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const enMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return "";
    const day = dateVal.getDate();
    const monthStr = thaiMonths[dateVal.getMonth()];
    const ceYear = dateVal.getFullYear();
    const beYear = ceYear < 2100 ? ceYear + 543 : ceYear;
    return day + " " + monthStr + " " + beYear.toString().slice(-2);
  }
  
  let str = dateVal.toString().trim();
  if (!str) return "";
  if (str === "ยอดเริ่มต้น") return str;

  // 1. Check if ISO format YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})/);
  if (isoMatch) {
    let yInt = parseInt(isoMatch[1], 10);
    let mInt = parseInt(isoMatch[2], 10);
    let dInt = parseInt(isoMatch[3], 10);
    let beYear = yInt < 2100 ? yInt + 543 : yInt;
    let mStr = (mInt >= 1 && mInt <= 12) ? thaiMonths[mInt - 1] : thaiMonths[0];
    return dInt + " " + mStr + " " + beYear.toString().slice(-2);
  }

  // 2. Check general D/M/Y or D Month Y format (e.g. 04/06/2569, 4/มิย/69, 21 พ.ค. 2026, 13/06/2026)
  const match = str.match(/^(\d{1,2})\s*[\/\-\.\s]\s*([a-zA-Z\u0e00-\u0e7f\.]+|\d{1,2})\s*[\/\-\.\s]?\s*(\d{2,4})?/);
  if (match) {
    let dInt = parseInt(match[1], 10);
    let mToken = match[2];
    let yToken = match[3];

    let mIdx = -1;
    let mInt = parseInt(mToken, 10);
    if (!isNaN(mInt) && mInt >= 1 && mInt <= 12) {
      mIdx = mInt - 1;
    } else {
      let mClean = mToken.toString().toLowerCase().replace(/\./g, "");
      for (let i = 0; i < 12; i++) {
        let tClean = thaiMonths[i].replace(/\./g, "");
        let fClean = fullThaiMonths[i];
        let eClean = enMonths[i];
        if (mClean.includes(tClean) || mClean.includes(fClean) || mClean.includes(eClean)) {
          mIdx = i;
          break;
        }
      }
    }

    if (mIdx !== -1) {
      let mStr = thaiMonths[mIdx];
      let yStr = "";
      if (yToken) {
        let yInt = parseInt(yToken, 10);
        if (!isNaN(yInt)) {
          if (yInt < 100) {
            yStr = yInt > 50 ? yInt.toString() : (yInt + 43).toString();
          } else if (yInt < 2100) {
            yStr = (yInt + 543).toString().slice(-2);
          } else {
            yStr = yInt.toString().slice(-2);
          }
        }
      }
      if (!yStr) {
        const todayCE = new Date().getFullYear();
        yStr = (todayCE + 543).toString().slice(-2);
      }
      return dInt + " " + mStr + " " + yStr;
    }
  }

  return str;
}


function getLineQuotaData() {
  try {
    const quotaUrl = "https://api.line.me/v2/bot/message/quota";
    const quotaRes = UrlFetchApp.fetch(quotaUrl, {
      method: "get",
      headers: {
        "Authorization": "Bearer " + LINE_ACCESS_TOKEN
      },
      muteHttpExceptions: true
    });
    
    const quotaJson = JSON.parse(quotaRes.getContentText());
    
    let totalQuota = 500; // default/fallback
    if (quotaJson.type === "limited" || quotaJson.type === "manual") {
      totalQuota = quotaJson.value || 500;
    } else if (quotaJson.type === "none") {
      totalQuota = 999999; // unlimited
    }
    
    const consumptionUrl = "https://api.line.me/v2/bot/message/quota/consumption";
    const consumptionRes = UrlFetchApp.fetch(consumptionUrl, {
      method: "get",
      headers: {
        "Authorization": "Bearer " + LINE_ACCESS_TOKEN
      },
      muteHttpExceptions: true
    });
    
    const consumptionJson = JSON.parse(consumptionRes.getContentText());
    const totalUsage = consumptionJson.totalUsage || 0;
    
    return {
      status: "success",
      type: quotaJson.type || "limited",
      total: totalQuota,
      usage: totalUsage,
      remaining: Math.max(0, totalQuota - totalUsage)
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString(),
      total: 500,
      usage: 0,
      remaining: 500
    };
  }
}

function broadcastFlexCard(senderUserId, type, code, qty, price, project) {
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const uids = new Set();
    
    if (senderUserId && senderUserId.length > 5) {
      uids.add(senderUserId);
    }
    
    for (let key in properties) {
      if (key.indexOf("authorized_") === 0 && properties[key] === "true") {
        const uid = key.replace("authorized_", "");
        if (uid && uid.length > 5) {
          uids.add(uid);
        }
      }
    }
    
    Array.from(uids).forEach(targetUid => {
      try {
        triggerLINEFlexCard(targetUid, type, code, qty, price, project);
      } catch (err) {
        Logger.log("Error sending Flex Card to " + targetUid + ": " + err.toString());
      }
    });
  } catch (err) {
    Logger.log("Error in broadcastFlexCard: " + err.toString());
  }
}

function broadcastTextMessage(text, excludeUserId) {
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const uids = [];
    for (let key in properties) {
      if (key.indexOf("authorized_") === 0 && properties[key] === "true") {
        const uid = key.replace("authorized_", "");
        if (uid !== excludeUserId) {
          uids.push(uid);
        }
      }
    }
    
    for (let i = 0; i < uids.length; i++) {
      const targetUid = uids[i];
      
      // Check LINE quota before sending push message
      const quota = getLineQuotaData();
      if (quota.remaining <= 0) {
        Logger.log("LINE free message quota reached. Stopping push notification to " + targetUid);
        continue;
      }
      
      pushTextMessage(targetUid, text);
    }
  } catch (err) {
    Logger.log("Error in broadcastTextMessage: " + err.toString());
  }
}

function pushTextMessage(userId, text) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: userId,
    messages: [
      {
        type: "text",
        text: text
      }
    ]
  };
  
  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + LINE_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Error pushing text message: " + err.toString());
  }
}

function onEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    
    // Ignore default sheets
    if (sheetName.toLowerCase().indexOf("sheet") !== -1) return;
    
    const range = e.range;
    const a1 = range.getA1Notation();
    const oldValue = e.oldValue || "-";
    const newValue = e.value || "-";
    
    let editor = "หุ้นส่วน";
    if (e.user && e.user.getEmail()) {
      editor = e.user.getEmail().split("@")[0];
    }
    
    const notifyText = `📢 [แจ้งเตือน] มีการแก้ไขข้อมูลบนตาราง Google Sheet\n\n📌 โปรเจกต์: ${sheetName}\n📍 ช่องที่แก้: ${a1}\n✏️ ค่าเดิม: ${oldValue}\n➡️ ค่าใหม่: ${newValue}\n👤 แก้ไขโดย: ${editor}`;
    
    broadcastTextMessage(notifyText, "system_edit");
  } catch (err) {
    Logger.log("Error in onEdit: " + err.toString());
  }
}


function backupSpreadsheet() {
  try {
    // Create backup filename: STA_Backup_yyyy-MM-dd
    const formattedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm");
    const backupName = "STA_Backup_" + formattedDate;
    
    // Copy spreadsheet using SpreadsheetApp which only requires spreadsheets scope (already authorized)
    const copiedSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID).copy(backupName);
    
    Logger.log("Backup created successfully in root Google Drive: " + backupName);
    return "✅ สำรองข้อมูล Google Sheets เรียบร้อย!\n\n📁 จัดเก็บใน Google Drive ของคุณ (ไฟล์ชื่อ: " + backupName + ")";
  } catch (err) {
    Logger.log("Error in backupSpreadsheet: " + err.toString());
    return "❌ เกิดข้อผิดพลาดในการสำรองข้อมูล: " + err.toString();
  }
}


function getMenuQuickReplies() {
  return {
    items: [
      {
        type: "action",
        action: {
          type: "message",
          label: "🛍️ ยอดสมัคร",
          text: "ยอดสมัคร"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "💸 รายจ่าย",
          text: "รายจ่าย"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "📢 ค่าโฆษณา",
          text: "ค่าโฆษณา"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "📦 สต็อกหนังสือ",
          text: "สต็อกหนังสือ"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "💵 ส่วนแบ่ง",
          text: "ส่วนแบ่ง"
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "📊 สรุป",
          text: "สรุป"
        }
      }
    ]
  };
}


// ==========================================
// SYSTEM LOGS & AUDIT TIMELINE LOGIC
// ==========================================

function getSystemLogsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("SYSTEM_LOGS");
  if (!sheet) {
    sheet = ss.insertSheet("SYSTEM_LOGS");
    sheet.appendRow(["Log ID", "Timestamp", "Project", "Editor", "Action Type", "Details", "Status"]);
    sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logSystemAction(project, actionType, editor, detailsObj) {
  try {
    const sheet = getSystemLogsSheet();
    const logId = "LOG_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");
    const detailsStr = JSON.stringify(detailsObj);
    sheet.appendRow([logId, timestamp, project, editor, actionType, detailsStr, "Active"]);
    return logId;
  } catch (err) {
    Logger.log("Error in logSystemAction: " + err.toString());
    return null;
  }
}

function getHistoryLogs() {
  try {
    const sheet = getSystemLogsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    const maxLogs = 100;
    const startRow = Math.max(2, lastRow - maxLogs + 1);
    const numRows = lastRow - startRow + 1;

    const values = sheet.getRange(startRow, 1, numRows, 7).getValues();
    const logs = values.map(row => {
      let details = {};
      const rawDetails = row[5];
      if (typeof rawDetails === "object" && rawDetails !== null) {
        details = rawDetails;
      } else if (typeof rawDetails === "string" && rawDetails.trim()) {
        try {
          details = JSON.parse(rawDetails);
        } catch (pe) {
          details = { text: rawDetails };
        }
      }
      return {
        logId: String(row[0] || ""),
        timestamp: row[1] ? String(row[1]) : "",
        project: String(row[2] || ""),
        editor: String(row[3] || ""),
        actionType: String(row[4] || ""),
        details: details,
        status: String(row[6] || "Active")
      };
    });
    return logs.reverse();
  } catch (err) {
    Logger.log("Error in getHistoryLogs: " + err.toString());
    return [];
  }
}

function cancelHistoryLog(logId, adminName) {
  try {
    const sheet = getSystemLogsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return "❌ ไม่พบประวัติการทำรายการ";
    
    const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    let targetRowIdx = -1;
    let logItem = null;
    
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === logId) {
        targetRowIdx = i + 2;
        logItem = {
          logId: values[i][0],
          project: values[i][2],
          editor: values[i][3],
          actionType: values[i][4],
          details: JSON.parse(values[i][5] || "{}"),
          status: values[i][6]
        };
        break;
      }
    }
    
    if (!logItem) return "❌ ไม่พบประวัติ Log ID " + logId;
    if (logItem.status === "Cancelled") return "⚠️ รายการนี้ถูกยกเลิกไปก่อนหน้านี้แล้ว";
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pSheet = ss.getSheetByName(logItem.project);
    if (!pSheet) return "❌ ไม่พบหน้างานของโปรเจกต์ " + logItem.project;
    
    const type = logItem.actionType;
    const details = logItem.details;
    
    if (type === "ยอดสมัคร" || type === "บันทึกออเดอร์") {
      const code = details.code.toUpperCase();
      const qty = details.qty;
      const price = details.price;
      
      const salesValues = pSheet.getRange("A1:C15").getValues();
      let matchIdx = -1;
      for (let i = 2; i < 10; i++) {
        if (salesValues[i][0] && salesValues[i][0].toString().trim().toUpperCase() === code) {
          matchIdx = i + 1;
          break;
        }
      }
      if (matchIdx !== -1) {
        const currentQty = parseInt(salesValues[matchIdx - 1][1] || "0", 10);
        const currentPrice = parseFloat((salesValues[matchIdx - 1][2] || "0").toString().replace(/,/g, ""));
        pSheet.getRange(matchIdx, 2).setValue(Math.max(0, currentQty - qty));
        pSheet.getRange(matchIdx, 3).setValue(Math.max(0, currentPrice - price));
      }
    } 
    else if (type === "สต็อกหนังสือ" || type === "รับหนังสือเข้าสต็อก") {
      const code = details.code.toUpperCase();
      const qty = details.qty;
      
      const stockValues = pSheet.getRange("D1:E20").getValues();
      let matchIdx = -1;
      for (let i = 11; i < 16; i++) {
        if (stockValues[i][0] && stockValues[i][0].toString().trim().toUpperCase() === code) {
          matchIdx = i + 1;
          break;
        }
      }
      if (matchIdx !== -1) {
        const currentReceived = parseInt(stockValues[matchIdx - 1][1] || "0", 10);
        pSheet.getRange(matchIdx, 5).setValue(Math.max(0, currentReceived - qty));
      }
    } 
    else if (type === "รายจ่าย" || type === "บันทึกรายจ่าย") {
      const desc = details.description;
      const price = details.price;
      
      const expValues = pSheet.getRange("D12:G150").getValues();
      let matchIdx = -1;
      for (let i = 0; i < expValues.length; i++) {
        if (expValues[i][1] === desc && parseFloat(expValues[i][2]) === price) {
          matchIdx = i + 12;
          break;
        }
      }
      if (matchIdx !== -1) {
        pSheet.getRange(matchIdx, 4, 1, 4).clearContent();
      }
    } 
    else if (type === "ค่าโฆษณา" || type === "บันทึกค่าแอด") {
      const desc = details.description;
      const price = details.price;
      
      const adValues = pSheet.getRange("A12:C150").getValues();
      let matchIdx = -1;
      for (let i = 0; i < adValues.length; i++) {
        if (adValues[i][1] === desc && parseFloat(adValues[i][2]) === price) {
          matchIdx = i + 12;
          break;
        }
      }
      if (matchIdx !== -1) {
        pSheet.getRange(matchIdx, 1, 1, 3).clearContent();
      }
    } 
    else if (type === "ส่วนแบ่ง" || type === "บันทึกส่วนแบ่ง") {
      const total = details.total;
      
      const distValues = pSheet.getRange("H12:J150").getValues();
      let matchIdx = -1;
      for (let i = 0; i < distValues.length; i++) {
        if (parseFloat(distValues[i][2]) === total) {
          matchIdx = i + 12;
          break;
        }
      }
      if (matchIdx !== -1) {
        pSheet.getRange(matchIdx, 8, 1, 3).clearContent();
      }
    }
    
    sheet.getRange(targetRowIdx, 7).setValue("Cancelled");
    logSystemAction(logItem.project, "ลบรายการ", adminName || logItem.editor, { cancelledLogId: logId, actionType: type });
    return "✅ ยกเลิกรายการสำเร็จ!";
  } catch (err) {
    Logger.log("Error in cancelHistoryLog: " + err.toString());
    return "❌ เกิดข้อผิดพลาด: " + err.toString();
  }
}

function restoreToLog(logId, adminName) {
  try {
    const sheet = getSystemLogsSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return "❌ ไม่พบประวัติการทำรายการ";
    
    const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    let targetIdx = -1;
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === logId) {
        targetIdx = i;
        break;
      }
    }
    
    if (targetIdx === -1) return "❌ ไม่พบประวัติที่ระบุ";
    
    const logsToUndo = [];
    for (let i = values.length - 1; i > targetIdx; i--) {
      if (values[i][6] === "Active") {
        logsToUndo.push({
          logId: values[i][0],
          rowIdx: i + 2,
          project: values[i][2],
          actionType: values[i][4],
          details: JSON.parse(values[i][5] || "{}")
        });
      }
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    for (let i = 0; i < logsToUndo.length; i++) {
      const logItem = logsToUndo[i];
      const pSheet = ss.getSheetByName(logItem.project);
      if (!pSheet) continue;
      
      const type = logItem.actionType;
      const details = logItem.details;
      
      if (type === "ยอดสมัคร" || type === "บันทึกออเดอร์") {
        const code = details.code.toUpperCase();
        const qty = details.qty;
        const price = details.price;
        
        const salesValues = pSheet.getRange("A1:C15").getValues();
        let matchIdx = -1;
        for (let j = 2; j < 10; j++) {
          if (salesValues[j][0] && salesValues[j][0].toString().trim().toUpperCase() === code) {
            matchIdx = j + 1;
            break;
          }
        }
        if (matchIdx !== -1) {
          const currentQty = parseInt(salesValues[matchIdx - 1][1] || "0", 10);
          const currentPrice = parseFloat((salesValues[matchIdx - 1][2] || "0").toString().replace(/,/g, ""));
          pSheet.getRange(matchIdx, 2).setValue(Math.max(0, currentQty - qty));
          pSheet.getRange(matchIdx, 3).setValue(Math.max(0, currentPrice - price));
        }
      } 
      else if (type === "สต็อกหนังสือ" || type === "รับหนังสือเข้าสต็อก") {
        const code = details.code.toUpperCase();
        const qty = details.qty;
        
        const stockValues = pSheet.getRange("D1:E20").getValues();
        let matchIdx = -1;
        for (let j = 11; j < 16; j++) {
          if (stockValues[j][0] && stockValues[j][0].toString().trim().toUpperCase() === code) {
            matchIdx = j + 1;
            break;
          }
        }
        if (matchIdx !== -1) {
          const currentReceived = parseInt(stockValues[matchIdx - 1][1] || "0", 10);
          pSheet.getRange(matchIdx, 5).setValue(Math.max(0, currentReceived - qty));
        }
      } 
      else if (type === "รายจ่าย" || type === "บันทึกรายจ่าย") {
        const desc = details.description;
        const price = details.price;
        
        const expValues = pSheet.getRange("D12:G150").getValues();
        let matchIdx = -1;
        for (let j = 0; j < expValues.length; j++) {
          if (expValues[j][1] === desc && parseFloat(expValues[j][2]) === price) {
            matchIdx = j + 12;
            break;
          }
        }
        if (matchIdx !== -1) {
          pSheet.getRange(matchIdx, 4, 1, 4).clearContent();
        }
      } 
      else if (type === "ค่าโฆษณา" || type === "บันทึกค่าแอด") {
        const desc = details.description;
        const price = details.price;
        
        const adValues = pSheet.getRange("A12:C150").getValues();
        let matchIdx = -1;
        for (let j = 0; j < adValues.length; j++) {
          if (adValues[j][1] === desc && parseFloat(adValues[j][2]) === price) {
            matchIdx = j + 12;
            break;
          }
        }
        if (matchIdx !== -1) {
          pSheet.getRange(matchIdx, 1, 1, 3).clearContent();
        }
      } 
      else if (type === "ส่วนแบ่ง" || type === "บันทึกส่วนแบ่ง") {
        const total = details.total;
        
        const distValues = pSheet.getRange("H12:J150").getValues();
        let matchIdx = -1;
        for (let j = 0; j < distValues.length; j++) {
          if (parseFloat(distValues[j][2]) === total) {
            matchIdx = j + 12;
            break;
          }
        }
        if (matchIdx !== -1) {
          pSheet.getRange(matchIdx, 8, 1, 3).clearContent();
        }
      }
      
      sheet.getRange(logItem.rowIdx, 7).setValue("Cancelled");
    }
    
    logSystemAction(values[targetIdx][2], "ย้อนคืนประวัติ", adminName || "System", { restoredToLogId: logId });
    return "✅ ย้อนคืนประวัติข้อมูลตารางสำเร็จ!";
  } catch (err) {
    Logger.log("Error in restoreToLog: " + err.toString());
    return "❌ เกิดข้อผิดพลาด: " + err.toString();
  }
}

function onEdit(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();
    if (sheetName === "SYSTEM_LOGS") return;
    
    const userEmail = Session.getActiveUser().getEmail() || "Google Sheet Editor";
    const row = range.getRow();
    const col = range.getColumn();
    const newValue = e.value;
    const oldValue = e.oldValue;
    
    logSystemAction(sheetName, "แก้ไขชีตโดยตรง", userEmail, {
      cell: range.getA1Notation(),
      row: row,
      col: col,
      oldValue: oldValue,
      newValue: newValue
    });
  } catch (err) {
    Logger.log("Error in onEdit logging: " + err.toString());
  }
}


// Case-insensitive sheet getter
function getSheetCaseInsensitive(spreadsheet, name) {
  const sheets = spreadsheet.getSheets();
  const searchName = name.toLowerCase().trim();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().trim() === searchName) {
      return sheets[i];
    }
  }
  return null;
}

// Execute balance carryover (Double Entry: Expense in source, Revenue in destination)
function executeCarryover(sourceProj, destProj, amount, adminName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const srcSheet = getSheetCaseInsensitive(spreadsheet, sourceProj);
    const destSheet = getSheetCaseInsensitive(spreadsheet, destProj);
    
    if (!srcSheet) return { status: "error", message: "ไม่พบโปรเจกต์ต้นทาง: " + sourceProj };
    if (!destSheet) return { status: "error", message: "ไม่พบโปรเจกต์ปลายทาง: " + destProj };
    
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear() + 543}`;
    
    // Use actual sheet name casing for logging
    const actualSrcName = srcSheet.getName();
    const actualDestName = destSheet.getName();
    
    // 1. Add Expense to sourceProj
    const srcValues = srcSheet.getRange("A1:J150").getValues();
    let srcHeaderIdx = -1;
    for (let i = 0; i < srcValues.length; i++) {
      const rowText = srcValues[i].join(" ").toLowerCase();
      if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
        srcHeaderIdx = i;
        break;
      }
    }
    if (srcHeaderIdx === -1) return { status: "error", message: "ไม่พบตารางรายจ่ายในโปรเจกต์ต้นทาง " + actualSrcName };
    
    let srcTargetRow = -1;
    for (let i = srcHeaderIdx + 1; i < srcValues.length; i++) {
      if (!srcValues[i][3] && !srcValues[i][4] && !srcValues[i][5] && !srcValues[i][6]) {
        srcTargetRow = i + 1;
        break;
      }
    }
    if (srcTargetRow === -1) srcTargetRow = srcValues.length + 1;
    
    const expDesc = "ยอดยกไปยัง " + actualDestName;
    srcSheet.getRange(srcTargetRow, 4, 1, 4).setValues([[dateStr, expDesc, amount, "โอนย้ายยอดเงินคงเหลือเพื่อตั้งต้นใหม่"]]);
    logSystemAction(actualSrcName, "รายจ่าย", adminName, { description: expDesc, price: amount, note: "โอนย้ายยอดเงินคงเหลือ" });
    
    // 2. Add Revenue to destProj
    const destValues = destSheet.getRange("A1:C10").getValues();
    let destRowIdx = -1;
    const destCode = "ยอดยกมาจาก " + actualSrcName;
    
    // Check if code already exists
    for (let i = 2; i < 10; i++) {
      if (destValues[i][0] && destValues[i][0].toString().trim() === destCode) {
        destRowIdx = i + 1;
        break;
      }
    }
    
    // If not exists, find first empty row in rows 3 to 10
    if (destRowIdx === -1) {
      for (let i = 2; i < 10; i++) {
        if (!destValues[i][0] || destValues[i][0].toString().trim() === "") {
          destRowIdx = i + 1;
          break;
        }
      }
    }
    
    if (destRowIdx === -1) {
      return { status: "error", message: "ตารางรายรับปลายทางเต็มแล้ว (ไม่พบแถวว่างในแถวที่ 3-10 ของ " + actualDestName + ")" };
    }
    
    const currentPrice = parseFloat((destValues[destRowIdx - 1][2] || "0").toString().replace(/,/g, ""));
    destSheet.getRange(destRowIdx, 1, 1, 3).setValues([[destCode, 0, currentPrice + amount]]);
    logSystemAction(actualDestName, "ยอดสมัคร", adminName, { code: destCode, qty: 0, price: amount });
    
    return { status: "success", message: `✅ โอนยอดสำเร็จ! โอนจาก ${actualSrcName} ไปยัง ${actualDestName} จำนวน ${amount.toLocaleString()} บาท` };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}
