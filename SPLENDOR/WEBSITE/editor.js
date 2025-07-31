const client = new Appwrite.Client();
client
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('680364d1000477ec420b');

const DATABASE_ID = '6816dc7f00195dd533bf';
const COLLECTION_ID = '6816de0600052ed834e4'; 
const CODE_COLLECTION_ID = '682215d200201cb95f05'; 
const databases = new Appwrite.Databases(client);

let currentProject = null;
let activeEditor = null;
const editors = {
    html: null,
    css: null,
    js: null
};

window.editors = editors;
window.editorsReady = new Promise((resolve) => {
    window.resolveEditorsReady = resolve;
});

let consoleVisible = false;
const consoleOutput = [];

const debouncedUpdatePreview = debounce(updatePreview, 300);

window.updatePreview = updatePreview;
window.debouncedUpdatePreview = debouncedUpdatePreview;

let autocompleteEnabled = localStorage.getItem('autocompleteEnabled') !== 'false';

let isGuestViewer = false;

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setupConsole() {
    const consolePanel = document.createElement('div');
    consolePanel.id = 'consolePanel';
    consolePanel.className = 'console-panel';
    consolePanel.innerHTML = `
        <div class="console-header">
            <span>Console Output</span>
            <button id="clearConsole">Clear</button>
            <button id="closeConsole">×</button>
        </div>
        <div class="console-content"></div>
    `;
    document.body.appendChild(consolePanel);

    const consoleDivider = document.createElement('div');
    consoleDivider.className = 'console-divider';
    consoleDivider.style.display = 'none';
    document.body.appendChild(consoleDivider);

    document.getElementById('clearConsole').addEventListener('click', () => {
        consoleOutput.length = 0;
        updateConsoleDisplay();
    });

    document.getElementById('closeConsole').addEventListener('click', () => {
        consoleVisible = false;
        consolePanel.style.display = 'none';
        consoleDivider.style.display = 'none';
    });

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    function onPointerMove(e) {
        if (!isDragging) return;
        const clientY = e.clientY;
        const deltaY = startY - clientY;
        let newHeight = startHeight + deltaY;
        
        const minHeight = 80;
        const maxHeight = window.innerHeight * 0.6;
        newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
        
        consolePanel.style.height = newHeight + 'px';
        consoleDivider.style.top = (window.innerHeight - newHeight - consoleDivider.offsetHeight / 2) + 'px';
    }

    function onPointerUp() {
        if (isDragging) {
            isDragging = false;
            consoleDivider.classList.remove('dragging');
            document.body.style.cursor = '';
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        }
    }

    consoleDivider.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startHeight = consolePanel.offsetHeight;
        consoleDivider.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        if (consoleDivider.setPointerCapture) {
            consoleDivider.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
    });

    window.addEventListener('resize', () => {
        if (consoleVisible) {
            const panelHeight = consolePanel.offsetHeight;
            consoleDivider.style.top = (window.innerHeight - panelHeight - consoleDivider.offsetHeight / 2) + 'px';
        }
    });
}

