# KAZI - AI Desktop Agent

Your personal AI desktop assistant powered by Gemini 2.0 Flash.

## Features

- 🖥️ **Screen Vision** - Sees and understands your screen
- 🖱️ **Mouse/Keyboard Control** - Clicks, types, scrolls on your behalf
- 💬 **Natural Language** - Just tell it what to do
- 🔄 **Background Mode** - Runs silently in system tray
- ⚡ **Hotkey** - Ctrl+Shift+K to toggle window

## Setup

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r python/requirements.txt
```

### 2. Add App Icon

Download a 512x512 PNG icon and save it to `assets/icon.png`

### 3. Run the App

```bash
npm start
```

## Building Installer

```bash
# Windows
npm run build:win

# Mac
npm run build:mac

# Linux
npm run build:linux
```

The installer will be in the `dist` folder.

## Usage

1. Press **Ctrl+Shift+K** to show/hide the window
2. Type a command like "Open Chrome and go to google.com"
3. Watch Kazi execute the task

## Example Commands

- "Open Chrome and go to twitter.com"
- "Click the compose tweet button"
- "Type: Hello world!"
- "Scroll down"
- "Press Ctrl+S to save"

## Safety

- **Failsafe**: Move mouse to any screen corner to abort
- **Max Steps**: Tasks stop after 20 actions to prevent loops

## Cost

~$5-10/month for 10,000 actions using Gemini 2.0 Flash API

## Built With

- Electron
- Python + PyAutoGUI
- Google Gemini 2.0 Flash

---

Built for Eugine Micah 🚀
