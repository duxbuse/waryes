/**
 * RegisterScreen - New player registration
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import { register } from '../api/AuthApi';

export interface RegisterScreenCallbacks {
  onRegisterSuccess: () => void;
  onBackToLogin: () => void;
}

export function createRegisterScreen(callbacks: RegisterScreenCallbacks): Screen {
  const element = document.createElement('div');
  element.id = 'register-screen';
  element.innerHTML = `
    <div class="register-container">
      <div class="aquila-crest">\u269C \u2720 \u269C</div>
      <h1 class="register-title">NEW RECRUIT</h1>
      <p class="register-subtitle">ENLISTMENT FORM</p>

      <div class="gothic-divider">
        <div class="line"></div>
        <span class="sym">\u2720</span>
        <div class="line"></div>
      </div>

      <form class="register-form" id="register-form">
        <div class="form-field">
          <label>DESIGNATION</label>
          <input type="text" id="reg-username" placeholder="Username (3-32 chars)" autocomplete="username" required minlength="3" maxlength="32" />
        </div>
        <div class="form-field">
          <label>DISPLAY NAME</label>
          <input type="text" id="reg-display-name" placeholder="Display Name" required maxlength="64" />
        </div>
        <div class="form-field">
          <label>COMMS CHANNEL</label>
          <input type="email" id="reg-email" placeholder="Email" autocomplete="email" required />
        </div>
        <div class="form-field">
          <label>AUTHORIZATION CODE</label>
          <input type="password" id="reg-password" placeholder="Password (min 8 chars)" autocomplete="new-password" required minlength="8" />
        </div>
        <div class="register-error" id="register-error"></div>
        <button type="submit" class="menu-btn primary" id="btn-enlist">
          <span class="btn-flourish">\u269C</span> ENLIST <span class="btn-flourish">\u269C</span>
        </button>
      </form>

      <button class="menu-btn" id="btn-back-login">
        <span class="btn-flourish">\u2726</span> RETURN <span class="btn-flourish">\u2726</span>
      </button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #register-screen {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }
    #register-screen .register-container {
      text-align: center;
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      max-width: 440px;
      width: 100%;
      animation: sectionBootUp 1.0s ease-out both;
    }
    #register-screen .register-title {
      font-family: var(--font-display);
      font-size: 36px;
      color: var(--gold);
      text-shadow: 0 0 20px rgba(255,200,100,0.5);
      margin: 0;
    }
    #register-screen .register-subtitle {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--blue-dim);
      letter-spacing: 4px;
      margin: 0;
    }
    #register-screen .register-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      max-width: 320px;
    }
    #register-screen .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: left;
    }
    #register-screen .form-field label {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--blue-dim);
      letter-spacing: 2px;
    }
    #register-screen .form-field input {
      background: rgba(0,0,0,0.6);
      border: 1px solid var(--blue-dim);
      color: var(--text);
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    #register-screen .form-field input:focus {
      border-color: var(--gold);
    }
    #register-screen .register-error {
      color: #ff4444;
      font-family: var(--font-mono);
      font-size: 12px;
      min-height: 18px;
    }
  `;
  element.appendChild(style);

  const form = element.querySelector('#register-form') as HTMLFormElement;
  const errorDiv = element.querySelector('#register-error') as HTMLDivElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (element.querySelector('#reg-username') as HTMLInputElement).value;
    const displayName = (element.querySelector('#reg-display-name') as HTMLInputElement).value;
    const email = (element.querySelector('#reg-email') as HTMLInputElement).value;
    const password = (element.querySelector('#reg-password') as HTMLInputElement).value;

    errorDiv.textContent = '';
    const enlistBtn = element.querySelector('#btn-enlist') as HTMLButtonElement;
    enlistBtn.disabled = true;
    enlistBtn.textContent = 'PROCESSING...';

    const result = await register(username, email, password, displayName);

    enlistBtn.disabled = false;
    enlistBtn.innerHTML = '<span class="btn-flourish">\u269C</span> ENLIST <span class="btn-flourish">\u269C</span>';

    if (result.success) {
      callbacks.onRegisterSuccess();
    } else {
      errorDiv.textContent = result.error;
    }
  });

  element.querySelector('#btn-back-login')?.addEventListener('click', callbacks.onBackToLogin);

  return {
    type: ScreenType.Register,
    element,
  };
}