function updateConsoleDisplay() {
    const consoleContent = document.querySelector('.console-content');
    consoleContent.innerHTML = consoleOutput.map(log => {
        const type = log.type || 'log';
        const message = log.message;
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        return `<div class="console-line ${type}">
            <span class="console-timestamp">[${timestamp}]</span>
            <span class="console-message">${message}</span>
        </div>`;
    }).join('');
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

function logToConsole(message, type = 'log') {
    consoleOutput.push({
        message: String(message),
        type,
        timestamp: new Date()
    });
    if (consoleVisible) {
        updateConsoleDisplay();
    }
}

function updatePreview() {
    const preview = document.getElementById('previewFrame');
    if (!preview) return;

    const html = editors.html ? editors.html.getValue() : '';
    const css = editors.css ? editors.css.getValue() : '';
    const js = editors.js ? editors.js.getValue() : '';

    const isFullHTML = html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html');
    
    const consoleOverrideScript = `
        <script type="text/javascript">
        if (!window._consoleOverridden) {
            window._consoleOverridden = true;
            window._originalConsole = {
                log: console.log,
                error: console.error,
                warn: console.warn,
                info: console.info
            };
            function sendToParent(type, ...args) {
                window.parent.postMessage({
                    type: 'console',
                    method: type,
                    args: args.map(arg => {
                        if (typeof arg === 'object') {
                            try {
                                return JSON.stringify(arg);
                            } catch (e) {
                                return String(arg);
                            }
                        }
                        return String(arg);
                    })
                }, '*');
            }
            console.log = (...args) => {
                window._originalConsole.log.apply(console, args);
                sendToParent('log', ...args);
            };
            console.error = (...args) => {
                window._originalConsole.error.apply(console, args);
                sendToParent('error', ...args);
            };
            console.warn = (...args) => {
                window._originalConsole.warn.apply(console, args);
                sendToParent('warn', ...args);
            };
            console.info = (...args) => {
                window._originalConsole.info.apply(console, args);
                sendToParent('info', ...args);
            };
        }
        function blockRedirect() {
            const errorMsg = 'Due to security and web best practices, SPLENDOR does not allow redirecting away from the current tab from the code.';
            if (typeof window.parent !== 'undefined') {
                window.parent.postMessage({
                    type: 'console',
                    method: 'error',
                    args: [errorMsg]
                }, '*');
            }
            throw new Error(errorMsg);
        }
        Object.defineProperty(window, 'location', {
            configurable: false,
            enumerable: true,
            get: function() { return window._originalLocation || window.location; },
            set: function(val) { blockRedirect(); }
        });
        const forbidden = ['assign', 'replace'];
        forbidden.forEach(fn => {
            if (typeof window.location[fn] === 'function') {
                window.location[fn] = blockRedirect;
            }
        });
        window.open = blockRedirect;
        </script>
    `;
    
    const userScript = `<script type="text/javascript">\ntry {\n${js}\n} catch(e) {console.error('Preview JS Error:', e);}\n</script>`;
    
    let processedHtml = html;
    if (!isFullHTML) {
        processedHtml = processedHtml.replace(
            /https:\/\/via\.placeholder\.com\/(\d+)x(\d+)/g,
            (match, width, height) => {
                const svgContent = `
                    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                        <rect width="100%" height="100%" fill="#ddd"/>
                        <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#666" text-anchor="middle" dy=".3em">
                            ${width}x${height}
                        </text>
                    </svg>
                `;
                return 'data:image/svg+xml;base64,' + btoa(svgContent);
            }
        );
    }
    
    const content = isFullHTML ? processedHtml : `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
                <style type="text/css">
                    ${css}
                </style>
            </head>
            <body>
                ${processedHtml}
                ${consoleOverrideScript}
                ${userScript}
            </body>
        </html>
    `;
    
    try {
        const previewDocument = preview.contentDocument || preview.contentWindow.document;
        previewDocument.open();
        previewDocument.write(content);
        previewDocument.close();

        const handleError = (e) => {
            console.error('Resource loading error:', e.target.src || e.target.href);
        };
        
        previewDocument.addEventListener('error', handleError, true);
    } catch (error) {
        console.error('Preview update error:', error);
    }

    const consolePanel = document.getElementById('consolePanel');
    const consoleDivider = document.querySelector('.console-divider');
    if (consolePanel && consoleDivider) {
        if (consolePanel.style.display === 'block') {
            consoleDivider.style.display = 'block';
        } else {
            consoleDivider.style.display = 'none';
        }
    }
}

window.addEventListener('message', (event) => {
    if (event.data.type === 'console') {
        const message = event.data.args.join(' ');
        logToConsole(message, event.data.method);
    }
});

function setupPreviewDivider() {
    const divider = document.querySelector('.divider');
    const editorContainer = document.querySelector('.editor-container');
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const savedWidth = localStorage.getItem('editorWidth');
    if (savedWidth) {
        editorContainer.style.width = savedWidth;
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const clientX = e.clientX;
        const deltaX = clientX - startX;
        const totalWidth = document.body.offsetWidth;
        let newWidth = startWidth + deltaX;
        
        const minWidth = Math.max(300, totalWidth * 0.2);
        const maxWidth = totalWidth * 0.8;
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        editorContainer.style.width = newWidth + 'px';
        localStorage.setItem('editorWidth', newWidth + 'px');
        
        if (window.editors) {
            Object.values(window.editors).forEach(editor => {
                if (editor) editor.refresh();
            });
        }
    }

    function onPointerUp() {
        if (isDragging) {
            isDragging = false;
            divider.classList.remove('dragging');
            document.body.style.cursor = '';
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        }
    }

    divider.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startWidth = editorContainer.offsetWidth;
        divider.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        if (divider.setPointerCapture) {
            divider.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
    });

    window.addEventListener('resize', () => {
        const totalWidth = document.body.offsetWidth;
        const minWidth = Math.max(300, totalWidth * 0.2);
        const maxWidth = totalWidth * 0.8;
        let currentWidth = editorContainer.offsetWidth;
        if (currentWidth < minWidth) {
            editorContainer.style.width = minWidth + 'px';
        } else if (currentWidth > maxWidth) {
            editorContainer.style.width = maxWidth + 'px';
        }

        if (window.editors) {
            Object.values(window.editors).forEach(editor => {
                if (editor) editor.refresh();
            });
        }
    });
}

