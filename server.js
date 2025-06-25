const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const pty = require('node-pty');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files with no-cache for development
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Store active Q chat sessions
const sessions = new Map();

// Store session buffers to handle split ANSI sequences
const sessionBuffers = new Map();

io.on('connection', (socket) => {

    // Initialize buffer for this session
    sessionBuffers.set(socket.id, '');

    socket.on('start-q-chat', () => {

        try {
            // Spawn Q chat process with better terminal settings
            const ptyProcess = pty.spawn('q', ['chat'], {
                name: 'xterm-256color',
                cols: 120,
                rows: 30,
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor'
                }
            });

            sessions.set(socket.id, ptyProcess);

            // Handle data from Q chat - send raw data to frontend for buffering
            ptyProcess.onData((data) => {
                try {

                    // Send raw data to frontend - let frontend handle buffering and processing
                    socket.emit('q-output', {
                        raw: data
                    });
                } catch (error) {
                    console.error('Error processing Q chat output:', error);
                    socket.emit('q-output', {
                        raw: data,
                        html: `Error processing output: ${error.message}`
                    });
                }
            });

            // Handle process exit
            ptyProcess.onExit((code, signal) => {
                sessions.delete(socket.id);
                socket.emit('q-exit', { code, signal });
            });

            socket.emit('q-started');
        } catch (error) {
            console.error('Error starting Q chat process:', error);
            socket.emit('q-error', { message: 'Failed to start Q chat: ' + error.message });
        }
    });

    socket.on('q-input', (data) => {
        const ptyProcess = sessions.get(socket.id);
        if (ptyProcess) {
            try {
                ptyProcess.write(data);
            } catch (error) {
                console.error('Error writing to Q chat process:', error);
                socket.emit('q-error', { message: 'Failed to send input: ' + error.message });
            }
        } else {
            socket.emit('q-error', { message: 'No active Q chat session found' });
        }
    });

    socket.on('disconnect', () => {
        const ptyProcess = sessions.get(socket.id);
        if (ptyProcess) {
            ptyProcess.kill();
            sessions.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
