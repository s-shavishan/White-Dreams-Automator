/** නමෝ බුද්ධාය | 🤍 */

'use strict';

const $ = id => document.getElementById(id);
const ACTIVE = new Set(['resolving', 'downloading', 'handing-off', 'retrying']);
const ATTENTION = new Set(['failed', 'interrupted', 'cancelled']);
const LABELS = {
    queued: 'Queued',
    resolving: 'Resolving',
    downloading: 'Downloading',
    'handing-off': 'Sending to IDM',
    retrying: 'Retrying',
    completed: 'Completed',
    'handed-off': 'Sent to IDM',
    failed: 'Failed',
    interrupted: 'Interrupted',
    cancelled: 'Cancelled'
};
const PAGE_SIZE = 50;
const model = {
    files: [],
    summary: {},
    revision: -1,
    running: false,
    paused: false,
    extracting: false,
    phase: 'idle',
    config: {},
    capabilities: {},
    selected: new Set(),
    filter: 'all',
    search: '',
    sort: 'added',
    page: 1,
    online: false,
    logs: [],
    logAfter: 0,
    busy: new Set(),
    token: ''
};
let stream, toastTimer, bootPromise, frame, detailId, importedFiles = null, helpPrompted = false;

function storageGet(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem('wd-v3-' + key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem('wd-v3-' + key, JSON.stringify(value));
    } catch { /* Preferences are optional; queue lives on the server. */
    }
}

function refreshTakeoverUI() {
    const idmSelected = $('engineInput').value === 'idm';
    $('takeoverBlock').hidden = !idmSelected;

    const enabled = $('idmTakeoverInput').checked;
    $('takeoverWarning').hidden = !enabled;
    $('idmMaxWaitInput').disabled = !enabled;
}

function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
}

function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
}

function bytes(value) {
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value < 1024) return `${value} B`;
    let n = value, unit = 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    while (n >= 1024 && unit < units.length - 1) {
        n /= 1024;
        unit++;
    }
    return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[unit]}`;
}

function timeLeft(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.ceil(seconds % 3600 / 60)}m`;
}

function runOutcome() {
    const summary = model.summary || {};
    const finished = !model.running && !model.extracting && Number(summary.runTotal) > 0 &&
        Number(summary.runFinished) >= Number(summary.runTotal);
    const attention = Number(summary.failed || 0) + Number(summary.interrupted || 0) + Number(summary.cancelled || 0);
    return {finished, hasIssues: finished && attention > 0};
}

function toast(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}

function showError(error, target) {
    const text = error?.message || String(error || 'An unexpected error occurred.');
    if (target) {
        $(target).textContent = text;
        $(target).classList.remove('hidden');
    } else {
        $('errorText').textContent = (error?.code ? `[${error.code}] ` : '') + text;
        $('errorBanner').classList.remove('hidden');
    }
}

function online(value) {
    model.online = value;
    document.body.classList.toggle('is-offline', !value);
    $('connection').className = 'connection ' + (value ? '' : 'offline');
    $('connection').replaceChildren(node('i'), document.createTextNode(value ? 'Live connection' : 'Reconnecting'));
    $('connectionBanner').classList.toggle('hidden', value);
    controls();
}

