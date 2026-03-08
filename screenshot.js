const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800, H = 480;

const API_URL = "https://api.open-meteo.com/v1/forecast?latitude=40.74353280033631&longitude=-74.00675113622488&hourly=temperature_2m,precipitation&daily=temperature_2m_max,temperature_2m_min&current_weather=true&timezone=America%2FNew_York&temperature_unit=fahrenheit";

function getCurrentLocalHour() {
  const now = new Date();
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  localNow.setMinutes(0, 0, 0);
  return localNow.getTime();
}

function formatUpdated() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric"
  });
}

// Catmull-Rom spline for smooth curve
function catmullRomPoints(points, segments = 16) {
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    for (let t = 0; t < segments; t++) {
      const s = t / segments;
      const s2 = s * s, s3 = s2 * s;
      const x = 0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*s + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*s2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*s3);
      const y = 0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*s + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*s2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*s3);
      result.push([x, y]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

async function main() {
  const res = await fetch(API_URL);
  const data = await res.json();

  const currentTemp = Math.round(data.current_weather.temperature);
  const currentHour = getCurrentLocalHour();
  const hourOfDay = new Date(currentHour).getHours();

  const hourlyTimestamps = data.hourly.time.map(t => new Date(t).getTime());
  const hourlyTemps = data.hourly.temperature_2m;
  const hourlyPrecip = data.hourly.precipitation;

  let startIndex = hourlyTimestamps.findIndex(t => t >= currentHour);
  if (startIndex === -1) startIndex = 0;

  const tempSeries = hourlyTemps.slice(startIndex, startIndex + 12);
  const precipSeries = hourlyPrecip.slice(startIndex, startIndex + 12);
  const hours = hourlyTimestamps.slice(startIndex, startIndex + 12);

  let highTemp, lowTemp;
  if (hourOfDay >= 18) {
    const remaining = hourlyTemps.slice(startIndex);
    highTemp = Math.round(Math.max(...remaining));
    lowTemp = Math.round(Math.min(...remaining));
  } else {
    highTemp = Math.round(Math.max(...tempSeries));
    lowTemp = Math.round(Math.min(...tempSeries));
  }

  const xLabels = hours.map(ts => {
    const d = new Date(ts);
    const h = d.getHours() % 12 || 12;
    const ap = d.getHours() < 12 ? 'A' : 'P';
    return `${h}${ap}`;
  });

  // ── Canvas ────────────────────────────────────────────────────────────────
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // ── Layout constants ──────────────────────────────────────────────────────
  const LEFT_W = 190;       // left panel width
  const PAD = 32;

  // Chart area
  const CL = LEFT_W + 48;
  const CR = W - 32;
  const CT = 52;
  const CB = H - 52;
  const CW = CR - CL;
  const CH = CB - CT;

  // Scales
  const tRange = Math.max(...tempSeries) - Math.min(...tempSeries);
  const tPad = Math.max(4, Math.round(tRange * 0.25));
  const tempMin = Math.floor((Math.min(...tempSeries) - tPad) / 5) * 5;
  const tempMax = Math.ceil((Math.max(...tempSeries) + tPad) / 5) * 5;
  const precipMax = Math.max(Math.max(...precipSeries) * 1.8, 0.4);

  function tempToY(t) { return CB - ((t - tempMin) / (tempMax - tempMin)) * CH; }
  function precipToY(p) { return CB - (p / precipMax) * CH; }
  function idxToX(i) { return CL + (i / (tempSeries.length - 1)) * CW; }

  // ── LEFT PANEL ────────────────────────────────────────────────────────────

  // Thin right border
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT_W, PAD);
  ctx.lineTo(LEFT_W, H - PAD);
  ctx.stroke();

  // Location label
  ctx.fillStyle = '#bbb';
  ctx.font = '600 10px monospace';
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0.15em';
  ctx.fillText('NEW YORK', PAD, PAD + 2);

  // NOW label
  ctx.fillStyle = '#ccc';
  ctx.font = '10px monospace';
  ctx.fillText('NOW', PAD, 82);

  // Big temp
  ctx.fillStyle = '#000';
  ctx.font = '700 88px sans-serif';
  ctx.fillText(`${currentTemp}°`, PAD - 3, 172);

  // Thin divider
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 186);
  ctx.lineTo(LEFT_W - PAD, 186);
  ctx.stroke();

  // High / Low block
  const hlY = 220;
  ctx.fillStyle = '#000';
  ctx.font = '600 16px monospace';
  ctx.fillText(`${highTemp}°`, PAD, hlY);
  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.fillText('HIGH', PAD, hlY + 16);

  ctx.fillStyle = '#000';
  ctx.font = '600 16px monospace';
  ctx.fillText(`${lowTemp}°`, PAD, hlY + 50);
  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.fillText('LOW', PAD, hlY + 66);

  // Updated timestamp
  ctx.fillStyle = '#ccc';
  ctx.font = '9px monospace';
  ctx.fillText(formatUpdated(), PAD, H - PAD + 4);

  // ── CHART: Grid ───────────────────────────────────────────────────────────

  // Horizontal grid lines (temp ticks every 5°)
  const gridTemps = [];
  for (let t = tempMin; t <= tempMax; t += 5) gridTemps.push(t);

  gridTemps.forEach(t => {
    const y = Math.round(tempToY(t));
    // Line
    ctx.strokeStyle = t === 0 ? '#ccc' : '#f0f0f0';
    ctx.lineWidth = t === 0 ? 1 : 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(CL, y);
    ctx.lineTo(CR, y);
    ctx.stroke();
    // Label
    ctx.fillStyle = '#bbb';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${t}°`, CL - 10, y + 4);
  });

  // Vertical grid lines + x-labels
  for (let i = 0; i < xLabels.length; i++) {
    const x = Math.round(idxToX(i));
    // Only draw every other line to keep it clean
    if (i % 2 === 0) {
      ctx.strokeStyle = '#f4f4f4';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, CT);
      ctx.lineTo(x, CB);
      ctx.stroke();
    }
    // x labels
    ctx.fillStyle = i % 2 === 0 ? '#999' : '#ccc';
    ctx.font = `${i % 2 === 0 ? '600' : '400'} 11px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(xLabels[i], x, CB + 20);
  }

  // Top + bottom axis lines
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(CL, CB);
  ctx.lineTo(CR, CB);
  ctx.stroke();

  // ── CHART: Precip bars ────────────────────────────────────────────────────
  const barW = Math.max(6, (CW / tempSeries.length) * 0.35);

  for (let i = 0; i < precipSeries.length; i++) {
    const p = precipSeries[i];
    if (p <= 0.001) continue;
    const x = idxToX(i);
    const top = precipToY(p);
    const bh = CB - top;
    if (bh < 1) continue;

    // Subtle filled bar
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(x - barW / 2, top, barW, bh);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - barW / 2, top, barW, bh);
  }

  // ── CHART: Temp curve ─────────────────────────────────────────────────────
  const rawPoints = tempSeries.map((t, i) => [idxToX(i), tempToY(t)]);
  const smooth = catmullRomPoints(rawPoints, 20);

  // Subtle area fill under curve
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(smooth[0][0], CB);
  smooth.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(smooth[smooth.length - 1][0], CB);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, CT, 0, CB);
  grad.addColorStop(0, 'rgba(0,0,0,0.07)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Smooth line
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  smooth.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  // Dots at data points — only on alternating hours to keep clean
  for (let i = 0; i < tempSeries.length; i++) {
    if (i % 2 !== 0) continue;
    const x = idxToX(i);
    const y = tempToY(tempSeries[i]);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Temp value above dot
    ctx.fillStyle = '#444';
    ctx.font = '600 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(tempSeries[i])}°`, x, y - 9);
  }

  // ── CHART: Header labels ──────────────────────────────────────────────────
  ctx.fillStyle = '#bbb';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('NEXT 12 HRS', CL, CT - 16);

  ctx.textAlign = 'right';
  ctx.fillText('PRECIP (in)', CR, CT - 16);

  // Precip y-axis (right)
  ctx.textAlign = 'left';
  ctx.font = '10px monospace';
  ctx.fillStyle = '#ccc';
  [0.1, 0.25, 0.5].forEach(p => {
    if (p > precipMax) return;
    const y = precipToY(p);
    ctx.fillText(`${p}"`, CR + 6, y + 4);
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  const out = fs.createWriteStream('weather.png');
  canvas.createPNGStream().pipe(out);
  out.on('finish', () => console.log('Done: weather.png saved'));
}

main().catch(err => { console.error(err); process.exit(1); });