function getCustomHint(cm, options) {
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);
    let start = token.start;
    let end = cur.ch;
    let word = token.string.slice(0, end - start).toLowerCase();
    let mode = cm.getOption('mode');
    let hintFn = null;

    if (mode === 'htmlmixed') {
        hintFn = CodeMirror.hint.html;
    } else if (mode === 'css') {
        hintFn = CodeMirror.hint.css;
    } else if (mode === 'javascript') {
        hintFn = CodeMirror.hint.javascript;
    }

    if (!hintFn) return;

    let result = hintFn(cm, options) || { list: [] };

    if (word) {
        result.list = result.list.filter(item => {
            const text = typeof item === 'string' ? item : item.displayText || item.text;
            return text && text.toLowerCase().includes(word);
        });
    }

    result.from = CodeMirror.Pos(cur.line, start);
    result.to = CodeMirror.Pos(cur.line, end);

    if (mode === 'htmlmixed') {
        const tagCompletions = [
            'html', 'div', 'span', 'p', 'ul', 'li', 
            'a', 'img', 'script', 'style', 'head', 'body',
            'title', 'meta', 'link', 'h1', 'h2', 'h3', 'h4',
            'h5', 'h6', 'table', 'tr', 'td', 'th', 'form',
            'input', 'button', 'label', 'select', 'option'
        ];

        result.list = result.list.filter(item => {
            const text = typeof item === 'string' ? item : item.displayText || item.text;
            if (/^[a-zA-Z]+$/.test(text) && tagCompletions.some(tag => tag.startsWith(word))) {
                return false;
            }
            return !tagCompletions.some(tag =>
                text === `<${tag}` || text === `<${tag}>`
            );
        });

        tagCompletions.forEach(tag => {
            if (tag.startsWith(word)) {
                const isSelfClosing = ['img', 'meta', 'link', 'input'].includes(tag);
                let snippet, cursorOffset;
                if (isSelfClosing) {
                    snippet = `<${tag}>`;
                    cursorOffset = snippet.length;
                } else {
                    snippet = `<${tag}></${tag}>`;
                    cursorOffset = `<${tag}>`.length;
                }
                result.list.push({
                    text: snippet,
                    displayText: tag,
                    from: result.from,
                    to: result.to,
                    hint: (cm, data, comp) => {
                        cm.replaceRange(snippet, data.from, data.to);
                        const cursorPos = CodeMirror.Pos(
                            data.from.line,
                            data.from.ch + cursorOffset
                        );
                        cm.setCursor(cursorPos);
                    }
                });
            }
        });

        result.list.sort((a, b) => {
            const aText = typeof a === 'string' ? a : a.displayText || a.text;
            const bText = typeof b === 'string' ? b : b.displayText || b.text;
            return aText.localeCompare(bText);
        });
    }

    return result;
}

async function initializeEditors() {
    const theme = getPreferredTheme() === 'dark' ? 'splendor-dark' : 'splendor-light';

    editors.html = CodeMirror.fromTextArea(document.getElementById('editor-html'), {
        lineNumbers: true,
        mode: 'htmlmixed',
        theme: theme,
        autoCloseTags: true,
        extraKeys: { 'Ctrl-Space': 'autocomplete' },
        hintOptions: { 
            hint: getCustomHint, 
            completeSingle: false,
            completeAfter: /<\/$/
        }
    });

    editors.css = CodeMirror.fromTextArea(document.getElementById('editor-css'), {
        lineNumbers: true,
        mode: 'css',
        theme: theme,
        extraKeys: { 'Ctrl-Space': 'autocomplete' },
        hintOptions: { hint: getCustomHint, completeSingle: false }
    });

    editors.js = CodeMirror.fromTextArea(document.getElementById('editor-js'), {
        lineNumbers: true,
        mode: 'javascript',
        theme: theme,
        extraKeys: { 'Ctrl-Space': 'autocomplete' },
        hintOptions: { hint: getCustomHint, completeSingle: false }
    });

    attachAutocompleteHandlers();

    switchEditor('html');

    Object.values(editors).forEach(editor => {
        if (editor) {
            editor.on('change', debouncedUpdatePreview);
        }
    });
}

