const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// This is the folder our "fake desktop" watches and displays.
// It's a safe sandbox folder, NOT your real macOS Desktop, so nothing
// important can get chomped by accident during a demo.
const DEMO_DESKTOP_PATH = path.join(__dirname, 'demo-desktop');

function ensureDemoFilesExist() {
  if (!fs.existsSync(DEMO_DESKTOP_PATH)) {
    fs.mkdirSync(DEMO_DESKTOP_PATH, { recursive: true });
  }

  // Seed some funny placeholder files if the folder is empty,
  // purely so the demo looks good out of the box.
  const existing = fs.readdirSync(DEMO_DESKTOP_PATH);
  if (existing.length === 0) {
    const sampleFiles = [
      'taxes_2024_final_FINAL.pdf',
      'definitely_not_a_virus.exe',
      'ex_playlist_do_not_open.mp3',
      'homework_i_will_do_later.docx',
      'screenshot_2026-03-02.png',
      'untitled_folder',
      'random_notes.txt',
      'old_resume_v9.pdf',
      'new_folder_2',
      'vacation_photos_backup.zip',
      'meeting_notes_draft.txt',
      'do_not_delete_important.png',
    ];
    sampleFiles.forEach((name) => {
      const fullPath = path.join(DEMO_DESKTOP_PATH, name);
      if (name === 'untitled_folder' || name === 'new_folder_2') {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        fs.writeFileSync(fullPath, 'This is a harmless demo file created for the Pac-Man Deleter Creatathon project.\n');
      }
    });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ensureDemoFilesExist();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: renderer asks main process for the current list of desktop items ---
ipcMain.handle('get-desktop-items', async () => {
  const entries = fs.readdirSync(DEMO_DESKTOP_PATH, { withFileTypes: true });
  return entries.map((entry) => {
    const fullPath = path.join(DEMO_DESKTOP_PATH, entry.name);
    return {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      ext: entry.isDirectory() ? null : path.extname(entry.name).toLowerCase(),
    };
  });
});

// --- IPC: renderer tells main process "Pac-Man has finished eating this one, delete it for real" ---
ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    // Uses the real macOS Trash, not permanent deletion.
    // Safer for demo day, and honestly more "correct" behavior
    // since that's what a real Delete key does too.
    await shell.trashItem(itemPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-demo-folder-path', async () => {
  return DEMO_DESKTOP_PATH;
});
