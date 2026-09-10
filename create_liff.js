const CHANNEL_ACCESS_TOKEN = "NHjsvK4l1ngTXVEJPucy7R1c1uUJ5Ux79tU/WLcQSc7ms8C80urt9K7IpubGum9/Q9RIEWUtfMGzk8wn7OKSglhwu64Ig6Xn+YIC1irfOU/BzQsmlyDswjEhbOLdAJyahfSKRdgBQk3yVvAtB8NxPAdB04t89/1O/w1cDnyilFU=";

async function run() {
  try {
    console.log("Creating LIFF App on LINE...");
    const payload = {
      view: {
        type: "compact",
        url: "https://sta69-ledger-98315.web.app/"
      },
      description: "Ledger Form",
      features: {
        ble: false
      }
    };

    const res = await fetch("https://api.line.me/liff/v1/apps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Failed to create LIFF app: ${JSON.stringify(data)}`);
    }

    console.log("✅ LIFF App created successfully!");
    console.log(`LIFF ID: ${data.liffId}`);
  } catch (err) {
    console.error("❌ Error creating LIFF app:", err);
  }
}

run();
