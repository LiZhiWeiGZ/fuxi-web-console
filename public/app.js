const $ = (selector) => document.querySelector(selector);

const els = {
  appShell: $('#appShell'),
  mobileNavToggle: $('#mobileNavToggle'),
  mobileNavClose: $('#mobileNavClose'),
  mobileBackdrop: $('#mobileBackdrop'),
  tabDocs: $('#tabDocs'),
  tabWoven: $('#tabWoven'),
  tabChat: $('#tabChat'),
  docSidebar: $('#docSidebar'),
  wovenSidebar: $('#wovenSidebar'),
  chatSidebar: $('#chatSidebar'),
  docsView: $('#docsView'),
  wovenView: $('#wovenView'),
  chatView: $('#chatView'),
  docSearch: $('#docSearch'),
  refreshKb: $('#refreshKb'),
  refreshStatus: $('#refreshStatus'),
  docTree: $('#docTree'),
  wovenSearch: $('#wovenSearch'),
  refreshWoven: $('#refreshWoven'),
  wovenStatus: $('#wovenStatus'),
  wovenTree: $('#wovenTree'),
  docTitle: $('#docTitle'),
  docPath: $('#docPath'),
  docMeta: $('#docMeta'),
  excelTabs: $('#excelTabs'),
  docContent: $('#docContent'),
  headingToc: $('#headingToc'),
  wovenTitle: $('#wovenTitle'),
  wovenPath: $('#wovenPath'),
  wovenMeta: $('#wovenMeta'),
  wovenContent: $('#wovenContent'),
  wovenToc: $('#wovenToc'),
  newChat: $('#newChat'),
  chatSessions: $('#chatSessions'),
  chatTitle: $('#chatTitle'),
  deleteChat: $('#deleteChat'),
  messages: $('#messages'),
  chatForm: $('#chatForm'),
  chatInput: $('#chatInput')
};

const CHAT_KEY = 'fuxi.chat.sessions';
let docData = { groups: [], docs: [], config: null };
let wovenData = { groups: [], docs: [], config: null };
let currentDocPath = null;
let currentWorkbook = null;
let currentView = 'arranged';
let currentWovenPath = null;
let sessions = loadSessions();
let activeSessionId = sessions[0]?.id || null;

init();

function init() {
  bindEvents();
  if (!sessions.length) createSession();
  renderSessions();
  renderMessages();
  loadDocs(true);
  loadWoven(true);
}

function bindEvents() {
  els.mobileNavToggle.addEventListener('click', openMobileNav);
  els.mobileNavClose.addEventListener('click', closeMobileNav);
  els.mobileBackdrop.addEventListener('click', closeMobileNav);
  els.tabDocs.addEventListener('click', () => switchMainTab('docs'));
  els.tabWoven.addEventListener('click', () => switchMainTab('woven'));
  els.tabChat.addEventListener('click', () => switchMainTab('chat'));
  els.docSearch.addEventListener('input', () => renderDocTree());
  els.wovenSearch.addEventListener('input', () => renderWovenTree());
  els.refreshKb.addEventListener('click', () => loadDocs(true));
  els.refreshWoven.addEventListener('click', () => loadWoven(true));
  els.newChat.addEventListener('click', () => { createSession(); switchMainTab('chat'); closeMobileNav(); });
  els.deleteChat.addEventListener('click', deleteActiveSession);
  els.chatForm.addEventListener('submit', submitQuestion);
  els.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) els.chatForm.requestSubmit();
  });
  els.excelTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    openDocView(button.dataset.view);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileNav();
  });
  window.addEventListener('resize', () => {
    if (!isMobileViewport()) closeMobileNav();
  });
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function openMobileNav() {
  els.appShell.classList.add('nav-open');
  document.body.classList.add('mobile-nav-open');
  els.mobileBackdrop.hidden = false;
  els.mobileNavToggle.setAttribute('aria-expanded', 'true');
}

function closeMobileNav() {
  els.appShell.classList.remove('nav-open');
  document.body.classList.remove('mobile-nav-open');
  els.mobileBackdrop.hidden = true;
  els.mobileNavToggle.setAttribute('aria-expanded', 'false');
}

