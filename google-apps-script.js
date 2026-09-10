// ใส่ Channel Access Token จาก LINE Developers Console ที่นี่
const LINE_ACCESS_TOKEN = "ใส่_CHANNEL_ACCESS_TOKEN_ของคุณที่นี่";
const DEFAULT_TAB_NAME = "Sta70";

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const event = json.events[0];
    if (!event) return ContentService.createTextOutput("No events");

    const replyToken = event.replyToken;

    if (event.type !== "message" || event.message.type !== "text") {
      return ContentService.createTextOutput("OK");
    }

    const userMessage = event.message.text.trim();
    const incomeRegex = /^รายรับ\s+(\S+)\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?/i;
    const expenseRegex = /^รายจ่าย\s+(\S+)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?/i;
    const stockRegex = /^รับหนังสือ\s+(\S+)\s+(\d+)/i;

    let responseText = "";

    if (incomeRegex.test(userMessage)) {
      responseText = handleIncome(userMessage, incomeRegex);
    } else if (expenseRegex.test(userMessage)) {
      responseText = handleExpense(userMessage, expenseRegex);
    } else if (stockRegex.test(userMessage)) {
      responseText = handleStock(userMessage, stockRegex);
    } else {
      responseText = "ℹ️ วิธีการกรอกบัญชีผ่านแชท LINE:\n\n" +
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

    replyMessage(replyToken, responseText);
    return ContentService.createTextOutput("OK");
  } catch (err) {
    Logger.log(err.toString());
    return ContentService.createTextOutput(err.toString());
  }
}

function handleIncome(message, regex) {
  const match = message.match(regex);
  const code = match[1].toUpperCase();
  const qty = parseInt(match[2], 10);
  const totalPrice = match[3] ? parseFloat(match[3]) : 0;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEFAULT_TAB_NAME);
  if (!sheet) return `❌ ไม่พบหน้าชีต "${DEFAULT_TAB_NAME}"`;

  const values = sheet.getRange("A1:C15").getValues();
  let rowIdx = -1;

  for (let i = 2; i < Math.min(10, values.length); i++) {
    if (values[i][0] && values[i][0].toString().trim().toUpperCase() === code) {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx === -1) return `❌ ไม่พบรหัสสินค้า "${code}" ในแถวที่ 3-10`;

  const currentQty = parseInt(values[rowIdx - 1][1] || "0", 10);
  const currentPrice = parseFloat((values[rowIdx - 1][2] || "0").toString().replace(/,/g, ""));

  sheet.getRange(rowIdx, 2).setValue(currentQty + qty);
  sheet.getRange(rowIdx, 3).setValue(currentPrice + totalPrice);

  return `✅ บันทึกรายรับสำเร็จ!\n\n🛍️ สินค้า: ${code}\n➕ จำนวนเพิ่ม: ${qty} ชิ้น (รวมสะสม: ${currentQty + qty} ชิ้น)\n💰 ยอดเพิ่ม: ${totalPrice.toLocaleString()} บาท`;
}

function handleExpense(message, regex) {
  const match = message.match(regex);
  const description = match[1];
  const price = parseFloat(match[2]);
  const note = match[3] || "";

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear() + 543}`;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEFAULT_TAB_NAME);
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

  const isAdsCost = description.toLowerCase().includes("โฆษณา") || description.toLowerCase().includes("แอด");
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
  } else {
    for (let i = headerRowIdx + 1; i < values.length; i++) {
      if (!values[i][3] && !values[i][4] && !values[i][5] && !values[i][6]) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) targetRow = values.length + 1;
    sheet.getRange(targetRow, 4, 1, 4).setValues([[dateStr, description, price, note]]);
  }

  return `✅ บันทึกรายจ่ายสำเร็จ!\n\n📅 วันที่: ${dateStr}\n🏷️ หมวด: ${isAdsCost ? "ค่าแอด/โฆษณา" : "รายจ่ายอื่นๆ"}\n📝 รายการ: ${description}\n💸 ยอดเงิน: ${price.toLocaleString()} บาท`;
}

function handleStock(message, regex) {
  const match = message.match(regex);
  const code = match[1].toLowerCase();
  const qty = parseInt(match[2], 10);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEFAULT_TAB_NAME);
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

  return `✅ บันทึกรับหนังสือเข้าสต็อกสำเร็จ!\n\n📚 หนังสือ: ${code.toUpperCase()}\n➕ จำนวนรับเข้าเพิ่ม: ${qty.toLocaleString()} เล่ม\n📦 สต็อกสะสมทั้งหมด: ${currentReceived + qty} เล่ม`;
}

function replyMessage(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken: replyToken,
    messages: [{ type: "text", text: text }]
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
