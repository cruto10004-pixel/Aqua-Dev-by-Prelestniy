#!/usr/bin/env node
/**
 * Минималистичный бандлер ES-модулей фронта Aqua, без внешних зависимостей.
 *
 * Склеивает весь граф статических import/export из frontend/js/app.js
 * в один файл frontend/js/bundle.js. Рассчитан именно на стиль кода
 * этого проекта (проверено заранее):
 *   - только `import { a, b } from './rel.js';` (возможно многострочный)
 *   - только именованные экспорты: `export const|function|async function|class NAME`
 *   - без `export default`, без алиасов `as`, без динамических import()
 *   - граф модулей ацикличен
 *
 * Если что-то из этих допущений перестанет быть верным — бандлер упадёт
 * с понятной ошибкой, а не молча соберёт битый файл.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const JS_ROOT = path.resolve(__dirname, '..', 'frontend', 'js');
const ENTRY = path.join(JS_ROOT, 'app.js');
const OUT = path.join(JS_ROOT, 'bundle.js');

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"](\.\.?\/[^'"]+)['"]\s*;?/gs;
const EXPORT_DECL_RE = /^export\s+(const|function|async function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function moduleKey(p) {
  return path.relative(JS_ROOT, p).split(path.sep).join('/');
}

function resolveImport(fromFile, relPath) {
  const resolved = path.normalize(path.join(path.dirname(fromFile), relPath));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Import not found: '${relPath}' from ${fromFile}`);
  }
  return resolved;
}

// 1) Собираем граф модулей от entry.
const files = new Map(); // abs path -> raw source
const deps = new Map();  // abs path -> Set(abs path)

function collect(file) {
  if (files.has(file)) return;
  const src = readFile(file);
  files.set(file, src);
  const d = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    const dep = resolveImport(file, m[2]);
    d.add(dep);
  }
  deps.set(file, d);
  for (const dep of d) collect(dep);
}

collect(ENTRY);

// 2) Топологическая сортировка (зависимости — перед зависимым).
const order = [];
const state = new Map(); // 0 visiting, 1 done
function visit(file, stack) {
  const s = state.get(file);
  if (s === 1) return;
  if (s === 0) {
    throw new Error(`Обнаружен цикл импортов: ${stack.concat(file).join(' -> ')}`);
  }
  state.set(file, 0);
  for (const dep of deps.get(file)) visit(dep, stack.concat(file));
  state.set(file, 1);
  order.push(file);
}
visit(ENTRY, []);

// 3) Трансформация каждого модуля: убираем import/export, заворачиваем в IIFE.
function transform(file) {
  let src = files.get(file);
  const key = moduleKey(file);

  // Собираем импорты в виде: const { a, b } = __m["dep/key.js"];
  const importLines = [];
  IMPORT_RE.lastIndex = 0;
  src = src.replace(IMPORT_RE, (full, names, relPath) => {
    const dep = resolveImport(file, relPath);
    const depKey = moduleKey(dep);
    const cleanNames = names.split(',').map((n) => n.trim()).filter(Boolean).join(', ');
    importLines.push(`  const { ${cleanNames} } = __m[${JSON.stringify(depKey)}];`);
    return ''; // вырезаем сам import
  });

  // Убираем 'export ' перед декларациями, собирая экспортируемые имена.
  const exportedNames = [];
  const lines = src.split('\n').map((line) => {
    const m = line.match(EXPORT_DECL_RE);
    if (!m) return line;
    exportedNames.push(m[2]);
    return line.replace(/^export\s+/, '');
  });
  src = lines.join('\n');

  if (/^export\s/m.test(src)) {
    throw new Error(`Необработанный export в ${file} — проверь формат файла.`);
  }

  const exportsObj = exportedNames.length
    ? `{ ${exportedNames.join(', ')} }`
    : '{}';

  return [
    `__m[${JSON.stringify(key)}] = (function () {`,
    importLines.join('\n'),
    src,
    `  return ${exportsObj};`,
    `})();`,
  ].join('\n');
}

const chunks = order.map(transform);

const banner = `/* АВТОСГЕНЕРИРОВАНО tools/build_bundle.js — не редактировать вручную.
 * Пересобрать: node tools/build_bundle.js
 * Источник: frontend/js/app.js и его граф import'ов.
 */`;

const bundle = [
  banner,
  '(function () {',
  "'use strict';",
  'const __m = {};',
  ...chunks,
  '})();',
].join('\n\n');

fs.writeFileSync(OUT, bundle, 'utf8');
console.log(`Собрано ${order.length} модулей -> ${path.relative(process.cwd(), OUT)} (${(bundle.length / 1024).toFixed(1)} KB)`);
