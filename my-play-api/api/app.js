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
    const o = oldParts[i] || 0;
    const n = newParts[i] || 0;
    if (n > o) return true;
    if (n < o) return false;
  }
  return false;
}

// Hàm dùng SerpAPI để xuyên thủng hệ thống lấy version (Không sợ Cloudflare)
async function getRealVersionViaSerpApi(appId) {
  // Gắn API Key của bạn vào đây
  const API_KEY = "ad0607aaaeaad68f78555e246f65fa06a59078d1f52988021a4568c718c329fc";
  const url = `https://serpapi.com/search.json?engine=google_play_product&store=apps&gl=us&hl=vi&product_id=${appId}&api_key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data && data.product_info && data.product_info.version) {
      let ver = data.product_info.version;
      // Bỏ qua nếu version bị Google giấu thành "Varies with device"
      if (ver.toLowerCase().includes("varies") || ver.toLowerCase().includes("thay đổi")) return null;
      return ver.replace(/^v/i, '').trim();
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
    // Chạy SONG SONG: Vừa cào Google Play (lấy ảnh, text), vừa gọi SerpAPI (lấy Version)
    const [playApp, realVersion] = await Promise.all([
      gplay.app({
        appId: id, lang: 'vi', country: 'us',
        requestOptions: { headers: { 'Cache-Control': 'no-cache' } }
      }).catch(() => null),
      getRealVersionViaSerpApi(id)
    ]);

    if (!playApp) {
      return res.status(500).json({ error: 'App ID không tồn tại hoặc lỗi API' });
    }

    // Nếu SerpAPI bắt được bản cao hơn, lập tức ghi đè vào data của Vercel
    if (realVersion && isVersionNewer(playApp.version, realVersion)) {
      playApp.version = realVersion;
      playApp.sourceLog = `SerpAPI (Bản chuẩn: ${realVersion})`;
    } else {
      playApp.sourceLog = `Google Play`;
    }

    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}