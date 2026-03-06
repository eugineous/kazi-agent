const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Kazi', click: () => mainWindow.show() },
    { label: 'Hide Kazi', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (menuItem) => {
      app.setLoginItemSettings({
        openAtLogin: menuItem.checked,
        path: app.getPath('exe')
      });
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => {
      if (pythonProcess) pythonProcess.kill();
      app.exit();
    }}
  ]);
  
  tray.setToolTip('Kazi Agent');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

function findPython() {
  const { execSync } = require('child_process');
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (_) {}
  }
  return null;
}

function startPythonAgent() {
  const pythonPath = findPython();

  if (!pythonPath) {
    console.error('Python not found! Please run INSTALL_AND_RUN.bat first.');
    if (mainWindow) {
      mainWindow.webContents.send('agent-response', '[ERROR] Python not installed. Please run INSTALL_AND_RUN.bat to set up Kazi.');
    }
    return;
  }

  // Handle both development and production paths
  let scriptPath;
  if (app.isPackaged) {
    scriptPath = path.join(process.resourcesPath, 'python', 'screen_agent.py');
  } else {
    scriptPath = path.join(__dirname, '../python/screen_agent.py');
  }

  pythonProcess = spawn(pythonPath, [scriptPath], { env: { ...process.env } });

  pythonProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      if (mainWindow) {
        mainWindow.webContents.send('agent-response', line);
      }
    });
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python Error: ${data}`);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`Python agent exited with code ${code}`);
    pythonProcess = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startPythonAgent();
  
  // Global hotkey: Ctrl+Shift+K to toggle window
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Keep app running in tray
});

// Handle commands from renderer
ipcMain.on('send-command', (event, command) => {
  if (pythonProcess && pythonProcess.stdin && !pythonProcess.killed) {
    pythonProcess.stdin.write(command + '\n');
  } else {
    // Try to restart Python agent if it died
    startPythonAgent();
    setTimeout(() => {
      if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(command + '\n');
      }
    }, 1000);
  }
});

ipcMain.on('minimize-window', () => {
  mainWindow.hide();
});
