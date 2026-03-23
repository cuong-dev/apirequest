import gplay from 'google-play-scraper';

// Hàm so sánh version chuẩn
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

// Hàm chuyên đi cào AppBrain (Kèm Header giả danh Googlebot)
async function getAppBrainVersion(appId) {
  try {
    const url = `https://www.appbrain.com/app/${appId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'X-Forwarded-For': '66.249.66.1', // Ép IP giả của máy chủ Google
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!res.ok) return { version: null, error: `AppBrain báo lỗi HTTP ${res.status}` };
    const html = await res.text();
    
    if (html.includes('Cloudflare') || html.includes('Just a moment')) {
      return { version: null, error: 'AppBrain cũng đã bật Cloudflare chặn Vercel' };
    }

    // Lưới Regex siêu việt: Quét mọi định dạng chứa số Version trên AppBrain
    const match = html.match(/(?:Version|Phiên bản):?(?:<\/td>|<\/th>|<\/b>|<span[^>]*>)?\s*(?:<td[^>]*>|<div[^>]*>)?\s*([0-9]+(?:\.[0-9]+)+)/i);
    
    if (match && match[1]) {
      return { version: match[1].trim(), error: null };
    }
    return { version: null, error: 'Không tìm thấy số version trong HTML của AppBrain' };
  } catch (e) {
    return { version: null, error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  // Khởi tạo Nhật ký theo dõi
  let debugLog = {
    app_id: id,
    gplay_scraper: { version: null, status: "Đang chờ" },
    appbrain: { version: null, status: "Đang chờ", error: null },
    ket_luan: ""
  };

  try {
    // Gọi Google Play trước để lấy thông tin nền (Tên, Ảnh...)
    let playApp = null;
    try {
      playApp = await gplay.app({
        appId: id, lang: 'vi', country: 'us',
        requestOptions: { headers: { 'Cache-Control': 'no-cache' } }
      });
      debugLog.gplay_scraper.status = "Thành công";
      debugLog.gplay_scraper.version = playApp.version;
    } catch (e) {
      debugLog.gplay_scraper.status = "Lỗi thư viện gplay: " + e.message;
    }

    if (!playApp) {
      return res.status(200).json({ error: "Không lấy được data Google Play", debug_log: debugLog });
    }

    // Song song gọi AppBrain để lấy bản 1%
    const appBrainResult = await getAppBrainVersion(id);
    
    if (appBrainResult.error) {
      debugLog.appbrain.status = "Thất bại";
      debugLog.appbrain.error = appBrainResult.error;
    } else {
      debugLog.appbrain.status = "Thành công";
      debugLog.appbrain.version = appBrainResult.version;
    }

    // So sánh và Quyết định cướp ngôi
    if (appBrainResult.version && isVersionNewer(playApp.version, appBrainResult.version)) {
      playApp.version = appBrainResult.version;
      playApp.sourceLog = `AppBrain (${appBrainResult.version})`;
      debugLog.ket_luan = `AppBrain THẮNG: Lấy bản ${appBrainResult.version} đè lên bản ${debugLog.gplay_scraper.version} của Google.`;
    } else {
      playApp.sourceLog = `Google Play`;
      debugLog.ket_luan = `Giữ Google Play vì AppBrain không lấy được hoặc bản bằng/nhỏ hơn.`;
    }

    // Nhét log vào data để bạn xem
    playApp.debug_log = debugLog;
    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}