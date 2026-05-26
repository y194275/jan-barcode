const STORAGE_KEY = 'jan-barcode-codes';
let codes = [];
let currentDetailIndex = 0;
let tesseractLoaded = false;
let tesseractWorker = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadCodes();
  renderList();
  bindEvents();
}

function bindEvents() {
  document.getElementById('camera-input').addEventListener('change', handleCameraInput);
  document.getElementById('add-btn').addEventListener('click', handleManualAdd);
  document.getElementById('manual-jan').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleManualAdd();
  });
  document.getElementById('bulk-toggle-btn').addEventListener('click', () => {
    document.getElementById('bulk-input-area').classList.toggle('hidden');
  });
  document.getElementById('bulk-add-btn').addEventListener('click', handleBulkAdd);
  document.getElementById('clear-all-btn').addEventListener('click', handleClearAll);

  document.getElementById('ocr-add-all').addEventListener('click', handleOcrAddAll);
  document.getElementById('ocr-retry').addEventListener('click', () => {
    document.getElementById('camera-input').click();
  });
  document.getElementById('ocr-retry2').addEventListener('click', () => {
    document.getElementById('camera-input').click();
  });

  document.getElementById('prev-btn').addEventListener('click', () => navigateDetail(-1));
  document.getElementById('next-btn').addEventListener('click', () => navigateDetail(1));

  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.target));
  });
}

// --- View Management ---

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  if (viewId === 'home-view') {
    renderList();
  }
}

// --- Storage ---

function loadCodes() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    codes = data ? JSON.parse(data) : [];
  } catch {
    codes = [];
  }
}

function saveCodes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

// --- JAN Code Validation ---

function calcCheckDigit(code12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function validateEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  return calcCheckDigit(code.slice(0, 12)) === parseInt(code[12]);
}

function extractJANCodes(text) {
  const matches = text.match(/\d{13}/g) || [];
  const seen = new Set();
  const results = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      results.push({
        code: m,
        valid: validateEAN13(m)
      });
    }
  }
  return results;
}

// --- Manual Input ---

function handleManualAdd() {
  const input = document.getElementById('manual-jan');
  const code = input.value.trim();

  if (!code) return;

  if (!/^\d{13}$/.test(code)) {
    showToast('13桁の数字を入力してください');
    return;
  }

  if (!validateEAN13(code)) {
    showToast('チェックディジットが不正です');
    return;
  }

  if (codes.some(c => c.code === code)) {
    showToast('既に追加済みです');
    return;
  }

  codes.push({ code, name: '' });
  saveCodes();
  renderList();
  input.value = '';
  showToast('追加しました');
}

function handleBulkAdd() {
  const textarea = document.getElementById('bulk-jan');
  const text = textarea.value.trim();
  if (!text) return;

  const lines = text.split(/[\n\r,\s]+/).filter(Boolean);
  let added = 0;

  for (const line of lines) {
    const code = line.replace(/\D/g, '');
    if (/^\d{13}$/.test(code) && validateEAN13(code) && !codes.some(c => c.code === code)) {
      codes.push({ code, name: '' });
      added++;
    }
  }

  saveCodes();
  renderList();
  textarea.value = '';
  showToast(added > 0 ? `${added}件追加しました` : '追加できるコードがありません');
}

function handleClearAll() {
  if (confirm('すべてのコードを削除しますか？')) {
    codes = [];
    saveCodes();
    renderList();
  }
}

// --- List Rendering ---

function renderList() {
  const list = document.getElementById('code-list');
  const empty = document.getElementById('empty-state');
  const actions = document.getElementById('list-actions');

  if (codes.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    actions.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  actions.classList.remove('hidden');

  list.innerHTML = codes.map((item, i) => `
    <div class="code-item" data-index="${i}">
      <div class="barcode-container">
        <svg id="barcode-${i}"></svg>
      </div>
      <div class="code-info">
        <div>
          <div class="jan-number">${item.code}</div>
          ${item.name ? `<div class="product-name">${escapeHtml(item.name)}</div>` : ''}
        </div>
        <button class="delete-btn" data-index="${i}" title="削除">&times;</button>
      </div>
      <div class="tap-hint">タップして拡大</div>
    </div>
  `).join('');

  codes.forEach((item, i) => {
    try {
      JsBarcode(`#barcode-${i}`, item.code, {
        format: 'EAN13',
        width: 2,
        height: 50,
        displayValue: false,
        margin: 0
      });
    } catch {
      const container = document.querySelector(`#barcode-${i}`).parentElement;
      container.innerHTML = `<div class="barcode-error">チェックディジット不正（正しくは末尾 ${calcCheckDigit(item.code.slice(0, 12))}）</div>`;
    }
  });

  list.querySelectorAll('.code-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      showDetail(parseInt(el.dataset.index));
    });
  });

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      codes.splice(idx, 1);
      saveCodes();
      renderList();
    });
  });
}

