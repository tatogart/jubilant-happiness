/* Проверка сеансов: прямоугольность, глухой периметр, достижимость точек. */
const fs = require('fs');
const vm = require('vm');

const sandbox = { window: {}, module: { exports: {} } };
sandbox.window.NISHA = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/maps.js', 'utf8'), sandbox, { filename: 'maps.js' });
const Maps = sandbox.window.NISHA.Maps;

let problems = 0;
const fail = (id, msg) => { problems++; console.log(`  ✗ [сеанс ${id}] ${msg}`); };

Maps.raw.forEach((raw, idx) => {
  const g = raw.grid;
  const w = g[0].length;
  console.log(`сеанс ${raw.id} «${raw.name}» — ${w}x${g.length}`);

  g.forEach((row, y) => {
    if (row.length !== w) fail(raw.id, `строка ${y}: длина ${row.length}, ожидалось ${w}`);
  });

  const isWall = (ch) => !'.,@X12345ltnm'.includes(ch);
  for (let x = 0; x < w; x++) {
    if (!isWall(g[0][x])) fail(raw.id, `верхняя граница открыта в x=${x}`);
    if (!isWall(g[g.length - 1][x])) fail(raw.id, `нижняя граница открыта в x=${x}`);
  }
  for (let y = 0; y < g.length; y++) {
    if (!isWall(g[y][0])) fail(raw.id, `левая граница открыта в y=${y}`);
    if (!isWall(g[y][w - 1])) fail(raw.id, `правая граница открыта в y=${y}`);
  }

  const map = Maps.load(idx);
  if (!map.start) fail(raw.id, 'нет точки входа @');
  if (!map.exit && !map.niches.length) fail(raw.id, 'нет ни выхода X, ни ниши');
  if (!map.spawns.length) fail(raw.id, 'нет узлов');

  // BFS от точки входа по проходимым клеткам
  if (map.start) {
    const seen = new Uint8Array(map.w * map.h);
    const q = [[map.start.x | 0, map.start.y | 0]];
    seen[(map.start.y | 0) * map.w + (map.start.x | 0)] = 1;
    while (q.length) {
      const [cx, cy] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return;
        const i = ny * map.w + nx;
        if (seen[i] || map.cells[i] > 0) return;
        seen[i] = 1; q.push([nx, ny]);
      });
    }
    const at = (p) => seen[(p.y | 0) * map.w + (p.x | 0)];
    if (map.exit && !at(map.exit)) fail(raw.id, 'выход недостижим от точки входа');
    map.spawns.forEach((s, i) => {
      if (!at(s)) fail(raw.id, `узел ${s.kind} #${i} (${s.x | 0},${s.y | 0}) отрезан от карты`);
    });
    map.niches.forEach((n) => {
      if (!at(n)) fail(raw.id, `ниша «${n.kind}» недостижима`);
    });
    const open = map.cells.reduce((a, c) => a + (c === 0 ? 1 : 0), 0);
    const reach = seen.reduce((a, c) => a + c, 0);
    if (reach < open) console.log(`  · достижимо ${reach} из ${open} клеток (остальное — карманы)`);
    console.log(`  · узлов: ${map.spawns.length}, декора: ${map.props.length}`);
  }
});

console.log(problems ? `\nпроблем: ${problems}` : '\nвсе сеансы проходимы');
process.exit(problems ? 1 : 0);