async function api(route, body, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(route, {
            method: body === undefined ? 'GET' : 'POST',
            headers: body === undefined ? {} : {'Content-Type': 'application/json', 'X-WD-Token': model.token},
            body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store'
        });
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error('The server returned an unreadable response. Reload the app.');
        }
        if (!response.ok || result.ok === false) {
            const e = new Error(result.error || 'The operation could not be completed.');
            e.code = result.code;
            if (response.status === 401) {
                online(false);
                setTimeout(() => void bootstrap().catch(showError), 300);
            }
            throw e;
        }
        return result;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('The request timed out. Reconnect and check the queue before trying the action again.');
        if (error instanceof TypeError) {
            online(false);
            throw new Error('Cannot reach the local app. Reconnect before trying again.');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function action(key, operation, errorTarget) {
    if (model.busy.has(key)) return;
    model.busy.add(key);
    controls();
    if (errorTarget) $(errorTarget).classList.add('hidden');
    try {
        await operation();
    } catch (error) {
        showError(error, errorTarget);
    } finally {
        model.busy.delete(key);
        controls();
    }
}

function applyState(state) {
    if (!state || !Array.isArray(state.files) || typeof state.revision !== 'number') throw new Error('The queue state was invalid. Reconnect to reload it.');
    if (state.revision < model.revision) return;
    Object.assign(model, {
        files: state.files,
        summary: state.summary || {},
        revision: state.revision,
        running: Boolean(state.running),
        paused: Boolean(state.paused),
        extracting: Boolean(state.extracting),
        phase: state.phase
    });
    const valid = new Set(model.files.map(f => f.id));
    model.selected = new Set([...model.selected].filter(id => valid.has(id)));
    if (state.persistenceError) showError(new Error(state.persistenceError));
    scheduleRender();
}

function applyPatch(patch) {
    if (!patch?.file || typeof patch.revision !== 'number' || patch.revision <= model.revision) return;
    const index = model.files.findIndex(f => f.id === patch.file.id);
    if (index === -1) {
        void api('/api/state').then(applyState).catch(showError);
        return;
    }
    model.files[index] = patch.file;
    model.summary = patch.summary || model.summary;
    model.revision = patch.revision;
    model.phase = patch.phase || model.phase;
    scheduleRender();
}

function connect() {
    stream?.close();
    stream = new EventSource('/api/events');
    stream.onopen = () => {
        online(true);
        void api('/api/state').then(applyState).catch(showError);
    };
    stream.onerror = () => online(false);
    for (const [event, handler] of Object.entries({
        state: applyState, patch: applyPatch, log: appendLog,
        config: cfg => {
            model.config = cfg;
            controls();
        }
    })) {
        stream.addEventListener(event, e => {
            try {
                handler(JSON.parse(e.data));
            } catch {
                showError(new Error('An update could not be read. Use Reconnect to refresh the queue.'));
            }
        });
    }
}

async function bootstrap() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
        const data = await api('/api/bootstrap');
        model.token = data.token;
        model.config = data.config;
        model.capabilities = data.capabilities;
        // Revisions belong to this server session. A restarted server may begin again at zero.
        model.revision = -1;
        const saved = storageGet('selection', []);
        if (Array.isArray(saved)) model.selected = new Set(saved.filter(v => typeof v === 'string'));
        model.logs = Array.isArray(data.logs) ? data.logs.slice(-500) : [];
        applyState(data.state);
        applyTheme(storageGet('theme', data.config.theme || 'light'));
        const compact = Boolean(storageGet('compact', false));
        document.body.classList.toggle('compact', compact);
        $('compactBtn').setAttribute('aria-pressed', String(compact));
        online(true);
        connect();
        renderLogs();
        maybeOpenLicenseHelp();
        if (data.config.warnings?.length) showError(new Error(data.config.warnings.join(' ')));
    })();
    try {
        await bootPromise;
    } finally {
        bootPromise = null;
    }
}

function scheduleRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
        frame = null;
        renderList();
        renderStats();
        controls();
        if ($('detailDialog').open) renderDetails();
    });
}

function filteredFiles() {
    const search = model.search.toLowerCase();
    const list = model.files.filter(f => {
        const filterMatch = model.filter === 'all' || (model.filter === 'pending' && f.status === 'queued') ||
            (model.filter === 'active' && ACTIVE.has(f.status)) || (model.filter === 'completed' && ['completed', 'handed-off'].includes(f.status)) ||
            (model.filter === 'attention' && ATTENTION.has(f.status));
        return filterMatch && (!search || f.name.toLowerCase().includes(search) || f.url.toLowerCase().includes(search));
    });
    if (model.sort !== 'added') list.sort((a, b) => String(a[model.sort]).localeCompare(String(b[model.sort]), undefined, {numeric: true}));
    return list;
}

function saveSelection() {
    storageSet('selection', [...model.selected]);
}

