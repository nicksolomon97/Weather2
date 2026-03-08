const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800, H = 480;

const API_URL = "https://api.open-meteo.com/v1/forecast" +
  "?latitude=40.74353280033631&longitude=-74.00675113622488" +
  "&hourly=temperature_2m,precipitation,weathercode" +
  "&current_weather=true&timezone=America%2FNew_York&temperature_unit=fahrenheit";

function getCurrentLocalHour() {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  local.setMinutes(0, 0, 0);
  return local.getTime();
}

function formatUpdated() {
  return "Updated " + new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric"
  });
}

// WMO weather code → condition label
function wmoCondition(code) {
  if (code === 0)                return "Clear";
  if (code <= 2)                 return "Partly Cloudy";
  if (code === 3)                return "Overcast";
  if (code >= 51 && code <= 55)  return "Drizzle";
  if (code >= 61 && code <= 65)  return "Rain";
  if (code >= 71 && code <= 75)  return "Snow";
  if (code === 77)               return "Snow";
  if (code >= 80 && code <= 82)  return "Showers";
  if (code >= 85 && code <= 86)  return "Snow";
  if (code >= 95)                return "Thunderstorm";
  return "Cloudy";
}

// Catmull-Rom spline
function catmull(pts, seg = 24) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3);
      const y = 0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3);
      out.push([x, y]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

async function main() {
  const res  = await fetch(API_URL);
  const data = await res.json();

  const currentTemp = Math.round(data.current_weather.temperature);
  const currentCode = data.current_weather.weathercode;
  const condition   = wmoCondition(currentCode);

  const currentHour = getCurrentLocalHour();
  const hourOfDay   = new Date(currentHour).getHours();

  const hourlyTS     = data.hourly.time.map(t => new Date(t).getTime());
  const hourlyTemps  = data.hourly.temperature_2m;
  const hourlyPrecip = data.hourly.precipitation;
  const hourlyCodes  = data.hourly.weathercode;

  let start = hourlyTS.findIndex(t => t >= currentHour);
  if (start === -1) start = 0;

  const tempSeries   = hourlyTemps .slice(start, start + 12);
  const precipSeries = hourlyPrecip.slice(start, start + 12);
  const codeSeries   = hourlyCodes .slice(start, start + 12);
  const hours        = hourlyTS    .slice(start, start + 12);

  // Per-hour condition type for labelling
  const precipType = codeSeries.map(c => {
    if (c >= 71 && c <= 77) return "Snow";
    if (c >= 95)            return "Storm";
    if (c >= 51)            return "Rain";
    return "";
  });

  const highTemp = Math.round(Math.max(...tempSeries));
  const lowTemp  = Math.round(Math.min(...tempSeries));

  const xLabels = hours.map(ts => {
    const d = new Date(ts);
    const h = d.getHours() % 12 || 12;
    return `${h}${d.getHours() < 12 ? 'A' : 'P'}`;
  });

  // ── Canvas setup ────────────────────────────────────────────────────────────
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── Fonts (system monospace — always available on Ubuntu) ───────────────────
  const F = {
    xs:   '9px monospace',
    sm:   '10px monospace',
    smb:  'bold 10px monospace',
    md:   '11px monospace',
    mdb:  'bold 11px monospace',
    lgb:  'bold 13px monospace',
    titb: 'bold 15px sans-serif',
    big:  'bold 72px sans-serif',
  };

  function textW(text, font) {
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  // ── LEFT PANEL ──────────────────────────────────────────────────────────────
  const LP = 30, LW = 185;

  ctx.font = F.titb; ctx.fillStyle = '#000000'; ctx.textAlign = 'left';
  ctx.fillText('New York', LP, 46);

  ctx.font = F.md; ctx.fillStyle = '#888888';
  ctx.fillText(condition, LP, 64);

  ctx.font = F.big; ctx.fillStyle = '#000000';
  ctx.fillText(`${currentTemp}°`, LP - 4, 156);

  // H / L
  ctx.font = F.lgb; ctx.fillStyle = '#333333';
  ctx.fillText(`H:${highTemp}°`, LP, 178);
  ctx.fillText(`L:${lowTemp}°`,  LP + 76, 178);

  // Divider
  ctx.strokeStyle = '#eeeeee'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LP, 192); ctx.lineTo(LW - 8, 192); ctx.stroke();

  // Stats
  const stats = [
    ['FEELS LIKE', `${currentTemp - 3}°`],
    ['HUMIDITY',   '62%'],
    ['WIND',       '8 mph'],
  ];
  let sy = 208;
  for (const [label, val] of stats) {
    ctx.font = F.xs; ctx.fillStyle = '#aaaaaa';
    ctx.fillText(label, LP, sy);
    ctx.font = F.mdb; ctx.fillStyle = '#222222';
    ctx.fillText(val, LP, sy + 14);
    sy += 42;
  }

  ctx.font = F.xs; ctx.fillStyle = '#cccccc';
  ctx.fillText(formatUpdated(), LP, H - 22);

  // Panel separator
  ctx.strokeStyle = '#eeeeee'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LW, 20); ctx.lineTo(LW, H - 20); ctx.stroke();

  // ── CHART BOUNDS ────────────────────────────────────────────────────────────
  const CL = LW + 44;
  const CR = W - 58;   // leaves 58px right margin — enough for precip labels
  const CT = 48;
  const CB = H - 72;   // leaves 72px below for x-labels + legend
  const CW = CR - CL;
  const CH = CB - CT;
  const N  = tempSeries.length;

  const tPad    = Math.max(5, Math.round((Math.max(...tempSeries) - Math.min(...tempSeries)) * 0.3));
  const tempMin = Math.floor((Math.min(...tempSeries) - tPad) / 5) * 5;
  const tempMax = Math.ceil( (Math.max(...tempSeries) + tPad) / 5) * 5;
  const precMax = Math.max(Math.max(...precipSeries) * 1.8, 0.4);

  const ty  = t => CB - ((t - tempMin) / (tempMax - tempMin)) * CH;
  const py  = p => CB - (p / precMax) * CH;
  const ix  = i => CL + (i / (N - 1)) * CW;

  // Section header
  ctx.font = F.sm; ctx.fillStyle = '#aaaaaa'; ctx.textAlign = 'left';
  ctx.fillText('HOURLY FORECAST', CL, 34);

  // ── Horizontal grid ─────────────────────────────────────────────────────────
  for (let t = tempMin; t <= tempMax; t += 5) {
    const y = Math.round(ty(t));
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(CL, y); ctx.lineTo(CR, y); ctx.stroke();
    ctx.font = F.sm; ctx.fillStyle = '#bbbbbb'; ctx.textAlign = 'right';
    ctx.fillText(`${t}°`, CL - 8, y + 4);
  }

  // Bottom axis line
  ctx.strokeStyle = '#dddddd'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CL, CB); ctx.lineTo(CR, CB); ctx.stroke();

  // ── X-axis labels ────────────────────────────────────────────────────────────
  for (let i = 0; i < N; i++) {
    const x   = Math.round(ix(i));
    const fnt = i % 2 === 0 ? F.mdb : F.md;
    const col = i % 2 === 0 ? '#666666' : '#aaaaaa';
    ctx.font = fnt; ctx.fillStyle = col; ctx.textAlign = 'center';
    ctx.fillText(xLabels[i], x, CB + 18);
  }

  // ── Precip right-axis ────────────────────────────────────────────────────────
  ctx.font = F.xs; ctx.fillStyle = '#cccccc'; ctx.textAlign = 'left';
  ctx.fillText('in.', CR + 8, CT + 2);
  for (const p of [0.1, 0.25, 0.5]) {
    if (p > precMax * 0.95) continue;
    ctx.fillText(`${p}"`, CR + 8, Math.round(py(p)) + 4);
  }

  // ── Precip bars ──────────────────────────────────────────────────────────────
  const barW = Math.max(7, (CW / N) * 0.28);
  for (let i = 0; i < N; i++) {
    const p = precipSeries[i];
    if (p <= 0.001) continue;
    const x   = ix(i);
    const top = py(p);
    const bh  = CB - top;
    if (bh < 1) continue;
    ctx.fillStyle   = '#d5e8f5';
    ctx.strokeStyle = '#aacce8';
    ctx.lineWidth   = 1;
    ctx.fillRect(  x - barW / 2, top, barW, bh);
    ctx.strokeRect(x - barW / 2, top, barW, bh);
  }

  // ── Condition pill labels (Rain / Snow / Storm) ──────────────────────────────
  let i = 0;
  while (i < N) {
    const cond = precipType[i];
    if (!cond) { i++; continue; }
    let j = i;
    while (j < N && precipType[j] === cond) j++;
    const midX  = (ix(i) + ix(j - 1)) / 2;
    const topPs = [];
    for (let k = i; k < j; k++) topPs.push(py(precipSeries[k]));
    let topY = Math.min(...topPs) - 14;
    topY = Math.max(CT + 4, topY);

    ctx.font = F.xs;
    const lw  = ctx.measureText(cond).width;
    const pad = 5;
    const rx  = midX - lw / 2 - pad;
    const ry  = topY - 2;
    const rw  = lw + pad * 2;
    const rh  = 13;
    const r   = 3;

    // Rounded rect pill
    ctx.fillStyle   = '#e8f4fd';
    ctx.strokeStyle = '#aacce8';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
    ctx.lineTo(rx + r, ry + rh);
    ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
    ctx.lineTo(rx, ry + r);
    ctx.arcTo(rx, ry, rx + r, ry, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#4488bb'; ctx.textAlign = 'center';
    ctx.fillText(cond, midX, topY + 8);
    i = j;
  }

  // ── Smooth temp curve ────────────────────────────────────────────────────────
  const raw    = tempSeries.map((t, i) => [ix(i), ty(t)]);
  const smooth = catmull(raw, 24);

  // Gradient area fill
  for (let row = Math.floor(CT); row < Math.floor(CB); row++) {
    const alphaF = 1 - (row - CT) / CH;
    const shade  = Math.round(235 + 18 * alphaF);
    const xs = [];
    for (let k = 0; k < smooth.length - 1; k++) {
      const [x1, y1] = smooth[k], [x2, y2] = smooth[k + 1];
      if (Math.min(y1, y2) <= row && row <= Math.max(y1, y2) && Math.abs(y2 - y1) > 0.001) {
        const t_ = (row - y1) / (y2 - y1);
        xs.push(x1 + t_ * (x2 - x1));
      }
    }
    if (xs.length) {
      const hex = shade.toString(16).padStart(2, '0');
      ctx.strokeStyle = `#${hex}${hex}${hex}`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(Math.min(...xs)), row);
      ctx.lineTo(Math.round(CR), row);
      ctx.stroke();
    }
  }

  // White halo + line
  ctx.lineJoin = 'round'; ctx.setLineDash([]);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
  ctx.beginPath();
  smooth.forEach(([x, y], k) => k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  ctx.strokeStyle = '#111111'; ctx.lineWidth = 2;
  ctx.beginPath();
  smooth.forEach(([x, y], k) => k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  // Dots + temp labels (every other point)
  for (let i = 0; i < N; i += 2) {
    const x = Math.round(ix(i)), y = Math.round(ty(tempSeries[i])), r = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#222222'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = F.mdb; ctx.fillStyle = '#222222'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(tempSeries[i])}°`, x, y - 10);
  }

  // ── Legend (well below x-labels) ─────────────────────────────────────────────
  const LY = CB + 44;
  ctx.textAlign = 'left';

  // Temp
  let lx = CL;
  ctx.strokeStyle = '#111111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, LY + 5); ctx.lineTo(lx + 20, LY + 5); ctx.stroke();
  ctx.beginPath(); ctx.arc(lx + 10, LY + 5, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = '#222222'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = F.sm; ctx.fillStyle = '#888888';
  ctx.fillText('Temperature', lx + 28, LY + 9);

  // Precip
  lx = CL + 150;
  ctx.fillStyle = '#d5e8f5'; ctx.strokeStyle = '#aacce8'; ctx.lineWidth = 1;
  ctx.fillRect(lx, LY, 12, 12); ctx.strokeRect(lx, LY, 12, 12);
  ctx.font = F.sm; ctx.fillStyle = '#888888';
  ctx.fillText('Precipitation', lx + 18, LY + 9);

  // Condition
  lx = CL + 310;
  ctx.fillStyle = '#e8f4fd'; ctx.strokeStyle = '#aacce8'; ctx.lineWidth = 1;
  ctx.fillRect(lx, LY, 28, 12); ctx.strokeRect(lx, LY, 28, 12);
  ctx.font = F.xs; ctx.fillStyle = '#4488bb'; ctx.textAlign = 'center';
  ctx.fillText('Rain', lx + 14, LY + 9);
  ctx.font = F.sm; ctx.fillStyle = '#888888'; ctx.textAlign = 'left';
  ctx.fillText('Condition', lx + 34, LY + 9);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const out = fs.createWriteStream('weather.png');
  canvas.createPNGStream().pipe(out);
  out.on('finish', () => console.log('Done: weather.png saved'));
}

main().catch(err => { console.error(err); process.exit(1); });
