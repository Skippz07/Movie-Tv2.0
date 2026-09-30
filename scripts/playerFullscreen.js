const shell = document.getElementById('iframe-container');
const button = document.querySelector('.player-fullscreen-button');
const status = document.querySelector('.player-fullscreen-status');

if (shell && button) {
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const sync = () => {
    const active = Boolean(fullscreenElement());
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('i').className = active ? 'fas fa-compress' : 'fas fa-expand';
    if (status) status.textContent = '';
  };

  button.addEventListener('click', async () => {
    if (status) status.textContent = '';
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw new Error('Fullscreen exit unavailable');
        await exit.call(document);
      } else {
        const enter = shell.requestFullscreen || shell.webkitRequestFullscreen;
        if (!enter) throw new Error('Fullscreen unavailable');
        // Keep our server controls inside the fullscreen element.
        await enter.call(shell);
      }
    } catch {
      if (status) status.textContent = 'Fullscreen is unavailable here. Open Flix in your browser to try again.';
    }
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