function switchMainTab(name) {
  const docs = name === 'docs';
  const woven = name === 'woven';
  const chat = name === 'chat';
  els.tabDocs.classList.toggle('active', docs);
  els.tabWoven.classList.toggle('active', woven);
  els.tabChat.classList.toggle('active', chat);
  els.tabDocs.setAttribute('aria-selected', docs ? 'true' : 'false');
  els.tabWoven.setAttribute('aria-selected', woven ? 'true' : 'false');
  els.tabChat.setAttribute('aria-selected', chat ? 'true' : 'false');
  els.docSidebar.classList.toggle('active', docs);
  els.wovenSidebar.classList.toggle('active', woven);
  els.chatSidebar.classList.toggle('active', chat);
  els.docsView.classList.toggle('active', docs);
  els.wovenView.classList.toggle('active', woven);
  els.chatView.classList.toggle('active', chat);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadDocs(force = false) {
  setStatus(force ? '正在刷新知识库...' : '正在读取知识库...');
  try {
    docData = force ? await api('/api/docs/refresh', { method: 'POST', body: '{}' }) : await api('/api/docs/tree');
    renderDocTree();
    setStatus(`已同步 ${docData.docs.length} 个文档，${formatTime(docData.scannedAt)}`);
    if (currentDocPath) {
      const exists = docData.docs.some((doc) => doc.path === currentDocPath);
      if (exists) await openDoc(currentDocPath, currentView, { preserveScroll: true });
      else showDeletedDocument();
    } else {
      const first = docData.groups.find((group) => group.items.length)?.items[0];
      if (first) await openDoc(first.path, first.defaultView || defaultViewKey());
      else showEmptyDocument('知识库中还没有可展示的 Markdown 文档。');
    }
  } catch (error) {
    setStatus(`刷新失败：${error.message}`);
    showEmptyDocument(`读取知识库失败：${escapeHtml(error.message)}`);
  }
}

async function loadWoven(force = false) {
  setWovenStatus(force ? '正在刷新专题...' : '正在读取专题...');
  try {
    wovenData = force ? await api('/api/woven/refresh', { method: 'POST', body: '{}' }) : await api('/api/woven/tree');
    renderWovenTree();
    setWovenStatus(`已同步 ${wovenData.docs.length} 个专题，${formatTime(wovenData.scannedAt)}`);
    if (currentWovenPath) {
      const exists = wovenData.docs.some((doc) => doc.path === currentWovenPath);
      if (exists) await openWoven(currentWovenPath, { preserveScroll: true });
      else showDeletedWoven();
    } else {
      const first = wovenData.groups.find((group) => group.items.length)?.items[0];
      if (first) await openWoven(first.path);
      else showEmptyWoven('知识库中还没有可展示的专题文档。');
    }
  } catch (error) {
    setWovenStatus(`刷新失败：${error.message}`);
    showEmptyWoven(`读取专题失败：${escapeHtml(error.message)}`);
  }
}

function setStatus(text) {
  els.refreshStatus.textContent = text;
}

function setWovenStatus(text) {
  els.wovenStatus.textContent = text;
}

function defaultViewKey() {
  return docData.config?.navigation?.primaryTab || docData.config?.tabs?.[0]?.key || 'arranged';
}

function getDocViewTabs(doc) {
  if (Array.isArray(doc.viewTabs) && doc.viewTabs.length) return doc.viewTabs;
  if (Array.isArray(doc.views?.tabs) && doc.views.tabs.length) return doc.views.tabs;
  return (docData.config?.tabs || []).map((tab) => ({
    key: tab.key,
    label: tab.label,
    path: doc.views?.[tab.key] || null,
    available: Boolean(doc.views?.[tab.key]),
    role: tab.role
  }));
}

function imageRootRel() {
  return docData.config?.assets?.imageRoot || 'raw/excel-images';
}

function renderDocTree() {
  const q = els.docSearch.value.trim().toLowerCase();
  els.docTree.innerHTML = '';
  for (const group of docData.groups) {
    const items = group.items.filter((doc) => !q || [doc.title, doc.path, doc.workbook].join('\n').toLowerCase().includes(q));
    if (!items.length) continue;
    const section = document.createElement('section');
    section.className = 'group';
    section.innerHTML = `<div class="group-title"><span>${escapeHtml(group.label)}</span><span>${items.length}</span></div>`;
    for (const doc of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `doc-item ${doc.path === currentDocPath ? 'active' : ''}`;
      button.title = doc.title;
      if (doc.path === currentDocPath) button.setAttribute('aria-current', 'page');
      button.innerHTML = `<div class="doc-item-title">${escapeHtml(doc.title)}</div>`;
      button.addEventListener('click', () => {
        openDoc(doc.path, doc.defaultView || defaultViewKey());
        closeMobileNav();
      });
      section.appendChild(button);
    }
    els.docTree.appendChild(section);
  }
}

function renderWovenTree() {
  const q = els.wovenSearch.value.trim().toLowerCase();
  els.wovenTree.innerHTML = '';
  for (const group of wovenData.groups) {
    const items = group.items.filter((doc) => !q || [doc.title, doc.path, doc.groupLabel].join('\n').toLowerCase().includes(q));
    if (!items.length) continue;
    const section = document.createElement('section');
    section.className = 'group';
    section.innerHTML = `<div class="group-title"><span>${escapeHtml(group.label)}</span><span>${items.length}</span></div>`;
    for (const doc of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `doc-item ${doc.path === currentWovenPath ? 'active' : ''}`;
      button.title = doc.title;
      if (doc.path === currentWovenPath) button.setAttribute('aria-current', 'page');
      button.innerHTML = `<div class="doc-item-title">${escapeHtml(doc.title)}</div>`;
      button.addEventListener('click', () => {
        openWoven(doc.path);
        closeMobileNav();
      });
      section.appendChild(button);
    }
    els.wovenTree.appendChild(section);
  }
}

async function openDoc(path, view = 'arranged', options = {}) {
  const doc = await api(`/api/docs/read?path=${encodeURIComponent(path)}`);
  currentDocPath = doc.path;
  currentWorkbook = doc.workbook;
  currentView = view;
  renderDocTree();
  renderDoc(doc);
  updateExcelTabs(doc, view);
  if (!options.preserveScroll) els.docContent.scrollTop = 0;
}

async function openWoven(path, options = {}) {
  const doc = await api(`/api/docs/read?path=${encodeURIComponent(path)}`);
  currentWovenPath = doc.path;
  renderWovenTree();
  renderWovenDoc(doc);
  if (!options.preserveScroll) els.wovenContent.scrollTop = 0;
}

function renderDoc(doc) {
  els.docTitle.textContent = doc.title;
  els.docPath.textContent = '';
  els.docMeta.textContent = doc.updatedAt ? `更新：${formatTime(doc.updatedAt)}` : '';
  els.docContent.classList.remove('empty-state');
  const body = rewriteImageMarkdownUrls(doc.body, doc);
  els.docContent.innerHTML = renderMarkdown(body, doc.frontmatter);
  renderToc(doc.headings);
}

function renderWovenDoc(doc) {
  els.wovenTitle.textContent = doc.title;
  els.wovenPath.textContent = '';
  els.wovenMeta.textContent = [doc.groupLabel, doc.updatedAt ? `更新：${formatTime(doc.updatedAt)}` : ''].filter(Boolean).join(' · ');
  els.wovenContent.classList.remove('empty-state');
  els.wovenContent.innerHTML = renderMarkdown(doc.body, doc.frontmatter);
  renderWovenToc(doc.headings);
}

function updateExcelTabs(doc, view) {
  const tabs = getDocViewTabs(doc);
  const hasExcelViews = tabs.some((tab) => tab.available);
  els.excelTabs.classList.toggle('hidden', !hasExcelViews);
  els.excelTabs.innerHTML = tabs.map((tab) => `
    <button data-view="${escapeAttr(tab.key)}" class="view-tab ${tab.key === view ? 'active' : ''}" type="button" ${tab.available ? '' : 'disabled'}>
      ${escapeHtml(tab.label)}
    </button>
  `).join('');
}

async function openDocView(view) {
  if (!currentDocPath) return;
  const current = await api(`/api/docs/read?path=${encodeURIComponent(currentDocPath)}`);
  const targetPath = current.views?.[view];
  currentView = view;
  for (const button of els.excelTabs.querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === view);
  if (!targetPath) return showEmptyDocument('当前文档没有对应内容。');
  await openDoc(targetPath, view);
}

async function renderImages(workbook) {
  if (!workbook) return showEmptyDocument('当前文档没有图片资源。');
  els.docTitle.textContent = `${workbook} - 图片资源`;
  els.docPath.textContent = `${imageRootRel()}/${workbook}`;
  els.docMeta.textContent = '';
  els.headingToc.innerHTML = '';
  try {
    const data = await api(`/api/docs/images?workbook=${encodeURIComponent(workbook)}`);
    const mediaHtml = data.media ? `<h2 id="media-md">MEDIA.md</h2>${renderMarkdown(data.media.body, data.media.frontmatter)}` : '';
    const images = data.images.map((image) => `
      <div class="image-card">
        <a href="${image.url}" target="_blank" rel="noreferrer"><img src="${image.url}" alt="${escapeHtml(image.name)}"></a>
        <a href="${image.url}" target="_blank" rel="noreferrer">${escapeHtml(image.name)}</a>
      </div>
    `).join('');
    els.docContent.classList.remove('empty-state');
    els.docContent.innerHTML = `<h1>${escapeHtml(workbook)} 图片资源</h1>${mediaHtml}<h2 id="image-files">图片文件</h2><div class="image-grid">${images || '<p>没有找到图片文件。</p>'}</div>`;
    renderToc([{ level: 1, title: `${workbook} 图片资源`, anchor: slugify(`${workbook} 图片资源`) }, { level: 2, title: '图片文件', anchor: 'image-files' }]);
  } catch (error) {
    showEmptyDocument(`读取图片资源失败：${escapeHtml(error.message)}`);
  }
}

async function renderFused(current) {
  const workbook = current.views?.workbook || currentWorkbook;
  const arrangedPath = current.views?.arranged || current.path;
  const rawPath = current.views?.raw;
  if (!workbook || !arrangedPath) return showEmptyDocument('当前文档没有可融合的整理版和图片资源。');
  try {
    const [arranged, raw, imageData] = await Promise.all([
      api(`/api/docs/read?path=${encodeURIComponent(arrangedPath)}`),
      rawPath ? api(`/api/docs/read?path=${encodeURIComponent(rawPath)}`) : Promise.resolve(null),
      api(`/api/docs/images?workbook=${encodeURIComponent(workbook)}`)
    ]);
    currentDocPath = arranged.path;
    currentWorkbook = workbook;
    currentView = 'fused';
    renderDocTree();
    els.docTitle.textContent = `${arranged.title} - 图文融合`;
    els.docPath.textContent = `${arranged.path} + ${rawPath || '原始文件缺失'} + ${imageRootRel()}/${workbook}`;
    els.docMeta.textContent = `融合 ${imageData.images.length} 张图片`;

    const sourceDoc = raw || arranged;
    const articleHtml = renderMarkdown(sourceDoc.body, sourceDoc.frontmatter);
    const shell = document.createElement('div');
    shell.innerHTML = articleHtml;
    const used = injectImagesLikeExcel(shell, imageData.images);
    const remaining = imageData.images.slice(used);
    const allImages = imageData.images.map(renderImageCard).join('');

    els.docContent.classList.remove('empty-state');
    els.docContent.innerHTML = `
      <section class="fused-hero">
        <div>
          <h1 id="fused-overview">图文融合阅读</h1>
          <p>正文优先使用 raw/excel-md 的原始 Excel 抽取结构，图片按抽取顺序插入到 Sheet、流程图、界面、弹窗、美术需求等段落中间。由于当前抽取结果没有单元格锚点，这里是按原始文档顺序推断插入。</p>
        </div>
        <div class="fused-count">${imageData.images.length}<span>张图片</span></div>
      </section>
      <section class="fused-source-summary">
        <h2 id="fused-summary">整理版摘要</h2>
        ${renderMarkdown(arranged.body.split(/\n##\s+/).slice(0, 3).join('\n## '), arranged.frontmatter)}
      </section>
      <section class="fused-article">
        <h2 id="fused-excel-body">原始 Excel 图文正文</h2>
        ${shell.innerHTML}
      </section>
      ${remaining.length ? `<section class="fused-section"><h2 id="fused-remaining-images">未插入图片</h2><p class="fused-note">这些图片没有找到足够合适的段落位置，保留在此处。</p><div class="fused-image-grid">${remaining.map(renderImageCard).join('')}</div></section>` : ''}
      <section class="fused-section">
        <h2 id="fused-images">完整图片资源</h2>
        <div class="fused-image-grid">${allImages || '<p>没有找到图片文件。</p>'}</div>
      </section>`;
    renderToc([
      { level: 1, title: '图文融合阅读', anchor: 'fused-overview' },
      { level: 2, title: '整理版摘要', anchor: 'fused-summary' },
      { level: 2, title: '原始 Excel 图文正文', anchor: 'fused-excel-body' },
      ...(sourceDoc.headings || []),
      ...(remaining.length ? [{ level: 2, title: '未插入图片', anchor: 'fused-remaining-images' }] : []),
      { level: 2, title: '完整图片资源', anchor: 'fused-images' }
    ]);
    for (const button of els.excelTabs.querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === 'fused');
    els.docContent.scrollTop = 0;
  } catch (error) {
    showEmptyDocument(`生成图文融合页失败：${escapeHtml(error.message)}`);
  }
}

function injectImagesLikeExcel(container, images) {
  if (!images.length) return 0;
  const preferred = [...container.querySelectorAll('h2, h3, h4')].filter((node) => /图|界面|入口|弹窗|美术|需求|流程|规则|系统|功能|操作|展示|UI|ui/i.test(node.textContent || ''));
  const allHeadings = [...container.querySelectorAll('h2, h3, h4')];
  const anchors = uniqueNodes([...preferred, ...allHeadings]).slice(0, Math.max(10, Math.ceil(images.length / 2)));
  if (!anchors.length) return 0;
  let cursor = 0;
  const firstPassCount = Math.min(images.length, anchors.length * 3);
  for (let index = 0; index < anchors.length && cursor < firstPassCount; index += 1) {
    const anchor = anchors[index];
    const title = anchor.textContent || '';
    const weight = /图|界面|弹窗|美术|需求|流程|UI|ui/i.test(title) ? 3 : 2;
    const chunk = images.slice(cursor, cursor + weight);
    cursor += chunk.length;
    if (!chunk.length) break;
    const block = document.createElement('figure');
    block.className = 'excel-inline-images';
    block.innerHTML = `<figcaption>插入图片：${escapeHtml(title || '当前段落')}</figcaption><div class="excel-inline-grid">${chunk.map(renderImageCard).join('')}</div>`;
    insertAfterContext(anchor, block);
  }
  return cursor;
}

function insertAfterContext(anchor, block) {
  let target = anchor;
  let cursor = anchor.nextElementSibling;
  let steps = 0;
  while (cursor && !/^H[1-4]$/.test(cursor.tagName) && steps < 4) {
    target = cursor;
    cursor = cursor.nextElementSibling;
    steps += 1;
  }
  target.insertAdjacentElement('afterend', block);
}

function uniqueNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    if (seen.has(node)) return false;
    seen.add(node);
    return true;
  });
}

