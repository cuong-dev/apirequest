import gplay from 'google-play-scraper';

// 1. Hàm so sánh version
function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer || oldVer === "N/A" || newVer === "N/A") return false;
  const cleanOld = String(oldVer).replace(/[^0-9.]/g, '');
  const cleanNew = String(newVer).replace(/[^0-9.]/g, '');
  
  const oldParts = cleanOld.split(".").map(n => parseInt(n, 10) || 0);
  const newParts = cleanNew.split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(oldParts.length, newParts.length);
  
  for (let i = 0; i < len; i++) {
    const o = oldParts[i] || 0;
    const n = newParts[i] || 0;
    if (n > o) return true;
    if (n < o) return false;
  }
  return false;
}

// 2. Hàm cào APKCombo ĐÃ NÂNG CẤP (Dùng AllOrigins Proxy để xuyên thủng Cloudflare)
async function getApkComboVersion(appId) {
  try {
    // Link gốc cần cào
    const targetUrl = `https://apkcombo.com/vi/a/${appId}/`;
    
    // Bọc link gốc qua màng lọc AllOrigins (Giấu IP Vercel)
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    
    // AllOrigins trả về JSON, trong đó chứa toàn bộ HTML của APKCombo
    const data = await res.json();
    const html = data.contents;

    if (!html || html.includes('Cloudflare') || html.includes('Just a moment')) {
      return null; // Proxy cũng bị chặn thì đành chịu
    }

    // Nâng cấp lưới quét Regex để bắt mọi định dạng version
    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i)
               || html.match(/<span class="version[^>]*>([^<]+)<\/span>/i);

    if (match && match[1]) {
      return match[1].trim().replace(/^v/i, '').trim();
    }
    return null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // 3. Chạy SONG SONG: Google Play & APKCombo (qua Proxy)
    const [playApp, apkComboVersion] = await Promise.all([
      gplay.app({
        appId: id, lang: 'vi', country: 'us',
        requestOptions: {
          headers: { 'Cache-Control': 'no-cache' }
        }
      }).catch(() => null),
      getApkComboVersion(id)
    ]);

    if (!playApp) {
      return res.status(500).json({ error: 'App ID không tồn tại hoặc lỗi Google Play' });
    }

    // 4. Cướp version của APKCombo nếu cao hơn
    if (apkComboVersion && isVersionNewer(playApp.version, apkComboVersion)) {
      playApp.version = apkComboVersion;
      playApp.sourceLog = `APKCombo qua Proxy (${apkComboVersion})`;
    } else {
      playApp.sourceLog = `Google Play`;
    }

    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}