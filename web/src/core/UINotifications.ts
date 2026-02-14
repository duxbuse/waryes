/**
 * DOM-based notification and dialog system
 * Replaces browser alert/confirm dialogs for better automation compatibility
 */

let notificationContainer: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'ui-notifications';
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(notificationContainer);
  }
  return notificationContainer;
}

export function showNotification(message: string, duration: number = 3000): void {
  const container = ensureContainer();

  const notification = document.createElement('div');
  notification.className = 'ui-notification';
  notification.style.cssText = `
    background: rgba(26, 26, 32, 0.95);
    border: 1px solid var(--blue-primary, #00aaff);
    border-radius: 8px;
    padding: 12px 20px;
    color: #fff;
    font-family: var(--font-body, 'Crimson Pro', serif);
    font-size: 14px;
    box-shadow: 0 4px 20px rgba(0, 170, 255, 0.3);
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
  `;
  notification.textContent = message;

  // Add animation keyframes if not already present
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  container.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

export function showConfirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ui-confirm-overlay';
    overlay.style.cssText = `
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
    `;

    const dialog = document.createElement('div');
    dialog.className = 'ui-confirm-dialog';
    dialog.style.cssText = `
      background: rgba(26, 26, 32, 0.98);
      border: 2px solid var(--blue-primary, #00aaff);
      border-radius: 12px;
      padding: 24px 32px;
      color: #fff;
      font-family: var(--font-body, 'Crimson Pro', serif);
      text-align: center;
      box-shadow: 0 8px 40px rgba(0, 170, 255, 0.3);
      max-width: 400px;
    `;

    const messageEl = document.createElement('p');
    messageEl.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 16px;
      line-height: 1.5;
    `;
    messageEl.textContent = message;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: center;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    confirmBtn.className = 'ui-confirm-btn';
    confirmBtn.style.cssText = `
      background: linear-gradient(180deg, var(--blue-primary, #00aaff), var(--blue-dark, #0088dd));
      border: 1px solid var(--blue-glow, #00ccff);
      border-radius: 6px;
      padding: 10px 24px;
      color: #fff;
      font-family: var(--font-heading, 'Cinzel', serif);
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.1s;
      letter-spacing: 1px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'ui-cancel-btn';
    cancelBtn.style.cssText = `
      background: rgba(42, 42, 48, 0.8);
      border: 1px solid var(--steel-highlight, #4a4a55);
      border-radius: 6px;
      padding: 10px 24px;
      color: #ccc;
      font-family: var(--font-heading, 'Cinzel', serif);
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.1s;
      letter-spacing: 1px;
    `;

    const cleanup = () => overlay.remove();

    confirmBtn.onclick = () => { cleanup(); resolve(true); };
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
    overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };

    buttonContainer.appendChild(confirmBtn);
    buttonContainer.appendChild(cancelBtn);
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    confirmBtn.focus();
  });
}
