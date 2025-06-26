// Updated: 2025-06-22 01:10 - Added clickable select interface for CLI prompts
class QChatInterface {
    constructor() {
        this.socket = io();
        this.terminal = document.getElementById('terminal');
        this.userInput = document.getElementById('userInput');
        this.inputSection = document.getElementById('inputSection');
        this.promptIndicator = document.getElementById('promptIndicator');
        this.status = document.getElementById('status');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearBtn');

        this.isWaitingForInput = false;
        this.isSelectPrompt = false; // Track if current prompt is a select/choice prompt
        this.rawBuffer = ''; // Buffer for raw ANSI data
        this.bufferTimeout = null;
        this.lastSentInput = '';
        this.thinkingElement = null;
        this.thinkingInterval = null;
        this.currentLine = '';
        this.streamingQueue = [];
        this.isStreaming = false;

        // Block-based rendering system
        this.currentBlock = null;
        this.currentBlockContent = '';
        this.blockType = 'system'; // 'system', 'user', 'bot'
        this.blockBuffer = ''; // Buffer for current block content

        // Initialize simple ANSI to HTML converter
        this.ansiConverter = {
            toHtml: (text) => this.convertAnsiToHtml(text)
        };

        this.initializeEventListeners();
        this.initializeSocketListeners();

        // Auto-start Q Chat when page loads
        this.socket.on('connect', () => {
            this.updateStatus('Connected', 'connected');
            // Start Q Chat automatically
            setTimeout(() => this.startQChat(), 500);
        });

        this.setupUploadAndFilesModal();
    }

    initializeEventListeners() {
        // Button events
        this.sendBtn.addEventListener('click', () => this.sendInput());
        this.clearBtn.addEventListener('click', () => this.clearInput());

        // Textarea events
        this.userInput.addEventListener('keydown', (e) => {
            // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
            if ((e.metaKey && e.key === 'Enter') || (e.ctrlKey && e.key === 'Enter')) {
                e.preventDefault();
                this.sendInput();
                return;
            }

            // Handle special keys for select prompts
            if (this.isSelectPrompt) {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
                    e.preventDefault();
                    this.handleSelectPromptKey(e.key);
                    return;
                }
            }
        });

