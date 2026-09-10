const functions = require("firebase-functions");
const admin = require("firebase-admin");
const line = require("@line/bot-sdk");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

admin.initializeApp();

// Config parameters for LINE Bot
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || functions.config().line.access_token || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || functions.config().line.secret || ""
};

const client = new line.Client(lineConfig);

// Google Sheets Credentials Setup
// Service Account credentials can be loaded from local service-account.json or Firebase secret config
let googleAuth = null;
try {
  const secretPath = path.join(__dirname, "service-account.json");
  if (fs.existsSync(secretPath)) {
    googleAuth = new google.auth.GoogleAuth({
      keyFile: secretPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  } else {
    // Fallback to application default credentials (ADC) if running in GCP environment with service account enabled
    googleAuth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }
} catch (err) {
  console.error("Failed to initialize Google Auth:", err);
}

// Configurable Spreadsheet ID (using the hardcoded spreadsheet from app)
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "15PDmzbRGXocSvm42lksU9KNRcg7op31qc-b1JEo4wjQ";
const DEFAULT_TAB_NAME = "Sta70"; // Maps to key STA_2570

/**
 * Main Webhook endpoint to receive LINE Messaging API events
 */
exports.webhook = functions.https.onRequest(async (req, res) => {
  const signature = req.headers["x-line-signature"];

  if (!signature) {
    return res.status(400).send("Missing signature");
  }

  // Verify LINE signature to guarantee request authenticity
  if (lineConfig.channelSecret && !line.validateSignature(JSON.stringify(req.body), lineConfig.channelSecret, signature)) {
    return res.status(401).send("Invalid signature");
  }

  const events = req.body.events;
  try {
    const results = await Promise.all(events.map(handleEvent));
    return res.json(results);
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).send(err.message);
  }
});

/**
 * Handle incoming LINE events (message, postback, etc.)
 */
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userMessage = event.message.text.trim();
  const replyToken = event.replyToken;

  // Pattern match commands:
  // 1. รายรับ [รหัสสินค้า] [จำนวน] [ราคาขายรวม]
  // 2. รายจ่าย [รายการ/ค่าแอด] [ยอดเงิน] [โน้ตย่อย]
  // 3. รับหนังสือ [รหัสหนังสือ] [จำนวน]
  const incomeRegex = /^รายรับ\s+(\S+)\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?/i;
  const expenseRegex = /^รายจ่าย\s+(\S+)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?/i;
  const stockRegex = /^รับหนังสือ\s+(\S+)\s+(\d+)/i;

  if (incomeRegex.test(userMessage)) {
    return handleIncomeCommand(userMessage, incomeRegex, replyToken);
  } else if (expenseRegex.test(userMessage)) {
    return handleExpenseCommand(userMessage, expenseRegex, replyToken);
  } else if (stockRegex.test(userMessage)) {
    return handleStockCommand(userMessage, stockRegex, replyToken);
  }

  // Handle default fallback response with guide instructions
  const helpText = "ℹ️ **วิธีการกรอกบัญชีผ่านแชท LINE:**\n\n" +
    "📈 **1. บันทึกรายรับ (อัปเดตสต็อกยอดขาย):**\n" +
    "พิมพ์: `รายรับ [รหัสสินค้า] [จำนวน] [ราคารวม]`\n" +
    "👉 ตัวอย่าง: `รายรับ 3ZEED 10 3200`\n\n" +
    "💸 **2. บันทึกรายจ่าย:**\n" +
    "พิมพ์: `รายจ่าย [รายการ] [ยอดเงิน] [โน้ตย่อย]`\n" +
    "👉 ตัวอย่าง (ค่าโฆษณา): `รายจ่าย ค่าโฆษณา 5000`\n" +
    "👉 ตัวอย่าง (ค่าใช้อื่นๆ): `รายจ่าย ค่าส่งของ 120 เคอรี่`\n\n" +
    "📦 **3. บันทึกรับหนังสือเข้าสต็อก:**\n" +
    "พิมพ์: `รับหนังสือ [รหัสหนังสือ] [จำนวน]`\n" +
    "👉 ตัวอย่าง: `รับหนังสือ 3ZEED 200`\n\n" +
    "หรือแตะปุ่มใน **ลิสต์เมนู** เพื่อเปิดหน้าแดชบอร์ดกรอกฟอร์มพร้อมถ่ายรูปสลิปครับ";

  return client.replyMessage(replyToken, {
    type: "text",
    text: helpText
  });
}

