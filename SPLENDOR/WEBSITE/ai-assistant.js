class AIAssistant {
    constructor() {
        this.sidebar = document.getElementById('aiSidebar');
        this.toggle = document.getElementById('aiToggle');
        this.closeBtn = document.getElementById('closeAi');
        this.apiKeyInput = document.getElementById('apiKey');
        this.modelSelect = null;
        this.chatContainer = document.getElementById('aiChat');
        this.promptInput = document.getElementById('aiPrompt');
        this.sendButton = document.getElementById('aiSend');
        this.tokenCounter = document.querySelector('.ai-token-counter');
        this.passcodeInput = document.getElementById('aiPasscode');
        this.statusIndicator = document.getElementById('aiStatusIndicator');
        this.statusMessage = document.getElementById('aiStatusMessage');
        this.lastPasscodeError = false;
        
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
        this.maxRequestsPerMinute = 20;
        this.maxRetries = 10; 
        this.retryDelay = 500; 
        
        this._decryptedApiKey = '';
        this.chatHistory = [];
        this.codeSnapshots = [];
        
        const editors = window.editors;
        if (!editors?.html?.getValue || !editors?.css?.getValue || !editors?.js?.getValue) {
            console.error('Editors not properly initialized in AIAssistant constructor:', {
                html: !!editors?.html,
                css: !!editors?.css,
                js: !!editors?.js,
                htmlGetValue: !!editors?.html?.getValue,
                cssGetValue: !!editors?.css?.getValue,
                jsGetValue: !!editors?.js?.getValue
            });
            throw new Error('Editors not properly initialized');
        }
        
        this.setupEventListeners();
        this.updateSendButtonState();
        this.addNewChatButton();
        
        console.log('AI Assistant initialized');

        if (this.promptInput) {
            this.promptInput.setAttribute('maxlength', '84');
            let charCountElem = document.getElementById('aiPromptCharCount');
            if (!charCountElem) {
                charCountElem = document.createElement('div');
                charCountElem.id = 'aiPromptCharCount';
                charCountElem.style.cssText = 'font-size:11px;color:#888;text-align:right;margin-top:2px;user-select:none;display:block;width:60px;min-width:60px;max-width:80px;box-sizing:border-box;float:right;';
                this.promptInput.parentNode.appendChild(charCountElem);
            }
            const updateCharCount = () => {
                charCountElem.textContent = `${this.promptInput.value.length}/84`;
                if (this.promptInput.value.length > 84) {
                    charCountElem.style.color = '#e74c3c';
                } else {
                    charCountElem.style.color = '#888';
                }
            };
            this.promptInput.addEventListener('input', updateCharCount);
            updateCharCount();
        }
    }

    setupEventListeners() {
        this.toggle.addEventListener('click', () => this.toggleSidebar());
        this.closeBtn.addEventListener('click', () => this.toggleSidebar());

        this.passcodeInput.addEventListener('input', () => this.handlePasscodeEntry());

        this.promptInput.addEventListener('input', () => this.updateTokenCount());
        
        this.sendButton.addEventListener('click', () => this.handleSendRequest());

        this.promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.sendButton.disabled) {
                    this.handleSendRequest();
                }
            }
        });
    }

    toggleSidebar() {
        this.sidebar.classList.toggle('active');
        if (this.sidebar.classList.contains('active')) {
            if (this.toggle) this.toggle.style.display = 'none';
        } else {
            if (this.toggle) this.toggle.style.display = '';
        }
    }

    async handlePasscodeEntry() {
        const passcode = this.passcodeInput.value;
        
        if (!passcode) {
            this._decryptedApiKey = '';
            this.lastPasscodeError = false;
            this.updateSendButtonState();
            return;
        }

        if (window.account) {
            try {
                const originalPasscode = passcode;
                
                const user = await window.account.get();
                const prefs = user.prefs || {};
                const dataStr = prefs.gptApiKeyData;
                
                if (!dataStr) {
                    this._decryptedApiKey = '';
                    this.lastPasscodeError = false;
                    this.updateSendButtonState();
                    return;
                }

                let data;
                try {
                    data = JSON.parse(dataStr);
                } catch (e) {
                    console.error('Failed to parse API key data:', e);
                    this._decryptedApiKey = '';
                    this.lastPasscodeError = false;
                    this.updateSendButtonState();
                    return;
                }

                if (data.encrypted && data.salt && data.iv) {
                    const apiKey = await this.decryptApiKey(
                        data.encrypted,
                        originalPasscode,
                        data.salt,
                        data.iv,
                        data.iterations || 100000,
                        data.hash || "SHA-256"
                    );
                    
                    if (apiKey) {
                        this._decryptedApiKey = apiKey;
                        this.lastPasscodeError = false;
                    } else {
                        this._decryptedApiKey = '';
                        this.lastPasscodeError = true;
                    }
                } else {
                    this._decryptedApiKey = '';
                    this.lastPasscodeError = false;
                }
                
                this.updateSendButtonState();
            } catch (err) {
                console.error('Error handling passcode entry:', err);
                this._decryptedApiKey = '';
                this.lastPasscodeError = true;
                this.updateSendButtonState();
            }
        }
    }

    updateTokenCount() {
        const editors = this.getEditors();
        if (!editors) return;
        const htmlCode = editors.html?.getValue() || '';
        const cssCode = editors.css?.getValue() || '';
        const jsCode = editors.js?.getValue() || '';
        const promptText = this.promptInput.value;
        
        const totalInputTokens = Math.ceil((htmlCode.length + cssCode.length + jsCode.length + promptText.length) / 4);
        
        if (totalInputTokens > 100000) {
            this.tokenCounter.textContent = 'Est tokens surpass 100k token limit';
            this.tokenCounter.style.color = '#e74c3c';
        } else {
            const costPerThousand = 0.01;
            const estCost = (totalInputTokens / 1000 * costPerThousand).toFixed(4);
            this.tokenCounter.textContent = `Estimated tokens: ${totalInputTokens} | Est. cost: $${estCost}`;
            this.tokenCounter.style.color = '#888';
        }
        
        this.updateSendButtonState();
    }

    updateSendButtonState() {
        const hasApiKey = this._decryptedApiKey && this._decryptedApiKey.length > 0;
        const hasPrompt = this.promptInput.value.trim().length > 0;
        const underRateLimit = this.checkRateLimit(true);
        
        const editors = this.getEditors();
        let underTokenLimit = true;
        if (editors) {
            const htmlCode = editors.html?.getValue() || '';
            const cssCode = editors.css?.getValue() || '';
            const jsCode = editors.js?.getValue() || '';
            const promptText = this.promptInput.value;
            const totalInputTokens = Math.ceil((htmlCode.length + cssCode.length + jsCode.length + promptText.length) / 4);
            underTokenLimit = totalInputTokens <= 100000;
        }
        
        this.sendButton.disabled = !(hasApiKey && hasPrompt && underRateLimit && underTokenLimit);
        this.sendButton.textContent = `Send Request (${this.requestCount}/${this.maxRequestsPerMinute})`;
        
        if (this.statusIndicator) {
            this.statusIndicator.textContent = hasApiKey ? '🔓 API Key Unlocked' : '🔒 API Key Locked';
            this.statusIndicator.style.color = hasApiKey ? '#27ae60' : '#e74c3c';
        }
        if (this.statusMessage) {
            if (this.lastPasscodeError) {
                this.statusMessage.textContent = '❌ Incorrect passcode. Please try again.';
                this.statusMessage.style.color = '#e74c3c';
            } else if (!hasApiKey) {
                this.statusMessage.textContent = 'Enter your passcode to unlock the API key.';
                this.statusMessage.style.color = '#888';
            } else if (!underTokenLimit) {
                this.statusMessage.textContent = '❌ Token limit exceeded. Please reduce your code or prompt.';
                this.statusMessage.style.color = '#e74c3c';
            } else {
                this.statusMessage.textContent = '';
            }
        }
    }

    checkRateLimit(check = false) {
        const now = Date.now();
        const timeWindow = 60000;
        
        if (now - this.lastRequestTime > timeWindow) {
            this.requestCount = 0;
            this.lastRequestTime = now;
        }
        
        if (check) {
            return this.requestCount < this.maxRequestsPerMinute;
        }
        
        this.requestCount++;
        this.updateSendButtonState();
        
        return true;
    }

    async handleSendRequest() {
        if (!this.checkRateLimit()) {
            alert('Rate limit exceeded. Please wait a moment.');
            return;
        }

        const prompt = this.promptInput.value.trim();
        if (prompt.length > 84) {
            const charCountElem = document.getElementById('aiPromptCharCount');
            if (charCountElem) {
                charCountElem.style.color = '#e74c3c';
                charCountElem.textContent = `Too long! (${prompt.length}/84)`;
            }
            return;
        }
        if (!prompt) return;

        this.sendButton.disabled = true;
        this.promptInput.disabled = true;

        try {
            this.addMessage('user', prompt);

            this.promptInput.value = '';
            this.updateTokenCount();

            Object.values(this.getEditors()).forEach(editor => {
                if (editor && editor.setOption) editor.setOption('readOnly', true);
            });

            await this.makeOpenAIRequest(prompt);

        } catch (error) {
            console.error('Error:', error);
            this.addMessage('assistant', '❌ Error: ' + (error.message || 'Failed to process your request.'));
        } finally {
            Object.values(this.getEditors()).forEach(editor => {
                if (editor && editor.setOption) editor.setOption('readOnly', false);
            });
            this.sendButton.disabled = false;
            this.promptInput.disabled = false;
            this.promptInput.focus();
        }
    }

    getEditors() {
        const editors = window.editors;
        if (!editors?.html?.getValue || !editors?.css?.getValue || !editors?.js?.getValue) {
            console.error('Editors not properly initialized');
            return null;
        }
        return editors;
    }

    async previewChanges(changes) {
        const editors = this.getEditors();
        if (!editors) return null;

        const preview = {
            html: { before: [], after: [] },
            css: { before: [], after: [] },
            js: { before: [], after: [] }
        };

        for (const [language, change] of Object.entries(changes)) {
            const editor = editors[language];
            if (!editor) continue;

            const doc = editor.getDoc();
            const currentContent = doc.getValue().split('\n');
            
            let startLine = change.line - 1;
            let endLine = change.endLine ? change.endLine - 1 : startLine;
            
            preview[language].before = currentContent.slice(startLine, endLine + 1);
            
            switch (change.type) {
                case 'insert':
                    preview[language].after = [change.content];
                    break;
                case 'replace':
                    preview[language].after = change.content.split('\n');
                    break;
                case 'delete':
                    preview[language].after = [];
                    break;
            }
        }

        return preview;
    }

    async parseAndInjectCode(response) {
        const editors = this.getEditors();
        if (!editors) {
            console.error('Editor access failed');
            this.addMessage('assistant', '❌ Could not access code editors. Please refresh the page and try again.');
            return;
        }

        const extractChanges = (text) => {
            const startMarker = '[CHANGES]';
            const endMarker = '[/CHANGES]';
            const startIndex = text.indexOf(startMarker);
            const endIndex = text.indexOf(endMarker);
            
            if (startIndex === -1 || endIndex === -1) {
                console.log('No changes found');
                return null;
            }

            try {
                const jsonStr = text.substring(startIndex + startMarker.length, endIndex).trim();
                
                const rawChanges = JSON.parse(jsonStr);
                
                const combinedChanges = {};
                
                for (const [language, change] of Object.entries(rawChanges)) {
                    if (!combinedChanges[language]) {
                        combinedChanges[language] = {
                            changes: [change]
                        };
                    } else {
                        combinedChanges[language].changes.push(change);
                    }
                }
                
                return combinedChanges;
            } catch (e) {
                console.error('Failed to parse changes:', e);
                this.addMessage('assistant', '❌ Error: The AI response could not be parsed as valid JSON. This is usually due to a missing or invalid escape character in the code. Please try rewording your request, or click "New Chat" and try again.\n\nRaw response for debugging:\n' + text.substring(startIndex, endIndex + endMarker.length));
                return null;
            }
        };

        try {
            const changes = extractChanges(response);
            if (!changes) {
                this.addMessage('assistant', '⚠️ No changes were found in the AI response. Please try again.');
                return;
            }

            let injectedSomething = false;
            let changesSummary = [];

            for (const [language, changeOrArray] of Object.entries(changes)) {
                const editor = editors[language];
                if (!editor || !editor.getDoc) {
                    console.error(`Editor not properly initialized for ${language}`);
                    continue;
                }

                const changesArr = changeOrArray.changes || [changeOrArray];

                let currentContent = editor.getValue().split('\n');
                let languageInjected = false;

                for (const change of changesArr) {
                    try {
                        const line = change.line || 1;
                        const endLine = change.endLine || line;
                        if (line < 1 || (endLine && endLine < line)) {
                            console.error(`Invalid line numbers for ${language}:`, change);
                            continue;
                        }
                        let safeEndLine = endLine;
                        if (endLine && endLine > currentContent.length) {
                            safeEndLine = currentContent.length;
                        }
                        switch (change.type) {
                            case 'insert':
                                currentContent.splice(line - 1, 0, change.content);
                                changesSummary.push(`Added code to ${language.toUpperCase()}`);
                                languageInjected = true;
                                break;
                            case 'replace':
                                currentContent.splice(line - 1, safeEndLine - line + 1, change.content);
                                changesSummary.push(`Updated ${language.toUpperCase()} code`);
                                languageInjected = true;
                                break;
                            case 'delete':
                                currentContent.splice(line - 1, safeEndLine - line + 1);
                                changesSummary.push(`Removed code from ${language.toUpperCase()}`);
                                languageInjected = true;
                                break;
                            default:
                                console.error(`Invalid change type for ${language}:`, change.type);
                                continue;
                        }
                    } catch (error) {
                        console.error(`Error applying changes to ${language}:`, error);
                        this.addMessage('assistant', `❌ Error applying changes to ${language.toUpperCase()}: ${error.message}`);
                    }
                }
                if (languageInjected) {
                    injectedSomething = true;
                    editor.setValue(currentContent.join('\n'));
                }
            }

            if (!injectedSomething) {
                console.warn('No changes were applied');
                this.addMessage('assistant', '⚠️ No changes were applied. Please try again.');
                return;
            }

            if (typeof window.debouncedUpdatePreview === 'function') {
                window.debouncedUpdatePreview();
            }

            const summary = changesSummary.join(', ');
            this.addMessage('assistant', `✅ Done: ${summary}. Changes have been applied to your code.`);

        } catch (error) {
            console.error('Code injection failed:', error.message);
            this.addMessage('assistant', '❌ Failed to apply changes: ' + error.message);
        }
    }

    getEditorContent() {
        const editors = this.getEditors();
        if (!editors) {
            console.warn('Could not access editors');
            return {
                currentCode: '',
                htmlCode: '',
                cssCode: '',
                jsCode: ''
            };
        }

        const htmlCode = String(editors.html.getValue() || '').trim();
        const cssCode = String(editors.css.getValue() || '').trim();
        const jsCode = String(editors.js.getValue() || '').trim();
        const currentLanguage = document.querySelector('.editor-tab.active')?.dataset.language || 'html';
        const currentCode = String(editors[currentLanguage].getValue() || '').trim();

        console.log('Editor content retrieved:', {
            html: htmlCode.length + ' chars',
            css: cssCode.length + ' chars',
            js: jsCode.length + ' chars',
            current: currentLanguage
        });

        return { currentCode, htmlCode, cssCode, jsCode };
    }

    addNewChatButton() {
        const header = document.querySelector('.ai-header');
        const newChatBtn = document.createElement('button');
        newChatBtn.className = 'new-chat-btn';
        newChatBtn.innerHTML = '🗑️ New Chat';
        newChatBtn.onclick = () => this.confirmNewChat();
        header.insertBefore(newChatBtn, header.lastChild);

        const style = document.createElement('style');
        style.textContent = `
            .new-chat-btn {
                background: #e0e5ec;
                border: none;
                padding: 8px 12px;
                border-radius: 8px;
                cursor: pointer;
                color: #4d4d4d;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 4px 4px 8px #b8b9be, -4px -4px 8px #ffffff;
                transition: all 0.3s ease;
            }
            .new-chat-btn:hover {
                box-shadow: 2px 2px 4px #b8b9be, -2px -2px 4px #ffffff;
            }
            .new-chat-btn:active {
                box-shadow: inset 2px 2px 4px #b8b9be, inset -2px -2px 4px #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    confirmNewChat() {
        if (confirm('Starting a new chat will clear the current conversation history and code snapshots. This cannot be undone. Continue?')) {
            this.chatHistory = [];
            this.codeSnapshots = [];
            this.chatContainer.innerHTML = '';
            this.addMessage('assistant', 'Started a new chat. How can I help you?');
        }
    }

    addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;
        messageDiv.textContent = content;
        
        if (type === 'user') {
            messageDiv.style.cursor = 'pointer';
            messageDiv.title = 'Click to revert to this message';
            
            const editors = this.getEditors();
            if (!editors) {
                console.error('Could not access editors for snapshot');
                return messageDiv;
            }
            
            const snapshot = {
                html: editors.html?.getValue() || '',
                css: editors.css?.getValue() || '',
                js: editors.js?.getValue() || '',
                prompt: content,
                messageContent: content
            };
            this.codeSnapshots.push(snapshot);
            
            messageDiv.onclick = () => this.handleMessageRevert(this.codeSnapshots.length - 1, content);
        }
        
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        
        this.chatHistory.push({ role: type, content });
        
        return messageDiv;
    }

    handleMessageRevert(snapshotIndex, messageContent) {
        if (confirm('Revert to this message? This will restore the code state from when this message was sent.')) {
            const snapshot = this.codeSnapshots[snapshotIndex];
            if (!snapshot) {
                console.error('No snapshot found at index:', snapshotIndex);
                return;
            }
            
            const editors = this.getEditors();
            if (!editors) {
                console.error('Could not access editors for revert');
                return;
            }
            
            if (editors.html) editors.html.setValue(snapshot.html);
            if (editors.css) editors.css.setValue(snapshot.css);
            if (editors.js) editors.js.setValue(snapshot.js);
            
            this.promptInput.value = messageContent;
            this.updateTokenCount();
            
            if (typeof window.debouncedUpdatePreview === 'function') {
                window.debouncedUpdatePreview();
            }
            
            this.addMessage('assistant', '↩️ Reverted to previous state. You can modify the prompt and send it again.');
        }
    }

    async handleIncompleteResponse(partialResponse, prompt) {
        const messageDiv = this.addMessage('assistant', '⚠️ The response appears to be incomplete. Would you like MUSE to continue generating? (Type "yes" to continue, anything else to move on)');
        
        const handleNextInput = async (nextPrompt) => {
            if (nextPrompt.toLowerCase().trim() === 'yes') {
                messageDiv.remove();
                
                this.addMessage('assistant', '🔄 Continuing generation...');
                
                const startIndex = partialResponse.indexOf('[CHANGES]');
                const partialChanges = startIndex !== -1 ? partialResponse.substring(startIndex) : '';
                
                const continuationPrompt = `${prompt}\n\nPlease continue from where you left off. Here's the partial response:\n${partialChanges}`;
                
                if (!this.chatHistory.some(msg => msg.content === prompt)) {
                    this.chatHistory.push({ role: 'user', content: prompt });
                }
                
                this.chatHistory.push({ role: 'user', content: 'yes' });
                
                await this.makeOpenAIRequest(continuationPrompt);
            } else {
                messageDiv.remove();
                
                this.addMessage('assistant', 'Understood, MUSE will move on.');
                
                this.chatHistory.push({ role: 'user', content: 'no' });
            }
        };
        
        const keydownHandler = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleNextInput(this.promptInput.value);
                this.promptInput.value = '';
                this.promptInput.removeEventListener('keydown', keydownHandler);
            }
        };
        
        this.promptInput.addEventListener('keydown', keydownHandler);
    }

    async makeOpenAIRequest(prompt, retryCount = 0, lastError = null) {
        const apiKey = this._decryptedApiKey;
        const model = 'gpt-4.1';
        const maxRetries = 3;
        const retryDelay = 1000;

        let actualPrompt = prompt;
        if (lastError) {
            actualPrompt += `\n\nThe previous attempt to apply your changes failed with this error: ${lastError}. Please fix the issue and try again.`;
        }

        const editors = this.getEditors();
        const currentLanguage = document.querySelector('.editor-tab.active')?.dataset.language || 'html';
        const code = editors[currentLanguage]?.getValue() || '';

        const addLineNumbers = (code) => {
            return code.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n');
        };
        const htmlWithLines = addLineNumbers(editors.html?.getValue() || '');
        const cssWithLines = addLineNumbers(editors.css?.getValue() || '');
        const jsWithLines = addLineNumbers(editors.js?.getValue() || '');

        const estimateTokens = (text) => Math.ceil((text || '').length / 4);
        const totalCodeTokens = estimateTokens(htmlWithLines) + estimateTokens(cssWithLines) + estimateTokens(jsWithLines);
        
        if (totalCodeTokens > 100000) {
            this.addMessage('assistant', '❌ Request too large: estimated ' + totalCodeTokens + ' tokens. Please reduce your code or conversation history and try again.');
            return;
        }

        const recentHistory = this.chatHistory.slice(-2);
        let lastUserMsg = '';
        for (let i = recentHistory.length - 1; i >= 0; i--) {
            if (recentHistory[i].role === 'user') {
                lastUserMsg = recentHistory[i].content;
                break;
            }
        }
        if (!lastUserMsg) lastUserMsg = actualPrompt;

        const userMessages = this.chatHistory.filter(m => m.role === 'user').slice(-3);
        const aiMessages = this.chatHistory.filter(m => m.role === 'assistant').slice(-2);
        const promptText = this.promptInput.value;
        
        let totalTokens = estimateTokens(htmlWithLines) + estimateTokens(cssWithLines) + estimateTokens(jsWithLines) + estimateTokens(promptText);
        userMessages.forEach(m => { totalTokens += estimateTokens(m.content); });
        aiMessages.forEach(m => { totalTokens += estimateTokens(m.content); });
        
        if (totalTokens > 100000) {
            this.addMessage('assistant', `❌ Request too large: estimated ${totalTokens} tokens. Please reduce your code or conversation history and try again.`);
            return;
        }
        const systemPrompt = `You are MUSE, an expert AI coding assistant. Your job is to REPLACE and IMPROVE code that ALREADY EXISTS, never duplicate, and always identify the correct lines to change.\n\nCRITICAL LINE NUMBER RULES:\n- The code above shows EXACT line numbers (e.g., \"5: <div>\")  \n- When you specify line: 5, you're targeting the line that starts with \"5:\"\n- Count carefully - line numbers are 1-based and must match exactly\n- If you see \"23: console.log('test')\" and want to change it, use line: 23\n\nIMPORTANT: Line numbers in your response MUST match EXACTLY with the line numbers in the current code. Do not adjust them. The line numbers you specify will be used as-is.\n\nStep 1: Generate the solution code for the user's request, considering the file system and how the code will be run in the provided template.\n\nStep 2: When outputting code, always use \\n for line breaks inside string values. Do NOT use actual newlines in any string value.\n\nStep 3: Output ONLY the minimal set of changes, using the following rules:\n- Respond ONLY with a JSON object wrapped inside [CHANGES]...[\/CHANGES] tags, like this:\n  [CHANGES]{\n    \"html\": { \"type\": \"replace\", \"line\": 5, \"endLine\": 5, \"content\": \"<div>...<\/div>\" },\n    \"css\": { ... },\n    \"js\": { ... }\n  }[\/CHANGES]\n- Your main job is to REPLACE and IMPROVE code that ALREADY EXISTS. Avoid duplicating code. Only replace or improve the relevant lines.\n- Include only lines that must be changed.\n- Do NOT output the entire file or line-to-code mappings.\n- For multiple changes in the same language, combine them into one object using minimal insert/replace/delete operations.\n- Never use duplicate keys in the JSON.\n- Never include <script> tags in HTML; all JavaScript changes must be in the 'js' field.\n- Only include languages that require changes.\n- Use 1-based line numbers that match EXACTLY with the current code.\n- No explanations unless explicitly requested.\n- Output must be valid JSON inside the [CHANGES] tags.\n- STRICT JSON: Use only double quotes (\") for all keys and string values. Do NOT use single quotes ('). Do NOT use actual newlines inside any string value; use \\n for line breaks. No multiline strings, comments, or trailing commas.\n- The only valid values for \"type\" are: \"insert\", \"replace\", or \"delete\". Do NOT use any other type (such as \"remove\", \"add\", \"update\", etc.).\n- Be mindful of your output token limit to avoid getting cut off.\n\nThe user's code will be injected into this template:\n[<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <style type=\"text/css\">\n      \${css}\n    </style>\n  </head>\n  <body>\n    \${html}\n    \${script}\n  </body>\n</html>\n;]\n\nCurrent code:\nHTML (with line numbers):\n${htmlWithLines}\n\nCSS (with line numbers):\n${cssWithLines}\n\nJavaScript (with line numbers):\n${jsWithLines}\n\nRecent conversation:\n${userMessages.map(m => 'User: ' + m.content).join('\n')}\n${aiMessages.map(m => 'AI: ' + m.content).join('\n')}\n\nNew user instruction:\n${promptText}`;

        console.log('--- SYSTEM PROMPT ---\n' + systemPrompt);
        console.log('--- USER MESSAGE ---\n' + lastUserMsg);

        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: lastUserMsg
            }
        ];

        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        temperature: 0,
                        top_p: 1,
                        
                        stream: true
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 60;
                        this.addMessage('assistant', `⏳ Rate limited. Waiting ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        attempt++;
                        continue;
                    }
                    if (response.status >= 500) {
                        throw new Error(`Server error (${response.status}). Retrying...`);
                    }
                    if (error.error?.message?.includes('context_length_exceeded')) {
                        this.addMessage('assistant', `⚠️ The request is too large for this model. Try starting a new chat or using a smaller codebase.`);
                        return;
                    }
                    throw new Error(error.error?.message || 'API request failed');
                }

                let currentMessage = '';
                let messageElement = this.addMessage('assistant', 'generating...');
                let seenChangesTag = false;
                let seenEndChangesTag = false;

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        if (seenChangesTag && !seenEndChangesTag) {
                            messageElement.remove();
                            await this.handleIncompleteResponse(currentMessage, prompt);
                            return;
                        }
                        break;
                    }
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices[0]?.delta?.content || '';
                                if (content) {
                                    currentMessage += content;
                                    if (currentMessage.includes('[CHANGES]')) seenChangesTag = true;
                                    if (currentMessage.includes('[/CHANGES]')) seenEndChangesTag = true;
                                    const idx = currentMessage.indexOf('[CHANGES]');
                                    const beforeChanges = idx !== -1 ? currentMessage.slice(0, idx).trim() : currentMessage.trim();
                                    if (!seenChangesTag && beforeChanges.length > 0 && !beforeChanges.startsWith('[')) {
                                        messageElement.textContent = beforeChanges;
                                    } else if (seenEndChangesTag) {
                                        const changesEndIndex = currentMessage.indexOf('[/CHANGES]') + '[/CHANGES]'.length;
                                        const cheerfulMessage = currentMessage.slice(changesEndIndex).trim();
                                        if (cheerfulMessage) {
                                            messageElement.textContent = cheerfulMessage;
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error('Error parsing chunk:', e);
                            }
                        }
                    }
                }
                if (messageElement && messageElement.textContent === 'generating...') {
                    if (seenEndChangesTag) {
                        const changesEndIndex = currentMessage.indexOf('[/CHANGES]') + '[/CHANGES]'.length;
                        const cheerfulMessage = currentMessage.slice(changesEndIndex).trim();
                        if (cheerfulMessage) {
                            messageElement.textContent = cheerfulMessage;
                        }
                    } else {
                        const idx = currentMessage.indexOf('[CHANGES]');
                        const beforeChanges = idx !== -1 ? currentMessage.slice(0, idx).trim() : currentMessage.trim();
                        if (!seenChangesTag && beforeChanges.length > 0 && !beforeChanges.startsWith('[')) {
                            messageElement.textContent = beforeChanges;
                        }
                    }
                }

                console.log('--- RAW AI OUTPUT ---\n' + currentMessage);

                let injectError = null;
                try {
                    await this.parseAndInjectCode(currentMessage);
                } catch (err) {
                    injectError = err.message || String(err);
                }
                if (injectError && attempt < 2) {
                    this.addMessage('assistant', `⚠️ There was an error applying the changes: ${injectError}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return this.makeOpenAIRequest(prompt, attempt + 1, injectError);
                } else if (injectError) {
                    this.addMessage('assistant', `❌ Failed to apply changes after ${attempt + 1} attempts. Last error: ${injectError}`);
                }
                return;
            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error);
                if (error.name === 'AbortError') {
                    this.addMessage('assistant', '⏳ Request timed out. Retrying...');
                } else {
                    this.addMessage('assistant', `❌ ${error.message}`);
                }
                attempt++;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                } else {
                    throw new Error('Failed after multiple retries. Please try again later.');
                }
            }
        }
    }

    waitForEditors() {
        return new Promise((resolve, reject) => {
            let retries = 0;
            
            const checkEditors = () => {
                const editors = window.editors;
                console.log('Checking for editors...', editors);
                
                if (editors && editors.html && editors.css && editors.js) {
                    console.log('Editors found and initialized');
                    resolve(editors);
                    return;
                }
                
                retries++;
                if (retries >= this.maxRetries) {
                    console.error('Failed to find editors after', this.maxRetries, 'attempts');
                    reject(new Error('Editors not available after maximum retries'));
                    return;
                }
                
                console.log('Editors not ready, retrying... (attempt', retries, 'of', this.maxRetries, ')');
                setTimeout(checkEditors, this.retryDelay);
            };
            
            checkEditors();
        });
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent += `
            .ai-message.user {
                transition: background-color 0.2s ease;
            }
            .ai-message.user:hover {
                background: #d8dde4;
                box-shadow: inset 2px 2px 5px #b8b9be, inset -2px -2px 5px #ffffff;
            }
            .ai-message.user::after {
                content: '↩️';
                position: absolute;
                right: 10px;
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            .ai-message.user:hover::after {
                opacity: 1;
            }
            .ai-token-counter {
                line-height: 1.4;
                position: relative;
                display: inline-block;
                cursor: pointer;
            }
            .token-total {
                font-family: monospace;
                font-size: 13px;
                background: #f5f5f5;
                border-radius: 4px;
                padding: 6px 12px;
                box-shadow: 2px 2px 6px #b8b9be, -2px -2px 6px #ffffff;
                color: #333;
                transition: box-shadow 0.2s;
            }
            .ai-token-counter:hover .token-total {
                box-shadow: 0 2px 8px #b8b9be, 0 1px 2px #fff1;
            }
            .token-breakdown-tooltip {
                display: none;
                position: absolute;
                left: 0;
                top: 110%;
                min-width: 260px;
                background: #fff;
                color: #222;
                border-radius: 8px;
                box-shadow: 0 4px 16px #b8b9be, 0 -4px 16px #ffffff;
                padding: 14px 18px;
                font-size: 12px;
                z-index: 100;
                white-space: pre-line;
            }
            .ai-token-counter:hover .token-breakdown-tooltip {
                display: block;
            }
            .ai-toggle {
                background: #e0e5ec;
                color: #4d4d4d;
                border: none;
                border-radius: 25px;
                box-shadow: 4px 4px 8px #b8b9be, -4px -4px 8px #ffffff;
                transition: box-shadow 0.3s, background 0.3s, color 0.3s;
            }
            .ai-toggle:hover {
                box-shadow: 2px 2px 8px #b8b9be, -2px -2px 8px #ffffff, 0 0 0 2px #e0e5ec;
                background: #e0e5ec;
                color: #222;
            }
        `;
        document.head.appendChild(style);
    }

    async getKeyMaterial(password) {
        let enc = new TextEncoder();
        return await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            {name: "PBKDF2"},
            false,
            ["deriveKey"]
        );
    }

    async deriveKey(password, salt, iterations = 100000, hash = "SHA-256") {
        const keyMaterial = await this.getKeyMaterial(password);
        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: iterations,
                hash: hash
            },
            keyMaterial,
            {name: "AES-GCM", length: 256},
            true,
            ["encrypt", "decrypt"]
        );
    }

    async decryptApiKey(ciphertextB64, passcode, saltB64, ivB64, iterations, hash) {
        const dec = new TextDecoder();
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
        
        let enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(passcode),
            {name: "PBKDF2"},
            false,
            ["deriveKey"]
        );
        
        const key = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: iterations,
                hash: hash
            },
            keyMaterial,
            {name: "AES-GCM", length: 256},
            true,
            ["encrypt", "decrypt"]
        );
        
        try {
            const decrypted = await window.crypto.subtle.decrypt(
                {name: "AES-GCM", iv: iv},
                key,
                ciphertext
            );
            const result = dec.decode(decrypted);
            return result;
        } catch (e) {
            return null;
        }
    }

    async promptForPasscode() {
        return new Promise((resolve) => {
            const passcode = window.prompt('Enter your secret passcode to unlock your GPT API key:');
            resolve(passcode);
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.editorsReady;
        
        window.aiAssistant = new AIAssistant();
        console.log('AI Assistant initialized with editors:', window.editors);
    } catch (error) {
        console.error('Failed to initialize AI Assistant:', error);
        const errorMessage = document.createElement('div');
        errorMessage.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 10000;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;
        errorMessage.textContent = 'Failed to initialize AI Assistant. Please refresh the page.';
        document.body.appendChild(errorMessage);
        
        setTimeout(() => errorMessage.remove(), 5000);
    }
}); 