function renderImageCard(image) {
  return `<div class="image-card">
    <a href="${image.url}" target="_blank" rel="noreferrer"><img src="${image.url}" alt="${escapeHtml(image.name)}"></a>
    <a href="${image.url}" target="_blank" rel="noreferrer">${escapeHtml(image.name)}</a>
  </div>`;
}
async function renderImageMd(current) {
  const workbook = current.views?.workbook || currentWorkbook;
  if (!workbook) return showEmptyDocument('当前文档没有对应的带图 Markdown。');
  currentWorkbook = workbook;
  currentView = 'imageMd';
  for (const button of els.excelTabs.querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === 'imageMd');
  els.docTitle.textContent = `${current.title || workbook} - 原始文件`;
  els.docPath.textContent = `正在根据锚点 Markdown 生成标准带图版：${workbook}`;
  els.docMeta.textContent = '按需生成';
  els.headingToc.innerHTML = '';
  els.docContent.classList.remove('empty-state');
  els.docContent.innerHTML = '<div class="excel-like-actions"><span>正在生成标准带图 Markdown，首次打开可能需要几秒。</span></div>';
  try {
    const result = await api(`/api/excel/image-md?workbook=${encodeURIComponent(workbook)}`);
    const doc = result.doc;
    els.docPath.textContent = `${result.originalPath} -> ${result.path}`;
    els.docMeta.textContent = `图片：${doc.frontmatter?.image_count ?? ''}`;
    els.docContent.innerHTML = renderMarkdown(rewriteImageMarkdownUrls(doc.body, doc), doc.frontmatter);
    renderToc(doc.headings || []);
    els.docContent.scrollTop = 0;
  } catch (error) {
    showEmptyDocument(`带图 Markdown 生成失败：${escapeHtml(error.message)}`);
  }
}

