import fs from "fs";
import path from "path";

const CHANNEL_ACCESS_TOKEN = "NHjsvK4l1ngTXVEJPucy7R1c1uUJ5Ux79tU/WLcQSc7ms8C80urt9K7IpubGum9/Q9RIEWUtfMGzk8wn7OKSglhwu64Ig6Xn+YIC1irfOU/BzQsmlyDswjEhbOLdAJyahfSKRdgBQk3yVvAtB8NxPAdB04t89/1O/w1cDnyilFU=";
const LIFF_ID = "2010690090-AKybN7Fn";
const IMAGE_PATH = "/Users/phanuphan/.gemini/antigravity/brain/12439b12-c9b9-4a86-a597-f947524ccf6a/resized_menu.jpg";

async function run() {
  try {
    console.log("1. Creating Rich Menu object...");
    const richMenuDef = {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "Pastel Ledger Menu",
      chatBarText: "เมนูทำบัญชี",
      areas: [
        // Top Left: add-sale
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: {
            type: "message",
            text: "ยอดสมัคร"
          }
        },
        // Top Middle: add-expense
        {
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: {
            type: "message",
            text: "รายจ่าย"
          }
        },
        // Top Right: add-ad
        {
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: {
            type: "message",
            text: "ค่าโฆษณา"
          }
        },
        // Bottom Left: receive-stock
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: {
            type: "message",
            text: "สต็อกหนังสือ"
          }
        },
        // Bottom Middle: add-distribution
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: {
            type: "message",
            text: "ส่วนแบ่ง"
          }
        },
        // Bottom Right: view dashboard overview
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: {
            type: "message",
            text: "สรุป"
          }
        }
      ]
    };

    const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(richMenuDef)
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      throw new Error(`Failed to create rich menu: ${JSON.stringify(createData)}`);
    }

    const richMenuId = createData.richMenuId;
    console.log(`✅ Rich Menu created successfully with ID: ${richMenuId}`);

    console.log("2. Uploading Rich Menu image...");
    const imageBuffer = fs.readFileSync(IMAGE_PATH);
    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: imageBuffer
    });

    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.text();
      throw new Error(`Failed to upload rich menu image: ${uploadErr}`);
    }
    console.log("✅ Rich Menu image uploaded successfully.");

    console.log("3. Setting Rich Menu as default...");
    const linkRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}`
      }
    });

    if (!linkRes.ok) {
      const linkErr = await linkRes.text();
      throw new Error(`Failed to set default rich menu: ${linkErr}`);
    }
    console.log("✅ Rich Menu set as default for all users!");
    console.log("🎉 SUCCESS!");

  } catch (err) {
    console.error("❌ Error running script:", err);
  }
}

run();
