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

// TUYỆT CHIÊU GIẢ DANH GOOGLEBOT (Để CF mở cửa mời vào)
const GOOGLEBOT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'X-Forwarded-For': '66.249.66.1', // Ép IP giả của máy chủ Google Search
  'Accept': '*/*'
};

// 1. Bot săn từ APKCombo
async function getApkComboVersion(appId) {
  try {
    const res = await fetch(`https://apkcombo.com/vi/a/${appId}/`, { headers: GOOGLEBOT_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.includes('Cloudflare') || html.includes('Just a moment')) return null;

    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);
    if (match && match[1]) return match[1].trim().replace(/^v/i, '').trim();
    return null;
  } catch (e) { return null; }
}

// 2. Bot săn từ AppBrain (Trang này ít bị chặn hơn)
async function getAppBrainVersion(appId) {
  try {
    const res = await fetch(`https://www.appbrain.com/app/${appId}`, { headers: GOOGLEBOT_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    
    // Tìm cấu trúc chứa version của AppBrain
    const match = html.match(/Changelog cho bản cập nhật ([^<]+)/i)
               || html.match(/Version:<\/b>\s*([^<]+)/i)
               || html.match(/Phiên bản hiện tại:<\/b>\s*([^<]+)/i);
               
    if (match && match[1]) return match[1].trim().replace(/^v/i, '').trim();
    return null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Chạy 3 xe cào cùng lúc: Google Play (lấy ảnh/info) + 2 trang APK (Săn Version)
    const [playApp, apkComboVer, appBrainVer] = await Promise.all([
      gplay.app({
        appId: id, lang: 'vi', country: 'us',
        requestOptions: { headers: { 'Cache-Control': 'no-cache' } }
      }).catch(() => null),
      getApkComboVersion(id),
      getAppBrainVersion(id)
    ]);

    if (!playApp) {
      return res.status(500).json({ error: 'App ID không tồn tại hoặc lỗi API nền' });
    }

    // Gộp 2 kết quả săn được lại, lấy số to nhất làm chuẩn
    let bestExternalVer = null;
    let externalSource = "";

    if (apkComboVer) { bestExternalVer = apkComboVer; externalSource = `APKCombo`; }
    
    if (appBrainVer && isVersionNewer(bestExternalVer, appBrainVer)) {
      bestExternalVer = appBrainVer; 
      externalSource = `AppBrain`;
    }

    // So tài với bản của Google Play đang có
    if (bestExternalVer && isVersionNewer(playApp.version, bestExternalVer)) {
      playApp.version = bestExternalVer;
      playApp.sourceLog = `${externalSource} (Bản mới: ${bestExternalVer})`;
    } else {
      playApp.sourceLog = `Google Play`;
    }

    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}