function rewriteImageMarkdownUrls(markdown, doc = null) {
  const imageRoot = doc?.config?.assets?.imageRoot || docData.config?.assets?.imageRoot || 'raw/excel-images';
  const imageDirName = imageRoot.split('/').filter(Boolean).at(-1) || 'excel-images';
  const marker = `../${imageDirName}/`;
  return String(markdown || '').replace(/!\[([^\]]*)\]\((.+)\)/g, (match, alt, src) => {
    if (!src.startsWith(marker)) return match;
    const rest = src.slice(marker.length);
    const slash = rest.lastIndexOf('/');
    if (slash <= 0) return match;
    const wb = rest.slice(0, slash);
    const file = rest.slice(slash + 1);
    const rel = `${imageRoot}/${decodeHtml(wb)}/${decodeHtml(file)}`;
    return `![${alt}](/api/files?path=${encodeURIComponent(rel)})`;
  });
}
async function renderAnchoredMd(current) {
  const workbook = current.views?.workbook || currentWorkbook;
  if (!workbook) return showEmptyDocument('当前文档没有对应的锚点 Markdown。');
  currentWorkbook = workbook;
  currentView = 'anchoredMd';
  for (const button of els.excelTabs.querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === 'anchoredMd');
  els.docTitle.textContent = `${current.title || workbook} - 锚点MD`;
  els.docPath.textContent = `正在根据原始 Excel 生成锚点 Markdown：${workbook}`;
  els.docMeta.textContent = '按需生成';
  els.headingToc.innerHTML = '';
  els.docContent.classList.remove('empty-state');
  els.docContent.innerHTML = '<div class="excel-like-actions"><span>正在生成带图片锚点的 Markdown，首次打开可能需要几秒。</span></div>';
  try {
    const result = await api(`/api/excel/anchored-md?workbook=${encodeURIComponent(workbook)}`);
    const doc = result.doc;
    els.docPath.textContent = `${result.originalPath} -> ${result.path}`;
    els.docMeta.textContent = `图片锚点：${doc.frontmatter?.image_count ?? ''}`;
    const html = renderAnchoredMarkdown(doc.body, workbook);
    els.docContent.innerHTML = `<div class="anchored-md-wrap">${html}</div>`;
    renderToc(doc.headings || []);
    els.docContent.scrollTop = 0;
  } catch (error) {
    showEmptyDocument(`锚点 Markdown 生成失败：${escapeHtml(error.message)}`);
  }
}

