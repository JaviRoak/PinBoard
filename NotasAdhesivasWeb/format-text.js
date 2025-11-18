;(() => {
  const $ = sel => document.querySelector(sel);

  const formatToggle  = $('#format-text-toggle');
  const formatToolbar = $('#format-toolbar');

  if (!formatToggle || !formatToolbar) return;

  const formatButtons = formatToolbar.querySelectorAll('[data-cmd]');

  // Toggle mostrar/ocultar barra de formato
  formatToggle.addEventListener('click', () => {
    const visible = formatToolbar.classList.toggle('is-visible');
    formatToggle.classList.toggle('is-on', visible);
  });

  // evitar que al hacer mousedown en los botones se pierda la selección dentro de la nota.
  formatButtons.forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // así se mantiene la selección de texto
    });

    btn.addEventListener('click', e => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (!cmd) return;

      // Aplicar comando al texto seleccionado
      // (el navegador recuerda la última selección en el contenteditable)
      document.execCommand(cmd, false, null);
    });
  });
})();
