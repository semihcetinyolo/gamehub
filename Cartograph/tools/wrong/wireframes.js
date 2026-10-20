// Wireframes for the "wrong full board" display, drawn on the real cactus level.
// node tools/wrong/wireframes.js   → tools/wrong/wireframes.html
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
require('../../stained-levels.js');
const L = window.CARTO_STAINED[1];
const { map } = L;

// Two realistic slips: each pane painted in its neighbour's colour.
const fill = L.solution.slice();
fill[24] = L.solution[30];
fill[0] = L.solution[10];
const clashes = map.edges.filter(e => fill[e[4]] === fill[e[5]]);
const pairs = [...new Set(clashes.map(e => `${e[4]}-${e[5]}`))].map(k => {
  const [a, b] = k.split('-').map(Number);
  const segs = clashes.filter(e => e[4] === a && e[5] === b);
  const mid = segs[Math.floor(segs.length / 2)];
  return { a, b, segs, at: [(mid[0] + mid[2]) / 2, (mid[1] + mid[3]) / 2] };
});
const wrongPanes = [...new Set(pairs.flatMap(p => [p.a, p.b]))];
const seamD = segs => segs.map(e => `M${e[0]} ${e[1]}L${e[2]} ${e[3]}`).join('');
const shade = (hex, k) => '#' + [1, 3, 5].map(i => {
  const v = parseInt(hex.slice(i, i + 2), 16);
  return Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k).toString(16).padStart(2, '0');
}).join('');

function board(kind, uid) {
  const W = map.cols, H = map.rows;
  let defs = `<clipPath id="shape${uid}"><path d="${map.shape}"/></clipPath>`;
  L.palette.forEach((c, i) => {
    defs += `<pattern id="st${uid}${i}" width=".24" height=".24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".065" height=".24" fill="${shade(c, -0.2)}"/></pattern>`;
  });
  let body = '';
  for (let r = 0; r < map.count; r++) {
    body += `<path d="${map.paths[r]}" fill="${L.palette[fill[r]]}"/>`;
    if (L.given[r] >= 0) body += `<path d="${map.paths[r]}" fill="url(#st${uid}${L.given[r]})"/>`;
  }
  const lead = `<path d="${map.edgePath}" fill="none" stroke="#3a4234" stroke-width=".12" stroke-linecap="round" stroke-linejoin="round"/>`;
  let over = '', top = '';
  if (kind === 'now') {
    for (const r of wrongPanes) over += `<path d="${map.paths[r]}" fill="#e2343f" opacity=".42"/>`;
    top += `<path d="${seamD(clashes)}" stroke="#e2343f" stroke-width=".26" stroke-linecap="round" fill="none"/>`;
    for (const r of wrongPanes) {
      const [x, y] = map.anchors[r];
      top += `<g transform="translate(${x} ${y})"><circle r=".32" fill="#fff" stroke="#e2343f" stroke-width=".09"/><path d="M-.12 -.12L.12 .12M.12 -.12L-.12 .12" stroke="#e2343f" stroke-width=".09" stroke-linecap="round"/></g>`;
    }
  }
  if (kind === 'spot' || kind === 'seal') {
    defs += `<mask id="m${uid}"><rect width="${W}" height="${H}" fill="#fff"/>${wrongPanes.map(r => `<path d="${map.paths[r]}" fill="#000"/>`).join('')}</mask>`;
    over += `<rect width="${W}" height="${H}" fill="#14201a" opacity="${kind === 'spot' ? 0.62 : 0.28}" mask="url(#m${uid})"/>`;
  }
  if (kind === 'spot') {
    defs += `<filter id="g${uid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".14"/></filter>`;
    for (const p of pairs) {
      top += `<path d="${seamD(p.segs)}" stroke="#ffd36a" stroke-width=".5" stroke-linecap="round" fill="none" filter="url(#g${uid})"/>`;
      top += `<path d="${seamD(p.segs)}" stroke="#fff3c4" stroke-width=".14" stroke-linecap="round" fill="none"/>`;
    }
    pairs.forEach((p, i) => { top += placeholder(p.at, 0.78, 'lens', i === 0); });
  }
  if (kind === 'crack') {
    for (const p of pairs) {
      const [cx, cy] = p.at;
      let lines = '';
      for (let k = 0; k < 9; k++) {
        const a = k * 0.7 + 0.3; let x = cx, y = cy, d = `M${cx} ${cy}`;
        for (let s = 0; s < 4; s++) { x += Math.cos(a + (s % 2 ? .35 : -.3)) * 0.42; y += Math.sin(a + (s % 2 ? .35 : -.3)) * 0.42; d += `L${x.toFixed(2)} ${y.toFixed(2)}`; }
        lines += `<path d="${d}"/>`;
      }
      defs += `<clipPath id="c${uid}${p.a}"><path d="${map.paths[p.a]}"/><path d="${map.paths[p.b]}"/></clipPath>`;
      over += `<g clip-path="url(#c${uid}${p.a})" fill="none" stroke="#fff" stroke-width=".06" stroke-linecap="round" opacity=".95">${lines}</g>`;
      over += `<g clip-path="url(#c${uid}${p.a})"><rect x="${cx - 1.6}" y="${cy - 1.6}" width="3.2" height="3.2" fill="none" stroke="#7b5ea8" stroke-width=".06" stroke-dasharray=".18 .12"/></g>`;
    }
    top += `<text x="${pairs[0].at[0] + 0.2}" y="${pairs[0].at[1] - 1.1}" class="tag">wrong-crack</text>`;
  }
  if (kind === 'seal') {
    for (const p of pairs) top += `<path d="${seamD(p.segs)}" stroke="#faf3df" stroke-width=".1" stroke-dasharray=".2 .16" stroke-linecap="round" fill="none"/>`;
    pairs.forEach((p, i) => { top += placeholder(p.at, 0.72, 'seal', i === 0); });
  }
  return `<svg viewBox="-0.3 -0.3 ${W + 0.6} ${H + 0.6}" class="board" role="img" aria-label="Kaktüs bölümü, ${pairs.length} hatalı komşuluk">
<defs>${defs}</defs><g clip-path="url(#shape${uid})">${body}${over}${lead}</g>
<path d="${map.shape}" fill="none" stroke="#3a4234" stroke-width=".22"/>${top}</svg>`;
}