function renderAnchoredMarkdown(markdown, workbook) {
  const body = String(markdown || '');
  const tableStart = body.indexOf('<table');
  if (tableStart < 0) return renderMarkdown(body);
  const intro = body.slice(0, tableStart);
  const tables = body.slice(tableStart);
  const safeIntro = renderMarkdown(intro);
  const rewritten = rewriteAnchoredImageUrls(tables, workbook);
  return safeIntro + rewritten;
}

function rewriteAnchoredImageUrls(html, workbook) {
  return html.replace(/src="\.\.\/(excel-images|excel-anchored-images)\/([^"/]+)\/([^"]+)"/g, (_m, dir, wb, file) => {
    const rel = `raw/${dir}/${decodeHtml(wb)}/${decodeHtml(file)}`;
    return `src="/api/files?path=${encodeURIComponent(rel)}"`;
  });
}

function decodeHtml(value) {
  const el = document.createElement('textarea');
  el.innerHTML = value;
  return el.value;
}
async function renderExcelLike(current) {
  const workbook = current.views?.workbook || currentWorkbook;
  if (!workbook) return showEmptyDocument('当前文档没有对应的 Excel 预览。');
  currentWorkbook = workbook;
  currentView = 'excelLike';
  for (const button of els.excelTabs.querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === 'excelLike');
  els.docTitle.textContent = `${current.title || workbook} - Excel 预览`;
  els.docPath.textContent = `正在根据原始 Excel 生成预览：${workbook}`;
  els.docMeta.textContent = '按需生成';
  els.headingToc.innerHTML = '';
  els.docContent.classList.remove('empty-state');
  els.docContent.innerHTML = '<div class="excel-like-actions"><span>正在读取原始 Excel 并生成预览，首次打开可能需要几秒。</span></div>';
  try {
    const preview = await api(`/api/excel/preview?workbook=${encodeURIComponent(workbook)}`);
    els.docPath.textContent = `${preview.originalPath} -> ${preview.path}`;
    els.docContent.innerHTML = `
      <div class="excel-like-actions">
        <span>直接预览原始 Excel：Sheet、网格、合并单元格和图片锚点由后端按需解析。</span>
        <a href="${preview.url}" target="_blank" rel="noreferrer">新窗口打开</a>
      </div>
      <iframe class="excel-like-frame" src="${preview.url}" title="${escapeAttr(workbook)} Excel 预览"></iframe>`;
  } catch (error) {
    showEmptyDocument(`Excel 预览生成失败：${escapeHtml(error.message)}`);
  }
}
function renderToc(headings = []) {
  if (!headings.length) {
    els.headingToc.innerHTML = '';
    return;
  }
  els.headingToc.innerHTML = `<div class="toc-title">目录</div>${headings.map((h) => `<a class="toc-link" style="padding-left:${(h.level - 1) * 12 + 6}px" href="#${h.anchor}">${escapeHtml(h.title)}</a>`).join('')}`;
}

