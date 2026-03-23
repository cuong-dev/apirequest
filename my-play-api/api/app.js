import gplay from 'google-play-scraper';

// ---------------- VERSION COMPARE ----------------
function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer) return false;

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

// ---------------- BATCHEXECUTE ----------------
async function getVersionFromBatchexecute(appId) {
  try {
    const body = `f.req=[[[\"UsvDTd\",\"[[\\\"${appId}\\\",7]]\",null,\"generic\"]]]`;

    const res = await fetch("https://play.google.com/_/PlayStoreUi/data/batchexecute", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
      },
      body
    });

    const text = await res.text();

    // Regex lấy version (x.y.z hoặc x.y.z.w)
    const match = text.match(/\d+\.\d+(\.\d+)+/);

    return match ? match[0] : null;

  } catch (e) {
    return null;
  }
}

// ---------------- RETRY BATCHEXECUTE ----------------
async function getBatchVersions(appId, retry = 5) {
  const versions = [];

  for (let i = 0; i < retry; i++) {
    const v = await getVersionFromBatchexecute(appId);
    if (v) versions.push(v);

    // delay random tránh bị cache/bucket
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
  }

  return versions;
}

// ---------------- MAIN HANDLER ----------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  const requestOptions = {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0'
    }
  };

  try {
    const countries = ['us', 'vn', 'sg'];

    // ----------- GPLAY -----------
    const gplayPromises = countries.map(country =>
      gplay.app({
        appId: id,
        lang: 'vi',
        country,
        requestOptions
      }).catch(() => null)
    );

    // ----------- BATCHEXECUTE -----------
    const batchPromise = getBatchVersions(id, 5);

    const [gplayResults, batchVersions] = await Promise.all([
      Promise.all(gplayPromises),
      batchPromise
    ]);

    const validGplay = gplayResults.filter(r => r !== null);
    const allVersions = [];

    // lấy version từ gplay
    validGplay.forEach(r => {
      if (r.version) allVersions.push(r.version);
    });

    // thêm version từ batch
    allVersions.push(...batchVersions);

    if (allVersions.length === 0) {
      return res.status(500).json({ error: 'Không lấy được version' });
    }

    // ----------- CHỌN VERSION CAO NHẤT -----------
    let bestVersion = allVersions[0];

    for (let i = 1; i < allVersions.length; i++) {
      if (isVersionNewer(bestVersion, allVersions[i])) {
        bestVersion = allVersions[i];
      }
    }

    // lấy base app info từ gplay (nếu có)
    let bestApp = validGplay[0] || {};
    bestApp.version = bestVersion;

    return res.status(200).json({
      ...bestApp,
      debug: {
        gplayVersions: validGplay.map(r => r.version),
        batchVersions: batchVersions,
        allVersions: allVersions,
        selected: bestVersion
      }
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}