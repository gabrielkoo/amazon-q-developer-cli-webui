# Amazon Q Developer CLI WebUI

A web-based interface for Amazon Q CLI that provides streaming token display, ASCII formatting preservation, and interactive textarea prompts for multiline input.

![Amazon Q Developer CLI WebUI](/screenshot.jpg)

## Features

- **Streaming Display**: Tokens are displayed with a typing effect to simulate real-time streaming
- **ASCII Formatting**: Preserves all ANSI color codes and formatting from Q chat
- **Interactive Prompts**: Prompts starting with "> " are converted to textarea inputs for multiline support
- **Real-time Communication**: Uses WebSockets for real-time bidirectional communication
- **Terminal-like Interface**: Dark theme with monospace font for authentic terminal experience

## Installation

0. Install Amazon Q Developer CLI and and authenticate with your AWS Builder ID / IAM Identity Center.

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Click "Start Q Chat" to initialize the Q chat session
2. The terminal will display Q's responses with streaming animation
3. When Q prompts for input (indicated by "> "), a textarea will appear
4. Type your multiline response and press Ctrl+Enter or click "Send"
5. Use "Stop Q Chat" to terminate the session

## Controls

- **Start Q Chat**: Initializes a new Q chat session
- **Stop Q Chat**: Sends `/quit` command to terminate the session
- **Clear Terminal**: Clears the terminal display
- **Send**: Sends the input to Q chat (also Ctrl+Enter)
- **Clear Input**: Clears the current input textarea

## Technical Details

### Backend (Node.js)

- **Express**: Web server framework
- **Socket.IO**: Real-time WebSocket communication
- **node-pty**: Spawns and manages Q chat process with PTY support

### Frontend

- **Vanilla JavaScript**: No framework dependencies
- **WebSocket**: Real-time communication with server
- **ANSI Processing**: Converts ANSI escape codes to HTML/CSS
- **Streaming Animation**: Character-by-character display with typing cursor

### File Structure
```
├── server.js          # Node.js server with Socket.IO
├── package.json       # Dependencies and scripts
├── public/
│   ├── index.html     # Main HTML interface
│   ├── style.css      # Styling and ANSI color definitions
│   └── script.js      # Frontend JavaScript logic
└── README.md          # This file
```

## Development

For development with auto-restart:
```bash
npm run dev
```

## Requirements

- Node.js (v14 or higher)
- Amazon Q CLI installed and configured
- Modern web browser with WebSocket support

## Customization

### Streaming Speed
Adjust the streaming speed by modifying the interval in `script.js`:
```javascript
}, 10); // Change this value (milliseconds per character)
```

### Colors and Styling
Modify ANSI color mappings in `style.css` under the `.terminal` section.

### Terminal Size
Adjust the PTY size in `server.js`:
```javascript
cols: 120,  // Terminal width
rows: 30,   // Terminal height
```
