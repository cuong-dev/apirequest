import gplay from 'google-play-scraper';

export default async function handler(req, res) {
  // 1. Cấu hình Header để tránh lỗi CORS và Cache
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Thiếu App ID (ví dụ: ?id=com.abc.xyz)' });
  }

  try {
    // 2. Gọi thư viện google-play-scraper
    // Cấu hình: lấy tiếng Việt (vi) và vùng Việt Nam (vn) để khớp dữ liệu bạn cần
    const appData = await gplay.app({
      appId: id,
      lang: 'vi',
      country: 'vn',
      // Thêm requestOptions để tránh bị Google chặn IP hoặc cache cũ
      requestOptions: {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }
    });

    // 3. Chuẩn hóa lại dữ liệu trước khi gửi về Google Sheet
    // Một số app có version là "Varies with device", mình sẽ xử lý nếu cần
    const cleanData = {
      title: appData.title,
      version: appData.version || "Varies with device",
      recentChanges: appData.recentChanges || "Không có thông tin cập nhật mới.",
      icon: appData.icon,
      screenshots: appData.screenshots || [],
      score: appData.score,
      ratings: appData.ratings,
      description: appData.description,
      developer: appData.developer,
      updated: appData.updated,
      url: appData.url,
      // Thêm log để bạn biết dữ liệu này lấy từ thư viện chính chủ
      sourceLog: "Google Play Scraper (Official)"
    };

    res.status(200).json(cleanData);

  } catch (error) {
    // 4. Xử lý lỗi tinh tế: Nếu không tìm thấy App, trả về lỗi 404 thay vì sập (500)
    console.error("Lỗi Scraper:", error.message);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Không tìm thấy ứng dụng này trên Google Play.' });
    }

    res.status(500).json({ 
      error: 'Lỗi máy chủ khi lấy dữ liệu từ Google.',
      detail: error.message 
    });
  }
}