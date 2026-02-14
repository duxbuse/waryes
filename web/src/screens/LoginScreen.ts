/**
 * LoginScreen - Player authentication screen
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import { login } from '../api/AuthApi';

export interface LoginScreenCallbacks {
  onLoginSuccess: () => void;
  onRegister: () => void;
  onGuest: () => void;
}

export function createLoginScreen(callbacks: LoginScreenCallbacks): Screen {
  const element = document.createElement('div');
  element.id = 'login-screen';
  element.innerHTML = `
    <div class="login-container">
      <div class="aquila-crest">\u269C \u2720 \u269C</div>
      <h1 class="login-title" data-text="STELLAR SIEGE">STELLAR SIEGE</h1>
      <p class="login-subtitle">AUTHENTICATION REQUIRED</p>

      <div class="gothic-divider">
        <div class="line"></div>
        <span class="sym">\u2720</span>
        <div class="line"></div>
      </div>

      <form class="login-form" id="login-form">
        <div class="form-field">
          <label>DESIGNATION</label>
          <input type="text" id="login-username" placeholder="Username" autocomplete="username" required />
        </div>
        <div class="form-field">
          <label>AUTHORIZATION CODE</label>
          <input type="password" id="login-password" placeholder="Password" autocomplete="current-password" required />
        </div>
        <div class="login-error" id="login-error"></div>
        <button type="submit" class="menu-btn primary" id="btn-login">
          <span class="btn-flourish">\u269C</span> AUTHENTICATE <span class="btn-flourish">\u269C</span>
        </button>
      </form>

      <div class="login-links">
        <button class="menu-btn" id="btn-register">
          <span class="btn-flourish">\u2726</span> NEW RECRUIT <span class="btn-flourish">\u2726</span>
        </button>
        <button class="menu-btn corrupted" id="btn-guest">
          <span class="btn-flourish warp">\u2620</span> PLAY AS GUEST <span class="btn-flourish warp">\u2620</span>
        </button>
      </div>

      <span class="menu-footer">v0.5.0 \u2014 Secure Connection</span>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #login-screen {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }
    #login-screen .login-container {
      text-align: center;
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      max-width: 440px;
      width: 100%;
      animation: sectionBootUp 1.0s ease-out both;
    }
    #login-screen .login-title {
      font-family: var(--font-display);
      font-size: 42px;
      color: var(--gold);
      text-shadow: 0 0 20px rgba(255,200,100,0.5);
      margin: 0;
    }
    #login-screen .login-subtitle {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--blue-dim);
      letter-spacing: 4px;
      margin: 0;
    }
    #login-screen .login-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 320px;
    }
    #login-screen .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: left;
    }
    #login-screen .form-field label {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--blue-dim);
      letter-spacing: 2px;
    }
    #login-screen .form-field input {
      background: rgba(0,0,0,0.6);
      border: 1px solid var(--blue-dim);
      color: var(--text);
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    #login-screen .form-field input:focus {
      border-color: var(--gold);
    }
    #login-screen .login-error {
      color: #ff4444;
      font-family: var(--font-mono);
      font-size: 12px;
      min-height: 18px;
    }
    #login-screen .login-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      max-width: 320px;
    }
  `;
  element.appendChild(style);

  // Event handlers
  const form = element.querySelector('#login-form') as HTMLFormElement;
  const errorDiv = element.querySelector('#login-error') as HTMLDivElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (element.querySelector('#login-username') as HTMLInputElement).value;
    const password = (element.querySelector('#login-password') as HTMLInputElement).value;

    errorDiv.textContent = '';
    const loginBtn = element.querySelector('#btn-login') as HTMLButtonElement;
    loginBtn.disabled = true;
    loginBtn.textContent = 'AUTHENTICATING...';

    const result = await login(username, password);

    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span class="btn-flourish">\u269C</span> AUTHENTICATE <span class="btn-flourish">\u269C</span>';

    if (result.success) {
      callbacks.onLoginSuccess();
    } else {
      errorDiv.textContent = result.error;
    }
  });

  element.querySelector('#btn-register')?.addEventListener('click', callbacks.onRegister);
  element.querySelector('#btn-guest')?.addEventListener('click', callbacks.onGuest);

  return {
    type: ScreenType.Login,
    element,
  };
}
