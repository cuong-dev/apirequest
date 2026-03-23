import gplay from 'google-play-scraper';

// 1. Hàm so sánh version (Logic cốt lõi)
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

// 2. Hàm săn version từ UpToDown (Né Cloudflare bằng Browser Header)
async function getVersionFromUpToDown(appId) {
  try {
    const searchUrl = `https://www.uptodown.com/android/search/${appId}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Quét số version trong HTML của UpToDown
    // Thường nằm trong các thẻ class "version" hoặc "last"
    const match = html.match(/class="version">([^<]+)</i)
               || html.match(/<div class="last">([^<]+)</i)
               || html.match(/([0-9]+\.[0-9]+(?:\.[0-9]+)+)/);

    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

// 3. Hàm gọi Aptoide API (Phương án 2)
async function getVersionFromAptoide(appId) {
  try {
    const res = await fetch(`https://ws75.aptoide.com/api/7/app/getMeta?package_name=${appId}`);
    const data = await res.json();
    if (data.nodes?.meta?.data?.file) return data.nodes.meta.data.file.vername;
    return null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Kích hoạt 3 nòng súng cùng lúc
    const [playApp, upVer, aptVer] = await Promise.all([
      gplay.app({ appId: id, lang: 'vi', country: 'us' }).catch(() => null),
      getVersionFromUpToDown(id),
      getVersionFromAptoide(id)
    ]);

    if (!playApp) return res.status(404).json({ error: 'App không tồn tại' });

    let bestVer = playApp.version;
    let source = "Google Play Gốc";

    // So sánh: UpToDown vs Aptoide vs Google Play
    if (upVer && isVersionNewer(bestVer, upVer)) {
      bestVer = upVer;
      source = "UpToDown";
    }
    if (aptVer && isVersionNewer(bestVer, aptVer)) {
      bestVer = aptVer;
      source = "Aptoide API";
    }

    playApp.version = bestVer;
    playApp.recentChanges = (playApp.recentChanges || "") + `\n\n[🚀 Nguồn: ${source}]`;

    res.status(200).json(playApp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}