const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800, H = 480;
const DIVIDER = 220;

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

function drawHatchPattern(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.2;
  const step = 5;
  for (let i = -(h); i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

async function fetchWeather() {
  const res = await fetch(API_URL);
  return res.json();
}

async function main() {
  const data = await fetchWeather();

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

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  const PAD = 28;

  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.fillText('NEW YORK, NY', PAD, PAD + 11);

  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText('NOW', PAD, 90);

  ctx.fillStyle = '#000';
  ctx.font = 'bold 100px serif';
  ctx.fillText(`${currentTemp}\u00B0`, PAD - 4, 195);

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#000';
  ctx.fillText(`\u2191 ${highTemp}\u00B0`, PAD, 260);
  ctx.fillText(`\u2193 ${lowTemp}\u00B0`, PAD, 292);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText('HIGH', PAD + 68, 260);
  ctx.fillText('LOW', PAD + 68, 292);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`Updated ${formatUpdated()}`, PAD, H - 20);

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(DIVIDER, 0);
  ctx.lineTo(DIVIDER, H);
  ctx.stroke();

  const CL = DIVIDER + 50;
  const CR = W - 18;
  const CT = 28;
  const CB = H - 44;
  const CW = CR - CL;
  const CH = CB - CT;

  const tempMin = Math.floor(Math.min(...tempSeries) / 5) * 5 - 2;
  const tempMax = Math.ceil(Math.max(...tempSeries) / 5) * 5 + 2;
  const precipMax = Math.max(Math.max(...precipSeries) * 1.5, 0.3);

  function tempToY(t) { return CB - ((t - tempMin) / (tempMax - tempMin)) * CH; }
  function precipToY(p) { return CB - (p / precipMax) * CH; }
  function idxToX(i) { return CL + (i / (tempSeries.length - 1)) * CW; }

  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  for (let t = tempMin; t <= tempMax; t += 5) {
    const y = tempToY(t);
    ctx.beginPath();
    ctx.moveTo(CL, y);
    ctx.lineTo(CR, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.font = '12px monospace';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'right';
  for (let t = tempMin + 5; t <= tempMax; t += 5) {
    const y = tempToY(t);
    ctx.fillText(`${t}\u00B0`, CL - 6, y + 4);
  }

  ctx.textAlign = 'center';
  ctx.font = '13px monospace';
  ctx.fillStyle = '#555';
  const barW = Math.max(8, (CW / tempSeries.length) * 0.55);

  for (let i = 0; i < xLabels.length; i++) {
    const x = idxToX(i);
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, CT);
    ctx.lineTo(x, CB);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(xLabels[i], x, CB + 18);
  }

  for (let i = 0; i < precipSeries.length; i++) {
    if (precipSeries[i] <= 0) continue;
    const x = idxToX(i);
    const top = precipToY(precipSeries[i]);
    const bh = CB - top;
    if (bh < 1) continue;
    drawHatchPattern(ctx, x - barW / 2, top, barW, bh);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - barW / 2, top, barW, bh);
  }

  ctx.textAlign = 'left';
  ctx.font = '11px monospace';
  ctx.fillStyle = '#aaa';
  const precipTicks = [0.1, 0.2, 0.5, 1.0].filter(v => v <= precipMax);
  for (const p of precipTicks) {
    const y = precipToY(p);
    ctx.fillText(`${p}"`, CR + 2, y + 4);
  }

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i < tempSeries.length; i++) {
    const x = idxToX(i);
    const y = tempToY(tempSeries[i]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (let i = 0; i < tempSeries.length; i++) {
    const x = idxToX(i);
    const y = tempToY(tempSeries[i]);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
  }

  const LX = CL;
  const LY = H - 14;
  ctx.font = '10px monospace';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LX, LY - 4);
  ctx.lineTo(LX + 18, LY - 4);
  ctx.stroke();
  ctx.fillText('Temperature', LX + 22, LY);
  const PX = LX + 120;
  drawHatchPattern(ctx, PX, LY - 10, 12, 10);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(PX, LY - 10, 12, 10);
  ctx.fillStyle = '#999';
  ctx.fillText('Precipitation', PX + 16, LY);

  const out = fs.createWriteStream('weather.png');
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => console.log('Done: weather.png saved'));
}

main().catch(err => { console.error(err); process.exit(1); });
