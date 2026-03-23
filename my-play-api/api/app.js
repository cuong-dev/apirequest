import gplay from 'google-play-scraper';

// 1. Hàm so sánh version chuẩn xác
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

// 2. Hàm "Đào sâu" mã nguồn Google Play bằng Mobile User-Agent
async function getVersionFromGoogleDeepScan(appId) {
  const url = `https://play.google.com/store/apps/details?id=${appId}&hl=vi&gl=vn`;
  try {
    const response = await fetch(url, {
      headers: {
        // Giả lập Samsung Galaxy S23 để Google nhả version mới nhất
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
      }
    });
    const html = await response.text();

    // Tìm trong mảng dữ liệu thô AF_initDataCallback của Google
    // Đây là nơi chứa metadata thực tế của app bao gồm cả bản đang rollout
    const match = html.match(/\[\[\["([\d\.]+)"\]\]\]/) 
               || html.match(/\["([\d\.]+",\[\[\[/)
               || html.match(/\[null,"([\d\.]+)"\]/); 

    if (match && match[1]) {
      return match[1].trim();
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
    // Luồng 1: Lấy dữ liệu đầy đủ (Ảnh, Tên, Mô tả) từ thư viện
    const playApp = await gplay.app({
      appId: id,
      lang: 'vi',
      country: 'vn',
      requestOptions: { headers: { 'Cache-Control': 'no-cache' } }
    }).catch(() => null);

    if (!playApp) {
      return res.status(404).json({ error: 'Không tìm thấy App' });
    }

    // Luồng 2: Quét sâu mã nguồn thô để tìm Version rollout mới nhất
    const deepVersion = await getVersionFromGoogleDeepScan(id);

    let finalSource = "Google Play (Cơ bản)";
    
    // Nếu bản quét sâu tìm được số to hơn bản thư viện lấy được
    if (deepVersion && isVersionNewer(playApp.version, deepVersion)) {
      playApp.version = deepVersion;
      finalSource = "Google Play (Quét sâu hệ thống)";
    }

    // Ghi chú nguồn để bạn theo dõi trên Discord
    playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🛡️ Nguồn: ${finalSource}]`;

    res.status(200).json(playApp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}