/* PDF Merge: collects PDFs in the chosen order and hands them to the shared engine. Runs only in the browser. */
(function () {
  const { dropZone, formatBytes, download, vetFiles, say } = window.Tool;
  const Engine = window.PdfEngine;
  const $ = s => document.querySelector(s);
  const list = $('#list'), card = $('#card'), err = $('#err'), status = $('#status');
  const readOpts = Engine.optionsPanel($('#opts'));
  let items = []; // { file, src, types, error }

  dropZone($('#drop'), async files => {
    const { ok, problems } = await vetFiles(files, { kinds: ['pdf'], maxMB: 150, maxCount: 50 - items.length });
    say(err, problems.join(' '));
    say(status, '');
    for (const file of ok) {
      const item = { file, src: null, types: null };
      items.push(item);
      render();
      try { item.src = await Engine.open(file); }
      catch (e) { item.error = e.message; render(); continue; }
      render();
      Engine.pageTypes(item.src).then(t => { item.types = t; render(); }, () => {});
    }
  });

  function render() {
    card.hidden = !items.length;
    list.textContent = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML = `<div class="thumb" style="display:grid;place-items:center;font-weight:800;color:var(--orange)">${i + 1}</div>
        <div class="info"><div class="name"></div><div class="meta"></div></div>
        <div class="actions">
          <button class="btn small" type="button" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn small" type="button" data-act="down" aria-label="Move down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn small" type="button" data-act="rm" aria-label="Remove">✕</button>
        </div>`;
      li.querySelector('.name').textContent = item.file.name;
      const pages = item.error ? 'Cannot be used, see below'
        : !item.src ? 'Reading…'
        : `${item.src.pages} page${item.src.pages > 1 ? 's' : ''} · ${item.types ? Engine.describeTypes(item.types) : 'checking pages…'}`;
      const meta = li.querySelector('.meta');
      meta.textContent = `${formatBytes(item.file.size)} · ${pages}`;
      if (item.error) meta.classList.add('err');
      li.addEventListener('click', e => {
        const act = e.target.closest('button')?.dataset.act;
        if (!act) return;
        if (act === 'rm') Engine.close(items.splice(i, 1)[0].src);
        if (act === 'up') [items[i - 1], items[i]] = [items[i], items[i - 1]];
        if (act === 'down') [items[i + 1], items[i]] = [items[i], items[i + 1]];
        render();
      });
      list.appendChild(li);
    });
    const total = items.reduce((s, it) => s + (it.src ? it.src.pages : 0), 0);
    $('#info').textContent = `${items.length} file${items.length === 1 ? '' : 's'} · ${total} pages in total`;
    $('#go').disabled = items.length < 2 || items.some(it => !it.src);
    const errors = items.filter(it => it.error).map(it => it.error);
    if (errors.length) say(err, errors.join(' ') + ' Remove it to continue.');
  }

  $('#clear').addEventListener('click', () => {
    items.forEach(it => Engine.close(it.src));
    items = []; say(err, ''); say(status, ''); render();
  });

  $('#go').addEventListener('click', async () => {
    const btn = $('#go'), text = btn.textContent;
    btn.disabled = true; btn.textContent = 'Merging…'; say(err, '');
    try {
      const parts = items.map(it => ({ src: it.src, indices: [...Array(it.src.pages).keys()] }));
      const bytes = await Engine.build(parts, readOpts(), line => say(status, line));
      download(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
      const before = items.reduce((s, it) => s + it.file.size, 0);
      const change = bytes.length < before * 0.99 ? `, ${Math.round((1 - bytes.length / before) * 100)}% smaller than the originals together` : '';
      say(status, `Done: merged.pdf is ${formatBytes(bytes.length)} (the originals were ${formatBytes(before)}${change}).`);
    } catch (e) {
      say(status, '');
      say(err, e.message || 'Something went wrong while merging.');
    }
    btn.textContent = text; btn.disabled = false;
  });
})();