// --- Detail View ---

function showDetail(index) {
  currentDetailIndex = index;
  renderDetail();
  showView('detail-view');
}

function renderDetail() {
  const item = codes[currentDetailIndex];
  if (!item) return;

  const container = document.getElementById('detail-barcode');
  container.innerHTML = '<svg id="detail-svg"></svg>';

  try {
    JsBarcode('#detail-svg', item.code, {
      format: 'EAN13',
      width: 3,
      height: 120,
      displayValue: true,
      fontSize: 18,
      margin: 10,
      background: '#ffffff'
    });
  } catch {}

  document.getElementById('detail-jan').textContent = item.code;
  document.getElementById('detail-name').textContent = item.name || '';
  document.getElementById('detail-counter').textContent = `${currentDetailIndex + 1} / ${codes.length}`;
  document.getElementById('detail-title').textContent = `バーコード ${currentDetailIndex + 1}/${codes.length}`;

  document.getElementById('prev-btn').disabled = currentDetailIndex === 0;
  document.getElementById('next-btn').disabled = currentDetailIndex === codes.length - 1;
}

function navigateDetail(direction) {
  const newIndex = currentDetailIndex + direction;
  if (newIndex >= 0 && newIndex < codes.length) {
    currentDetailIndex = newIndex;
    renderDetail();
  }
}

// --- OCR ---

async function handleCameraInput(e) {
  const file = e.target.files[0];
  if (!file) return;

  showView('ocr-view');
  document.getElementById('ocr-status').classList.remove('hidden');
  document.getElementById('ocr-results').classList.add('hidden');
  document.getElementById('ocr-no-results').classList.add('hidden');

  const imgUrl = URL.createObjectURL(file);
  document.getElementById('ocr-image').src = imgUrl;

  try {
    await loadTesseract();
    const result = await runOCR(file);
    const janCodes = extractJANCodes(result);

    document.getElementById('ocr-status').classList.add('hidden');

    if (janCodes.length > 0) {
      renderOcrResults(janCodes);
      document.getElementById('ocr-results').classList.remove('hidden');
    } else {
      document.getElementById('ocr-no-results').classList.remove('hidden');
    }
  } catch (err) {
    document.getElementById('ocr-status').classList.add('hidden');
    document.getElementById('ocr-no-results').classList.remove('hidden');
    console.error('OCR error:', err);
  }

  e.target.value = '';
}

async function loadTesseract() {
  if (tesseractLoaded) return;

  await new Promise((resolve, reject) => {
    if (window.Tesseract) {
      tesseractLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
      tesseractLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function runOCR(imageFile) {
  const statusEl = document.getElementById('ocr-status');
  statusEl.innerHTML = `
    <div class="spinner"></div>
    <p>OCRエンジン読み込み中...</p>
    <div class="progress-bar"><div class="fill" id="ocr-progress"></div></div>
  `;

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100);
        const progressEl = document.getElementById('ocr-progress');
        if (progressEl) progressEl.style.width = pct + '%';
        statusEl.querySelector('p').textContent = `テキスト認識中... ${pct}%`;
      } else if (m.status === 'loading language traineddata') {
        statusEl.querySelector('p').textContent = 'OCRデータ読み込み中...';
      }
    }
  });

  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
  });

  const { data: { text } } = await worker.recognize(imageFile);
  await worker.terminate();

  return text;
}

function renderOcrResults(janCodes) {
  const container = document.getElementById('ocr-codes');

  container.innerHTML = janCodes.map((item, i) => `
    <div class="ocr-code-item ${item.valid ? 'selected' : ''}" data-code="${item.code}">
      <input type="checkbox" ${item.valid ? 'checked' : ''} id="ocr-check-${i}">
      <label class="code-text" for="ocr-check-${i}">${item.code}</label>
      <span class="validity ${item.valid ? 'valid' : 'invalid'}">
        ${item.valid ? 'OK' : 'CD不正'}
      </span>
    </div>
  `).join('');

  container.querySelectorAll('.ocr-code-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const cb = el.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      el.classList.toggle('selected', cb.checked);
    });
  });
}

function handleOcrAddAll() {
  const checkboxes = document.querySelectorAll('#ocr-codes input[type="checkbox"]:checked');
  let added = 0;

  checkboxes.forEach(cb => {
    const code = cb.closest('.ocr-code-item').dataset.code;
    if (!codes.some(c => c.code === code)) {
      codes.push({ code, name: '' });
      added++;
    }
  });

  saveCodes();
  showToast(added > 0 ? `${added}件追加しました` : '追加できるコードがありません');
  showView('home-view');
}

// --- Utilities ---

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 2000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
