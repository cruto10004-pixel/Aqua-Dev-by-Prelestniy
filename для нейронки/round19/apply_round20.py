#!/usr/bin/env python3
# Aqua round20 patch. Run inside the unpacked round19 folder:
#   python3 apply_round20.py --dry-run   (only checks that every anchor matches)
#   python3 apply_round20.py             (applies, backs up, rebuilds standalone)
from pathlib import Path
import re, sys, shutil, subprocess

root = Path(__file__).resolve().parent
DRY = '--dry-run' in sys.argv
MARK = 'Round20:'
P = []
def patch(f, old, new): P.append((f, old, new))

HELPERS = r'''/* Round20: tolerant search and unique handles (client-side demo only). */
function normalizeSearch(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^@+/, "");
}
function chatMatches(c, q) {
  if (!q) return true;
  const hay = normalizeSearch([c.name, c.sub, c.username].filter(Boolean).join(" "));
  return q.split(" ").every((part) => hay.includes(part.replace(/^@+/, "")));
}
function highlightMatch(text, q) {
  const plain = String(text ?? "");
  if (!q) return esc(plain);
  const lower = plain.toLocaleLowerCase("ru").replace(/ё/g, "е");
  if (lower.length !== plain.length) return esc(plain);
  const ranges = [];
  for (const raw of q.split(" ")) {
    const part = raw.replace(/^@+/, "");
    if (!part) continue;
    for (let at = lower.indexOf(part); at !== -1; at = lower.indexOf(part, at + part.length))
      ranges.push([at, at + part.length]);
  }
  if (!ranges.length) return esc(plain);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [start, end] of ranges) {
    if (end <= pos) continue;
    const from = Math.max(start, pos);
    out += esc(plain.slice(pos, from)) + "<mark>" + esc(plain.slice(from, end)) + "</mark>";
    pos = end;
  }
  return out + esc(plain.slice(pos));
}
function nextChatId() {
  return chats.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;
}
function normalizeUsername(value) {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}
function usernameProblem(username) {
  if (!/^[a-z0-9._]{3,32}$/.test(username))
    return "Имя пользователя: 3–32 символа, латиница, цифры, точка или _";
  const taken =
    username === normalizeUsername(state.profile.username) ||
    chats.some((c) => normalizeUsername(c.username) === username);
  return taken ? "Это имя пользователя уже занято" : "";
}
function reportFieldError(input, message) {
  if (!input) { toast(message); return; }
  input.setCustomValidity(message);
  input.reportValidity();
  input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
}
'''

patch('app.js', 'function renderList(query = "") {\n', HELPERS + 'function renderList(query = "") {\n')
patch('app.js', '      c.name.toLowerCase().includes(query.toLowerCase()),\n', '      chatMatches(c, normalizeSearch(query)),\n')
patch('app.js', '<strong>${esc(c.name)} ${c.id === 0 ?', '<strong>${highlightMatch(c.name, normalizeSearch(query))} ${c.id === 0 ?')
patch('app.js', '<p>${esc(c.sub)}</p></span><span class="row-meta">', '<p>${highlightMatch(c.sub, normalizeSearch(query))}</p></span><span class="row-meta">')
patch('app.js',
  '\'<label class="field">Текст сообщения<input id="message-search" placeholder="Найти…"></label><div id="search-results" class="note">Введите текст для поиска</div>\',\n    );\n',
  '\'<label class="field">Текст сообщения<input id="message-search" type="search" autocomplete="off" placeholder="Найти…"></label><div id="search-results" class="note" aria-live="polite">Введите текст для поиска</div>\',\n    );\n    $("#message-search")?.focus(); // Round20: focus search field\n')
