export function sqDist3(a, b) {
  return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
}

export function kMeans(pts, k, iters) {
  if (pts.length <= k) return pts.map(p => [...p]);
  const centres = [pts[Math.floor(Math.random() * pts.length)].slice()];
  while (centres.length < k) {
    const dists = pts.map(p => Math.min(...centres.map(c => sqDist3(p, c))));
    const total = dists.reduce((a, d) => a + d, 0);
    let rnd = Math.random() * total;
    for (let j = 0; j < pts.length; j++) {
      rnd -= dists[j];
      if (rnd <= 0) { centres.push(pts[j].slice()); break; }
    }
    if (centres.length < k) centres.push(pts[Math.floor(Math.random() * pts.length)].slice());
  }
  for (let iter = 0; iter < iters; iter++) {
    const sums = Array.from({length: k}, () => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      centres.forEach((c, j) => { const d = sqDist3(p, c); if (d < bd) { bd = d; best = j; } });
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    sums.forEach((s, j) => { if (s[3] > 0) centres[j] = [s[0]/s[3], s[1]/s[3], s[2]/s[3]]; });
  }
  return centres;
}

export function keepLargestCC(mask, w, h) {
  const out = new Uint8Array(w * h);
  const vis = new Uint8Array(w * h);
  let bestComp = null;
  for (let seed = 0; seed < w * h; seed++) {
    if (!mask[seed] || vis[seed]) continue;
    const comp = [];
    const stk = [seed];
    while (stk.length) {
      const i = stk.pop();
      if (vis[i] || !mask[i]) continue;
      vis[i] = 1; comp.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x > 0)   stk.push(i - 1);
      if (x < w-1) stk.push(i + 1);
      if (y > 0)   stk.push(i - w);
      if (y < h-1) stk.push(i + w);
    }
    if (!bestComp || comp.length > bestComp.length) bestComp = comp;
  }
  if (bestComp) for (const i of bestComp) out[i] = 1;
  return out;
}

export function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const stk = [];
  for (let x = 0; x < w; x++) {
    if (!mask[x]) stk.push(x);
    if (!mask[(h-1)*w+x]) stk.push((h-1)*w+x);
  }
  for (let y = 1; y < h-1; y++) {
    if (!mask[y*w]) stk.push(y*w);
    if (!mask[y*w+w-1]) stk.push(y*w+w-1);
  }
  while (stk.length) {
    const i = stk.pop();
    if (outside[i] || mask[i]) continue;
    outside[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0)   stk.push(i - 1);
    if (x < w-1) stk.push(i + 1);
    if (y > 0)   stk.push(i - w);
    if (y < h-1) stk.push(i + w);
  }
  for (let i = 0; i < w*h; i++) {
    if (!outside[i] && !mask[i]) mask[i] = 1;
  }
}

export function morphClose(mask, w, h, r) {
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y*w+x]) { dil[y*w+x] = 1; continue; }
      let found = false;
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = x+dx, ny = y+dy;
          if (nx>=0&&nx<w&&ny>=0&&ny<h&&mask[ny*w+nx]) found = true;
        }
      }
      if (found) dil[y*w+x] = 1;
    }
  }
  const ero = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dil[y*w+x]) continue;
      let allIn = true;
      for (let dy = -r; dy <= r && allIn; dy++) {
        for (let dx = -r; dx <= r && allIn; dx++) {
          const nx = x+dx, ny = y+dy;
          if (nx<0||nx>=w||ny<0||ny>=h||!dil[ny*w+nx]) allIn = false;
        }
      }
      if (allIn) ero[y*w+x] = 1;
    }
  }
  return ero;
}

export function polyContains(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