        // Auto-resize textarea on input
        this.userInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });

        // Auto-resize on paste
        this.userInput.addEventListener('paste', () => {
            setTimeout(() => this.autoResizeTextarea(), 0);
        });
    }

    initializeSocketListeners() {
        this.socket.on('disconnect', () => {
            this.updateStatus('Disconnected', 'disconnected');
        });

        this.socket.on('q-started', () => {
            this.updateStatus('Q Chat Running', 'running');
        });

        this.socket.on('q-output', (data) => {
            this.handleQOutput(data);
        });

        this.socket.on('q-exit', () => {
            this.updateStatus('Q Chat Stopped', 'stopped');
            this.hideInputSection();
        });
    }

    startQChat() {
        this.clearTerminal();
        this.rawBuffer = '';
        this.streamingQueue = [];
        this.isStreaming = false;
        this.hideThinkingAnimation();
        clearTimeout(this.bufferTimeout);

        // Reset block system
        this.currentBlock = null;
        this.blockBuffer = '';
        this.blockType = 'system';

        this.socket.emit('start-q-chat');
        this.updateStatus('Starting Q Chat...', 'starting');
    }

    stopQChat() {
        this.socket.emit('stop-q-chat');
        this.hideInputSection();
        this.hideThinkingAnimation();
        this.isWaitingForInput = false;
    }

    sendInput() {
        const input = this.userInput.value;

        // Truncate empty lines from beginning and end
        const trimmedInput = this.truncateEmptyLines(input);

        if (trimmedInput.trim()) {
            this.lastSentInput = trimmedInput.trim();

            // IMMEDIATELY display clean user input before sending
            this.displayCleanUserInput(trimmedInput.trim());

            // Send it to Q
            this.socket.emit('q-input', trimmedInput + '\r\n');

            this.clearInput();
            this.hideInputSection();
            this.isWaitingForInput = false;
        }
    }

    truncateEmptyLines(input) {
        if (!input) return '';

        // Split into lines
        const lines = input.split('\n');

        // Find first non-empty line from the beginning
        let startIndex = 0;
        while (startIndex < lines.length && lines[startIndex].trim() === '') {
            startIndex++;
        }

        // Find first non-empty line from the end
        let endIndex = lines.length - 1;
        while (endIndex >= 0 && lines[endIndex].trim() === '') {
            endIndex--;
        }

        // If all lines are empty, return empty string
        if (startIndex > endIndex) {
            return '';
        }

        // Return the trimmed lines joined back together
        return lines.slice(startIndex, endIndex + 1).join('\n');
    }

    displayCleanUserInput(input) {
        // Create a clean user input block immediately
        this.createNewBlock('user');

        // Clean the input properly - remove quotes and format nicely
        const cleanInput = input.replace(/^["']|["']$/g, '').trim();
        const formattedInput = `> ${cleanInput}`;

        // Use plain text, not ANSI conversion to avoid duplicate prompts
        this.currentBlock.innerHTML = formattedInput;
        this.finalizeCurrentBlock();

        
    }

    clearInput() {
        this.userInput.value = '';
        this.resetTextareaHeight();
    }

    autoResizeTextarea() {
        const textarea = this.userInput;
        const minHeight = 48; // Minimum height in pixels
        const maxHeight = 240; // Maximum height (10 rows * 24px line height)
        const lineHeight = 24; // Approximate line height in pixels

        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';

        // Calculate new height based on content
        let newHeight = Math.max(minHeight, textarea.scrollHeight);
        newHeight = Math.min(newHeight, maxHeight);

        // Set the new height
        textarea.style.height = newHeight + 'px';

        // If content exceeds max height, ensure we scroll to bottom
        if (textarea.scrollHeight > maxHeight) {
            textarea.scrollTop = textarea.scrollHeight;
        }

        // Scroll the terminal to bottom to keep input visible
        this.scrollToBottom();
    }

    resetTextareaHeight() {
        this.userInput.style.height = '40px'; // Reset to minimum height
    }

    clearTerminal() {
        this.terminal.innerHTML = '';
    }

    updateStatus(text, className) {
        this.status.textContent = text;
        this.status.className = `status ${className}`;
    }

    showInputSection(prompt = '> ', isSelectPrompt = false) {
        this.isSelectPrompt = isSelectPrompt;

        if (isSelectPrompt) {
            this.showSelectInterface();
        } else {
            this.showTextInterface();
        }

        this.isWaitingForInput = true;
    }

    showTextInterface() {
        // Hide select interface if it exists
        const selectInterface = document.getElementById('selectInterface');
        if (selectInterface) {
            selectInterface.style.display = 'none';
        }

        this.promptIndicator.textContent = '';
        this.promptIndicator.style.color = '';
        this.inputSection.style.display = 'block';
        this.resetTextareaHeight();

        setTimeout(() => {
            this.userInput.focus();
        }, 100);
    }

    showSelectInterface() {
        

        // Hide text input
        this.inputSection.style.display = 'none';

        // Create or show select interface
        let selectInterface = document.getElementById('selectInterface');
        if (!selectInterface) {
            
            selectInterface = this.createSelectInterface();
        } else {
            
        }

        // Parse the current terminal content to extract options
        
        this.parseSelectOptions(selectInterface);
        selectInterface.style.display = 'block';
        
    }

    createSelectInterface() {
        

        const selectInterface = document.createElement('div');
        selectInterface.id = 'selectInterface';
        selectInterface.className = 'select-interface';
        selectInterface.innerHTML = `
            <div class="select-header">
                <span class="select-title">Select an option:</span>
            </div>
            <div class="select-options" id="selectOptions">
                <!-- Options will be populated dynamically -->
            </div>
            <div class="select-controls">
                <button id="selectCancelBtn" class="select-btn cancel">Cancel</button>
            </div>
        `;

        // Check if we need to create a model selection interface directly
        if (this.rawBuffer.includes('/model') || this.rawBuffer.includes('Select a model')) {
            
            const optionsContainer = selectInterface.querySelector('#selectOptions');

            // Create model options directly
            const models = [
                { text: 'claude-4-sonnet (active)', selected: true },
                { text: 'claude-3.7-sonnet', selected: false },
                { text: 'claude-3.5-sonnet', selected: false }
            ];

            // Set the title
            selectInterface.querySelector('.select-title').textContent = 'Select a model for this chat session';

            // Create option buttons
            models.forEach((model, index) => {
                const optionBtn = document.createElement('button');
                optionBtn.className = `select-option ${model.selected ? 'selected' : ''}`;
                optionBtn.textContent = model.text;
                optionBtn.addEventListener('click', () => {
                    this.selectOption(index);
                });
                optionsContainer.appendChild(optionBtn);
            });

            // Store options for keyboard navigation
            this.selectOptions = models;
            this.currentSelection = 0;
        }

        // Insert after the terminal
        const terminal = document.getElementById('terminal');
        terminal.parentNode.insertBefore(selectInterface, terminal.nextSibling);

        // Add event listeners
        document.getElementById('selectCancelBtn').addEventListener('click', () => {
            this.hideSelectInterface();
        });

        return selectInterface;
    }

    parseSelectOptions(selectInterface) {
        

        // Get the terminal content
        const terminalContent = this.terminal.textContent || this.terminal.innerText;
        const lines = terminalContent.split('\n');
        

        // Also check the raw buffer for ANSI codes
        const rawLines = this.rawBuffer.split(/\r?\n/);
        
        

        const optionsContainer = document.getElementById('selectOptions');
        optionsContainer.innerHTML = '';

        let questionText = '';
        let currentSelection = 0;
        const options = [];
        let foundSelectSection = false;

        // Look for the model selection section specifically
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Find the question line
            if ((trimmedLine.includes('?') && trimmedLine.includes('›')) ||
                (trimmedLine.includes('Select a model') && trimmedLine.includes('chat session')) ||
                (trimmedLine.includes('/model') && trimmedLine.includes('Select'))) {
                questionText = trimmedLine.replace(/[?›]/g, '').trim();
                foundSelectSection = true;
                continue;
            }

            // If we found the select section, look for options
            if (foundSelectSection) {
                if (trimmedLine.startsWith('❯') || trimmedLine.includes('❯')) {
                    // Current selection
                    const optionText = trimmedLine.replace('❯', '').trim();
                    options.push({ text: optionText, selected: true });
                    currentSelection = options.length - 1;
                } else if (trimmedLine.match(/^\s*claude-/) || trimmedLine.match(/^\s*gpt-/)) {
                    // Regular option (indented)
                    const optionText = trimmedLine.trim();
                    options.push({ text: optionText, selected: false });
                } else if (trimmedLine === '' || trimmedLine.includes('🤖')) {
                    // End of options section
                    break;
                }
            }
        }

        // If no options found, try looking through raw lines for ANSI-colored options
        if (options.length === 0) {
            for (let i = 0; i < rawLines.length; i++) {
                const rawLine = rawLines[i];
                const cleanLine = this.cleanAnsiSequences(rawLine);

                if (cleanLine.includes('Select a model') || cleanLine.includes('/model')) {
                    foundSelectSection = true;
                    questionText = cleanLine.replace(/[?›]/g, '').trim();
                    continue;
                }

                if (foundSelectSection) {
                    if (rawLine.includes('❯') || cleanLine.includes('❯')) {
                        // Current selection with arrow
                        const optionText = cleanLine.replace('❯', '').trim();
                        options.push({ text: optionText, selected: true });
                        currentSelection = options.length - 1;
                    } else if (cleanLine.match(/claude-|gpt-/)) {
                        // Regular option
                        options.push({ text: cleanLine.trim(), selected: false });
                    }
                }
            }
        }


        // If no options found, try parsing from raw buffer
        if (options.length === 0) {
            this.parseFromRawBuffer(optionsContainer);
            return;
        }

        // Update header
        if (questionText) {
            document.querySelector('.select-title').textContent = questionText;
        } else {
            document.querySelector('.select-title').textContent = 'Select a model for this chat session';
        }

        // Create option buttons
        options.forEach((option, index) => {
            const optionBtn = document.createElement('button');
            optionBtn.className = `select-option ${option.selected ? 'selected' : ''}`;
            optionBtn.textContent = option.text;
            optionBtn.addEventListener('click', () => {
                this.selectOption(index);
            });
            optionsContainer.appendChild(optionBtn);
        });

        // Store options for keyboard navigation
        this.selectOptions = options;
        this.currentSelection = currentSelection;
    }

    parseFromRawBuffer(optionsContainer) {
        // Try to parse from the raw buffer as fallback
        const rawContent = this.rawBuffer || '';

        // Look for the pattern in raw content
        const lines = rawContent.split(/\r?\n/);
        const options = [];
        let currentSelection = 0;
        let foundModelSection = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Remove ANSI codes for parsing
            const cleanLine = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

            // Look for model selection section
            if (cleanLine.includes('Select a model') ||
                cleanLine.includes('/model') ||
                cleanLine.includes('chat session')) {
                foundModelSection = true;
                continue;
            }

            if (foundModelSection || options.length > 0) {
                if (cleanLine.includes('❯') || line.includes('❯')) {
                    const optionText = cleanLine.replace('❯', '').trim();
                    options.push({ text: optionText, selected: true });
                    currentSelection = options.length - 1;
                } else if (cleanLine.includes('claude-') || cleanLine.includes('gpt-')) {
                    options.push({ text: cleanLine, selected: false });
                } else if (cleanLine.includes('🤖') || (options.length > 0 && cleanLine === '')) {
                    // End of model section
                    break;
                }
            }
        }


        // If still no options, create manual fallback
        if (options.length === 0) {
            options.push(
                { text: 'claude-4-sonnet (active)', selected: true },
                { text: 'claude-3.7-sonnet', selected: false },
                { text: 'claude-3.5-sonnet', selected: false }
            );
        }

        // Create option buttons
        options.forEach((option, index) => {
            const optionBtn = document.createElement('button');
            optionBtn.className = `select-option ${option.selected ? 'selected' : ''}`;
            optionBtn.textContent = option.text;
            optionBtn.addEventListener('click', () => {
                this.selectOption(index);
            });
            optionsContainer.appendChild(optionBtn);
        });

        this.selectOptions = options;
        this.currentSelection = currentSelection;
    }

    selectOption(index) {

        // Send arrow keys to navigate to the selected option
        const currentIndex = this.currentSelection;
        const targetIndex = index;

        if (targetIndex !== currentIndex) {
            const moves = targetIndex - currentIndex;
            const keyCode = moves > 0 ? '\x1b[B' : '\x1b[A'; // Down or Up

            for (let i = 0; i < Math.abs(moves); i++) {
                this.socket.emit('q-input', keyCode);
            }
        }

        // Send Enter to confirm selection
        setTimeout(() => {
            this.socket.emit('q-input', '\r');
            this.hideSelectInterface();
        }, 100);
    }

    hideSelectInterface() {
        const selectInterface = document.getElementById('selectInterface');
        if (selectInterface) {
            selectInterface.style.display = 'none';
        }
        this.isWaitingForInput = false;
        this.isSelectPrompt = false;
    }

    hideInputSection() {
        this.inputSection.style.display = 'none';
        this.hideSelectInterface();
        this.isWaitingForInput = false;
        this.isSelectPrompt = false;
    }

    handleSelectPromptKey(key) {

        // For select prompts, we need to send the raw key codes that the CLI expects
        let keyCode = '';

        switch(key) {
            case 'ArrowUp':
                keyCode = '\x1b[A'; // ANSI escape sequence for up arrow
                break;
            case 'ArrowDown':
                keyCode = '\x1b[B'; // ANSI escape sequence for down arrow
                break;
            case 'Enter':
                keyCode = '\r'; // Carriage return for Enter
                break;
        }

        if (keyCode) {
            this.socket.emit('q-input', keyCode);

            // For Enter key, hide the input section
            if (key === 'Enter') {
                this.hideInputSection();
            }
        }
    }

    handleQOutput(data) {
        // Aggressively remove ALL problematic sequences that cause display issues
        let cleanedData = data.raw
            // Remove cursor control sequences - be more aggressive
            .replace(/\x1b\[\?25[hl]/g, '') // Show/hide cursor
            .replace(/\x1b\[\?2004[hl]/g, '') // Bracketed paste mode
            .replace(/\[\?25[hl]/g, '') // Show/hide cursor without escape
            .replace(/\[\?2004[hl]/g, '') // Bracketed paste mode without escape
            // Remove ALL cursor movement sequences - be very aggressive
            .replace(/\x1b\[[ABCD]/g, '') // Cursor movements with escape
            .replace(/\x1b\[\d+[ABCD]/g, '') // Cursor movements with numbers
            .replace(/\[A/g, '') // Cursor up without escape (this is what's showing in screenshot)
            .replace(/\[B/g, '') // Cursor down without escape
            .replace(/\[C/g, '') // Cursor forward without escape
            .replace(/\[D/g, '') // Cursor backward without escape
            // Remove other problematic sequences
            .replace(/\x1b\[K/g, '') // Clear line
            .replace(/\x1b\[J/g, '') // Clear screen
            .replace(/\x1b\[H/g, '') // Home cursor
            // Remove carriage returns that cause line overwrites
            .replace(/\r\x1b\[K/g, '\n') // Convert CR+clear to newline
            .replace(/\r/g, ''); // Remove remaining carriage returns

        // BALANCED APPROACH: Allow first user input display, suppress only duplicates
        if (this.lastSentInput && this.isWaitingForInput === false) {
            const userInput = this.lastSentInput.trim();

            // Only suppress if this looks like cascading echo patterns (multiple prompts)
            const hasCascadingPattern = />\s*\w+>\s*\w+/.test(cleanedData);
            const hasMultiplePrompts = (cleanedData.match(/>/g) || []).length > 1;

            // Allow first occurrence of user input, suppress only cascading duplicates
            if (hasCascadingPattern || hasMultiplePrompts) {
                return; // Only suppress cascading patterns
            }
        }

        // Allow all other content (including first user input and all bot responses)
        

        // Add cleaned data to raw buffer
        this.rawBuffer += cleanedData;

        // Only check for model selection if user actually ran /model command
        // Don't trigger on help text that mentions /model
        if (this.lastSentInput === '/model' &&
            (data.raw.includes('❯') || data.raw.includes('Select a model for this chat session'))) {
            

            // Extract model selection data directly from the raw output
            const modelData = this.extractModelSelectionData(data.raw);

            if (modelData && modelData.models.length > 0) {
                // Create and show the model selection interface directly
                this.createDirectModelInterface(modelData.models, modelData.title);
                return;
            }
        }

        // Check for immediate prompt patterns in the raw data
        this.checkForImmediatePrompts(data.raw);

        // Process data line by line when we have complete lines (newlines)
        const lines = this.rawBuffer.split('\n');

        // Keep the last incomplete line in the buffer
        this.rawBuffer = lines.pop() || '';

        // Process each complete line as a block update
        for (const line of lines) {
            if (line.trim()) {
                this.processCompleteLine(line + '\n');
            }
        }

        // If we have remaining content without newline, update current block
        if (this.rawBuffer.trim()) {
            this.updateCurrentBlockWithPartialContent(this.rawBuffer);

            // Also check for prompts in the partial content
            this.checkForPrompts(this.rawBuffer, this.cleanAnsiSequences(this.rawBuffer));
        }
    }

    checkForImmediatePrompts(rawData) {
        // Check for immediate prompt indicators that don't wait for newlines
        if (rawData.includes('\x1b[38;5;13m>') ||
            rawData.includes('> ') ||
            rawData.match(/\x1b\[[0-9;]*m>\s*/)) {
            setTimeout(() => {
                if (!this.isWaitingForInput) {
                    this.showTextInterface();
                }
            }, 100);
        }
    }

    processCompleteLine(lineContent) {
        // Clean and analyze the content
        const cleanedContent = this.cleanAnsiSequences(lineContent);
        let textOnly = cleanedContent.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
        let processedLineContent = lineContent; // Make a mutable copy

        // Create cleanLine for exact matching
        const cleanLine = textOnly;

        // Debug: User input echo debugging only
        if (this.lastSentInput && (textOnly.includes(this.lastSentInput.trim()) || textOnly.includes('>'))) {
        }

        // Use the full lineContent for comprehensive thinking detection
        const hasUnicodeSpinner = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏].*?[Tt]hinking/i.test(lineContent);
        const hasDotsThinking = /\.{2,}.*?[Tt]hinking/i.test(lineContent);
        const hasThinkingDots = /[Tt]hinking\.{2,}/i.test(lineContent);
        const hasSpinnerSequence = /\x1b\[[0-9;]*[mK].*?[Tt]hinking/i.test(lineContent);
        const hasMultilineThinking = /\s+\.{2,}\s*\n\s*[Tt]hinking/i.test(lineContent);
        const hasSimpleThinking = /^\s*[Tt]hinking\.?\s*$/i.test(textOnly); // Just "Thinking." by itself

        const hasThinkingPattern = hasUnicodeSpinner || hasDotsThinking || hasThinkingDots || hasSpinnerSequence || hasMultilineThinking || hasSimpleThinking;

        if (hasThinkingPattern) {

            // For complete lines, try to extract actual content mixed with thinking
            let contentWithoutThinking = lineContent;

            // Remove thinking patterns more carefully
            contentWithoutThinking = contentWithoutThinking.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*Thinking\.{0,3}/g, ''); // Remove spinner + "Thinking..."
            contentWithoutThinking = contentWithoutThinking.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/g, ''); // Remove remaining spinners
            contentWithoutThinking = contentWithoutThinking.replace(/…/g, ''); // Remove ellipsis

            // Clean ANSI sequences and extract text
            const cleanedText = this.cleanAnsiSequences(contentWithoutThinking);
            const extractedText = cleanedText.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

            // If there's substantial actual content mixed in, process it
            if (extractedText.length > 20) { // Only if we have substantial content
                // Remove thinking element if it exists
                this.removeThinkingElement();

                // Process the cleaned content as normal line content
                textOnly = extractedText;
                processedLineContent = this.convertAnsiToHtml(extractedText);

                // Continue processing as normal content (don't return early)
            } else {
                // Pure thinking or minimal content - show animation only
                // Show thinking animation
                if (!this.thinkingElement || !this.thinkingElement.parentNode) {
                    this.createThinkingElement();
                }
                return; // Don't process as regular content
            }
        }

        // If we had thinking and now we have real content, replace thinking with response
        if (this.thinkingElement && (textOnly.length > 0 || processedLineContent.trim().length > 0)) {
            this.removeThinkingElement();
        }

        // Skip empty lines that might trigger unnecessary block creation
        if (!textOnly.trim() && !processedLineContent.trim()) {
            return;
        }

        // User input echo filtering debug
        if (this.lastSentInput && !this.currentBlock) {
            // Clean the user input by removing quotes and trimming
            const userInput = this.lastSentInput.replace(/^["']|["']$/g, '').trim();
            const expectedPrompt = `> ${userInput}`;


            // Only filter exact prompt patterns, not standalone user input
            if (textOnly === expectedPrompt) {
                
                return; // Skip obvious prompt echoes
            }
        }

        // DON'T skip empty lines - preserve them for formatting
        // Only skip lines that are completely empty AND have no formatting content
        if (processedLineContent.trim() === '' && !processedLineContent.includes('\x1b')) {
            
            // Still process empty lines but as formatting
            if (this.currentBlock) {
                this.updateCurrentBlock('\n');
            }
            return;
        }

        // Process normal content - ensure bot responses get proper styling
        const detectedType = this.detectBlockType(textOnly);

        // Skip creating blocks for echo patterns - just ignore them completely
        if (detectedType === 'echo') {
            
            return; // Don't create any block for echo patterns
        }

        // Debug user input block detection
        if (detectedType === 'user' || textOnly.includes('>')) {
        }

        if (!this.currentBlock || this.blockType !== detectedType) {
            // Debug block creation for user input
            if (detectedType === 'user') {
                
            }
            this.createNewBlock(detectedType);
        }

        this.updateCurrentBlock(processedLineContent);

        if (textOnly) {
            this.checkForPrompts(processedLineContent, textOnly);
        }
    }

    createThinkingElement() {
        

        // Only create if we absolutely don't have one
        if (this.thinkingElement && this.thinkingElement.parentNode) {
            
            return;
        }

        
        // Aggressively remove any existing thinking elements first
        this.removeThinkingElement();

        this.thinkingElement = document.createElement('div');
        this.thinkingElement.className = 'terminal-block terminal-block-system thinking-animation';
        this.thinkingElement.style.color = '#888888';
        this.thinkingElement.style.fontStyle = 'italic';

        // Create animated thinking with dots
        const thinkingText = document.createElement('span');
        thinkingText.textContent = 'Thinking';

        const dots = document.createElement('span');
        dots.className = 'thinking-dots';

        this.thinkingElement.appendChild(thinkingText);
        this.thinkingElement.appendChild(dots);
        this.terminal.appendChild(this.thinkingElement);

        // Animate the dots (only 0, 1, or 2 dots to prevent line breaking)
        let dotCount = 0;
        this.thinkingInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 3; // Changed from % 4 to % 3
            dots.textContent = '.'.repeat(dotCount);
        }, 500);

        
        this.scrollToBottom();
    }

    removeThinkingElement() {
        

        // Count existing thinking elements
        const existingElements = document.querySelectorAll('.thinking-animation');
        

        // Remove all thinking elements from DOM first
        existingElements.forEach((el, index) => {
            
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });

        // Clear the reference
        this.thinkingElement = null;
        

        // Clear any intervals
        if (this.thinkingInterval) {
            clearInterval(this.thinkingInterval);
            this.thinkingInterval = null;
            
        }
    }

    updateCurrentBlockWithPartialContent(partialContent) {
        // Check for various thinking patterns in partial content FIRST
        const hasUnicodeSpinner = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏].*?[Tt]hinking/i.test(partialContent);
        const hasDotsThinking = /\.{2,}.*?[Tt]hinking/i.test(partialContent);
        const hasThinkingDots = /[Tt]hinking\.{2,}/i.test(partialContent);
        const hasSpinnerSequence = /\x1b\[[0-9;]*[mK].*?[Tt]hinking/i.test(partialContent);
        const hasMultilineThinking = /\s+\.{2,}\s*\n\s*[Tt]hinking/i.test(partialContent);

        const hasThinkingPattern = hasUnicodeSpinner || hasDotsThinking || hasThinkingDots || hasSpinnerSequence || hasMultilineThinking;

        if (hasThinkingPattern) {

            // Show thinking animation instead of the raw text
            if (!this.thinkingElement || !this.thinkingElement.parentNode) {
                this.createThinkingElement();
            }
            return; // Don't process as regular content - this prevents the thinking text from showing
        }

        // If we had thinking and now we have real content, replace thinking with response
        if (this.thinkingElement && partialContent.trim().length > 0) {
            
            this.removeThinkingElement();
        }

        // Always update existing blocks with partial content - don't skip short content!
        if (this.currentBlock) {
            // Temporarily add partial content for display
            const tempBuffer = this.blockBuffer + partialContent;
            const processedContent = this.convertAnsiToHtml(tempBuffer);
            this.currentBlock.innerHTML = processedContent;
            this.scrollToBottom();
        } else {
            // Only apply length restriction when creating NEW blocks
            const cleanContent = this.cleanAnsiSequences(partialContent);
            const textOnly = cleanContent.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

            if (textOnly.length > 5) { // Only create block for substantial content
                const detectedType = this.detectBlockType(textOnly);

                // Skip creating blocks for echo patterns
                if (detectedType === 'echo') {
                    
                    return; // Don't create any block for echo patterns
                }

                
                this.createNewBlock(detectedType);
                this.updateCurrentBlock(this.convertAnsiToHtml(partialContent));
            }
        }
    }

    checkForPrompts(rawContent, textContent) {
        // Only debug model selection if user actually ran /model
        if (this.lastSentInput === '/model' && (rawContent.includes('❯') || rawContent.includes('Select a model'))) {
            
            
            
        }

        // Special case for model selection - only if user ran /model command
        if (this.lastSentInput === '/model' &&
            ((rawContent.includes('❯') && rawContent.includes('Select')) ||
             (rawContent.includes('Select a model') && rawContent.includes('chat session')))) {
            
            this.finalizeCurrentBlock();
            this.showSelectInterface();
            return;
        }

        // Check for colored prompt pattern (before ANSI cleaning)
        const hasColoredPrompt = rawContent.match(/\x1b\[38;5;13m>\s*\x1b\[39m/) ||
                                rawContent.match(/\x1b\[[0-9;]*m>\s*\x1b\[[0-9;]*m/) ||
                                rawContent.includes('> ');

        // Check for simple prompt patterns
        const hasSimplePrompt = textContent.trim().endsWith('>') ||
                               textContent.includes('> ') ||
                               rawContent.includes('\x1b[38;5;13m>');

        // Check for select prompt (multiple choice) - only for actual prompts, not help text
        const hasSelectOptions = (textContent.includes('?') && textContent.includes('❯')) ||
                                (this.lastSentInput === '/model' && textContent.includes('Select a model') && textContent.includes('chat session')) ||
                                (rawContent.includes('[?') && rawContent.includes('Select') && rawContent.includes('❯'));

        // Debug: Log select options detection only for actual prompts
        if (hasSelectOptions && this.lastSentInput === '/model') {
            
        }

        // Check for any prompt-like pattern
        const looksLikePrompt = hasColoredPrompt || hasSimplePrompt;

        if (looksLikePrompt && !hasSelectOptions) {
            this.finalizeCurrentBlock();
            this.showTextInterface();
        } else if (hasSelectOptions) {
            this.finalizeCurrentBlock();
            this.showSelectInterface();
        }
    }

    cleanAnsiSequences(data) {
        // Debug: Log raw data before cleaning
        if (data.includes('/model') || data.includes('Select a model') || data.includes('❯')) {
            
        }

        // Preserve important characters like ❯ before cleaning
        let preserved = data
            // Preserve selection arrow
            .replace(/\x1b\[38;5;\d+m❯/g, '❯')
            .replace(/\x1b\[[0-9;]*m❯/g, '❯')
            // Preserve question marks
            .replace(/\x1b\[38;5;\d+m\?/g, '?')
            .replace(/\x1b\[[0-9;]*m\?/g, '?');

        // Debug: Log preserved data
        if (data.includes('/model') || data.includes('Select a model') || data.includes('❯')) {
            
        }

        return preserved
            // Remove ONLY cursor control sequences, NOT color codes
            .replace(/\x1b\[\?25[hl]/g, '') // Show/hide cursor
            .replace(/\[\?25[hl]/g, '') // Show/hide cursor without escape
            .replace(/\x1b\[\?2004[hl]/g, '') // Bracketed paste mode
            .replace(/\[\?2004[hl]/g, '') // Bracketed paste mode without escape
            .replace(/\x1b\[K/g, '') // Clear line
            .replace(/\[K/g, '') // Clear line without escape
            .replace(/\x1b\[[0-9]*[ABCD]/g, '') // Cursor movement
            .replace(/\x1b\[[0-9]+;[0-9]+H/g, '') // Position cursor
            .replace(/\x1b\[[0-9]*C/g, '') // Cursor forward
            .replace(/\x1b\[2J/g, '') // Clear screen
            .replace(/\x1b\[H/g, '') // Home cursor
            .replace(/\x1b\[s/g, '') // Save cursor
            .replace(/\x1b\[u/g, '') // Restore cursor
            // Handle carriage return + cursor movement combinations
            .replace(/\r\x1b\[[0-9]*C/g, '\r')
            .replace(/\r\x1b\[K/g, '\r') // Carriage return + clear line
            // Remove incomplete sequences at end
            .replace(/\x1b\[[0-9;]*$/g, '')
            // Remove carriage returns that interfere with display
            .replace(/\r/g, '');
            // DON'T remove color codes - let convertAnsiToHtml handle them
    }

    processLineBreaks(htmlData) {
        return htmlData
            // Convert line breaks to HTML
            .replace(/\r\n/g, '<br>')
            .replace(/\n/g, '<br>')
            .replace(/\r/g, '')

            // Fix broken lines that might have color resets in the middle
            .replace(/(<br>)\s*(<span[^>]*>)/g, '$1$2') // Keep spans after line breaks
            .replace(/(<\/span>)(<br>)(<span[^>]*>)/g, '$1$2$3') // Handle span transitions across lines

            // Clean up artifacts
            .replace(/A+B+/g, '') // Remove interactive menu artifacts
            .replace(/❯\s*❯/g, '❯') // Remove duplicate selection arrows
            .replace(/>\s*>/g, '>') // Remove duplicate prompts

            // Fix spacing issues around line breaks
            .replace(/<br>\s+/g, '<br>') // Remove extra spaces after line breaks
            .replace(/\s+<br>/g, '<br>'); // Remove extra spaces before line breaks
    }

    checkForPrompt(textOnly, rawData = '', hasColoredPrompt = false) {

        // Remove all ANSI sequences for better prompt detection
        const cleanText = textOnly.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

        // Check for select/choice prompts (like model selection)
        // Look for the pattern of question mark and selection arrow or model selection text
        const isSelectPrompt = (cleanText.includes('?') && cleanText.includes('❯')) ||
                              (cleanText.includes('Select a model') && cleanText.includes('chat session')) ||
                              (cleanText.includes('/model') && cleanText.includes('Select'));

        // More specific prompt detection - look for the actual command prompt pattern
        // The real prompt should have cursor positioning after it
        const isRealPrompt = hasColoredPrompt ||
                           (rawData.includes('> ') && rawData.includes('\x1b[2C')) || // Cursor positioning
                           (cleanText === '>' || cleanText === '> ') || // Just a prompt by itself
                           (cleanText.endsWith('\n>') || cleanText.endsWith('\n> ')); // Prompt on new line

        // Avoid false positives from content that just happens to contain >
        const isFalsePositive = cleanText.includes('🤖') || // Bot indicator
                               cleanText.includes('○') || // List bullets
                               cleanText.includes('disabled') || // Status messages
                               cleanText.includes('chatting with') || // Intro message
                               (cleanText.includes('>') && cleanText.length > 10 && !isSelectPrompt); // Long text with >


        if ((isRealPrompt || isSelectPrompt) && !isFalsePositive && !this.isWaitingForInput) {
            const promptType = isSelectPrompt ? 'Select an option' : '> ';
            this.showInputSection(promptType, isSelectPrompt);
            return; // Exit early to avoid the fallback
        }

        // Enhanced fallback check - but be more careful
        setTimeout(() => {
            if (this.isWaitingForInput) return; // Already showing input

            // Look for the specific colored prompt pattern in recent output
            const hasRecentPrompt = rawData.includes('\x1b[38;5;13m> \x1b[39m\r\x1b[2C');


            if (hasRecentPrompt) {
                this.showInputSection('> ');
            }
        }, 150);
    }

    scrollToBottom() {
        this.terminal.scrollTop = this.terminal.scrollHeight;
    }

    // Block-based rendering methods
    createNewBlock(type) {
        // Finalize current block if it exists
        if (this.currentBlock) {
            this.finalizeCurrentBlock();
        }

        // Create new block
        this.currentBlock = document.createElement('div');
        this.currentBlock.className = `terminal-block terminal-block-${type}`;
        this.blockType = type;
        this.blockBuffer = '';
        this.currentBlockContent = '';

        // Add to terminal
        this.terminal.appendChild(this.currentBlock);
        this.scrollToBottom();

    }

    updateCurrentBlock(content) {
        if (!this.currentBlock) {
            this.createNewBlock('system');
        }

        // Debug user block content updates
        if (this.blockType === 'user') {
        }

        // Add content to buffer
        this.blockBuffer += content;

        // Process content and update block display
        const processedContent = this.convertAnsiToHtml(this.blockBuffer);

        // Debug processed content for user blocks
        if (this.blockType === 'user') {
        }

        this.currentBlock.innerHTML = processedContent;
        this.scrollToBottom();
    }

    finalizeCurrentBlock() {
        if (this.currentBlock && this.blockBuffer) {
            // Debug user block finalization
            if (this.blockType === 'user') {
            }

            // Strip only trailing blank lines from block content (preserve leading ones)
            let cleanedBuffer = this.blockBuffer;

            // Split into lines for processing
            let lines = cleanedBuffer.split('\n');

            // Remove only trailing empty lines
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                lines.pop();
            }

            // Rejoin the lines
            cleanedBuffer = lines.join('\n');

            // Final processing of the cleaned block content
            const finalContent = this.convertAnsiToHtml(cleanedBuffer);
            this.currentBlock.innerHTML = finalContent;

            // Debug user block final result
            if (this.blockType === 'user') {
            }

            
        }
    }

    detectBlockType(content) {
        // MUCH MORE RESTRICTIVE: Since we display user input immediately,
        // any content coming through the echo system should be bot response


        // Rule 1: NEVER classify echoed user input as user input since we display it immediately
        // Any content that looks like user input echo should be completely suppressed
        if (this.lastSentInput && content.trim().startsWith('> ')) {
            const cleanUserInput = this.lastSentInput.replace(/^["']|["']$/g, '').trim();
            const expectedPrompt = `> ${cleanUserInput}`;

            if (content.trim() === expectedPrompt || content.includes(expectedPrompt)) {
                
                return 'echo'; // Suppress this - we already displayed it
            }
        }

        // Rule 2: Block any echo patterns completely
        if (content.includes('> ') && content.match(/>\s*\w+>\s*\w+/)) {
            
            return 'echo';
        }

        // Rule 3: If content is long or contains AI phrases, it's definitely bot
        const cleanContent = content.replace(/^["']|["']$/g, '').trim();
        const isLongContent = cleanContent.length > 50;
        const hasAIphrases = /I'm Amazon Q|I am Amazon Q|AI assistant|Amazon Web Services|I have access|I can help|built by Amazon/i.test(cleanContent);

        if (isLongContent || hasAIphrases) {
            
            return 'bot';
        }

        // Rule 4: Command responses should be bot responses, not system
        if (this.lastSentInput && this.lastSentInput.match(/^\/[a-z]+/)) {
            
            return 'bot'; // Changed from 'system' to 'bot'
        }

        // Rule 5: If user sent regular input, assume this is bot response
        if (this.lastSentInput && this.lastSentInput.trim() && !this.lastSentInput.match(/^\/[a-z]+/)) {
            
            return 'bot';
        }

        
        return 'system';
    }

    displayUserInput(input) {
        // Create a user input block
        this.createNewBlock('user');

        // Format the input with a prompt indicator
        const formattedInput = `> ${input}`;
        this.updateCurrentBlock(formattedInput);
        this.finalizeCurrentBlock();

    }

    hideThinkingAnimation() {
        this.removeThinkingElement();
    }

    streamToTerminal(content) {
        if (!content.trim()) return;

        // Check for thinking patterns first - don't stream thinking content
        const cleanedContent = this.cleanAnsiSequences(content);
        const textOnly = cleanedContent.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
        const cleanLine = textOnly; // Use cleanLine for exact matching

        // Check for EXACT thinking pattern: "[spinner] Thinking..." OR multiple thinking patterns
        const exactThinkingPattern = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*Thinking\.{3}$/;
        const multipleThinkingPattern = /^([⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*Thinking\.{0,3}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]*)+[hinking\.]*$/;

        if (exactThinkingPattern.test(cleanLine) || multipleThinkingPattern.test(cleanLine)) {
            

            // Replace previous element in terminal if it exists and it's not already a thinking animation
            if (this.terminal.lastElementChild && !this.terminal.lastElementChild.classList.contains('thinking-animation')) {
                
                this.terminal.removeChild(this.terminal.lastElementChild);
            }

            // Show thinking animation
            if (!this.thinkingElement || !this.thinkingElement.parentNode) {
                this.createThinkingElement();
            }
            return;
        }

        // Detect other thinking patterns for mixed content
        const hasSpinner = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(textOnly);
        const hasThinkingText = textOnly.includes('Thinking');

        if (hasSpinner && hasThinkingText) {
            // Remove all thinking patterns and see if anything substantial remains
            let withoutThinking = textOnly;
            withoutThinking = withoutThinking.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/g, ''); // Remove spinners
            withoutThinking = withoutThinking.replace(/Thinking\.{0,3}/g, ''); // Remove "Thinking" with 0-3 dots
            withoutThinking = withoutThinking.replace(/hinking\.{0,3}/g, ''); // Handle truncated "hinking"
            withoutThinking = withoutThinking.replace(/\s+/g, ' ').trim(); // Clean up spaces

            const isOnlyThinking = withoutThinking.length === 0;

            if (isOnlyThinking) {
                // Pure thinking - show animation, don't stream
                
                if (!this.thinkingElement || !this.thinkingElement.parentNode) {
                    this.createThinkingElement();
                }
                return;
            } else if (withoutThinking.length > 0) {
                // Mixed content - clean and stream the non-thinking part
                
                this.removeThinkingElement();
                content = this.convertAnsiToHtml(withoutThinking);
            }
        }

        // Simple streaming logic - just stream everything else
        this.streamingQueue.push(content);

        if (!this.isStreaming) {
            this.processStreamingQueue();
        }
    }

    processStreamingQueue() {
        if (this.streamingQueue.length === 0) {
            this.isStreaming = false;
            return;
        }

        this.isStreaming = true;
        const content = this.streamingQueue.shift();

        // Create element and add to terminal
        const div = document.createElement('div');
        div.innerHTML = content;
        this.terminal.appendChild(div);
        this.scrollToBottom();

        // Process next item with a small delay for streaming effect
        setTimeout(() => {
            this.processStreamingQueue();
        }, 30); // Reduced delay for smoother streaming
    }

    convertAnsiToHtml(text) {
        // Debug: Log input text if it contains model selection content
        if (text.includes('/model') || text.includes('Select a model') || text.includes('❯')) {
            
        }

        // Preserve ASCII spinner sequences by converting them to Unicode equivalents
        let cleaned = text
            // Convert ASCII spinner sequences to Unicode spinners for display
            .replace(/\x1b\[38;5;\d+m\|\x1b\[39m/g, '⠋') // ASCII | to Unicode spinner
            .replace(/\x1b\[38;5;\d+m\/\x1b\[39m/g, '⠙') // ASCII / to Unicode spinner
            .replace(/\x1b\[38;5;\d+m-\x1b\[39m/g, '⠹') // ASCII - to Unicode spinner
            .replace(/\x1b\[38;5;\d+m\\\x1b\[39m/g, '⠸') // ASCII \ to Unicode spinner
            // Also handle raw ASCII spinners without color codes
            .replace(/(?<!\w)[\|\/\-\\](?=.*[Tt]hinking)/g, (match) => {
                const spinners = {'|': '⠋', '/': '⠙', '-': '⠹', '\\': '⠸'};
                return spinners[match] || match;
            })
            // Remove broken cursor control sequences that show up as text
            .replace(/\[?\?25[hl]/g, '')
            .replace(/\[?\?2004[hl]/g, '')
            // Remove cursor movement sequences that can interfere with text display
            .replace(/\x1b\[\d+[ABCD]/g, '') // Remove cursor movement (up, down, forward, backward)
            .replace(/\x1b\[\d+G/g, '') // Remove cursor column positioning
            .replace(/\x1b\[\d+;\d+H/g, '') // Remove cursor positioning
            .replace(/\x1b\[\d+C/g, ''); // Remove cursor forward movement

        // First escape HTML to prevent XSS
        let escaped = cleaned
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Preserve leading spaces by converting them to non-breaking spaces
        escaped = escaped.replace(/^( +)/gm, (match) => {
            return '&nbsp;'.repeat(match.length);
        });

        // Simple ANSI to HTML converter - create FLAT structure, not nested
        const ansiColors = {
            30: '#000000', 31: '#cd0000', 32: '#00cd00', 33: '#cdcd00',
            34: '#0000ee', 35: '#cd00cd', 36: '#00cdcd', 37: '#e5e5e5',
            90: '#7f7f7f', 91: '#ff0000', 92: '#00ff00', 93: '#ffff00',
            94: '#5c5cff', 95: '#ff00ff', 96: '#00ffff', 97: '#ffffff'
        };

        const ansiBgColors = {
            40: '#000000', 41: '#cd0000', 42: '#00cd00', 43: '#cdcd00',
            44: '#0000ee', 45: '#cd00cd', 46: '#00cdcd', 47: '#e5e5e5',
            100: '#7f7f7f', 101: '#ff0000', 102: '#00ff00', 103: '#ffff00',
            104: '#5c5cff', 105: '#ff00ff', 106: '#00ffff', 107: '#ffffff'
        };

        // Parse ANSI sequences and create flat span structure
        let result = '';
        let currentStyles = {
            color: null,
            backgroundColor: null,
            fontWeight: null
        };

        // Split text by ANSI sequences - use capturing groups to preserve the sequences
        const parts = escaped.split(/(\x1b\[[0-9;]*m|\x1b\[38;5;\d+m)/);

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            // Skip empty parts
            if (!part) continue;

            if (part.match(/^\x1b\[/)) {
                // This is an ANSI sequence - update current styles
                if (part.match(/\x1b\[38;5;(\d+)m/)) {
                    // 256-color sequence
                    const colorNum = parseInt(part.match(/\x1b\[38;5;(\d+)m/)[1]);
                    if (colorNum < 16) {
                        const standardColors = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
                                              '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
                        currentStyles.color = standardColors[colorNum];
                    } else if (colorNum < 232) {
                        // 216 color cube
                        const n = colorNum - 16;
                        const r = Math.floor(n / 36);
                        const g = Math.floor((n % 36) / 6);
                        const b = n % 6;
                        const toHex = (val) => val === 0 ? '00' : (55 + val * 40).toString(16).padStart(2, '0');
                        currentStyles.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
                    } else {
                        // Grayscale
                        const gray = 8 + (colorNum - 232) * 10;
                        const hex = Math.min(255, gray).toString(16).padStart(2, '0');
                        currentStyles.color = `#${hex}${hex}${hex}`;
                    }
                } else {
                    // Standard ANSI sequence
                    const match = part.match(/\x1b\[([0-9;]+)m/);
                    if (match) {
                        const codes = match[1].split(';');

                        for (let code of codes) {
                            const num = parseInt(code);
                            if (num === 0 || num === 39) {
                                // Reset
                                currentStyles.color = null;
                                currentStyles.backgroundColor = null;
                                currentStyles.fontWeight = null;
                            } else if (num === 1) {
                                currentStyles.fontWeight = 'bold';
                            } else if (num === 22) {
                                currentStyles.fontWeight = null;
                            } else if (num === 49) {
                                currentStyles.backgroundColor = null;
                            } else if (ansiColors[num]) {
                                currentStyles.color = ansiColors[num];
                            } else if (ansiBgColors[num]) {
                                currentStyles.backgroundColor = ansiBgColors[num];
                            }
                        }
                    }
                }
            } else {
                // This is text content - wrap in span with current styles
                // IMPORTANT: Preserve all spaces and characters exactly as they are
                const styles = [];
                if (currentStyles.color) styles.push(`color: ${currentStyles.color}`);
                if (currentStyles.backgroundColor) styles.push(`background-color: ${currentStyles.backgroundColor}`);
                if (currentStyles.fontWeight) styles.push(`font-weight: ${currentStyles.fontWeight}`);

                if (styles.length > 0) {
                    result += `<span style="${styles.join('; ')}">${part}</span>`;
                } else {
                    result += part;
                }
            }
        }

        // Special handling for model selection interface
        if (text.includes('/model') || text.includes('Select a model')) {
            // Highlight the selection arrow in cyan
            result = result.replace(/(❯)/g, '<span style="color: #00ffff; font-weight: bold">$1</span>');

            // Highlight "(active)" in green
            result = result.replace(/\(active\)/g, '<span style="color: #00ff00">(active)</span>');

            // Highlight model names
            result = result.replace(/(claude-[\w.-]+)/g, '<span style="color: #00cdcd">$1</span>');
            result = result.replace(/(gpt-[\w.-]+)/g, '<span style="color: #00cdcd">$1</span>');
        }

        // Debug: Log output result if it contains model selection content
        if (text.includes('/model') || text.includes('Select a model') || text.includes('❯')) {
            
        }

        return result;
    }

    setupUploadAndFilesModal() {
        this.uploadFolderBtn = document.getElementById('uploadFolderBtn');
        this.uploadFileBtn = document.getElementById('uploadFileBtn');
        this.folderInput = document.getElementById('folderInput');
        this.fileInput = document.getElementById('fileInput');
        this.openFilesModalBtn = document.getElementById('openFilesModalBtn');
        this.filesModal = document.getElementById('filesModal');
        this.closeFilesModal = document.getElementById('closeFilesModal');
        this.filesList = document.getElementById('filesList');

        // Open folder picker when upload folder button is clicked
        this.uploadFolderBtn.addEventListener('click', () => {
            this.folderInput.value = '';
            this.folderInput.click();
        });

        // Open file picker when upload files button is clicked
        this.uploadFileBtn.addEventListener('click', () => {
            this.fileInput.value = '';
            this.fileInput.click();
        });

        // Handle folder selection
        this.folderInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            await this.uploadFiles(files);
        });

        // Handle individual file selection
        this.fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            await this.uploadFiles(files);
        });

        // Open modal and fetch file list
        this.openFilesModalBtn.addEventListener('click', () => {
            this.showFilesModal();
        });
        this.closeFilesModal.addEventListener('click', () => {
            this.filesModal.style.display = 'none';
        });
        window.addEventListener('click', (e) => {
            if (e.target === this.filesModal) {
                this.filesModal.style.display = 'none';
            }
        });
    }

    async uploadFiles(files) {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f, f.webkitRelativePath || f.name));
        
        try {
            await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            alert('Upload successful!');
        } catch (err) {
            alert('Upload failed: ' + err.message);
        }
    }

    async showFilesModal() {
        try {
            const res = await fetch('/files');
            const data = await res.json();
            this.filesList.innerHTML = '';
            if (data.files && data.files.length) {
                data.files.forEach(filename => {
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `/download/${encodeURIComponent(filename)}`;
                    link.textContent = filename;
                    link.setAttribute('download', filename);
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.downloadFile(filename);
                    });
                    li.appendChild(link);
                    this.filesList.appendChild(li);
                });
            } else {
                this.filesList.innerHTML = '<li>No files uploaded.</li>';
            }
            this.filesModal.style.display = 'block';
        } catch (err) {
            this.filesList.innerHTML = '<li>Error loading files.</li>';
            this.filesModal.style.display = 'block';
        }
    }

    async downloadFile(filename) {
        const url = `/download/${encodeURIComponent(filename)}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 100);
        } catch (err) {
            alert('Download failed: ' + err.message);
        }
    }
}

// Initialize the interface when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new QChatInterface();
});