function attachAutocompleteHandlers() {
    Object.values(editors).forEach(editor => {
        if (!editor) return;
        editor.off('inputRead', editor._autocompleteHandler);
        if (autocompleteEnabled) {
            editor._autocompleteHandler = function(cm, change) {
                if (!cm.state.completionActive && change.text[0] && /\w|[<.]/.test(change.text[0])) {
                    cm.showHint();
                }
            };
            editor.on('inputRead', editor._autocompleteHandler);
        }
    });
}

function switchEditor(language) {
    Object.keys(editors).forEach(lang => {
        const wrapper = editors[lang].getWrapperElement();
        if (lang === language) {
            wrapper.style.display = 'block';
            editors[lang].refresh();
        } else {
            wrapper.style.display = 'none';
        }
    });

    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.language === language);
    });
}

function setupTabHandlers() {
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const language = tab.dataset.language;
            if (language) {
                switchEditor(language);
            }
        });
    });
}

function setupSaveHandler() {
    const saveButton = document.getElementById('saveButton');
    if (!saveButton) return;

    saveButton.addEventListener('click', async () => {
        if (window.isGuestViewer) {
            alert('Guests cannot save public projects. Log in as the owner to save.');
            return;
        }
        if (!currentProject || !currentProject.$id) {
            alert('No project loaded');
            return;
        }
        const codeData = {
            html_code: editors.html ? editors.html.getValue() : '',
            css_code: editors.css ? editors.css.getValue() : '',
            js_code: editors.js ? editors.js.getValue() : ''
        };
        try {
            await databases.updateDocument(
                DATABASE_ID,
                CODE_COLLECTION_ID,
                currentProject.$id,
                codeData
            );
            alert('Project code saved successfully!');
        } catch (error) {
            if (error && error.message && error.message.includes('could not be found')) {
                try {
                    await databases.createDocument(
                        DATABASE_ID,
                        CODE_COLLECTION_ID,
                        currentProject.$id,
                        codeData
                    );
                    alert('Project code created and saved successfully!');
                } catch (createErr) {
                    console.error('Error creating project code:', createErr);
                    alert('Failed to create project code');
                }
            } else {
                console.error('Error saving project code:', error);
                alert('Failed to save project code');
            }
        }
    });
}

const settingsButton = document.getElementById('settingsButton');
const settingsPopup = document.getElementById('settingsPopup');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings = document.getElementById('closeSettings');
const consoleButton = document.getElementById('consoleButton');

function openSettings() {
    settingsPopup.classList.add('active');
    settingsOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSettingsPopup() {
    settingsPopup.classList.remove('active');
    settingsOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

settingsButton.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsPopup);
settingsOverlay.addEventListener('click', closeSettingsPopup);

settingsPopup.addEventListener('click', (e) => {
    e.stopPropagation();
});

consoleButton.addEventListener('click', () => {
    consoleVisible = !consoleVisible;
    const consolePanel = document.getElementById('consolePanel');
    const consoleDivider = document.querySelector('.console-divider');
    
    consolePanel.style.display = consoleVisible ? 'block' : 'none';
    consoleDivider.style.display = consoleVisible ? 'block' : 'none';
    
    if (consoleVisible) {
        const panelHeight = consolePanel.offsetHeight;
        consoleDivider.style.top = (window.innerHeight - panelHeight - consoleDivider.offsetHeight / 2) + 'px';
        updateConsoleDisplay();
    }
});

function applyTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    localStorage.setItem('theme', theme);
    document.getElementById('themeToggle').checked = theme === 'dark';
    Object.values(window.editors).forEach(editor => {
        if (editor) editor.setOption('theme', theme === 'dark' ? 'splendor-dark' : 'splendor-light');
    });
}

function getPreferredTheme() {
    return localStorage.getItem('theme') || 'light';
}