patch('app.js',
  '''  if (e.target.id === "message-search") {
    $("#search-results").innerHTML =
      messages[state.chat]
        .filter((m) =>
          (m.text || "").toLowerCase().includes(e.target.value.toLowerCase()),
        )
        .map((m) => `<p style="padding:10px">${esc(m.text)}</p>`)
        .join("") || "Ничего не найдено";
  }
''',
  '''  if (e.target.id === "message-search") {
    // Round20: tolerant search, highlighted results, jump to message.
    const q = normalizeSearch(e.target.value);
    const label = (m) => m.text || m.file?.name || "";
    const hits = q
      ? (messages[state.chat] || []).map((m, i) => [m, i]).filter(([m]) => chatMatches({ name: label(m) }, q))
      : [];
    $("#search-results").innerHTML = !q
      ? "Введите текст для поиска"
      : hits.length
        ? `<p>Найдено: ${hits.length}</p><div class="search-results">${hits.map(([m, i]) => `<button type="button" class="search-result" data-action="gotomessage:${i}">${highlightMatch(label(m), q)}<small>${m.out ? "Вы" : "Собеседник"}${m.time ? " · " + esc(m.time) : ""}</small></button>`).join("")}</div>`
        : "Ничего не найдено";
  }
''')
patch('app.js',
  'c.channel ? "@aqua_design" : c.saved ? "Ваше личное пространство" : "@" + (c.id === 1 ? "alexandra" : "aqua_user")',
  'c.channel ? "@" + esc(c.username || "aqua_design") : c.saved ? "Ваше личное пространство" : "@" + esc(c.username || (c.id === 1 ? "alexandra" : "user" + c.id))')
patch('app.js',
  '    const kind = e.target.dataset.kind;\n    const c = {\n      id: chats.length,\n',
  '''    const kind = e.target.dataset.kind;
    // Round20: channel handle is stored and must be unique.
    const handle = kind === "channel" ? normalizeUsername($("#new-username")?.value) : "";
    if (kind === "channel") {
      const problem = usernameProblem(handle);
      if (problem) {
        reportFieldError($("#new-username"), problem);
        return;
      }
    }
    const c = {
      id: nextChatId(),
      username: handle || undefined,
''')
patch('app.js',
  '    const name = $("#contact-name").value.trim();\n    if (!name) return;\n    chats.push({\n      id: chats.length,\n',
  '''    const name = $("#contact-name").value.trim();
    if (!name) return;
    // Round20: the username field is no longer discarded; it must be unique.
    const username = normalizeUsername($("#contact-username")?.value);
    const problem = usernameProblem(username);
    if (problem) {
      reportFieldError($("#contact-username"), problem);
      return;
    }
    chats.push({
      id: nextChatId(),
      username,
''')
patch('app.js',
  'function toast(t) {\n  $("#toast").textContent = t;\n',
  '''function toast(t) {
  // Round20: announce toasts to screen readers.
  if (!$("#toast").hasAttribute("role")) {
    $("#toast").setAttribute("role", "status");
    $("#toast").setAttribute("aria-live", "polite");
  }
  $("#toast").textContent = t;
''')

APPEND = {
'app.js': r'''
/* Round20: jump from in-chat search to the message. */
document.addEventListener("click", (e) => {
  const el = e.target.closest('[data-action^="gotomessage:"]');
  if (!el) return;
  const index = el.dataset.action.slice("gotomessage:".length);
  closeModal();
  setTimeout(() => {
    const node = document.querySelector(`#messages [data-message="${CSS.escape(index)}"]`);
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: AquaMotion.isEnabled() ? "smooth" : "auto" });
    node.classList.remove("search-hit");
    void node.offsetWidth;
    node.classList.add("search-hit");
    setTimeout(() => node.classList.remove("search-hit"), 1700);
    node.focus({ preventScroll: true });
  }, 200);
});
''',
'search.css': r'''
/* Round20: search highlight, in-chat results, jump target. */
.chat-row mark,.search-result mark{background:color-mix(in srgb,var(--accent,#aebfee) 30%,transparent);color:inherit;border-radius:4px;padding:0 1px}
.search-results{display:grid;gap:6px;margin-top:8px;max-height:50vh;overflow:auto}
.search-result{all:unset;box-sizing:border-box;display:block;cursor:pointer;min-height:44px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,currentColor 6%,transparent);overflow-wrap:anywhere}
.search-result:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
.search-result:focus-visible{outline:2px solid var(--accent,#aebfee);outline-offset:2px}
.search-result small{display:block;opacity:.7;margin-top:2px}
.message.search-hit{animation:aqua-search-hit 1.6s ease-out}
@keyframes aqua-search-hit{0%,30%{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#aebfee) 55%,transparent)}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.message.search-hit{animation:none;outline:2px solid var(--accent,#aebfee);outline-offset:2px}}
''',
}