/**
 * Process a "รายรับ" (Income) command
 * Updates quantity and total price in the specific product slot in rows 3-10
 */
async function handleIncomeCommand(message, regex, replyToken) {
  const match = message.match(regex);
  const code = match[1].toUpperCase();
  const qty = parseInt(match[2], 10);
  const totalPrice = match[3] ? parseFloat(match[3]) : 0;

  try {
    if (!googleAuth) {
      throw new Error("ระบบฐานข้อมูล Sheets ยังไม่ได้เชื่อมต่อใบรับรองสิทธิ์ (Credentials)");
    }

    const sheets = google.sheets({ version: "v4", auth: googleAuth });
    
    // Fetch rows from spreadsheet to locate the product
    const range = `${DEFAULT_TAB_NAME}!A1:C15`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range
    });

    const rows = response.data.values || [];
    let productRowIndex = -1;

    // Scan rows 2 to 9 (rows 3 to 10 in spreadsheet)
    for (let i = 2; i < Math.min(10, rows.length); i++) {
      if (rows[i] && rows[i][0] && rows[i][0].trim().toUpperCase() === code) {
        productRowIndex = i + 1; // 1-indexed spreadsheet row number
        break;
      }
    }

    if (productRowIndex === -1) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `❌ ไม่พบรหัสสินค้า "${code}" ในผังขายสินค้าสล็อต (สแกนแถวที่ 3-10)`
      });
    }

    // Get current values to add updates
    const currentQty = parseInt(rows[productRowIndex - 1][1] || "0", 10);
    const currentPrice = parseFloat((rows[productRowIndex - 1][2] || "0").replace(/,/g, ""));

    const newQty = currentQty + qty;
    const newPrice = currentPrice + totalPrice;

    // Update in Google Sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_TAB_NAME}!B${productRowIndex}:C${productRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newQty, newPrice]]
      }
    });

    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ บันทึกรายรับสำเร็จ!\n\n🛍️ สินค้า: ${code}\n➕ จำนวนเพิ่ม: ${qty} ชิ้น (รวมสะสม: ${newQty} ชิ้น)\n💰 ยอดเพิ่ม: ${totalPrice.toLocaleString()} บาท (รวมสะสม: ${newPrice.toLocaleString()} บาท)`
    });

  } catch (err) {
    console.error("Google Sheets write error:", err);
    return client.replyMessage(replyToken, {
      type: "text",
      text: `❌ บันทึกรายรับล้มเหลว: ${err.message}`
    });
  }
}

/**
 * Process a "รายจ่าย" (Expense) command
 * Appends details to Google Sheet below the header row (Col A-C for Ads, Col D-G for Expenses)
 */
async function handleExpenseCommand(message, regex, replyToken) {
  const match = message.match(regex);
  const description = match[1];
  const price = parseFloat(match[2]);
  const note = match[3] || "";

  // Date formatted as DD/MM/YYYY for Google Sheets
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear() + 543; // Buddhist Era
  const dateStr = `${day}/${month}/${year}`;

  const isAdsCost = description.toLowerCase().includes("โฆษณา") || description.toLowerCase().includes("แอด");

  try {
    if (!googleAuth) {
      throw new Error("ระบบฐานข้อมูล Sheets ยังไม่ได้เชื่อมต่อใบรับรองสิทธิ์ (Credentials)");
    }

    const sheets = google.sheets({ version: "v4", auth: googleAuth });
    
    // Fetch tab content to find the table structures
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_TAB_NAME}!A1:J150`
    });

    const rows = response.data.values || [];
    let headerRowIdx = -1;

    // Locate header row containing "ว/ด/ป" and "รายการ"
    for (let i = 0; i < rows.length; i++) {
      const rowText = (rows[i] || []).join(" ").toLowerCase();
      if (rowText.includes("ว/ด/ป") && rowText.includes("รายการ")) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      throw new Error("ไม่พบแถวหัวตารางรายจ่าย (ว/ด/ป, รายการ) ในหน้าชีต");
    }

    let targetRowIndex = -1;

    if (isAdsCost) {
      // Find first empty cell in Column A-C under the header
      for (let i = headerRowIdx + 1; i <= rows.length; i++) {
        const row = rows[i] || [];
        if (!row[0] && !row[1] && !row[2]) {
          targetRowIndex = i + 1;
          break;
        }
      }
      if (targetRowIndex === -1) targetRowIndex = rows.length + 1;

      // Update Column A-C (Ads Cost Table)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${DEFAULT_TAB_NAME}!A${targetRowIndex}:C${targetRowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[dateStr, description, price]]
        }
      });
    } else {
      // Find first empty cell in Column D-G under the header
      for (let i = headerRowIdx + 1; i <= rows.length; i++) {
        const row = rows[i] || [];
        // Padded check for Col D-G (indices 3 to 6)
        if (!row[3] && !row[4] && !row[5] && !row[6]) {
          targetRowIndex = i + 1;
          break;
        }
      }
      if (targetRowIndex === -1) targetRowIndex = rows.length + 1;

      // Update Column D-G (Other Expenses Table)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${DEFAULT_TAB_NAME}!D${targetRowIndex}:G${targetRowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[dateStr, description, price, note]]
        }
      });
    }

    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ บันทึกรายจ่ายสำเร็จ!\n\n📅 วันที่: ${dateStr}\n🏷️ หมวด: ${isAdsCost ? "ค่าโฆษณารวม (Ads)" : "รายจ่ายอื่นๆ"}\n📝 รายการ: ${description}\n💸 ยอดเงิน: ${price.toLocaleString()} บาท\n📌 โน้ต: ${note || "-"}`
    });

  } catch (err) {
    console.error("Google Sheets write error:", err);
    return client.replyMessage(replyToken, {
      type: "text",
      text: `❌ บันทึกรายจ่ายล้มเหลว: ${err.message}`
    });
  }
}

/**
 * Process a "รับหนังสือ" (Receive Stock) command
 * Updates received quantity in Google Sheet (rows 12 to 16, column E)
 */
async function handleStockCommand(message, regex, replyToken) {
  const match = message.match(regex);
  const code = match[1].toLowerCase(); // bookCodes are lowercase in app.js
  const qty = parseInt(match[2], 10);

  try {
    if (!googleAuth) {
      throw new Error("ระบบฐานข้อมูล Sheets ยังไม่ได้เชื่อมต่อใบรับรองสิทธิ์ (Credentials)");
    }

    const sheets = google.sheets({ version: "v4", auth: googleAuth });
    
    // Fetch rows from spreadsheet
    const range = `${DEFAULT_TAB_NAME}!D1:E20`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range
    });

    const rows = response.data.values || [];
    let bookRowIndex = -1;

    // Scan rows 12 to 16 (index 11 to 15)
    for (let i = 11; i < Math.min(16, rows.length); i++) {
      if (rows[i] && rows[i][0] && rows[i][0].trim().toLowerCase() === code) {
        bookRowIndex = i + 1; // 1-indexed row number
        break;
      }
    }

    if (bookRowIndex === -1) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `❌ ไม่พบรหัสหนังสือ "${code.toUpperCase()}" ในตารางสต็อก (สแกนแถวที่ 12-16)`
      });
    }

    // Get current received qty (Column E is index 1 of range D:E)
    const currentReceived = parseInt(rows[bookRowIndex - 1][1] || "0", 10);
    const newReceived = currentReceived + qty;

    // Update Column E (which is E{row})
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_TAB_NAME}!E${bookRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newReceived]]
      }
    });

    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ บันทึกรับหนังสือเข้าสต็อกสำเร็จ!\n\n📚 หนังสือ: ${code.toUpperCase()}\n➕ จำนวนรับเข้าเพิ่ม: ${qty.toLocaleString()} เล่ม\n📦 สต็อกสะสมทั้งหมด: ${newReceived.toLocaleString()} เล่ม`
    });

  } catch (err) {
    console.error("Google Sheets stock write error:", err);
    return client.replyMessage(replyToken, {
      type: "text",
      text: `❌ บันทึกสต็อกหนังสือล้มเหลว: ${err.message}`
    });
  }
}