function renderWovenToc(headings = []) {
  if (!headings.length) {
    els.wovenToc.innerHTML = '';
    return;
  }
  els.wovenToc.innerHTML = `<div class="toc-title">目录</div>${headings.map((h) => `<a class="toc-link" style="padding-left:${(h.level - 1) * 12 + 6}px" href="#${h.anchor}">${escapeHtml(h.title)}</a>`).join('')}`;
}

function showDeletedDocument() {
  currentDocPath = null;
  currentView = defaultViewKey();
  renderDocTree();
  showEmptyDocument('当前文档已不存在。知识库目录已刷新，请从左侧重新选择。');
}

function showDeletedWoven() {
  currentWovenPath = null;
  renderWovenTree();
  showEmptyWoven('当前专题已不存在。专题目录已刷新，请从左侧重新选择。');
}

function showEmptyDocument(message) {
  els.docTitle.textContent = '文档';
  els.docPath.textContent = '';
  els.docMeta.textContent = '';
  els.excelTabs.classList.add('hidden');
  els.headingToc.innerHTML = '';
  els.docContent.classList.add('empty-state');
  els.docContent.innerHTML = `<p>${message}</p>`;
}

function showEmptyWoven(message) {
  els.wovenTitle.textContent = '专题';
  els.wovenPath.textContent = '';
  els.wovenMeta.textContent = '';
  els.wovenToc.innerHTML = '';
  els.wovenContent.classList.add('empty-state');
  els.wovenContent.innerHTML = `<p>${message}</p>`;
}

