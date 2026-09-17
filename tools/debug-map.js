/* Печатает карту достижимости сеанса: ' ' стена, '.' достижимо, '#' отрезано. */
const fs = require('fs'), vm = require('vm');
const sandbox = { window: { NISHA: {} }, module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/maps.js', 'utf8'), sandbox, { filename: 'maps.js' });
const Maps = sandbox.window.NISHA.Maps;
const idx = Number(process.argv[2] || 0);
const map = Maps.load(idx);
const seen = new Uint8Array(map.w * map.h);
const s = [map.start.x | 0, map.start.y | 0];
seen[s[1] * map.w + s[0]] = 1;
const q = [s];
while (q.length) {
  const [cx, cy] = q.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const i = ny * map.w + nx;
    if (seen[i] || map.cells[i] > 0) continue;
    seen[i] = 1; q.push([nx, ny]);
  }
}
let out = '';
for (let y = 0; y < map.h; y++) {
  let row = '';
  for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x;
    row += map.cells[i] > 0 ? '█' : (seen[i] ? '·' : 'X');
  }
  out += String(y).padStart(2, ' ') + ' ' + row + '\n';
}
console.log('   ' + Array.from({ length: map.w }, (_, i) => i % 10).join(''));
console.log(out);
