import { Alert, Platform } from 'react-native';

/**
 * Alert that works on web (RN Alert is a no-op there) and native.
 * Prefer for one-button status messages (restore, export, errors).
 */
export function showUserAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    void webAlert({ title, message });
    return;
  }
  Alert.alert(title, message);
}

/** Web-only one-button alert with the same dimmed chrome as webConfirm. */
export function webAlert(opts: {
  title: string;
  message?: string;
  okLabel?: string;
}): Promise<void> {
  if (typeof document === 'undefined') {
    if (typeof window !== 'undefined') {
      window.alert(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title);
    }
    return Promise.resolve();
  }

  const dark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const card = dark ? '#1F1F22' : '#FFFFFF';
  const ink = dark ? '#F4F4F5' : '#17171A';
  const mute = dark ? '#A1A1AA' : '#5B5B66';
  const line = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return new Promise((resolve) => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement('div');
    backdrop.setAttribute('role', 'presentation');
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      opacity: '0',
      transition: 'opacity 140ms ease-out',
    });

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    Object.assign(dialog.style, {
      width: '100%',
      maxWidth: '300px',
      background: card,
      borderRadius: '16px',
      overflow: 'hidden',
      textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
    });

    const body = document.createElement('div');
    Object.assign(body.style, { padding: '20px 18px 16px' });
    const h = document.createElement('div');
    h.textContent = opts.title;
    Object.assign(h.style, {
      color: ink,
      fontSize: '17px',
      fontWeight: '600',
      lineHeight: '22px',
    });
    body.appendChild(h);
    if (opts.message) {
      const p = document.createElement('div');
      p.textContent = opts.message;
      Object.assign(p.style, {
        color: mute,
        fontSize: '14px',
        lineHeight: '19px',
        marginTop: '6px',
      });
      body.appendChild(p);
    }
    dialog.appendChild(body);

    const row = document.createElement('div');
    Object.assign(row.style, { borderTop: `1px solid ${line}` });
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = opts.okLabel ?? 'OK';
    Object.assign(ok.style, {
      width: '100%',
      padding: '13px 8px',
      border: 'none',
      background: 'transparent',
      color: ink,
      fontSize: '17px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    row.appendChild(ok);
    dialog.appendChild(row);
    backdrop.appendChild(dialog);

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      prevFocus?.focus?.();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        close();
      }
    };
    ok.onclick = () => close();
    backdrop.onclick = (e) => {
      if (e.target === backdrop) close();
    };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
    });
    ok.focus();
  });
}

/**
 * Web-only confirm dialog with a dimmed backdrop, so a destructive choice is
 * the only thing in focus (window.confirm doesn't dim in every browser).
 * Falls back to window.confirm when there is no DOM.
 */
export function webConfirm(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (typeof document === 'undefined') {
    return Promise.resolve(
      typeof window !== 'undefined' &&
        window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title)
    );
  }

  const dark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const card = dark ? '#1F1F22' : '#FFFFFF';
  const ink = dark ? '#F4F4F5' : '#17171A';
  const mute = dark ? '#A1A1AA' : '#5B5B66';
  const line = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const danger = '#D9534F';

  return new Promise((resolve) => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement('div');
    backdrop.setAttribute('role', 'presentation');
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      opacity: '0',
      transition: 'opacity 140ms ease-out',
    });

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    Object.assign(dialog.style, {
      width: '100%',
      maxWidth: '300px',
      background: card,
      borderRadius: '16px',
      overflow: 'hidden',
      textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
    });

    const body = document.createElement('div');
    Object.assign(body.style, { padding: '20px 18px 16px' });
    const h = document.createElement('div');
    h.textContent = opts.title;
    Object.assign(h.style, { color: ink, fontSize: '17px', fontWeight: '600', lineHeight: '22px' });
    body.appendChild(h);
    if (opts.message) {
      const p = document.createElement('div');
      p.textContent = opts.message;
      Object.assign(p.style, { color: mute, fontSize: '14px', lineHeight: '19px', marginTop: '6px' });
      body.appendChild(p);
    }
    dialog.appendChild(body);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', borderTop: `1px solid ${line}` });
    const makeBtn = (label: string, color: string, bold: boolean) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        flex: '1',
        padding: '13px 8px',
        border: 'none',
        background: 'transparent',
        color,
        fontSize: '17px',
        fontWeight: bold ? '600' : '400',
        cursor: 'pointer',
        fontFamily: 'inherit',
      });
      return b;
    };
    const cancel = makeBtn('Cancel', ink, false);
    const confirm = makeBtn(
      opts.confirmLabel ?? 'OK',
      opts.destructive ? danger : ink,
      true
    );
    confirm.style.borderLeft = `1px solid ${line}`;
    row.append(cancel, confirm);
    dialog.appendChild(row);
    backdrop.appendChild(dialog);

    const close = (result: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      prevFocus?.focus?.();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    };
    cancel.onclick = () => close(false);
    confirm.onclick = () => close(true);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
    });
    cancel.focus();
  });
}