const darkModeStyle = document.createElement('style');
darkModeStyle.textContent = `
body.dark-mode {
    background: #1e1e1e !important;
    color: #d4d4d4 !important;
}
body.dark-mode .editor-tabs {
    background: #23272e !important;
    border-radius: 0 !important;
    border-bottom: 1.5px solid #222;
    box-shadow: none !important;
    padding: 0;
    display: flex;
    gap: 0;
}
body.dark-mode .editor-tab {
    background: #23272e !important;
    color: #bdbdbd !important;
    border: none;
    border-radius: 0 !important;
    box-shadow: 2px 2px 6px #181a20, -2px -2px 6px #2d313a !important;
    font-weight: 500;
    margin: 0;
    transition: background 0.18s, color 0.18s, box-shadow 0.18s;
}
body.dark-mode .editor-tab.active {
    background: #292d33 !important;
    color: #fff !important;
    border-bottom: 2.5px solid #3794ff !important;
    font-weight: 600;
    box-shadow: inset 1.5px 1.5px 6px #181a20, inset -1.5px -1.5px 6px #31343b !important;
}
body.dark-mode .editor-tab:hover {
    background: #26282c !important;
    color: #fff !important;
    box-shadow: 1.5px 1.5px 4px #181a20, -1.5px -1.5px 4px #2d313a !important;
}
body.dark-mode .editor-container,
body.dark-mode .preview-container,
body.dark-mode .settings-popup,
body.dark-mode .ai-sidebar,
body.dark-mode .toolbar,
body.dark-mode .ai-toggle {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: 0 2px 8px #1118, 0 1px 2px #222a !important;
}
body.dark-mode .ai-toggle {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: 4px 4px 12px #111a, -4px -4px 12px #222a !important;
}
body.dark-mode .ai-toggle:hover {
    background: #23272e !important;
    box-shadow: 0 4px 16px #111a, 0 -4px 16px #23272e !important;
}
body.dark-mode .settings-button,
body.dark-mode .close-settings,
body.dark-mode .new-chat-btn {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: 2px 2px 8px #111a, -2px -2px 8px #222a !important;
}
body.dark-mode .settings-popup,
body.dark-mode .ai-sidebar {
    box-shadow: 0 2px 8px #111a !important;
}
body.dark-mode .ai-message.assistant {
    background: #23272e !important;
    color: #d4d4d4 !important;
}
body.dark-mode .ai-message.user {
    background: #181c20 !important;
    color: #d4d4d4 !important;
}
body.dark-mode .ai-token-counter {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: 0 2px 8px #111a, 0 1px 2px #222a !important;
}
body.dark-mode .CodeMirror {
    background: #1e1e1e !important;
    color: #d4d4d4 !important;
}
body.dark-mode .CodeMirror-gutters {
    background: #23272e !important;
    border-right: 1px solid #222 !important;
}
body.dark-mode .CodeMirror-cursor {
    border-left: 1.5px solid #d4d4d4 !important;
}
body.dark-mode .CodeMirror-linenumber {
    color: #858585 !important;
}
body.dark-mode .CodeMirror-selected {
    background: #264f78 !important;
}
body.dark-mode .CodeMirror-activeline-background {
    background: #2a2d2e !important;
}
body.dark-mode .divider {
    background: #23272e !important;
    box-shadow: 4px 4px 12px #181a20, -4px -4px 12px #2d313a !important;
    border-radius: 8px;
    transition: box-shadow 0.2s, background 0.2s;
}
body.dark-mode .divider.dragging {
    box-shadow: inset 2px 2px 8px #181a20, inset -2px -2px 8px #31343b !important;
    background: #26282c !important;
}
body.dark-mode .divider::after {
    background: rgba(255,255,255,0.08) !important;
}
body.dark-mode .settings-section {
    background: #23272e !important;
    color: #d4d4d4 !important;
    border-radius: 15px;
    box-shadow: 2px 2px 8px #181a20, -2px -2px 8px #2d313a !important;
    border: none;
}
body.dark-mode .settings-popup {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: 0 2px 8px #181a20 !important;
}
body.dark-mode .ai-settings-group {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: 2px 2px 8px #181a20, -2px -2px 8px #2d313a !important;
    border-radius: 10px;
}
body.dark-mode .ai-input,
body.dark-mode .ai-select {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: inset 2px 2px 5px #181a20, inset -2px -2px 5px #2d313a !important;
    border: none !important;
}
body.dark-mode .ai-input:focus,
body.dark-mode .ai-select:focus {
    outline: none !important;
    box-shadow: 0 0 0 2px #3794ff !important;
}
body.dark-mode .ai-textarea {
    background: #23272e !important;
    color: #d4d4d4 !important;
    box-shadow: inset 2px 2px 5px #181a20, inset -2px -2px 5px #2d313a !important;
    border: none !important;
}
body.dark-mode .ai-textarea:focus {
    outline: none !important;
    box-shadow: 0 0 0 2px #3794ff !important;
}
`;
document.head.appendChild(darkModeStyle);

