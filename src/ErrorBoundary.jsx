// Captura els errors de renderització perquè una fallada no deixi la pàgina en blanc.
// Ofereix recarregar o restablir les dades locals (amb còpia de seguretat prèvia).
import React from 'react';
import {BACKUP_KEY, STORAGE_KEY, getStorage} from './storage';

const TEXT = {
  ca: {
    title: 'Alguna cosa no ha funcionat',
    body: 'L’aplicació ha trobat un error inesperat. Pots tornar-la a carregar. Si l’error es repeteix, restableix les dades locals: es farà una còpia de seguretat de les dades actuals.',
    reload: 'Tornar a carregar',
    reset: 'Restablir dades locals',
    confirm: 'Es restabliran el saldo, l’historial, la llista desada i les notes d’aquest navegador. Vols continuar?',
  },
  es: {
    title: 'Algo no ha funcionado',
    body: 'La aplicación ha encontrado un error inesperado. Puedes volver a cargarla. Si el error se repite, restablece los datos locales: se hará una copia de seguridad de los datos actuales.',
    reload: 'Volver a cargar',
    reset: 'Restablecer datos locales',
    confirm: 'Se restablecerán el saldo, el historial, la lista guardada y las notas de este navegador. ¿Quieres continuar?',
  },
  en: {
    title: 'Something went wrong',
    body: 'The app hit an unexpected error. You can reload it. If the error keeps happening, reset the local data: a backup of the current data will be kept.',
    reload: 'Reload',
    reset: 'Reset local data',
    confirm: 'This resets the balance, history, saved list and notes stored in this browser. Continue?',
  },
};

/**
 * Llegeix una preferència de localStorage sense fallar.
 * @param {string} key Clau.
 * @returns {string | null}
 */
function readPreference(key) {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Límit d'errors de React per a tota l'aplicació. */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {failed: false};
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError() {
    return {failed: true};
  }

  componentDidCatch(error, info) {
    console.error('[app] Error de renderització', error, info?.componentStack);
  }

  /** Desa una còpia de les dades actuals, les esborra i recarrega la pàgina. */
  reset() {
    const text = TEXT[this.language()] || TEXT.ca;
    if (!window.confirm(text.confirm)) return;
    const storage = getStorage();
    try {
      const current = storage?.getItem(STORAGE_KEY);
      if (current !== null && current !== undefined) storage.setItem(BACKUP_KEY, current);
      storage?.removeItem(STORAGE_KEY);
    } catch { /* no es pot accedir a localStorage: només es recarrega */ }
    window.location.reload();
  }

  /** @returns {'ca'|'es'|'en'} */
  language() {
    const value = readPreference('trading27-language');
    return value === 'es' || value === 'en' ? value : 'ca';
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const text = TEXT[this.language()];
    const theme = readPreference('trading27-theme') === 'light' ? 'light' : 'dark';
    return (
      <div className={'canvas theme-' + theme}>
        <main className="workspace" role="alert">
          <div className="pageHead">
            <h1>{text.title}</h1>
            <p>{text.body}</p>
          </div>
          <div className="detailActions">
            <button className="filled" onClick={() => window.location.reload()}>{text.reload}</button>
            <button className="outlineButton" onClick={this.reset}>{text.reset}</button>
          </div>
        </main>
      </div>
    );
  }
}