function renderMarkdown(markdown, frontmatter = {}) {
  const parts = [];
  if (Object.keys(frontmatter || {}).length) {
    parts.push('<details><summary>frontmatter</summary><pre><code>' + escapeHtml(JSON.stringify(frontmatter, null, 2)) + '</code></pre></details>');
  }
  const lines = String(markdown || '').split(/\r?\n/);
  let i = 0;
  let inCode = false;
  let code = [];
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    parts.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCode) {
        parts.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushPara();
        inCode = true;
      }
      i += 1;
      continue;
    }
    if (inCode) {
      code.push(line);
      i += 1;
      continue;
    }
    if (!line.trim()) {
      flushPara();
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      const text = stripInline(heading[2]);
      parts.push(`<h${level} id="${slugify(text)}">${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      flushPara();
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      parts.push(renderTable(tableLines));
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      const quotes = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quotes.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      parts.push(`<blockquote>${quotes.map((q) => inline(q)).join('<br>')}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      parts.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      parts.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
      continue;
    }
    para.push(line.trim());
    i += 1;
  }
  flushPara();
  if (inCode) parts.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return parts.join('\n');
}

function isTableStart(lines, index) {
  return lines[index]?.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || '');
}

function renderTable(lines) {
  const rows = lines.filter((_, index) => index !== 1).map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  if (!rows.length) return '';
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function inline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${text}</a>`);
  return html;
}

function stripInline(value) {
  return String(value).replace(/[`*_#\[\]()]/g, '').trim();
}