function setupAutocompleteToggle() {
    const toggle = document.getElementById('autocompleteToggle');
    toggle.checked = autocompleteEnabled;
    toggle.addEventListener('change', function() {
        autocompleteEnabled = this.checked;
        localStorage.setItem('autocompleteEnabled', autocompleteEnabled);
        attachAutocompleteHandlers();
    });
}

function setupVisibilityToggle() {
    const visibilityOptions = document.querySelectorAll('.visibility-option');
    
    if (currentProject) {
        visibilityOptions.forEach(option => {
            if (option.dataset.visibility === currentProject.visibility) {
                option.classList.add('active');
            }
        });
    }

    visibilityOptions.forEach(option => {
        option.addEventListener('click', async () => {
            if (!currentProject || window.isGuestViewer) {
                alert('Only the project owner can change visibility settings.');
                return;
            }

            const newVisibility = option.dataset.visibility;
            
            try {
                await databases.updateDocument(
                    DATABASE_ID,
                    COLLECTION_ID,
                    currentProject.$id,
                    { visibility: newVisibility }
                );
                
                visibilityOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                currentProject.visibility = newVisibility;
                
                const unlistedLinkSection = document.getElementById('unlistedLinkSection');
                if (unlistedLinkSection) {
                    if (newVisibility === 'unlisted') {
                        unlistedLinkSection.style.opacity = '1';
                        unlistedLinkSection.style.pointerEvents = 'auto';
                        const linkDisplay = document.getElementById('linkDisplay');
                        if (linkDisplay && currentProject.key) {
                            const baseUrl = window.location.origin + window.location.pathname;
                            const link = `${baseUrl}?projectId=${currentProject.$id}&key=${currentProject.key.toString()}`;
                            linkDisplay.textContent = link;
                        }
                    } else {
                        unlistedLinkSection.style.opacity = '0.5';
                        unlistedLinkSection.style.pointerEvents = 'none';
                        const linkDisplay = document.getElementById('linkDisplay');
                        if (linkDisplay) {
                            linkDisplay.textContent = 'No unlisted link generated';
                        }
                    }
                }
                
                const successMsg = document.createElement('div');
                successMsg.textContent = 'Visibility updated successfully!';
                successMsg.style.cssText = 'color:#28a745;background:#d4edda;padding:8px 16px;border-radius:8px;margin-top:10px;font-size:13px;text-align:center;';
                const visibilitySection = option.closest('.settings-section');
                const existingMsg = visibilitySection.querySelector('.success-message');
                if (existingMsg) existingMsg.remove();
                successMsg.className = 'success-message';
                visibilitySection.appendChild(successMsg);
                setTimeout(() => successMsg.remove(), 3000);
            } catch (error) {
                console.error('Error updating visibility:', error);
                alert('Failed to update visibility. Please try again.');
            }
        });
    });
}

