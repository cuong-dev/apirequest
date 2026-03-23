import gplay from 'google-play-scraper';

// 1. Hàm so sánh version (Để đảm bảo luôn lấy bản cao nhất)
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

// 2. Hàm dùng ScrapingAnt để "xuyên thủng" Cloudflare của APKCombo
async function getVersionFromAPKCombo(appId) {
  const ANT_API_KEY = 'd6efaa10e6114cac96bc12a2e9b21e99'; 
  const targetUrl = `https://apkcombo.com/vi/a/${appId}/`;
  
  // Gọi qua ScrapingAnt với chế độ browser=true để giả lập người dùng thật
  const proxyUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${ANT_API_KEY}&browser=true`;

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;

    // LẤY DỮ LIỆU JSON TỪ SCRAPINGANT
    const jsonData = await res.json();
    
    // TRÍCH XUẤT HTML TỪ TRƯỜNG "content"
    const html = jsonData.content; 
    if (!html) return null;

    // Dùng Regex để tìm số version trong mã nguồn HTML
    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);

    return match ? match[1].trim().replace(/^v/i, '').trim() : null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // Header để Google Sheet gọi được và không bị lưu cache cũ
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Chạy song song: Google Play (lấy ảnh/info) & ScrapingAnt (săn version mới)
    const [playApp, apkComboVer] = await Promise.all([
      gplay.app({
        appId: id, lang: 'vi', country: 'us',
        requestOptions: { headers: { 'Cache-Control': 'no-cache' } }
      }).catch(() => null),
      getVersionFromAPKCombo(id)
    ]);

    if (!playApp) {
      return res.status(404).json({ error: 'Không tìm thấy App trên Google Play' });
    }

    // So sánh: Nếu APKCombo có bản cao hơn thì ghi đè vào
    if (apkComboVer && isVersionNewer(playApp.version, apkComboVer)) {
      playApp.version = apkComboVer;
      // Ghi chú nguồn vào phần mô tả để bạn biết version này lấy từ đâu
      playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🛡️ Nguồn: APKCombo via ScrapingAnt]`;
    } else {
      playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🛡️ Nguồn: Google Play Gốc]`;
    }

    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}