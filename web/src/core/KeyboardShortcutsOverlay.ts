/**
 * KeyboardShortcutsOverlay - Displays keyboard shortcuts hint overlay during battle phase
 */

let overlayElement: HTMLDivElement | null = null;

function ensureStylesLoaded(): void {
  if (!document.getElementById('keyboard-shortcuts-styles')) {
    const style = document.createElement('style');
    style.id = 'keyboard-shortcuts-styles';
    style.textContent = `
      .keyboard-shortcuts-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      }

      .keyboard-shortcuts-panel {
        background: rgba(20, 20, 30, 0.98);
        border: 2px solid #4a9eff;
        border-radius: 12px;
        padding: 32px;
        color: #fff;
        font-family: 'Orbitron', sans-serif;
        box-shadow: 0 8px 40px rgba(74, 158, 255, 0.4);
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
      }

      .keyboard-shortcuts-panel h2 {
        margin: 0 0 24px 0;
        font-size: 24px;
        color: #4a9eff;
        text-align: center;
        letter-spacing: 2px;
      }

      .keyboard-shortcuts-section {
        margin-bottom: 20px;
      }

      .keyboard-shortcuts-section h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        color: #888;
        letter-spacing: 1px;
      }

      .keyboard-shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .keyboard-shortcut-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: rgba(74, 158, 255, 0.1);
        border-radius: 4px;
      }

      .keyboard-shortcut-key {
        font-family: 'Courier New', monospace;
        background: rgba(74, 158, 255, 0.2);
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 12px;
        color: #4a9eff;
        border: 1px solid rgba(74, 158, 255, 0.3);
      }

      .keyboard-shortcut-desc {
        font-size: 13px;
        color: #ccc;
      }

      .keyboard-shortcuts-close {
        margin-top: 24px;
        width: 100%;
        padding: 12px 24px;
        background: linear-gradient(180deg, #4a9eff 0%, #2d7dd2 100%);
        border: none;
        border-radius: 6px;
        color: #fff;
        font-family: 'Orbitron', sans-serif;
        font-size: 14px;
        cursor: pointer;
        transition: transform 0.1s;
      }

      .keyboard-shortcuts-close:hover {
        transform: scale(1.02);
      }

      .keyboard-shortcuts-close:active {
        transform: scale(0.98);
      }
    `;
    document.head.appendChild(style);
  }
}

export function showKeyboardShortcuts(): void {
  if (overlayElement) {
    return;
  }

  ensureStylesLoaded();

  overlayElement = document.createElement('div');
  overlayElement.className = 'keyboard-shortcuts-overlay';
  overlayElement.innerHTML = `
    <div class="keyboard-shortcuts-panel">
      <h2>KEYBOARD SHORTCUTS</h2>

      <div class="keyboard-shortcuts-section">
        <h3>SELECTION</h3>
        <div class="keyboard-shortcuts-list">
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Select Unit</span>
            <span class="keyboard-shortcut-key">Left Click</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Box Select</span>
            <span class="keyboard-shortcut-key">Click + Drag</span>
          </div>
        </div>
      </div>

      <div class="keyboard-shortcuts-section">
        <h3>MOVEMENT & COMBAT</h3>
        <div class="keyboard-shortcuts-list">
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Move</span>
            <span class="keyboard-shortcut-key">Right Click</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Attack</span>
            <span class="keyboard-shortcut-key">Right Click Enemy</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Reverse Move</span>
            <span class="keyboard-shortcut-key">R + Click</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Fast Move</span>
            <span class="keyboard-shortcut-key">F + Click</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Attack Move</span>
            <span class="keyboard-shortcut-key">A + Click</span>
          </div>
        </div>
      </div>

      <div class="keyboard-shortcuts-section">
        <h3>CONTROL GROUPS</h3>
        <div class="keyboard-shortcuts-list">
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Assign Group</span>
            <span class="keyboard-shortcut-key">Ctrl + 1-9</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Select Group</span>
            <span class="keyboard-shortcut-key">1-9</span>
          </div>
        </div>
      </div>

      <div class="keyboard-shortcuts-section">
        <h3>CAMERA</h3>
        <div class="keyboard-shortcuts-list">
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Pan Camera</span>
            <span class="keyboard-shortcut-key">WASD / Edge Pan</span>
          </div>
          <div class="keyboard-shortcut-item">
            <span class="keyboard-shortcut-desc">Zoom</span>
            <span class="keyboard-shortcut-key">Mouse Wheel</span>
          </div>
        </div>
      </div>

      <button class="keyboard-shortcuts-close">CLOSE</button>
    </div>
  `;

  const closeButton = overlayElement.querySelector('.keyboard-shortcuts-close');
  if (closeButton) {
    closeButton.addEventListener('click', hideKeyboardShortcuts);
  }

  overlayElement.addEventListener('click', (e) => {
    if (e.target === overlayElement) {
      hideKeyboardShortcuts();
    }
  });

  document.body.appendChild(overlayElement);
}

export function hideKeyboardShortcuts(): void {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}