function setupUnlistedLinkSystem() {
    const unlistedLinkSection = document.getElementById('unlistedLinkSection');
    const customKeyInput = document.getElementById('customKey');
    const generateRandomKeyBtn = document.getElementById('generateRandomKey');
    const copyLinkBtn = document.getElementById('copyLink');
    const linkDisplay = document.getElementById('linkDisplay');

    function generateRandomKey() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function updateLinkDisplay() {
        if (currentProject && currentProject.key) {
            const baseUrl = window.location.origin + window.location.pathname;
            const link = `${baseUrl}?projectId=${currentProject.$id}&key=${currentProject.key.toString()}`;
            linkDisplay.textContent = link;
        } else {
            linkDisplay.textContent = 'No unlisted link generated';
        }
    }

    function updateUnlistedSectionVisibility() {
        if (currentProject && currentProject.visibility === 'unlisted') {
            unlistedLinkSection.style.opacity = '1';
            unlistedLinkSection.style.pointerEvents = 'auto';
            updateLinkDisplay();
        } else {
            unlistedLinkSection.style.opacity = '0.5';
            unlistedLinkSection.style.pointerEvents = 'none';
            linkDisplay.textContent = 'No unlisted link generated';
        }
    }

    generateRandomKeyBtn.addEventListener('click', async () => {
        if (!currentProject || window.isGuestViewer) {
            alert('Only the project owner can generate keys.');
            return;
        }

        const randomKey = generateRandomKey();
        customKeyInput.value = randomKey;
        
        try {
            await databases.updateDocument(
                DATABASE_ID,
                COLLECTION_ID,
                currentProject.$id,
                { key: parseInt(randomKey) }
            );
            
            currentProject.key = randomKey;
            updateLinkDisplay();
            
            const successMsg = document.createElement('div');
            successMsg.textContent = 'Random key generated successfully!';
            successMsg.style.cssText = 'color:#28a745;background:#d4edda;padding:8px 16px;border-radius:8px;margin-top:10px;font-size:13px;text-align:center;';
            const linkSection = unlistedLinkSection;
            const existingMsg = linkSection.querySelector('.success-message');
            if (existingMsg) existingMsg.remove();
            successMsg.className = 'success-message';
            linkSection.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3000);
        } catch (error) {
            console.error('Error generating random key:', error);
            alert('Failed to generate random key. Please try again.');
        }
    });

    customKeyInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    });

    customKeyInput.addEventListener('blur', async () => {
        if (!currentProject || window.isGuestViewer) {
            return;
        }

        const customKey = customKeyInput.value.trim();
        
        if (customKey.length === 6) {
                    try {
            await databases.updateDocument(
                DATABASE_ID,
                COLLECTION_ID,
                currentProject.$id,
                { key: parseInt(customKey) }
            );
                
                currentProject.key = customKey;
                updateLinkDisplay();
                
                const successMsg = document.createElement('div');
                successMsg.textContent = 'Custom key saved successfully!';
                successMsg.style.cssText = 'color:#28a745;background:#d4edda;padding:8px 16px;border-radius:8px;margin-top:10px;font-size:13px;text-align:center;';
                const linkSection = unlistedLinkSection;
                const existingMsg = linkSection.querySelector('.success-message');
                if (existingMsg) existingMsg.remove();
                successMsg.className = 'success-message';
                linkSection.appendChild(successMsg);
                setTimeout(() => successMsg.remove(), 3000);
            } catch (error) {
                console.error('Error saving custom key:', error);
                alert('Failed to save custom key. Please try again.');
            }
        }
    });

    copyLinkBtn.addEventListener('click', async () => {
        if (!currentProject || !currentProject.key) {
            alert('No unlisted link available to copy.');
            return;
        }

        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}?projectId=${currentProject.$id}&key=${currentProject.key.toString()}`;
        
        try {
            await navigator.clipboard.writeText(link);
            
            const successMsg = document.createElement('div');
            successMsg.textContent = 'Link copied to clipboard!';
            successMsg.style.cssText = 'color:#28a745;background:#d4edda;padding:8px 16px;border-radius:8px;margin-top:10px;font-size:13px;text-align:center;';
            const linkSection = unlistedLinkSection;
            const existingMsg = linkSection.querySelector('.success-message');
            if (existingMsg) existingMsg.remove();
            successMsg.className = 'success-message';
            linkSection.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3000);
        } catch (error) {
            console.error('Error copying link:', error);
            alert('Failed to copy link. Please try again.');
        }
    });

    if (currentProject) {
        updateUnlistedSectionVisibility();
        if (currentProject.key) {
            customKeyInput.value = currentProject.key.toString();
        }
    }
}

function setLoaderProgress(percent) {
    const circle = document.querySelector('.progress-bar');
    if (!circle) return;
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}
function showLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) loader.classList.remove('hidden');
    setLoaderProgress(0);
}
function hideLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
            if (loader.parentNode) loader.parentNode.removeChild(loader);
        }, 1300);
    }
}
showLoader();

document.addEventListener('DOMContentLoaded', async () => {
    let progress = 0;
    function incProgress(step) {
        progress += step;
        if (progress > 100) progress = 100;
        setLoaderProgress(progress);
    }
    setLoaderProgress(5);

    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId') || urlParams.get('id');
    const isPreviewMode = urlParams.get('preview') === 'true';
    
    if (!projectId) {
        alert('Invalid project URL');
        window.location.href = 'index.html';
        return;
    }
    incProgress(10);

    await initializeEditors();
    incProgress(20);
    setupTabHandlers();
    setupSaveHandler();
    setupPreviewDivider();
    setupConsole();
    setupAutocompleteToggle();
    setupVisibilityToggle();
    setupUnlistedLinkSystem();
    incProgress(10);

    try {
        currentProject = await databases.getDocument(DATABASE_ID, COLLECTION_ID, projectId);
        incProgress(15);
        document.getElementById('projectTitle').textContent = currentProject.title || '(Untitled Project)';

        let currentUserId = null;
        try {
            const user = await window.account.get();
            currentUserId = user.$id;
        } catch (e) {
        }
        incProgress(10);
        
        if (currentProject.visibility === 'private' && currentUserId !== currentProject.userId) {
            window.location.href = 'error.html';
            return;
        }
        
        if (currentProject.visibility === 'unlisted' && currentUserId !== currentProject.userId) {
            const urlParams = new URLSearchParams(window.location.search);
            const providedKey = urlParams.get('key');
            
            if (!providedKey || providedKey !== currentProject.key.toString()) {
                window.location.href = 'error.html';
                return;
            }
        }
        
        if ((currentProject.visibility === 'public' || currentProject.visibility === 'unlisted') && !isPreviewMode && currentUserId !== currentProject.userId) {
            try {
                const currentViewCount = currentProject.viewCount || 0;
                await databases.updateDocument(
                    DATABASE_ID,
                    COLLECTION_ID,
                    projectId,
                    { viewCount: currentViewCount + 1 }
                );
                console.log('View count incremented for guest viewing project:', projectId);
            } catch (error) {
                console.error('Failed to increment view count:', error);
            }
        }
        
        if ((currentProject.visibility === 'public' || currentProject.visibility === 'unlisted') && currentUserId !== currentProject.userId) {
            isGuestViewer = true;
            window.isGuestViewer = true;
            const saveBtn = document.getElementById('saveButton');
            if (saveBtn) saveBtn.style.display = 'none';
            const aiBtn = document.getElementById('aiToggle');
            if (aiBtn) aiBtn.style.display = 'none';
            let guestNotice = document.getElementById('guestNotice');
            if (!guestNotice) {
                guestNotice = document.createElement('div');
                guestNotice.id = 'guestNotice';
                guestNotice.textContent = currentProject.visibility === 'unlisted' 
                    ? 'You are viewing an unlisted project. Changes will not be saved.' 
                    : 'You are viewing as a guest. Changes will not be saved.';
                guestNotice.style.cssText = 'color:#b85c00;background:#fff3cd;padding:8px 16px;border-radius:8px;margin-bottom:10px;font-size:13px;text-align:center;';
                const toolbar = document.querySelector('.toolbar');
                if (toolbar) toolbar.parentNode.insertBefore(guestNotice, toolbar.nextSibling);
            }
        }

        let codeDoc;
        try {
            codeDoc = await databases.getDocument(DATABASE_ID, CODE_COLLECTION_ID, projectId);
            incProgress(20);
        } catch (e) {
            codeDoc = { html_code: '', css_code: '', js_code: '' };
        }
        editors.html.setValue(codeDoc.html_code || '');
        editors.css.setValue(codeDoc.css_code || '');
        editors.js.setValue(codeDoc.js_code || '');
        debouncedUpdatePreview();

        window.resolveEditorsReady();
        setLoaderProgress(100);
        setTimeout(() => {
            const fill = document.querySelector('.progress-fill');
            if (fill) fill.setAttribute('r', 36);
            setTimeout(hideLoader, 1200);
        }, 200);
    } catch (error) {
        console.error('Error loading project:', error);
        alert('Failed to load project');
    }

    const theme = getPreferredTheme();
    applyTheme(theme);
    document.getElementById('themeToggle').addEventListener('change', function() {
        applyTheme(this.checked ? 'dark' : 'light');
    });

    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', () => {
            if (confirm("Are you sure you've saved your important progress? Unsaved changes will be lost.")) {
                window.location.href = 'index.html';
            }
        });
    }

    const refreshBtn = document.getElementById('refreshPreviewButton');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (typeof window.updatePreview === 'function') window.updatePreview();
        });
    }
});