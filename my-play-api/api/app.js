import gplay from 'google-play-scraper';

// 1. Hàm so sánh version chuẩn
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

// 2. Hàm săn version từ APKCombo dùng ScrapingAnt (Cấu hình tối cao)
async function getVersionFromScraperAnt(appId) {
  const ANT_API_KEY = 'd6efaa10e6114cac96bc12a2e9b21e99'; 
  const targetUrl = `https://apkcombo.com/vi/a/${appId}/`;
  
  // THÊM: wait_for_selector để đợi trang render xong số version
  const proxyUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${ANT_API_KEY}&browser=true&wait_for_selector=.is-version`;

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) return { ver: null, log: `Lỗi HTTP ${res.status}` };

    const jsonData = await res.json();
    const html = jsonData.content; 
    if (!html) return { ver: null, log: "ScrapingAnt trả về content rỗng" };

    // Kiểm tra xem có dính trang "Verify you are human" không
    if (html.includes("Cloudflare") && html.includes("verify")) {
      return { ver: null, log: "Vẫn bị Cloudflare chặn (Captcha)" };
    }

    // Quét version bằng nhiều mẫu Regex khác nhau (Phòng hờ APKCombo đổi giao diện)
    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/class="version">([^<]+)</i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);

    if (match && match[1]) {
      return { ver: match[1].trim().replace(/^v/i, '').trim(), log: "Thành công" };
    }
    
    return { ver: null, log: "Không tìm thấy số version trong HTML" };
  } catch (e) {
    return { ver: null, log: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Chạy song song cả 2 luồng
    const [playApp, antResult] = await Promise.all([
      gplay.app({ appId: id, lang: 'vi', country: 'us' }).catch(() => null),
      getVersionFromScraperAnt(id)
    ]);

    if (!playApp) return res.status(404).json({ error: 'App không tồn tại' });

    let finalSource = "Google Play Gốc";
    
    // Nếu ScrapingAnt lấy được version và bản đó mới hơn Google Play
    if (antResult.ver && isVersionNewer(playApp.version, antResult.ver)) {
      playApp.version = antResult.ver;
      finalSource = `APKCombo (via ANT)`;
    }

    // Gắn Log để bạn kiểm tra lỗi ngay trên Discord
    playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🛡️ Log: ${antResult.log}]\n[🔍 Nguồn: ${finalSource}]`;

    res.status(200).json(playApp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}