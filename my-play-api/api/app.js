import gplay from 'google-play-scraper';

function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer || oldVer === "N/A" || newVer === "N/A") return false;
  const cleanOld = String(oldVer).replace(/[^0-9.]/g, '');
  const cleanNew = String(newVer).replace(/[^0-9.]/g, '');
  const oldParts = cleanOld.split(".").map(n => parseInt(n, 10) || 0);
  const newParts = cleanNew.split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(oldParts.length, newParts.length);
  for (let i = 0; i < len; i++) {
    if ((newParts[i] || 0) > (oldParts[i] || 0)) return true;
    if ((newParts[i] || 0) < (oldParts[i] || 0)) return false;
  }
  return false;
}

// HÀM CHỐT HẠ: Dùng ScraperAnt để lấy HTML sạch từ APKCombo
async function getVersionFromAPKCombo(appId) {
  const ANT_API_KEY = d6efaa10e6114cac96bc12a2e9b21e99; 
  const targetUrl = encodeURIComponent(`https://apkcombo.com/vi/a/${appId}/`);
  
  // Gọi qua Proxy của ScraperAnt để né Cloudflare
  const proxyUrl = `https://api.scraperant.com/v2/general?url=${targetUrl}&x-api-key=${ANT_API_KEY}&browser=false`;

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const html = data.content; // ScraperAnt trả về HTML đã vượt qua Cloudflare

    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);

    return match ? match[1].trim().replace(/^v/i, '').trim() : null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    const playApp = await gplay.app({ appId: id, lang: 'vi', country: 'us' }).catch(() => null);
    if (!playApp) return res.status(404).json({ error: 'App không tồn tại' });

    // Gọi "Sát thủ" vượt rào Cloudflare
    const apkComboVer = await getVersionFromAPKCombo(id);

    let bestVer = playApp.version;
    let source = "Google Play Gốc";

    if (apkComboVer && isVersionNewer(bestVer, apkComboVer)) {
      bestVer = apkComboVer;
      source = "APKCombo (Vượt rào thành công)";
    }

    playApp.version = bestVer;
    playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🛡️ Check Version: ${source}]`;

    res.status(200).json(playApp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}