function renderList() {
    const list = filteredFiles();
    const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    model.page = Math.min(model.page, maxPage);
    const start = (model.page - 1) * PAGE_SIZE;
    const activeId = document.activeElement?.dataset?.selectId;
    const fragment = document.createDocumentFragment();
    for (const f of list.slice(start, start + PAGE_SIZE)) {
        const row = node('tr', model.selected.has(f.id) ? 'selected' : '');
        row.dataset.id = f.id;
        row.dataset.status = f.status;
        const cb = node('input');
        cb.type = 'checkbox';
        cb.dataset.selectId = f.id;
        cb.checked = model.selected.has(f.id);
        cb.setAttribute('aria-label', 'Select ' + f.name);
        cb.disabled = model.running;
        const c1 = node('td');
        c1.append(cb);
        const c2 = node('td'), inner = node('div', 'file-cell'), badge = node('div', 'file-icon'), copy = node('div');
        badge.append(icon('file'));
        const title = node('strong', '', f.name);
        title.title = f.name;
        let host;
        try {
            host = new URL(f.url).hostname;
        } catch {
            host = 'Unknown host';
        }
        copy.append(title, node('small', '', `${host} · ${f.kind === 'page' ? 'File page' : 'Direct link'}`));
        inner.append(badge, copy);
        c2.append(inner);
        const c3 = node('td'),
            pill = node('span', 'status-pill s-' + (Object.hasOwn(LABELS, f.status) ? f.status : 'failed'));
        pill.append(node('i'), document.createTextNode(LABELS[f.status] || 'Unknown'));
        c3.append(pill);
        if (f.error) pill.title = f.error.message;
        const c4 = node('td');
        c4.append(node('div', 'transfer-text', f.bytes ? bytes(f.bytes) : '—'));
        if (f.totalBytes && ACTIVE.has(f.status)) c4.append(node('div', 'transfer-detail', `of ${bytes(f.totalBytes)}`));
        else if (f.status === 'handed-off') c4.append(node('div', 'transfer-detail', 'Managed by IDM'));
        else if (f.attempts > 0) c4.append(node('div', 'transfer-detail', `Attempt ${f.attempts}`));
        const c5 = node('td'), details = node('button', 'row-detail', '›');
        details.dataset.detailId = f.id;
        details.setAttribute('aria-label', 'Inspect ' + f.name);
        c5.append(details);
        row.append(c1, c2, c3, c4, c5);
        fragment.append(row);
    }
    $('fileRows').replaceChildren(fragment);
    if (activeId) [...$('fileRows').querySelectorAll('input')].find(el => el.dataset.selectId === activeId)?.focus({preventScroll: true});
    $('emptyState').classList.toggle('hidden', list.length > 0);
    $('emptyState').querySelector('h3').textContent = model.files.length ? 'No files in this view.' : 'A little space for something new.';
    $('emptyState').querySelector('p').textContent = model.files.length ? 'Try another status or a different search.' : 'Drop in a collection page or add direct links. Your queue will stay ready when you are.';
    $('emptyImportBtn').classList.toggle('hidden', model.files.length > 0);
    $('pageInfo').textContent = list.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, list.length)} of ${list.length} files` : 'No files in this view';
    $('pageNumber').textContent = `${model.page} / ${maxPage}`;
    $('prevPage').disabled = model.page <= 1;
    $('nextPage').disabled = model.page >= maxPage;
    const selectedInView = list.filter(f => model.selected.has(f.id)).length;
    $('selectVisible').checked = list.length > 0 && selectedInView === list.length;
    $('selectVisible').indeterminate = selectedInView > 0 && selectedInView < list.length;
    $('selectVisible').disabled = model.running || !list.length;
    $('selInfo').textContent = `${model.selected.size} selected`;
    document.querySelector('.selection-bar')?.classList.toggle('has-selection', model.selected.size > 0);
    $('fileCount').textContent = model.files.length;
    $('navCount').textContent = model.files.length;
}

function renderStats() {
    const s = model.summary;
    $('statTotal').textContent = s.total || 0;
    $('statDone').textContent = s.completed || 0;
    $('statAttention').textContent = (s.failed || 0) + (s.interrupted || 0) + (s.cancelled || 0);
    $('statBytes').textContent = bytes(s.bytes || 0);
    $('statSpeed').textContent = s.speed ? `${bytes(s.speed)} / SEC` : 'NO ACTIVE TRANSFER';
    const percent = s.runTotal ? Math.min(100, Math.max(0, Math.round((s.runFinished || 0) / s.runTotal * 100))) : 0;
    const outcome = runOutcome();
    const runComplete = outcome.finished;
    $('progressText').textContent = percent + '%';
    $('overallProgress').setAttribute('aria-valuenow', String(percent));
    $('overallProgress').querySelector('i').style.width = percent + '%';
    $('queueCaption').textContent = runComplete
        ? `${s.runFinished || 0} of ${s.runTotal} items complete`
        : s.runTotal
            ? `${s.runFinished || 0} of ${s.runTotal} items processed`
            : `${model.selected.size} files selected`;
    const current = model.files.find(f => ACTIVE.has(f.status));
    $('currentFile').textContent = current?.name || (runComplete ? outcome.hasIssues ? 'Run finished with attention.' : 'Run complete.' : 'All is quiet.');
    $('currentFile').title = current?.name || '';
    $('currentStatus').textContent = current
        ? LABELS[current.status] + (current.bytes ? ` · ${bytes(current.bytes)}` : '')
        : runComplete
            ? outcome.hasIssues ? 'Review the highlighted files, then retry when ready.' : 'Every item in this run has been processed.'
            : 'Your next download starts here.';
    $('currentSpeed').textContent = current?.speed ? bytes(current.speed) + '/s' : '—';
    $('currentEta').textContent = current?.speed && current.totalBytes ? timeLeft((current.totalBytes - current.bytes) / current.speed) : '—';
    $('fileProgress').style.width = current?.totalBytes
        ? `${Math.min(99, Math.max(0, current.bytes / current.totalBytes * 100))}%`
        : runComplete ? '100%' : '0%';
    document.querySelector('.transfer-panel')?.classList.toggle('is-complete', runComplete);
    document.querySelector('.control-panel')?.classList.toggle('is-complete', runComplete);
    document.querySelector('.transfer-panel')?.classList.toggle('has-attention', outcome.hasIssues);
    document.querySelector('.control-panel')?.classList.toggle('has-attention', outcome.hasIssues);
    $('queueDot').classList.toggle('complete', runComplete);
    $('queueDot').classList.toggle('attention', outcome.hasIssues);
}

function controls() {
    const busy = model.busy.size > 0, locked = !model.online || busy;
    const mutable = !locked && !model.running && !model.extracting;
    const runnable = model.files.filter(f => model.selected.has(f.id) && !['completed', 'handed-off'].includes(f.status)).length;
    $('startBtn').disabled = !mutable || !runnable;
    $('startBtn').querySelector('span').textContent = model.running ? 'Queue is running' : runnable ? `Start ${runnable} file${runnable === 1 ? '' : 's'}` : 'Start selected';
    $('loadBtn').disabled = !mutable;
    $('loadBtn').firstChild.textContent = model.extracting || model.busy.has('extract') ? 'Finding files… ' : 'Find files ';
    $('cancelExtractBtn').classList.toggle('hidden', !model.extracting && !model.busy.has('extract'));
    $('cancelExtractBtn').disabled = !model.online;
    for (const id of ['importBtn', 'emptyImportBtn', 'importSave', 'settingsSave', 'removeBtn']) $(id).disabled = !mutable || (id === 'removeBtn' && !model.selected.size);
    $('selectNone').disabled = model.running || !model.selected.size;
    $('pauseBtn').disabled = locked || !model.running || model.phase === 'stopping';
    $('pauseBtn').textContent = model.paused ? 'Resume queue' : 'Pause after file';
    $('stopBtn').disabled = !model.online || !model.running || model.phase === 'stopping' || model.busy.has('stop');
    $('retryBtn').disabled = !mutable || !model.files.some(f => ATTENTION.has(f.status));
    $('exportBtn').disabled = !model.files.length;
    const outcome = runOutcome();
    const runComplete = outcome.finished;
    $('queueDot').classList.toggle('on', model.running);
    $('queueDot').classList.toggle('complete', runComplete);
    $('queueDot').classList.toggle('attention', outcome.hasIssues);
    document.querySelector('.control-panel')?.classList.toggle('is-complete', runComplete);
    document.querySelector('.control-panel')?.classList.toggle('has-attention', outcome.hasIssues);
    document.body.classList.toggle('queue-running', model.running || model.extracting);
    $('queueTitle').textContent = model.extracting
        ? 'Finding your files'
        : model.phase === 'stopping'
            ? 'Stopping safely…'
            : model.paused
                ? model.phase === 'paused' ? 'Taking a breather' : 'Pausing after this file'
                : model.running
                    ? 'Making progress'
                    : runComplete ? outcome.hasIssues ? 'Finished with attention' : 'Run complete' : 'Ready when you are';
    const idm = model.config.engine === 'idm';
    const takeover = idm && Boolean(model.config.idmTakeover);
    $('engineLabel').textContent = takeover ? 'IDM · full control' : idm ? 'IDM · hand-off' : 'Built-in';
    $('engineNote').textContent = takeover
        ? 'WhiteDreams closes IDM before each job and waits for completion. Do not use IDM manually while the queue runs.'
        : idm
            ? 'Sent to IDM means handed off, not completed. Stop IDM transfers in IDM.'
            : 'Actual transfer progress. Existing files are never overwritten.';
    $('openFolderBtn').disabled = !model.online || !model.capabilities.desktop;
    $('openFolderBtn').title = model.capabilities.desktop ? 'Open the configured download folder' : 'Folder opening is available in the desktop app';
    $('browseDirectory').disabled = !mutable || !model.capabilities.desktop;
    $('browseIdm').disabled = $('browseDirectory').disabled;
    $('checkUpdatesBtn').disabled = !model.online || !model.capabilities.updates || busy;
}

function openDialog(id) {
    if (!$(id).open) $(id).showModal();
}

function confirmAction(title, message) {
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmDialog').returnValue = '';
    return new Promise(resolve => {
        $('confirmDialog').addEventListener('close', () => resolve($('confirmDialog').returnValue === 'yes'), {once: true});
        openDialog('confirmDialog');
        $('confirmCancel').focus();
    });
}

function openImport() {
    importedFiles = null;
    $('importText').value = '';
    $('importFile').value = '';
    $('importFileLabel').textContent = 'Duplicates are skipped automatically.';
    $('importError').classList.add('hidden');
    openDialog('importDialog');
    $('importText').focus();
}

function openHelp() {
    openDialog('helpDialog');
}

function maybeOpenLicenseHelp() {
    if (model.config.hasLicense || helpPrompted) return;
    helpPrompted = true;
    requestAnimationFrame(openHelp);
}

function applyTheme(theme) {
    const chosen = ['light', 'dark', 'system'].includes(theme) ? theme : 'light';
    const resolved = chosen === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : chosen;
    document.documentElement.dataset.theme = resolved;
    const use = $('themeBtn')?.querySelector('use');
    use?.setAttribute('href', resolved === 'dark' ? '#i-sun' : '#i-moon');
    $('themeBtn')?.setAttribute('title', resolved === 'dark' ? 'Switch to Cloud theme' : 'Switch to Midnight theme');
    $('themeBtn')?.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#090d18' : '#f4f7fc');
    storageSet('theme', chosen);
}

function settings() {
    const c = model.config;
    $('engineInput').value = c.engine || 'native';
    $('themeInput').value = storageGet('theme', c.theme || 'light');
    $('directoryInput').value = c.downloadDir || '';
    $('idmInput').value = c.idmPath || '';
    $('retriesInput').value = c.retries ?? 2;
    $('timeoutInput').value = c.timeoutMinutes || 120;
    $('selectorInput').value = c.selector || '#plaintext a[href]';
    $('idmTakeoverInput').checked = Boolean(c.idmTakeover);
    $('idmMaxWaitInput').value = Math.max(1, Math.round((c.idmMaxWaitMs || 6 * 60 * 60 * 1000) / 60000));
    refreshTakeoverUI();
    $('licenseInput').value = '';
    $('clearLicenseInput').checked = false;
    $('licenseStatus').textContent = c.hasLicense ? 'Configured · ' + c.licenseProtection : 'Not configured';
    $('licenseInput').disabled = !c.canSaveLicense;
    $('licenseHelp').textContent = c.canSaveLicense ? 'Keys are protected using OS encryption. CloakBrowser may use the key for license validation. Leave blank to keep it unchanged.' : 'Secure key saving is unavailable in this session. Use the desktop app or WD_LICENSE for standalone Node mode. Direct downloads still work.';
    $('configPath').textContent = 'Settings: ' + (c.configPath || 'Not available');
    $('settingsError').classList.add('hidden');
    openDialog('settingsDialog');
    controls();
}

function appendLog(entry) {
    if (!entry || typeof entry.message !== 'string' || typeof entry.id !== 'number') return;
    if (!model.logs.some(e => e.id === entry.id)) model.logs.push(entry);
    model.logs = model.logs.slice(-500);
    renderLogs();
}

function renderLogs() {
    const entries = model.logs.filter(e => e.id > model.logAfter);
    const recent = entries.slice(-3).reverse().map(e => {
        const line = node('div', 'recent-entry ' + e.level);
        const text = node('span', '', e.message);
        text.title = e.message;
        line.append(node('i'), text, node('time', '', new Date(e.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })));
        return line;
    });
    $('recentLog').replaceChildren(...recent);
    const filter = $('logFilter').value;
    const full = entries.filter(e => filter === 'all' || e.level === filter).reverse().map(e => {
        const row = node('div', 'log-entry ' + e.level);
        row.append(node('time', '', new Date(e.time).toLocaleTimeString()), node('span', 'level', e.code || e.level), node('span', '', e.message));
        return row;
    });
    $('fullLog').replaceChildren(...full);
}

function exportData(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = node('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function renderDetails() {
    const f = model.files.find(item => item.id === detailId);
    if (!f) {
        $('detailDialog').close();
        return;
    }
    $('detailTitle').textContent = f.name;
    const fields = {
        'Status': LABELS[f.status] || f.status,
        'Source URL': f.url,
        'Link type': f.kind,
        'Received': bytes(f.bytes || 0),
        'Attempts': f.attempts || 0,
        'Saved filename': f.outputName || 'Not saved yet',
        'Expected SHA-256': f.sha256 || 'Not provided',
        'Computed SHA-256': f.checksum || 'Available after a built-in download',
        'Error': f.error ? `${f.error.code}: ${f.error.message}` : 'No error'
    };
    const elements = Object.entries(fields).flatMap(([key, value]) => [node('dt', '', key), node('dd', '', value)]);
    $('detailBody').replaceChildren(...elements);
}

function wire() {
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
    $('confirmAccept').onclick = () => $('confirmDialog').close('yes');
    $('confirmCancel').onclick = () => $('confirmDialog').close('no');

    $('navDownloads').onclick = () => {
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        window.scrollTo({top: 0, behavior: 'smooth'});
    };
    document.querySelector('.brand').onclick = event => {
        event.preventDefault();
        $('navDownloads').click();
    };
    for (const id of ['navActivity', 'viewActivityBtn']) $(id).onclick = () => {
        renderLogs();
        openDialog('activityDialog');
    };
    $('settingsBtn').onclick = settings;
    $('engineInput').onchange = refreshTakeoverUI;
    $('idmTakeoverInput').onchange = refreshTakeoverUI;
    $('aboutBtn').onclick = () => openDialog('aboutDialog');
    $('openAbout').onclick = () => openDialog('aboutwdDialog');
    $('helpBtn').onclick = openHelp;
    $('helpOpenSettings').onclick = () => {
        $('helpDialog').close();
        settings();
    };
    $('dismissError').onclick = () => $('errorBanner').classList.add('hidden');
    $('reconnectBtn').onclick = () => void bootstrap().catch(showError);
    $('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (storageGet('theme', 'light') === 'system') applyTheme('system');
    });
    $('compactBtn').onclick = () => {
        document.body.classList.toggle('compact');
        const compact = document.body.classList.contains('compact');
        $('compactBtn').setAttribute('aria-pressed', String(compact));
        storageSet('compact', compact);
    };

    for (const id of ['importBtn', 'emptyImportBtn']) $(id).onclick = openImport;

    $('sourceForm').onsubmit = event => {
        event.preventDefault();
        if ($('loadBtn').disabled) return;
        void action('extract', async () => {
            const data = await api('/api/extract', {url: $('urlInput').value.trim()}, 210000);
            applyState(data.state);
            for (const id of data.ids || []) model.selected.add(id);
            saveSelection();
            scheduleRender();
            toast(`${data.added} files added. ${data.duplicates} duplicates skipped.`);
        });
    };
    $('cancelExtractBtn').onclick = () => void action('cancelExtract', async () => {
        await api('/api/extract/cancel', {});
        toast('Extraction cancellation requested.');
    });

    $('importText').oninput = () => {
        importedFiles = null;
        $('importFileLabel').textContent = 'Duplicates are skipped automatically.';
    };
    $('importFile').onchange = () => void action('importRead', async () => {
        const file = $('importFile').files[0];
        if (!file) return;
        if (file.size > 900000) throw new Error('Choose an import smaller than 900 KB.');
        const text = await file.text();
        if (file.name.toLowerCase().endsWith('.json')) {
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error('This file is not valid JSON.');
            }
            importedFiles = Array.isArray(data) ? data : data.files;
            if (!Array.isArray(importedFiles)) throw new Error('The JSON import needs a files array.');
            $('importText').value = importedFiles.map(f => typeof f === 'string' ? f : f.url || '').join('\n');
            $('importFileLabel').textContent = `${file.name} · ${importedFiles.length} entries with metadata`;
        } else {
            importedFiles = null;
            $('importText').value = text;
            $('importFileLabel').textContent = file.name;
        }
    }, 'importError');
    $('importForm').onsubmit = event => {
        event.preventDefault();
        if ($('importSave').disabled) return;
        void action('import', async () => {
            const data = await api('/api/import', importedFiles ? {
                files: importedFiles,
                kind: $('importKind').value
            } : {text: $('importText').value, kind: $('importKind').value});
            applyState(data.state);
            for (const id of data.ids) model.selected.add(id);
            model.filter = 'all';
            model.search = '';
            $('search').value = '';
            model.page = 1;
            document.querySelectorAll('[data-filter]').forEach(el => {
                el.classList.toggle('active', el.dataset.filter === 'all');
                el.setAttribute('aria-pressed', String(el.dataset.filter === 'all'));
            });
            saveSelection();
            scheduleRender();
            $('importDialog').close();
            toast(`${data.added} files added. ${data.duplicates} duplicates skipped.`);
        }, 'importError');
    };

    $('settingsForm').onsubmit = event => {
        event.preventDefault();
        if ($('settingsSave').disabled) return;
        void action('settings', async () => {
            const engine = $('engineInput').value;
            const takeover = engine === 'idm' && $('idmTakeoverInput').checked;
            const maxWaitMinutes = Math.max(1, Math.min(1440, Number($('idmMaxWaitInput').value) || 360));

            // Changing into takeover mode is destructive: IDM will be
            // force-closed before every job. Confirm once, up front.
            if (takeover && !model.config.idmTakeover) {
                const ok = await confirmAction(
                    'Enable full IDM control?',
                    'WhiteDreams will close every running IDM window before each download, ' +
                    'then launch its own IDM instance and wait for completion. ' +
                    'Do not enable this while IDM has downloads in progress or if you plan ' +
                    'to start downloads manually in IDM. Closing IDM mid-download can corrupt ' +
                    'its queue.'
                );
                if (!ok) return;
            }

            const data = await api('/api/config', {
                engine,
                theme: $('themeInput').value,
                downloadDir: $('directoryInput').value.trim(),
                idmPath: $('idmInput').value.trim(),
                retries: Number($('retriesInput').value),
                timeoutMinutes: Number($('timeoutInput').value),
                selector: $('selectorInput').value.trim(),
                license: $('licenseInput').value,
                clearLicense: $('clearLicenseInput').checked,
                idmTakeover: takeover,
                idmMaxWaitMs: maxWaitMinutes * 60000
            });
            model.config = data.config;
            applyTheme(data.config.theme);
            $('licenseInput').value = '';
            $('settingsDialog').close();
            if (data.config.hasLicense) helpPrompted = false;
            else {
                helpPrompted = false;
                maybeOpenLicenseHelp();
            }
            toast('Settings saved.');
        }, 'settingsError');
    };

    for (const [id, route, target] of [['browseDirectory', '/api/pick-directory', 'directoryInput'], ['browseIdm', '/api/pick-idm', 'idmInput']])
        $(id).onclick = () => void action(id, async () => {
            const data = await api(route, {}, 300000);
            if (data.path) $(target).value = data.path;
        }, 'settingsError');

    $('startBtn').onclick = () => void action('start', async () => {
        const data = await api('/api/start', {ids: [...model.selected]});
        applyState(data.state);
        toast(`Started ${data.count} files.`);
    });
    $('pauseBtn').onclick = () => void action('pause', async () => {
        const data = await api(model.paused ? '/api/resume' : '/api/pause', {});
        applyState(data.state);
    });
    $('stopBtn').onclick = async () => {
        const takeover = model.config.engine === 'idm' && model.config.idmTakeover;
        const message = takeover
            ? 'The active IDM transfer will be terminated. Pending selected files become cancelled and can be retried.'
            : 'The current built-in transfer will be cancelled. Pending selected files become cancelled and can be retried. IDM transfers already sent must be stopped in IDM.';
        if (await confirmAction('Stop this queue?', message))
            void action('stop', async () => {
                const data = await api('/api/stop', {});
                applyState(data.state);
            });
    };
    $('retryBtn').onclick = () => void action('retry', async () => {
        const data = await api('/api/retry', {});
        applyState(data.state);
        toast('Retry queue started. Each file restarts from the beginning.');
    });
    $('removeBtn').onclick = async () => {
        const ids = [...model.selected];
        if (await confirmAction(`Remove ${ids.length} queue entries?`, 'This only removes them from the workspace. Downloaded files on disk are kept.'))
            void action('remove', async () => {
                const data = await api('/api/remove', {ids});
                applyState(data.state);
                saveSelection();
                toast('Queue entries removed. Downloaded files were kept.');
            });
    };

    $('selectVisible').onchange = event => {
        for (const f of filteredFiles()) {
            if (event.target.checked) model.selected.add(f.id); else model.selected.delete(f.id);
        }
        saveSelection();
        scheduleRender();
    };
    $('selectNone').onclick = () => {
        model.selected.clear();
        saveSelection();
        scheduleRender();
    };
    $('fileRows').onchange = event => {
        const id = event.target.dataset.selectId;
        if (!id) return;
        if (event.target.checked) model.selected.add(id); else model.selected.delete(id);
        saveSelection();
        scheduleRender();
    };
    $('fileRows').onclick = event => {
        const button = event.target.closest('[data-detail-id]');
        if (!button) return;
        detailId = button.dataset.detailId;
        renderDetails();
        openDialog('detailDialog');
    };
    $('filterTabs').onclick = event => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        model.filter = button.dataset.filter;
        model.page = 1;
        for (const child of $('filterTabs').children) {
            child.classList.toggle('active', child === button);
            child.setAttribute('aria-pressed', String(child === button));
        }
        scheduleRender();
    };
    $('search').oninput = () => {
        model.search = $('search').value.trim();
        model.page = 1;
        scheduleRender();
    };
    $('sortSelect').onchange = () => {
        model.sort = $('sortSelect').value;
        model.page = 1;
        scheduleRender();
    };
    $('prevPage').onclick = () => {
        model.page--;
        scheduleRender();
    };
    $('nextPage').onclick = () => {
        model.page++;
        scheduleRender();
    };

    $('logFilter').onchange = renderLogs;
    $('clearLogBtn').onclick = () => {
        model.logAfter = model.logs.at(-1)?.id || 0;
        renderLogs();
    };
    $('exportBtn').onclick = () => {
        const files = model.selected.size ? model.files.filter(f => model.selected.has(f.id)) : model.files;
        exportData('White-Dreams-queue.json', {
            schema: 'white-dreams.queue',
            version: 1,
            files: files.map(f => ({
                name: f.name,
                url: f.url,
                kind: f.kind,
                sha256: f.sha256 || f.checksum || ''
            }))
        });
        toast(`Exported ${files.length} files. The export contains source URLs; keep it private.`);
    };
    $('diagnosticsBtn').onclick = () => void action('diagnostics', async () => {
        exportData('White-Dreams-diagnostics.json', await api('/api/diagnostics'));
        toast('Diagnostics exported. Review filenames before sharing.');
    });
    $('copyUrlBtn').onclick = () => void action('copy', async () => {
        const f = model.files.find(f => f.id === detailId);
        if (f) {
            await navigator.clipboard.writeText(f.url);
            toast('Source URL copied.');
        }
    });
    $('openFolderBtn').onclick = () => void action('folder', () => api('/api/open-downloads', {}));
    $('checkUpdatesBtn').onclick = () => void action('updates', async () => {
        const data = await api('/api/updates/check', {}, 45000);
        $('updateMessage').textContent = data.message;
    });

    document.addEventListener('keydown', event => {
        if (document.querySelector('dialog[open]')) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            $('search').focus();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
            event.preventDefault();
            if (!$('importBtn').disabled) openImport();
        }
    });
    window.addEventListener('beforeunload', () => {
        saveSelection();
        stream?.close();
    });
    window.addEventListener('offline', () => online(false));
    window.addEventListener('online', () => {
        void bootstrap().catch(showError);
    });
}

window.addEventListener('error', () => showError(new Error('An interface error occurred. Reconnect to reload the latest queue state.')));
window.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    showError(event.reason || new Error('A background action failed.'));
});

wire();
renderList();
renderStats();
controls();
void bootstrap().catch(error => {
    online(false);
    showError(error);
});