def read(p):
    return p.read_text(encoding='utf-8').replace('\r\n', '\n')

def main():
    files = {f for f, _, _ in P} | set(APPEND)
    texts = {}
    for f in files:
        p = root / f
        if not p.is_file():
            sys.exit(f'ERROR: {f} not found. Run this script inside the round19 folder.')
        texts[f] = read(p)
    if MARK in texts['app.js']:
        sys.exit('Round20 patch is already applied. Nothing to do.')
    errors = []
    for f, old, new in P:
        n = texts[f].count(old)
        if n != 1:
            errors.append(f'{f}: anchor found {n} times: {old[:70]!r}')
        else:
            texts[f] = texts[f].replace(old, new)
    if errors:
        print('\n'.join(errors))
        sys.exit('ERROR: files differ from round19. Nothing was changed.')
    for f, extra in APPEND.items():
        texts[f] = texts[f].rstrip('\n') + '\n' + extra
    idx = root / 'index.html'
    if idx.is_file():
        html = read(idx)
        bumped = re.sub(r'([?&]v=)19a', r'\g<1>20a', html)
        if bumped != html:
            texts['index.html'] = bumped
        else:
            print('note: no ?v=19a cache marker in index.html, left unchanged')
    status = root / 'PROJECT_STATUS.md'
    extra = root / 'PROJECT_STATUS_ROUND20.md'
    if status.is_file() and extra.is_file():
        s = read(status)
        s = s.replace('**Актуальная версия: round19.', '**Актуальная версия: round20 (патч поверх round19). Предыдущая: round19.', 1)
        texts['PROJECT_STATUS.md'] = s.rstrip('\n') + '\n\n' + read(extra)
    print(f'{len(P)} replacements and {len(APPEND)} additions match.')
    if DRY:
        print('Dry run: nothing written.')
        return
    backup = root / '.round19-backup'
    backup.mkdir(exist_ok=True)
    for f, t in texts.items():
        src = root / f
        if src.is_file() and not (backup / f).exists():
            shutil.copy2(src, backup / f)
        src.write_text(t, encoding='utf-8')
    print('Written. Originals saved to .round19-backup/')
    node = shutil.which('node')
    if node:
        for js in sorted(root.glob('*.js')):
            r = subprocess.run([node, '--check', str(js)], capture_output=True, text=True)
            print(('ok   ' if r.returncode == 0 else 'FAIL ') + js.name, r.stderr.strip()[:300])
    else:
        print('note: node not found, syntax check skipped')
    if (root / 'build-standalone.py').is_file():
        subprocess.run([sys.executable, str(root / 'build-standalone.py')], cwd=root, check=False)
    # Round20: pack the full project next to the folder.
    import zipfile
    target = root.parent / 'aqua-design-preview-round20.zip'
    skip = {'.round19-backup', '__pycache__', '.git'}
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for p in sorted(root.rglob('*')):
            rel = p.relative_to(root)
            if p.is_file() and not (set(rel.parts) & skip) and p.suffix != '.zip':
                out.write(p, rel.as_posix())
    with zipfile.ZipFile(target) as check:
        bad = check.testzip()
        names = check.namelist()
    print(f'Full archive: {target} ({len(names)} files, PROJECT_STATUS.md in root: {"PROJECT_STATUS.md" in names}, damaged: {bad})')

if __name__ == '__main__':
    main()
