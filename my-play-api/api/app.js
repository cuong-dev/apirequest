import gplay from 'google-play-scraper';

// 1. Hàm so sánh version cực mạnh (Lọc bỏ các chữ cái linh tinh như 'v' hay 'Version')
function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer || oldVer === "N/A" || newVer === "N/A") return false;
  // Làm sạch chuỗi, chỉ giữ lại số và dấu chấm (VD: "v1.0.4" -> "1.0.4")
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

// 2. Hàm cào dữ liệu bí mật từ APKCombo
async function getApkComboVersion(appId) {
  try {
    // Mẹo: Cấu trúc link APKCombo mặc định luôn tự chuyển hướng đúng app ID
    const url = `https://apkcombo.com/vi/a/${appId}/`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36'
      }
    });
    
    if (!res.ok) return null;
    const html = await res.text();

    // Dùng Regex quét HTML của APKCombo để tìm ra version
    // APKCombo thường lưu version ở nhiều định dạng, ta quét bằng nhiều lớp lưới:
    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);

    if (match && match[1]) {
      let ver = match[1].trim();
      ver = ver.replace(/^v/i, '').trim(); // Cắt bỏ chữ 'v' ở đầu nếu có
      return ver;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // 3. Chạy SONG SONG cả 2 trình cào dữ liệu cùng 1 lúc cho nhanh
    const [playApp, apkComboVersion] = await Promise.all([
      // Bot 1: Cào Google Play (Để lấy tên, icon, screenshot, info...)
      gplay.app({
        appId: id,
        lang: 'vi',
        country: 'us',
        requestOptions: {
          headers: {
            'Cache-Control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36'
          }
        }
      }).catch(() => null),
      
      // Bot 2: Cào APKCombo (Chỉ để rình lấy cái Version mới nhất)
      getApkComboVersion(id)
    ]);

    if (!playApp) {
      return res.status(500).json({ error: 'App ID không tồn tại hoặc Google Play chặn.' });
    }

    // 4. So sánh và Cướp ngôi nếu APKCombo có bản mới hơn
    playApp.sourceLog = 'Bản từ Google Play gốc'; // Ghi chú để dễ theo dõi

    if (apkComboVersion && isVersionNewer(playApp.version, apkComboVersion)) {
      playApp.version = apkComboVersion; // Thay lõi version bằng bản của APKCombo
      playApp.sourceLog = `Đã dùng bản săn từ APKCombo (${apkComboVersion})`;
    }

    // 5. Trả về kết quả hoàn hảo cho Google Sheet
    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}