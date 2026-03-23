import gplay from 'google-play-scraper';

// Hàm so sánh version thu gọn (để tìm bản cao nhất)
function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer || oldVer === "N/A" || newVer === "N/A") return false;
  const oldParts = String(oldVer).split(".").map(n => parseInt(n, 10) || 0);
  const newParts = String(newVer).split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(oldParts.length, newParts.length);
  for (let i = 0; i < len; i++) {
    const o = oldParts[i] || 0;
    const n = newParts[i] || 0;
    if (n > o) return true;
    if (n < o) return false;
  }
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  // Ép Header giả lập trình duyệt xịn & yêu cầu Google không trả cache
  const requestOptions = {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  try {
    // Lách luật: Bắn 3 mũi tên tới 3 quốc gia cùng 1 lúc (Mỹ, Việt Nam, Singapore)
    const countries = ['us', 'vn', 'sg'];
    
    const promises = countries.map(country => 
      gplay.app({ 
        appId: id, 
        lang: 'vi', 
        country: country,
        requestOptions: requestOptions 
      }).catch(e => null) // Nếu 1 nước bị lỗi thì bỏ qua, lấy nước khác
    );

    // Chờ cả 3 kết quả trả về
    const results = await Promise.all(promises);

    // Lọc bỏ những kết quả bị lỗi (null)
    const validResults = results.filter(r => r !== null);

    if (validResults.length === 0) {
      return res.status(500).json({ error: 'Google chặn request hoặc App ID không tồn tại' });
    }

    // So sánh: Lấy App có Version cao nhất trong số 3 quốc gia
    let bestApp = validResults[0];
    for (let i = 1; i < validResults.length; i++) {
      if (isVersionNewer(bestApp.version, validResults[i].version)) {
        bestApp = validResults[i];
      }
    }

    // Trả về bản "ngon nhất"
    res.status(200).json(bestApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}