import gplay from 'google-play-scraper';

// 1. Hàm so sánh version (Giữ nguyên logic để tìm bản cao nhất)
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

// 2. Lớp 1: Gọi API Aptoide (Nhanh và sạch)
async function getVersionFromAptoideAPI(appId) {
  try {
    const res = await fetch(`https://ws75.aptoide.com/api/7/app/getMeta?package_name=${appId}`);
    const data = await res.json();
    if (data.nodes?.meta?.data?.file) {
      return data.nodes.meta.data.file.vername;
    }
    return null;
  } catch (e) { return null; }
}

// 3. Lớp 2: Cào giao diện Web Aptoide (Dự phòng khi API không thấy App)
async function scrapeAptoideWeb(appId) {
  try {
    // Thử tìm kiếm trực tiếp trên Aptoide để lấy trang kết quả
    const url = `https://en.aptoide.com/search?query=${appId}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
    });
    const html = await res.text();
    
    // Tìm kiếm version trong đống HTML trả về
    const match = html.match(/latest-version">([^<]+)</i) 
               || html.match(/Version:\s*<\/span>\s*<span[^>]*>([^<]+)<\/span>/i)
               || html.match(/([0-9]+\.[0-9]+(?:\.[0-9]+)+)/); // Regex tìm dãy số v1.2.3

    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Chạy song song 3 luồng để tối ưu tốc độ
    const [playApp, aptoideApiVer, aptoideWebVer] = await Promise.all([
      gplay.app({ appId: id, lang: 'vi', country: 'us' }).catch(() => null),
      getVersionFromAptoideAPI(id),
      scrapeAptoideWeb(id)
    ]);

    if (!playApp) return res.status(404).json({ error: 'App không tồn tại trên Play Store' });

    let bestVer = playApp.version;
    let source = "Google Play Gốc";

    // Kiểm tra kết quả từ API Aptoide trước
    if (aptoideApiVer && isVersionNewer(bestVer, aptoideApiVer)) {
      bestVer = aptoideApiVer;
      source = "Aptoide API";
    }

    // Nếu API không có, kiểm tra kết quả cào Web Aptoide
    if (aptoideWebVer && isVersionNewer(bestVer, aptoideWebVer)) {
      bestVer = aptoideWebVer;
      source = "Aptoide Web Scrape";
    }

    // Đóng gói dữ liệu trả về cho Google Sheet
    playApp.version = bestVer;
    playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🔍 Nguồn: ${source}]`;

    res.status(200).json(playApp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}