// Dashed stand-in for a picture that Astra will make.
function placeholder([x, y], r, kind, label) {
  const fillC = kind === 'seal' ? '#a3242b' : '#c9a24e';
  const inner = kind === 'seal'
    ? `<circle r="${r}" fill="${fillC}" stroke="#5d1015" stroke-width=".06"/><path d="M0 -.34L.09 -.09L.34 0L.09 .09L0 .34L-.09 .09L-.34 0L-.09 -.09Z" fill="#f2b8a8" opacity=".85"/>`
    : `<circle r="${r}" fill="rgba(255,255,255,.18)" stroke="${fillC}" stroke-width=".16"/><path d="M${r * 0.7} ${r * 0.7}l.45 .45" stroke="${fillC}" stroke-width=".22" stroke-linecap="round"/>`;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${inner}<circle r="${r + 0.14}" fill="none" stroke="#7b5ea8" stroke-width=".06" stroke-dasharray=".16 .1"/>${label ? `<text x="${r + 0.25}" y="-${r}" class="tag">wrong-${kind}</text>` : ''}</g>`;
}

const ICONS = { spot: 'wrong-lens', crack: 'icon-clash', seal: 'wrong-seal' };
function phone(kind, uid) {
  const banner = kind === 'now'
    ? `<div class="hintline">KOMŞU BÖLGELER, FARKLI RENKLER</div><div class="toast-now">Yanlış çözüm: kırmızı sınırlı 3 bölge komşusuyla aynı renk</div>`
    : `<div class="banner"><span class="ph ph-icon">${ICONS[kind]}</span><span class="bt"><b>Aynı renk yan yana</b><small>${pairs.length} yerde, düzeltince kaybolur</small></span><span class="step"><i>‹</i>1/${pairs.length}<i>›</i></span></div>`;
  return `<div class="phone"><div class="ph-top"><span class="sq"></span><span class="ttl"><small>CARTOGRAPH</small>SEVİYE 2</span><span class="sq"></span></div>
<div class="ph-board">${board(kind, uid)}</div>${banner}
<div class="dock"><div class="pills"><span>İPUCU</span><span>NOTLARI BOYA</span></div><div class="dots">${L.palette.map(c => `<span style="background:${c}"></span>`).join('')}</div></div></div>`;
}

const OPTIONS = [
  ['now', 'Şimdiki', 'Neden çirkin', [
    'Neon kırmızı çizgi kurşun hattın üstüne biniyor ve sürekli yanıp sönüyor; vitray dokusuyla hiç uyuşmuyor.',
    'Kırmızı ton koyu camda (mavi, yeşil) neredeyse görünmüyor, açık camda pembeye dönüyor.',
    'Kırmızı ✕ rozetleri her hatalı bölgenin ortasına basılıyor; hangi iki bölgenin çakıştığını söylemiyor.',
    'Uyarı yazısı iki satıra taşıyor, alttaki ipucu satırının ve yakınlaştırma düğmesinin üstüne biniyor.',
  ]],
  ['spot', 'A · Spot ışığı + büyüteç', 'En net bulunan', [
    'Tahta dolunca hafif sarsılır, sonra çakışan iki bölge dışındaki her şey %60 kararır.',
    'İki bölgenin ortak kenarı altın renkte yumuşak bir ışıkla parlar (bir kez yanar, yanıp sönmez).',
    'Ortak kenarın ortasına pirinç bir büyüteç (wrong-lens) iner.',
    'Alttaki şerit ‹ › ile çakışmalar arasında gezdirir; yakınlaştırma o yere kayar.',
    'Herhangi bir bölgeye dokununca karartma kalkar, işaretler düzelene kadar kalır.',
  ]],
  ['crack', 'B · Çatlak cam', 'En "oyunsu"', [
    'Çakışan kenarın ortasından iki bölgeye doğru beyaz çatlaklar yayılır (wrong-crack, cam çıtırtısı sesi).',
    'Renkler örtülmez; oyuncu iki bölgenin aynı renk olduğunu kendi görür.',
    'Bölgelerden biri yeniden boyanınca çatlak kırılarak dağılır.',
    'Şerit A ile aynı; ikon olarak iki cam parçası (icon-clash).',
    'Risk: çatlak çok küçük bölgede okunmayabilir, çok büyükte gürültülü durabilir.',
  ]],
  ['seal', 'C · Mühür + hafif karartma', 'Önerim', [
    'Çakışan kenarın ortasına kırmızı bir mum mühür basılır (wrong-seal); kartografya temasına oturur.',
    'Kenar boyunca krem renk kesik çizgi: "bu iki bölge" der, kurşun hattı kaybolmaz.',
    'Geri kalan tahta %25 kararır; renkler hâlâ okunur, hata yine de ilk bakışta bulunur.',
    'Mühür basılma hareketiyle gelir (büyükten küçüğe + gölge), bir kez; sonra sabit durur.',
    'Şerit aynı; mühür ikonu şeritte de kullanılır, yani tek görsel yeter.',
  ]],
];

const STYLE_UI = 'STYLE: polished mobile-game UI asset for CARTOGRAPH, a stained-glass map-colouring puzzle with an antique cartographer theme (brass instruments, parchment, wax seals). Soft studio lighting, gentle highlights, crisp clean edges that still read at 40 px. Palette around deep forest green #294f43, parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70, crimson #a3242b. Straight-on view. No text, letters, numbers, logos or watermark; no mockup, no background scene, no cast shadow outside the object. Transparent background (PNG with alpha).';
const ASSETS = [
  ['wrong-seal', 'C', 'Hatalı kenarın ortasına basılan mum mühür; şeritteki ikon da bu', '1024×1024, şeffaf', '~44 px',
    'A single round red wax seal seen straight from above: glossy deep crimson wax with an irregular poured rim and a few soft drips at the edge, stamped in the centre with a small embossed eight-pointed compass rose (no letters). Centred, filling about 85% of the canvas.'],
  ['wrong-lens', 'A', 'Hatalı kenarın üstüne inen büyüteç; şeritteki ikon da bu', '1024×1024, şeffaf', '~48 px',
    'A small antique brass magnifying glass: a round lens with a thick polished brass rim and a short brass handle pointing to the lower right. The lens glass is clear with only a faint highlight so whatever is behind it stays visible. Centred, filling about 85% of the canvas.'],
  ['wrong-crack', 'B', 'Çakışan iki bölgeye yayılan çatlak deseni (bölgeye kırpılır)', '1024×1024, şeffaf', 'bölge boyu',
    'A cracked-glass overlay only: thin bright white hairline fractures with faint pale-blue edges radiating from a small impact point exactly in the centre, a few longer cracks reaching towards the edges and a couple of short rings around the impact. Nothing else in the image, the rest fully transparent.'],
  ['icon-clash', 'B', 'Şeritteki ikon: aynı renkte iki cam parçası, değdikleri yerde kıvılcım', '1024×1024, şeffaf', '~40 px',
    'Two small stained-glass shards of the same amber colour with dark lead edges, touching along one side, with a tiny bright white spark where they meet. Centred, filling about 80% of the canvas.'],
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yanlış Çözüm Wireframe</title>
<style>
:root{--bg:#f3eedf;--card:#fffaf0;--ink:#24352d;--mute:#6b6f5e;--line:#d8cfb8;--accent:#294f43;--tag:#7b5ea8}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b211d;--card:#252c27;--ink:#ece6d4;--mute:#a7a894;--line:#3b4339;--accent:#8fc2a7}}
:root[data-theme="dark"]{--bg:#1b211d;--card:#252c27;--ink:#ece6d4;--mute:#a7a894;--line:#3b4339;--accent:#8fc2a7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1320px;margin:0 auto;padding:28px 16px 60px}h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:44px 0 12px}
.lead{color:var(--mute);max-width:760px;margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px;margin-top:22px}
.opt{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px}
.opt.rec{border:2px solid var(--accent)}.opt h3{margin:0;font-size:16px}.opt .kick{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.opt.rec .kick{color:var(--accent);font-weight:700}.opt ul{margin:0;padding-left:18px;font-size:14px}.opt li{margin:4px 0}
.phone{width:100%;max-width:270px;margin:0 auto;aspect-ratio:9/19;background:#efe9d8;border:3px solid #2b2f2a;border-radius:30px;padding:12px 10px;display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden;color:#24352d}
.ph-top{display:flex;justify-content:space-between;align-items:center}.ph-top .sq{width:26px;height:26px;border-radius:8px;background:#ddd5c0}
.ttl{text-align:center;font-weight:800;font-size:13px;line-height:1.1}.ttl small{display:block;font-size:7px;letter-spacing:.2em;color:#7d8572}
.ph-board{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}.board{height:100%;max-width:100%}
.tag{font:600 .42px system-ui;fill:var(--tag)}
.hintline{font-size:7px;letter-spacing:.12em;text-align:center;color:#7d8572;font-weight:700}
.toast-now{position:absolute;left:10px;right:10px;bottom:96px;background:rgba(60,66,58,.55);color:#fff;font-size:10px;font-weight:700;text-align:center;padding:6px 8px;border-radius:8px}
.banner{display:flex;align-items:center;gap:8px;background:#faf3df;border:1.5px solid #c9a24e;border-radius:12px;padding:6px 8px;box-shadow:0 2px 0 #b89548}
.banner .bt{flex:1;line-height:1.15}.banner b{font-size:11px;display:block}.banner small{font-size:8.5px;color:#6b6f5e}
.step{font-size:10px;font-weight:700;display:flex;align-items:center;gap:4px}.step i{font-style:normal;width:20px;height:20px;border-radius:6px;background:#294f43;color:#faf3df;display:grid;place-items:center;font-size:13px}
.ph{border:1.5px dashed var(--tag);color:var(--tag);font:600 7px/1.1 system-ui;display:grid;place-items:center;text-align:center;border-radius:50%}
.ph-icon{width:30px;height:30px;flex:none}
.dock{background:#2f4d3f;border-radius:14px 14px 18px 18px;padding:8px;margin:0 -10px -12px}
.pills{display:flex;gap:6px;margin-bottom:8px}.pills span{flex:1;background:#d9cfae;border-radius:8px;font-size:8px;font-weight:800;text-align:center;padding:6px 0;color:#2f4d3f}
.dots{display:flex;justify-content:space-around}.dots span{width:34px;height:34px;border-radius:50%;box-shadow:inset 0 -3px 0 rgba(0,0,0,.2)}
.legend{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--mute);margin-top:10px}.legend i{width:22px;height:14px;border:1.5px dashed var(--tag);border-radius:4px}
.shared{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 20px}.shared ul{margin:0;padding-left:18px}
.tbl{width:100%;border-collapse:collapse;background:var(--card);border-radius:14px;overflow:hidden;font-size:14px}
.tbl th,.tbl td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}.tbl code{font-weight:700}
.wrap{overflow-x:auto}.prompt{margin-top:6px;font-size:12.5px;color:var(--mute);white-space:pre-wrap}
button.copy{font:600 12px system-ui;background:var(--accent);color:var(--card);border:0;border-radius:8px;padding:6px 10px;cursor:pointer}
@media (max-width:640px){.tbl th:nth-child(4),.tbl td:nth-child(4),.tbl th:nth-child(5),.tbl td:nth-child(5){display:none}}
</style></head><body><main>
<h1>Yanlış çözüm gösterimi</h1>
<p class="lead">Tahta dolup da çözüm yanlış olunca ne göreceğimizin wireframe'leri. Hepsi gerçek 2. bölüm (kaktüs) üzerinde, iki hata ile çizildi: sol kenarda ve sağ üstte birer bölge komşusuyla aynı renk.</p>
<div class="legend"><i></i>Mor kesik çizgili yerler Astra'dan gelecek görseller; şimdilik yer tutucu.</div>
<div class="grid">
${OPTIONS.map(([k, t, kick, bullets], i) => `<section class="opt${k === 'seal' ? ' rec' : ''}"><div><div class="kick">${kick}</div><h3>${t}</h3></div>${phone(k, i)}<ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul></section>`).join('\n')}
</div>
<h2>Hangisi seçilirse seçilsin</h2>
<div class="shared"><ul>
<li>İşaret <b>bölgeye değil, iki bölgenin ortak kenarına</b> konur: "şu ikisi aynı renk" doğrudan okunur.</li>
<li>Sürekli yanıp sönme yok. Bir kez hareketle gelir, sonra sakin durur.</li>
<li>Uyarı yazısı gelip giden toast olmaktan çıkar, alttaki ipucu satırının yerine oturan kalıcı bir şerit olur; zoom düğmesinin üstüne binmez.</li>
<li>‹ › çakışmalar arasında gezdirir ve yakınlaştırılmış tahtayı o yere kaydırır.</li>
<li>Bir çakışma düzeltilince onun işareti kendi hareketiyle kalkar, sayı azalır; hepsi bitince şerit kapanır, bölüm biter.</li>
</ul></div>
<h2>Astra'dan istenecek görseller</h2>
<p class="lead">Sadece seçilen seçeneğin görselleri gerekiyor (C için tek görsel). Şerit, kesik çizgi, karartma ve ışık CSS/SVG ile çiziliyor.</p>
<div class="wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Dosya</th><th>Seçenek</th><th>Ne</th><th>Üretim</th><th>Oyunda</th></tr></thead><tbody>
${ASSETS.map(([n, o, what, size, inGame, prompt]) => `<tr><td><code>${n}</code><br><button class="copy" data-p="${esc(prompt + '\n\n' + STYLE_UI)}">Prompt'u kopyala</button></td><td>${o}</td><td>${what}<div class="prompt">${esc(prompt)}</div></td><td>${size}</td><td>${inGame}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="lead" style="margin-top:10px">Her prompt'un sonuna ortak stil satırı eklenerek kopyalanır. Referans olarak uygulama ikonunu (<code>assets/app-icon.png</code>) ver. Dosyalar <code>assets/wrong/src/</code> içine bu adlarla kaydedilir.</p>
</main><script>
document.querySelectorAll('button.copy').forEach(b => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.p); b.textContent = 'Kopyalandı'; } catch { b.textContent = 'Kopyalanamadı'; }
  setTimeout(() => { b.textContent = "Prompt'u kopyala"; }, 1500);
}));
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, 'wireframes.html'), html);
console.log(`wireframes.html: ${pairs.length} clashes, ${(html.length / 1024).toFixed(0)} KB`);