function slugify(value) {
  return encodeURIComponent(String(value).trim().toLowerCase().replace(/\s+/g, '-'));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(CHAT_KEY, JSON.stringify(sessions));
}

function createId(prefix = 'id') {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSession() {
  const now = new Date().toISOString();
  const session = { id: createId('session'), title: '新对话', createdAt: now, updatedAt: now, messages: [] };
  sessions.unshift(session);
  activeSessionId = session.id;
  saveSessions();
  renderSessions();
  renderMessages();
}

function getActiveSession() {
  return sessions.find((session) => session.id === activeSessionId) || sessions[0];
}

function renderSessions() {
  els.chatSessions.innerHTML = '';
  for (const session of sessions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `session-item ${session.id === activeSessionId ? 'active' : ''}`;
    button.innerHTML = `<div class="session-title">${escapeHtml(session.title)}</div><div class="session-time">${formatTime(session.updatedAt)}</div>`;
    button.addEventListener('click', () => {
      activeSessionId = session.id;
      renderSessions();
      renderMessages();
      closeMobileNav();
    });
    els.chatSessions.appendChild(button);
  }
}

function renderMessages() {
  const session = getActiveSession();
  if (!session) return;
  els.chatTitle.textContent = session.title;
  els.messages.innerHTML = session.messages.length ? '' : '<div class="empty-state">直接提问，后端会从知识库文件中定位来源。</div>';
  for (const msg of session.messages) {
    const row = document.createElement('div');
    row.className = `message ${msg.role}`;
    const sources = msg.sources?.length ? `<div class="source-list">${msg.sources.map((source) => `<button class="source-chip" data-source-path="${escapeAttr(source.path)}" type="button">${escapeHtml(source.title)}</button>`).join('')}</div>` : '';
    row.innerHTML = `<div class="bubble">${renderMarkdown(msg.content)}${sources}</div>`;
    row.querySelectorAll('[data-source-path]').forEach((button) => {
      button.addEventListener('click', () => {
        const sourcePath = button.dataset.sourcePath;
        if (isWovenPath(sourcePath)) {
          switchMainTab('woven');
          openWoven(sourcePath);
        } else {
          switchMainTab('docs');
          openDoc(sourcePath, defaultViewKey());
        }
      });
    });
    els.messages.appendChild(row);
  }
  els.messages.scrollTop = els.messages.scrollHeight;
}

async function submitQuestion(event) {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  const session = getActiveSession();
  const now = new Date().toISOString();
  if (session.title === '新对话') session.title = text.slice(0, 18);
  session.updatedAt = now;
  session.messages.push({ id: createId('message'), role: 'user', content: text });
  els.chatInput.value = '';
  saveSessions();
  renderSessions();
  renderMessages();

  const pending = { id: createId('message'), role: 'assistant', content: '正在查询知识库...', sources: [] };
  session.messages.push(pending);
  renderMessages();
  try {
    const result = await api('/api/ask', { method: 'POST', body: JSON.stringify({ messages: session.messages.filter((m) => m.role !== 'assistant' || m.id !== pending.id).map(({ role, content }) => ({ role, content })) }) });
    pending.content = result.answer;
    pending.sources = result.sources || [];
  } catch (error) {
    pending.content = `问答失败：${error.message}`;
  }
  session.updatedAt = new Date().toISOString();
  saveSessions();
  renderSessions();
  renderMessages();
}

function deleteActiveSession() {
  if (!activeSessionId) return;
  sessions = sessions.filter((session) => session.id !== activeSessionId);
  if (!sessions.length) {
    activeSessionId = null;
    createSession();
    return;
  }
  activeSessionId = sessions[0].id;
  saveSessions();
  renderSessions();
  renderMessages();
}

function isWovenPath(path) {
  return (wovenData.config?.woven?.groups || []).some((group) => path === `${group.path}.md` || path.startsWith(`${group.path}/`));
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}







