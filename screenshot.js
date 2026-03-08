const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800, H = 480;

const API_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=40.74353280033631&longitude=-74.00675113622488" +
  "&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m,winddirection_10m,relativehumidity_2m,apparent_temperature,uv_index" +
  "&current_weather=true&timezone=America%2FNew_York&temperature_unit=fahrenheit" +
  "&daily=temperature_2m_max,temperature_2m_min&windspeed_unit=mph";

function getCurrentLocalHour() {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  local.setMinutes(0, 0, 0);
  return local.getTime();
}

function formatUpdated() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric"
  });
}

function wmoCondition(code) {
  if (code === 0)               return "Clear";
  if (code <= 2)                return "Partly Cloudy";
  if (code === 3)               return "Overcast";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 71 && code <= 75) return "Snow";
  if (code === 77)              return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow Showers";
  if (code >= 95)               return "Thunderstorm";
  return "Cloudy";
}

function uvLabel(uv) {
  if (uv <= 2)  return "Low";
  if (uv <= 5)  return "Moderate";
  if (uv <= 7)  return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

function windDirLabel(deg) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// ── Icons ──────────────────────────────────────────────────────────────────
function drawCloud(ctx, cx, cy, s = 1, lw = 2, fill = '#ffffff') {
  const bw = 15*s, bh = 8*s;
  const lbx = cx-7*s, lby = cy-5*s, lbr = 5*s;
  const rbx = cx+5*s, rby = cy-4*s, rbr = 4*s;

  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.ellipse(cx,    cy+bh/2-bh/2, bw, bh,   0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(lbx,   lby,           lbr, lbr, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(rbx,   rby,           rbr, rbr, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillRect(cx-bw, cy, bw*2, bh);

  ctx.strokeStyle = '#000'; ctx.lineWidth = lw;
  // Bottom arc
  ctx.beginPath(); ctx.ellipse(cx, cy, bw, bh, 0, Math.PI*0.53, Math.PI*0.97); ctx.stroke();
  // Left side
  ctx.beginPath(); ctx.moveTo(cx-bw+1, cy+bh); ctx.lineTo(cx-bw+1, cy); ctx.stroke();
  // Bottom line
  ctx.beginPath(); ctx.moveTo(cx-bw+lw, cy+bh); ctx.lineTo(cx+bw-lw, cy+bh); ctx.stroke();
  // Left bump
  ctx.beginPath(); ctx.ellipse(lbx, lby, lbr, lbr, 0, Math.PI*0.45, Math.PI*1.05); ctx.stroke();
  // Right bump
  ctx.beginPath(); ctx.ellipse(rbx, rby, rbr, rbr, 0, Math.PI*0.45, Math.PI*1.05); ctx.stroke();
  // Top seam fill
  ctx.fillStyle = fill;
  ctx.fillRect(cx-bw+lw+1, cy-bh/2, bw*2-lw*2-2, bh/2+1);
}

function iconSun(ctx, cx, cy, r = 18, lw = 2, col = '#000') {
  const rc = r*0.44;
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(cx, cy, rc, 0, Math.PI*2); ctx.stroke();
  for (let a = 0; a < 360; a += 30) {
    const rad = a * Math.PI/180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad)*r*0.6,  cy + Math.sin(rad)*r*0.6);
    ctx.lineTo(cx + Math.cos(rad)*r*0.88, cy + Math.sin(rad)*r*0.88);
    ctx.stroke();
  }
}

function iconPartlyCloudy(ctx, cx, cy, r = 18, lw = 2, col = '#000') {
  const scx = cx-r*0.35, scy = cy-r*0.35, sr = r*0.3;
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(scx, scy, sr, 0, Math.PI*2); ctx.stroke();
  for (const a of [170,200,230,260,290,320,350]) {
    const rad = a * Math.PI/180;
    ctx.beginPath();
    ctx.moveTo(scx + Math.cos(rad)*sr*1.5, scy + Math.sin(rad)*sr*1.5);
    ctx.lineTo(scx + Math.cos(rad)*sr*2.1, scy + Math.sin(rad)*sr*2.1);
    ctx.stroke();
  }
  drawCloud(ctx, cx+r*0.1, cy+r*0.2, r/18*0.88, lw, '#ffffff');
}

function iconCloud(ctx, cx, cy, r = 18, lw = 2) {
  drawCloud(ctx, cx, cy, r/18, lw, '#ffffff');
}

function iconRain(ctx, cx, cy, r = 18, lw = 2, col = '#000') {
  drawCloud(ctx, cx, cy-r*0.3, r/18*0.88, lw, '#ffffff');
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  for (const [dx, dy] of [[-r*.4,0],[0,r*.15],[r*.4,0],[-r*.2,r*.3],[r*.2,r*.3]]) {
    ctx.beginPath();
    ctx.moveTo(cx+dx,          cy+r*.42+dy);
    ctx.lineTo(cx+dx-r*.12,    cy+r*.8+dy);
    ctx.stroke();
  }
}

function iconSnow(ctx, cx, cy, r = 18, lw = 2, col = '#000') {
  drawCloud(ctx, cx, cy-r*0.3, r/18*0.88, lw, '#ffffff');
  ctx.fillStyle = col;
  for (const dx of [-r*.38, 0, r*.38]) {
    const sr2 = Math.max(2, r*.14);
    ctx.beginPath(); ctx.arc(cx+dx, cy+r*.62, sr2, 0, Math.PI*2); ctx.fill();
  }
}

function iconStorm(ctx, cx, cy, r = 18, lw = 2, col = '#000') {
  drawCloud(ctx, cx, cy-r*0.28, r/18*0.88, lw, '#ffffff');
  ctx.strokeStyle = col; ctx.lineWidth = lw+1;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx+r*.18, cy+r*.28);
  ctx.lineTo(cx-r*.1,  cy+r*.62);
  ctx.lineTo(cx+r*.08, cy+r*.62);
  ctx.lineTo(cx-r*.22, cy+r*1.0);
  ctx.stroke();
}

function getIconFn(code) {
  if (code === 0)               return iconSun;
  if (code <= 2)                return iconPartlyCloudy;
  if (code === 3)               return iconCloud;
  if (code >= 71 && code <= 77) return iconSnow;
  if (code >= 95)               return iconStorm;
  if (code >= 51)               return iconRain;
  return iconCloud;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const res  = await fetch(API_URL);
  const data = await res.json();

  const currentCode = data.current_weather.weathercode;
  const currentTemp = Math.round(data.current_weather.temperature);
  const condition   = wmoCondition(currentCode);

  const currentHour = getCurrentLocalHour();
  const hourlyTS    = data.hourly.time.map(t => new Date(t).getTime());

  let start = hourlyTS.findIndex(t => t >= currentHour);
  if (start === -1) start = 0;

  const slice = (arr) => arr.slice(start, start + 12);

  const tempSeries   = slice(data.hourly.temperature_2m).map(Math.round);
  const precipSeries = slice(data.hourly.precipitation_probability);
  const codeSeries   = slice(data.hourly.weathercode);
  const hours        = slice(hourlyTS);

  const feelsLike  = Math.round(data.hourly.apparent_temperature[start]);
  const humidity   = Math.round(data.hourly.relativehumidity_2m[start]);
  const windSpeed  = Math.round(data.hourly.windspeed_10m[start]);
  const windDeg    = data.hourly.winddirection_10m[start];
  const uvRaw      = data.hourly.uv_index[start] ?? 0;
  const uv         = Math.round(uvRaw);
  const precipPct  = Math.round(precipSeries[0] ?? 0);

  const highTemp = Math.round(data.daily.temperature_2m_max[0]);
  const lowTemp  = Math.round(data.daily.temperature_2m_min[0]);

  const xLabels = hours.map((ts, i) => {
    if (i === 0) return "NOW";
    const d = new Date(ts);
    const h = d.getHours() % 12 || 12;
    return `${h} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  });

  // ── Canvas ──────────────────────────────────────────────────────────────
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const PAD   = 22;
  const TOP_H = 220;

  // ── TOP LEFT ────────────────────────────────────────────────────────────
  // City
  ctx.fillStyle = '#000'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('New York', PAD, 30);

  // Big temp
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(`${currentTemp}°`, PAD, 86);

  // Condition
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(condition, PAD + 130, 72);

  // H/L/Feels like
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#777';
  ctx.fillText(`H:${highTemp}°  L:${lowTemp}°  •  Feels like ${feelsLike}°`, PAD + 132, 98);

  // ── STAT BOXES ──────────────────────────────────────────────────────────
  const BOX_W = 168, BOX_H = 88, BOX_GAP = 8;
  const BOX_R1_Y = 14;
  const BOX_R2_Y = BOX_R1_Y + BOX_H + BOX_GAP;
  const BOX_C1_X = W - (BOX_W*2) - BOX_GAP*3;
  const BOX_C2_X = W - BOX_W - BOX_GAP*2;

  const boxes = [
    [BOX_C1_X, BOX_R1_Y, 'UV INDEX',       `${uv}`,          uvLabel(uv)],
    [BOX_C2_X, BOX_R1_Y, 'HUMIDITY',        `${humidity}%`,   ''],
    [BOX_C1_X, BOX_R2_Y, 'WIND',            `${windSpeed}`,   `mph ${windDirLabel(windDeg)}`],
    [BOX_C2_X, BOX_R2_Y, 'PRECIPITATION',   `${precipPct}%`,  ''],
  ];

  for (const [bx, by, label, val, sub] of boxes) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, BOX_W, BOX_H);
    const bp = 10;
    ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(label, bx+bp, by+bp+11);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(val,   bx+bp, by+bp+42);
    if (sub) {
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#777';
      ctx.fillText(sub, bx+bp, by+bp+62);
    }
  }

  // ── DIVIDER ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, TOP_H); ctx.lineTo(W, TOP_H); ctx.stroke();

  // ── BOTTOM: 12-HOUR FORECAST ────────────────────────────────────────────
  const BOTTOM_Y = TOP_H + 10;
  ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('12-HOUR FORECAST', PAD, BOTTOM_Y + 12);

  const GRID_Y  = BOTTOM_Y + 24;
  const COLS    = 6;
  const CELL_W  = Math.floor((W - PAD*2) / COLS);
  const CELL_H  = Math.floor((H - GRID_Y - 6) / 2);

  for (let i = 0; i < 12; i++) {
    const row   = Math.floor(i / COLS);
    const col   = i % COLS;
    const cx    = PAD + col * CELL_W;
    const cy    = GRID_Y + row * CELL_H;
    const isNow = i === 0;
    const cellCX = cx + CELL_W / 2;

    // Cell background
    ctx.fillStyle   = isNow ? '#000000' : '#ffffff';
    ctx.strokeStyle = isNow ? '#000000' : '#cccccc';
    ctx.lineWidth   = 1;
    ctx.fillRect(  cx,   cy,   CELL_W-2, CELL_H-2);
    ctx.strokeRect(cx,   cy,   CELL_W-2, CELL_H-2);

    const fg = isNow ? '#ffffff' : '#000000';

    // Time label
    ctx.fillStyle = fg;
    ctx.font      = isNow ? 'bold 11px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabels[i], cellCX, cy + 16);

    // Icon
    const iconY = cy + CELL_H/2 - 2;
    const iconR = 16;

    if (isNow) {
      // Draw icon white-on-black: draw to offscreen, invert
      const off    = createCanvas(W, H);
      const offCtx = off.getContext('2d');
      offCtx.fillStyle = '#000';
      offCtx.fillRect(0, 0, W, H);
      getIconFn(codeSeries[i])(offCtx, cellCX, iconY, iconR, 2, '#fff');
      // Blit white pixels as white onto main canvas
      const imgData = offCtx.getImageData(
        Math.floor(cellCX - iconR - 4), Math.floor(iconY - iconR - 4),
        iconR*2+8, iconR*2+8
      );
      // Re-draw with white stroke on main
      ctx.save();
      getIconFn(codeSeries[i])(ctx, cellCX, iconY, iconR, 2, '#fff');
      // For cloud fill, re-fill with black
      ctx.fillStyle = '#000';
      ctx.fillRect(cx, cy, CELL_W-2, CELL_H-2); // clear
      ctx.fillStyle = '#fff';
      // Draw icon on black cell using white strokes
      ctx.strokeStyle = '#fff';
      ctx.fillStyle   = '#000'; // cloud fill = black bg color

      // Sun
      if (codeSeries[i] === 0) {
        iconSun(ctx, cellCX, iconY, iconR, 2, '#fff');
      } else if (codeSeries[i] <= 2) {
        // Partly cloudy: white sun rays + white cloud outline, fill = black
        const scx2 = cellCX - iconR*0.35, scy2 = iconY - iconR*0.35, sr2 = iconR*0.3;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(scx2, scy2, sr2, 0, Math.PI*2); ctx.stroke();
        for (const a of [170,200,230,260,290,320,350]) {
          const rad = a*Math.PI/180;
          ctx.beginPath();
          ctx.moveTo(scx2+Math.cos(rad)*sr2*1.5, scy2+Math.sin(rad)*sr2*1.5);
          ctx.lineTo(scx2+Math.cos(rad)*sr2*2.1, scy2+Math.sin(rad)*sr2*2.1);
          ctx.stroke();
        }
        drawCloud(ctx, cellCX+iconR*0.1, iconY+iconR*0.2, iconR/18*0.88, 2, '#000');
        ctx.strokeStyle = '#fff';
        // Re-stroke cloud outline white
        const s2 = iconR/18*0.88;
        const ccx = cellCX+iconR*0.1, ccy = iconY+iconR*0.2;
        const bw2=15*s2, bh2=8*s2;
        const lbx2=ccx-7*s2, lby2=ccy-5*s2, lbr2=5*s2;
        const rbx2=ccx+5*s2, rby2=ccy-4*s2, rbr2=4*s2;
        ctx.beginPath(); ctx.ellipse(ccx, ccy, bw2, bh2, 0, Math.PI*0.53, Math.PI*0.97); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ccx-bw2+1, ccy+bh2); ctx.lineTo(ccx-bw2+1, ccy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ccx-bw2+2, ccy+bh2); ctx.lineTo(ccx+bw2-2, ccy+bh2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(lbx2,lby2,lbr2,lbr2,0,Math.PI*0.45,Math.PI*1.05); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(rbx2,rby2,rbr2,rbr2,0,Math.PI*0.45,Math.PI*1.05); ctx.stroke();
      } else {
        // All other icons: draw with black fill (= cell bg) and white stroke
        const s3 = iconR/18;
        const bw3=15*s3, bh3=8*s3;
        const lbx3=cellCX-7*s3, lby3=iconY-5*s3, lbr3=5*s3;
        const rbx3=cellCX+5*s3, rby3=iconY-4*s3, rbr3=4*s3;
        // Cloud
        const cloudCX = codeSeries[i] >= 51 ? cellCX : cellCX;
        const cloudCY = codeSeries[i] >= 51 ? iconY - iconR*0.28 : iconY;
        const cs = codeSeries[i] >= 51 ? iconR/18*0.88 : s3;
        drawCloud(ctx, cloudCX, cloudCY, cs, 2, '#000');
        // Re-outline in white
        ctx.strokeStyle = '#fff';
        const cbw=15*cs, cbh=8*cs;
        const clbx=cloudCX-7*cs, clby=cloudCY-5*cs, clbr=5*cs;
        const crbx=cloudCX+5*cs, crby=cloudCY-4*cs, crbr=4*cs;
        ctx.beginPath(); ctx.ellipse(cloudCX, cloudCY, cbw, cbh, 0, Math.PI*0.53, Math.PI*0.97); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cloudCX-cbw+1, cloudCY+cbh); ctx.lineTo(cloudCX-cbw+1, cloudCY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cloudCX-cbw+2, cloudCY+cbh); ctx.lineTo(cloudCX+cbw-2, cloudCY+cbh); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(clbx,clby,clbr,clbr,0,Math.PI*0.45,Math.PI*1.05); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(crbx,crby,crbr,crbr,0,Math.PI*0.45,Math.PI*1.05); ctx.stroke();
        // Rain drops / snow / bolt
        if (codeSeries[i] >= 95) {
          ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.lineJoin='round';
          ctx.beginPath();
          ctx.moveTo(cellCX+iconR*.18, iconY+iconR*.28);
          ctx.lineTo(cellCX-iconR*.1,  iconY+iconR*.62);
          ctx.lineTo(cellCX+iconR*.08, iconY+iconR*.62);
          ctx.lineTo(cellCX-iconR*.22, iconY+iconR*1.0);
          ctx.stroke();
        } else if (codeSeries[i] >= 71 && codeSeries[i] <= 77) {
          ctx.fillStyle='#fff';
          for (const dx of [-iconR*.38,0,iconR*.38]) {
            ctx.beginPath(); ctx.arc(cellCX+dx, iconY+iconR*.62, Math.max(2,iconR*.14), 0, Math.PI*2); ctx.fill();
          }
        } else if (codeSeries[i] >= 51) {
          ctx.strokeStyle='#fff'; ctx.lineWidth=2;
          for (const [dx,dy] of [[-iconR*.4,0],[0,iconR*.15],[iconR*.4,0],[-iconR*.2,iconR*.3],[iconR*.2,iconR*.3]]) {
            ctx.beginPath();
            ctx.moveTo(cellCX+dx, iconY+iconR*.42+dy);
            ctx.lineTo(cellCX+dx-iconR*.12, iconY+iconR*.8+dy);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // Redraw time label on top
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(xLabels[0], cellCX, cy + 16);

    } else {
      getIconFn(codeSeries[i])(ctx, cellCX, iconY, iconR, 2);
    }

    // Temperature
    ctx.fillStyle = fg;
    ctx.font      = isNow ? 'bold 13px sans-serif' : '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${tempSeries[i]}°`, cellCX, cy + CELL_H - 8);
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const out = fs.createWriteStream('weather.png');
  canvas.createPNGStream().pipe(out);
  out.on('finish', () => console.log('Done: weather.png saved'));
}

main().catch(err => { console.error(err); process.exit(1); });
