import gplay from 'google-play-scraper';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  // BẢNG NHẬT KÝ THEO DÕI (Sẽ xuất ra màn hình cho bạn xem)
  let debugLog = {
    app_id: id,
    gplay_scraper: { status: "Đang chờ", version: null, error: null },
    serpapi: { status: "Đang chờ", raw_version: null, clean_version: null, http_code: null, error: null },
    ket_luan_cuoi_cung: ""
  };

  // 1. Bắt đầu gọi SerpAPI
  const API_KEY = "ef59b4172e53b97473f2cd46a728a5ea930b9fa6b2ccd96f0c1dab1b5b445166";
  const serpUrl = `https://serpapi.com/search.json?engine=google_play_product&store=apps&gl=us&hl=vi&product_id=${id}&api_key=${API_KEY}`;
  
  let serpVersionFinal = null;
  try {
    const serpRes = await fetch(serpUrl);
    debugLog.serpapi.http_code = serpRes.status;
    
    if (!serpRes.ok) {
      debugLog.serpapi.status = "Lỗi HTTP";
      debugLog.serpapi.error = `Server trả về mã ${serpRes.status} - ${serpRes.statusText}`;
    } else {
      const data = await serpRes.json();
      if (data.error) {
        debugLog.serpapi.status = "SerpAPI từ chối";
        debugLog.serpapi.error = data.error; // Thường do hết quota (tiền)
      } else if (data.product_info && data.product_info.version) {
        debugLog.serpapi.status = "Thành công";
        debugLog.serpapi.raw_version = data.product_info.version;
        
        let ver = data.product_info.version;
        if (ver.toLowerCase().includes("varies") || ver.toLowerCase().includes("thay đổi")) {
          debugLog.serpapi.error = "Google Play giấu version thành chữ 'Varies with device'";
        } else {
          serpVersionFinal = ver.replace(/^v/i, '').trim();
          debugLog.serpapi.clean_version = serpVersionFinal;
        }
      } else {
        debugLog.serpapi.status = "Thất bại";
        debugLog.serpapi.error = "Không tìm thấy product_info.version trong cục data SerpAPI trả về";
      }
    }
  } catch (e) {
    debugLog.serpapi.status = "Sập Code Vercel";
    debugLog.serpapi.error = e.message;
  }

  // 2. Bắt đầu gọi Google Play Scraper (Vercel)
  let playApp = null;
  try {
    playApp = await gplay.app({
      appId: id, lang: 'vi', country: 'us',
      requestOptions: { headers: { 'Cache-Control': 'no-cache' } }
    });
    debugLog.gplay_scraper.status = "Thành công";
    debugLog.gplay_scraper.version = playApp.version;
  } catch (e) {
    debugLog.gplay_scraper.status = "Lỗi thư viện gplay";
    debugLog.gplay_scraper.error = e.message;
  }

  // 3. Xử lý Logic và Chốt sổ
  if (!playApp) {
    return res.status(200).json({ 
      canh_bao: "Thư viện cào Google Play đã sập hoàn toàn, không có data nền để trả về.", 
      debug_log: debugLog 
    });
  }

  if (serpVersionFinal && isVersionNewer(playApp.version, serpVersionFinal)) {
    playApp.version = serpVersionFinal;
    playApp.sourceLog = `SerpAPI (${serpVersionFinal})`;
    debugLog.ket_luan_cuoi_cung = `SerpAPI cao hơn (${serpVersionFinal} > ${debugLog.gplay_scraper.version}). ĐÃ ĐÁNH TRÁO THÀNH CÔNG!`;
  } else {
    playApp.sourceLog = `Google Play`;
    if (!serpVersionFinal) {
      debugLog.ket_luan_cuoi_cung = "SerpAPI không lấy được version, đành xài của Google Play.";
    } else {
      debugLog.ket_luan_cuoi_cung = `SerpAPI (${serpVersionFinal}) KHÔNG CAO HƠN Google Play (${debugLog.gplay_scraper.version}). Giữ nguyên bản gốc.`;
    }
  }

  // Nhét bảng log vào cuối data để đọc
  playApp.debug_log = debugLog;

  // Trả về HTTP 200 để hiển thị log lên trình duyệt
  res.status(200).json(playApp);
}