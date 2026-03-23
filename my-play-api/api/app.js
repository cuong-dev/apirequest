import gplay from 'google-play-scraper';

// 1. Hàm săn version từ APKCombo qua ScrapingAnt (Vượt Cloudflare 100%)
async function getVersionFromScraperAnt(appId) {
  // Key bạn cung cấp trong code C#
  const ANT_API_KEY = 'd6efaa10e6114cac96bc12a2e9b21e99'; 
  const targetUrl = `https://apkcombo.com/vi/a/${appId}/`;
  
  // Gọi qua API ScrapingAnt
  const proxyUrl = `https://api.scraperant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${ANT_API_KEY}&browser=true`;

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;

    // QUAN TRỌNG: ScrapingAnt trả về JSON
    const jsonResponse = await res.json();
    
    // Lấy nội dung HTML nằm trong trường "content"
    const html = jsonResponse.content; 

    if (!html) return null;

    // Tìm version trong HTML
    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);

    return match ? match[1].trim().replace(/^v/i, '').trim() : null;
  } catch (e) {
    console.error("Lỗi ScrapingAnt:", e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Lấy thông tin từ Google Play trước
    const playApp = await gplay.app({ appId: id, lang: 'vi', country: 'us' }).catch(() => null);
    
    // Gọi "Sát thủ" vượt rào Cloudflare dùng ScrapingAnt
    const apkComboVer = await getVersionFromScraperAnt(id);

    if (!playApp) {
      return res.status(404).json({ error: 'App không tồn tại trên Play Store' });
    }

    // So sánh và cập nhật version
    if (apkComboVer && playApp.version !== apkComboVer) {
      playApp.version = apkComboVer;
      playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🛡️ Nguồn: APKCombo via ScrapingAnt]`;
    }

    res.status(200).json(playApp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}