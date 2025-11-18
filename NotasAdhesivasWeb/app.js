;(() => {
  const $ = sel => document.querySelector(sel);
  const canvas = $('#canvas');
  const LS_KEY = 'postit_notes_v1';
  const SIZE_KEY = 'postit_canvas_size';
  const LINKS_KEY = 'postit_links_v1';
  let zCursor = 10;

  const dockAddBtn  = document.querySelector('.dock-btn-main');
  const clearBtn    = $('#clear');
  const drawToggle  = $('#draw-toggle');
  const imgBtn      = $('#import-image');
  const imgInput    = $('#image-input');
  const linkToggle  = $('#link-toggle');
  const downloadBtn = $('#download');

  const rand = (min,max)=> Math.floor(Math.random()*(max-min+1))+min;

  const MIN_W = 800; // Ancho minimo
  const MIN_H = 500; // Altura minima
  const MAX_W = 2600; // Ancho maximo
  const MAX_H = 1600; // Alturamaxima

  const PINS_KEY = 'postit_pins_v1';
  const drawToolbar      = $('#draw-toolbar');
  const drawPenBtn       = $('#draw-pen');
  const drawEraserBtn    = $('#draw-eraser');
  const linkToolbar      = $('#link-toolbar');
  const linkScissorsBtn  = $('#link-scissors');

  const pinToggle      = $('#pin-toggle');
  const pinToolbar     = $('#pin-toolbar');
  const pinAddBtn      = $('#link-addpin');
  const pinRemoveBtn   = $('#link-removepin');
  const pinMoveBtn     = $('#link-movepin');

  const colorButtons = document.querySelectorAll('.color-swatch');

  let drawColor = '#ffffff';  // color actual del trazo
  let eraseMode = false;      // si está activado el borrador
  let cutMode   = false;      // si está activado el modo tijera


  /* ============ GUARDAR / CARGAR NOTAS ============ */

  // Guarda todas las notas actuales en localStorage
  function save(){
    const data = [...canvas.querySelectorAll('.note')].map(n => ({
      id: n.dataset.id,
      x: parseInt(n.style.left)||0,
      y: parseInt(n.style.top)||0,
      color: parseInt(n.dataset.color)||1,
      rot: n.style.getPropertyValue('--rot')||'0deg',
      html: n.querySelector('.body').innerHTML
    }));
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  /* ============ TAMAÑO DEL TABLERO ============ */

  // Aplica ancho y alto al tablero visual
  function applyCanvasSize(w, h){
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
  }

  // Carga tamaño guardado o aplica uno por defecto
  function loadCanvasSize(){
    const raw = localStorage.getItem(SIZE_KEY);
    if(raw){
      try{
        const {w,h} = JSON.parse(raw);
        applyCanvasSize(w, h);
        return;
      }catch(e){
        localStorage.removeItem(SIZE_KEY);
      }
    }
    // tamaño por defecto
    applyCanvasSize(1200, 700);
  }

  // Guarda el tamaño actual del tablero
  function saveCanvasSize(){
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    localStorage.setItem(SIZE_KEY, JSON.stringify({w, h}));
  }

  /* ============ CAPA DE CONEXIONES (HILOS ROJOS) ============ */

  const connectLayer = document.createElement('canvas');
  connectLayer.id = 'connect-layer';
  connectLayer.style.position = 'absolute';
  connectLayer.style.inset = '0';
  connectLayer.style.zIndex = '9999';      // hilos por encima de todo
  connectLayer.style.pointerEvents = 'none';
  canvas.appendChild(connectLayer);

  const ctxLinks = connectLayer.getContext('2d');

  // Sincroniza el tamaño del canvas de hilos con el tablero
  function syncConnectLayerSize(){
    const rect = canvas.getBoundingClientRect();
    connectLayer.width  = rect.width;
    connectLayer.height = rect.height;
  }

  let connections = [];  // cada elemento: {fromId, toId}
  let linkingMode = false;
  let pendingFromId = null;

  // Guarda las conexiones en localStorage
  function saveLinks(){
    localStorage.setItem(LINKS_KEY, JSON.stringify(connections));
  }

  // Carga las conexiones desde localStorage
  function loadLinks(){
    const raw = localStorage.getItem(LINKS_KEY);
    if(!raw) return;
    try{
      connections = JSON.parse(raw) || [];
      redrawConnections();
    }catch(e){
      console.warn('No se pudieron cargar los hilos', e);
      connections = [];
      localStorage.removeItem(LINKS_KEY);
    }
  }

  // Guarda todos los pines sueltos en localStorage
  function savePins(){
    const data = [...canvas.querySelectorAll('.floating-pin')].map(p => ({
      id: p.dataset.id,
      x: parseInt(p.style.left) || 0,
      y: parseInt(p.style.top)  || 0
    }));
    localStorage.setItem(PINS_KEY, JSON.stringify(data));
  }

  // Carga pines sueltos desde localStorage
  function loadPins(){
    const raw = localStorage.getItem(PINS_KEY);
    if (!raw) return;
    try{
      const arr = JSON.parse(raw) || [];
      arr.forEach(spawnFloatingPin);
    }catch(e){
      console.warn('No se pudieron cargar los pines sueltos', e);
      localStorage.removeItem(PINS_KEY);
    }
  }


  // Elimina cualquier conexión asociada a una nota
  function removeConnectionsFor(noteId){
    const before = connections.length;
    connections = connections.filter(c => c.fromId !== noteId && c.toId !== noteId);
    if (connections.length !== before){
      saveLinks();
      redrawConnections();
    }
  }

  // Calcula el centro del pin de una nota en coordenadas del tablero
  function getPinCenter(note){
    const pin = note.querySelector('.pin');
    if (!pin) return null;
    const rectCanvas = canvas.getBoundingClientRect();
    const rectPin = pin.getBoundingClientRect();
    const x = (rectPin.left - rectCanvas.left) + rectPin.width/2;
    const y = (rectPin.top  - rectCanvas.top)  + rectPin.height/2;
    return {x, y};
  }

  // Redibuja todos los hilos en el canvas de conexiones
  function redrawConnections(){
    // siempre asegurar tamaño correcto antes de dibujar
    syncConnectLayerSize();

    ctxLinks.clearRect(0,0,connectLayer.width, connectLayer.height);

    ctxLinks.strokeStyle = '#b91c1c'; // Color del hilo
    ctxLinks.lineWidth = 4;     // grueso del hilo
    ctxLinks.lineCap = 'round';

    connections.forEach(c => {
      const a = canvas.querySelector(
        `.note[data-id="${c.fromId}"], .floating-pin[data-id="${c.fromId}"]`
      );
      const b = canvas.querySelector(
        `.note[data-id="${c.toId}"], .floating-pin[data-id="${c.toId}"]`
      );
      if(!a || !b) return;

      const p1 = getPinCenter(a);
      const p2 = getPinCenter(b);
      if(!p1 || !p2) return;

      ctxLinks.beginPath();
      ctxLinks.moveTo(p1.x, p1.y);
      ctxLinks.lineTo(p2.x, p2.y);
      ctxLinks.stroke();
    });
  }

  // Limpia solo el estado visual de los pines seleccionados
  function clearPendingLink(){
    canvas.querySelectorAll('.pin.pin-link-start')
          .forEach(p => p.classList.remove('pin-link-start'));
  }

  /* ============ CAPA DE DIBUJO ============ */

  const drawLayer = document.createElement('canvas');
  drawLayer.id = 'draw-layer';
  drawLayer.style.position = 'absolute';
  drawLayer.style.inset = '0';
  drawLayer.style.pointerEvents = 'none';
  drawLayer.style.zIndex = '5';
  canvas.appendChild(drawLayer);

  const ctx = drawLayer.getContext('2d');

  // Sincroniza el tamaño del canvas de dibujo con el tablero
  function syncDrawLayerSize(){
    drawLayer.width  = canvas.clientWidth;
    drawLayer.height = canvas.clientHeight;
  }

  let drawingMode = false;
  let drawing = false;
  let lastX = 0, lastY = 0;

  // Botón de modo dibujo
  if (drawToggle) {
    drawToggle.addEventListener('click', () => {
      drawingMode = !drawingMode;
      drawLayer.style.pointerEvents = drawingMode ? 'auto' : 'none';
      drawToggle.classList.toggle('is-on', drawingMode);

      // mostrar barra de dibujo solo cuando el modo está activo
      if (drawToolbar) {
        drawToolbar.classList.toggle('is-visible', drawingMode);
      }
    });
  }

  // Inicio de trazo
  drawLayer.addEventListener('pointerdown', (e) => {
    if (!drawingMode) return;
    drawing = true;
    const rect = drawLayer.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  });

  // Trazo continuo
  drawLayer.addEventListener('pointermove', (e) => {
    if (!drawingMode || !drawing) return;
    const rect = drawLayer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // si está el borrador, usamos destination-out para borrar
    if (eraseMode) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawColor;
    }

    ctx.lineWidth = 10;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
  });

  // Fin de trazo
  drawLayer.addEventListener('pointerup', () => {
    drawing = false;
  });

  drawLayer.addEventListener('pointerleave', () => {
    drawing = false;
  });

  // Botón pluma
  if (drawPenBtn) {
    drawPenBtn.addEventListener('click', () => {
      eraseMode = false;
      drawPenBtn.classList.add('is-on');
      if (drawEraserBtn) drawEraserBtn.classList.remove('is-on');
    });
  }

  // Botón borrador
  if (drawEraserBtn) {
    drawEraserBtn.addEventListener('click', () => {
      eraseMode = true;
      drawEraserBtn.classList.add('is-on');
      if (drawPenBtn) drawPenBtn.classList.remove('is-on');
    });
  }

  // Paleta de colores simples
  if (colorButtons.length) {
    colorButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.dataset.color || '#ffffff';
        drawColor = c;
        eraseMode = false;

        if (drawPenBtn) drawPenBtn.classList.add('is-on');
        if (drawEraserBtn) drawEraserBtn.classList.remove('is-on');

        colorButtons.forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
  }


  /* ============ NOTAS ============ */

  // Mantiene las notas dentro de los límites del tablero
  function clampNotesToCanvas(){
    const maxW = canvas.clientWidth;
    const maxH = canvas.clientHeight;

    canvas.querySelectorAll('.note').forEach(note => {
      let left = parseInt(note.style.left) || 0;
      let top  = parseInt(note.style.top)  || 0;

      const maxX = maxW - note.offsetWidth  - 8;
      const maxY = maxH - note.offsetHeight - 8;

      left = Math.max(8, Math.min(left, maxX));
      top  = Math.max(8, Math.min(top,  maxY));

      note.style.left = left + 'px';
      note.style.top  = top  + 'px';
    });

    redrawConnections();
  }

    // Crea un pin "suelto" sobre el tablero
  function spawnFloatingPin({id, x=100, y=100}){
    const wrapper = document.createElement('div');
    wrapper.className = 'floating-pin';
    wrapper.dataset.id = id;
    wrapper.style.position = 'absolute';
    wrapper.style.left = x + 'px';
    wrapper.style.top  = y + 'px';
    wrapper.style.zIndex = ++zCursor;

    wrapper.innerHTML = `<div class="pin"></div>`;
    canvas.appendChild(wrapper);

    const pinEl = wrapper.querySelector('.pin');

    // Click sobre el pin suelto
    pinEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const thisId = wrapper.dataset.id;

      // Si estamos en modo pines y herramienta "remove", borrar el pin
      if (pinMode && pinTool === 'remove') {
        removeFloatingPin(thisId);
        return;
      }

      // Si estamos en modo hilos (🧶)
      if (!linkingMode) return;

      // Modo tijeras: cortar solo hilos de este pin
      if (cutMode) {
        removeConnectionsFor(thisId);
        return;
      }

      // Crear conexión normal
      if (!pendingFromId){
        clearPendingLink();
        pendingFromId = thisId;
        pinEl.classList.add('pin-link-start');
      }else if (pendingFromId === thisId){
        clearPendingLink();
        pendingFromId = null;
      }else{
        connections.push({fromId: pendingFromId, toId: thisId});
        pendingFromId = null;
        clearPendingLink();
        saveLinks();
        redrawConnections();
      }
    });

    // Arrastrar el pin suelto (solo en modo pines + herramienta mover)
    let dragging = false, sx = 0, sy = 0, startLeft = 0, startTop = 0;

    wrapper.addEventListener('pointerdown', (e) => {
      // si el click viene sobre el pin y estamos en modo hilos, no arrastramos
      if (linkingMode && e.target.closest('.pin')) return;
      if (!pinMode || pinTool !== 'move') return;

      dragging = true;
      wrapper.setPointerCapture(e.pointerId);
      sx = e.clientX;
      sy = e.clientY;
      startLeft = parseInt(wrapper.style.left) || 0;
      startTop  = parseInt(wrapper.style.top)  || 0;
    });

    wrapper.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      let nx = startLeft + dx;
      let ny = startTop + dy;

      const maxX = canvas.clientWidth - wrapper.offsetWidth - 8;
      const maxY = canvas.clientHeight - wrapper.offsetHeight - 8;
      nx = Math.max(8, Math.min(nx, maxX));
      ny = Math.max(8, Math.min(ny, maxY));

      wrapper.style.left = nx + 'px';
      wrapper.style.top  = ny + 'px';

      redrawConnections();
    });

    wrapper.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      wrapper.releasePointerCapture(e.pointerId);
      savePins();
    });

    return wrapper;
  }

  // Click en el tablero para crear un pin suelto cuando
  // estamos en modo pines y con herramienta "add" seleccionada
  canvas.addEventListener('click', (e) => {
    if (!pinMode || pinTool !== 'add') return;

    // si el click fue sobre una nota o un pin existente, no crear uno nuevo
    if (e.target.closest('.note') || e.target.closest('.floating-pin')) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const id = 'pin-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
    spawnFloatingPin({id, x, y});
    savePins();
  });


  // Elimina un pin suelto por id
  function removeFloatingPin(pinId){
    const el = canvas.querySelector(`.floating-pin[data-id="${pinId}"]`);
    if (el) el.remove();
    removeConnectionsFor(pinId); // también borra sus hilos
    savePins();
  }

  // Carga notas y hilos desde localStorage
  function load(){
    loadCanvasSize();
    syncConnectLayerSize();
    syncDrawLayerSize();

    const raw = localStorage.getItem(LS_KEY);
    if(!raw){
      const cx = Math.max(40, (canvas.clientWidth/2)-120);
      const cy = 80;
      spawn({
        id: String(Date.now()), x: cx, y: cy, color: 1, rot: `${rand(-2,2)}deg`,
        html: '<b>¡Bienvenido!</b><br>Escribe aquí, cambia color con los círculos y arrastra la nota por la parte superior.'
      });
      save();
    }else{
      try{
        const arr = JSON.parse(raw);
        arr.forEach(spawn);
      }catch(e){
        console.warn('No se pudo cargar, limpiando almacenamiento', e);
        localStorage.removeItem(LS_KEY);
      }
    }
    loadPins();   // cargar pines
    loadLinks(); // cargar hilos después de tener las notas
  }

  // Crea una nota en el tablero
  function spawn({id, x=50, y=50, color=1, rot='0deg', html=''}){
    const note = document.createElement('div');
    note.className = 'note';
    note.dataset.id = id;
    note.dataset.color = color;
    note.style.left = x + 'px';
    note.style.top = y + 'px';
    note.style.setProperty('--rot', rot);
    note.style.zIndex = ++zCursor;

    note.innerHTML = `
    <div class="pin" aria-hidden="true"></div>
    <div class="head" data-role="drag">
        <span class="drag-hint">⇲ Arrastra aquí</span>
        <button class="delete" type="button" title="Eliminar">Eliminar</button>
    </div>
    <div class="body" contenteditable="true" role="textbox" aria-multiline="true"></div>
    <div class="actions" aria-label="Colores de la nota">
        <button class="chip c1" data-c="1" title="Amarillo"><span class="sr-only">Amarillo</span></button>
        <button class="chip c2" data-c="2" title="Coral"><span class="sr-only">Coral</span></button>
        <button class="chip c3" data-c="3" title="Verde"><span class="sr-only">Verde</span></button>
        <button class="chip c4" data-c="4" title="Azul"><span class="sr-only">Azul</span></button>
        <button class="chip c5" data-c="5" title="Lila"><span class="sr-only">Lila</span></button>
    </div>
    `;

    const bodyEl = note.querySelector('.body');
    bodyEl.innerHTML = html;

    // Marca la nota como "nota de imagen" si contiene una imagen
    const isImageNote = html && html.includes('<img');
    if (isImageNote) {
      note.classList.add('note-image');
    }

    // Lleva la nota al frente al hacer click
    note.addEventListener('pointerdown', () => note.style.zIndex = ++zCursor);

    // Guardar cuando cambia el texto
    bodyEl.addEventListener('input', save);

    // Botón eliminar de la nota
    const deleteBtn = note.querySelector('.delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      const noteId = note.dataset.id;
      note.classList.add('falling');

      note.addEventListener('animationend', () => {
        note.remove();
        removeConnectionsFor(noteId);
        save();
      }, { once: true });
    });

    // Cambiar color de la nota con los chips
    note.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', e => {
      note.dataset.color = e.currentTarget.dataset.c;
      save();
    }));

    // Hilos: click en el pin
    const pinEl = note.querySelector('.pin');
    if (pinEl){
      pinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!linkingMode) return;

        const thisId = note.dataset.id;

        // si estamos en modo tijeras, quitar hilos relacionados a esta nota
        if (cutMode) {
          removeConnectionsFor(thisId);
          return;
        }

        if (!pendingFromId){
          // primer punto
          clearPendingLink();          // limpia marcas anteriores
          pendingFromId = thisId;      // guarda origen
          pinEl.classList.add('pin-link-start');
        }else if (pendingFromId === thisId){
          // clic de nuevo en el mismo -> cancelar
          clearPendingLink();
          pendingFromId = null;
        }else{
          // segundo punto -> crear conexión
          connections.push({fromId: pendingFromId, toId: thisId});
          pendingFromId = null;
          clearPendingLink();
          saveLinks();
          redrawConnections();
        }
      });
    }

    // Zona de arrastre:
    // en notas de imagen se arrastra toda la nota, en notas normales solo la cabecera
    const dragZone = note.classList.contains('note-image')
      ? note
      : note.querySelector('[data-role="drag"]');

    let dragging = false, sx=0, sy=0, startLeft=0, startTop=0;

    // Inicio de arrastre
    dragZone.addEventListener('pointerdown', (e) => {
      // no iniciar arrastre si se hace click en el botón eliminar
      if (e.target.closest('.delete')) return;

      // no iniciar arrastre si estamos en modo hilos y se hizo click en el pin
      // esto permite que el pin se use solo para crear conexiones
      if (linkingMode && e.target.closest('.pin')) return;

      dragging = true;
      note.setPointerCapture(e.pointerId);
      dragZone.style.cursor='grabbing';
      sx = e.clientX; sy = e.clientY;
      startLeft = parseInt(note.style.left)||0;
      startTop = parseInt(note.style.top)||0;
    });

    // Movimiento mientras se arrastra
    note.addEventListener('pointermove', (e) => {
      if(!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      let nx = startLeft + dx;
      let ny = startTop + dy;

      const maxX = canvas.clientWidth - note.offsetWidth - 8;
      const maxY = canvas.clientHeight - note.offsetHeight - 8;
      nx = Math.max(8, Math.min(nx, maxX));
      ny = Math.max(8, Math.min(ny, maxY));
      note.style.left = nx + 'px';
      note.style.top = ny + 'px';

      // actualizar hilos mientras se mueve la nota
      redrawConnections();
    });

    // Fin de arrastre
    note.addEventListener('pointerup', (e) => {
      if(!dragging) return;
      dragging=false;
      note.releasePointerCapture(e.pointerId);
      dragZone.style.cursor = 'grab';
      save();
    });

    canvas.appendChild(note);
    return note;
  }

  // Crea una nueva nota con texto por defecto
  function addNote(){
    const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,7);
    const x = rand(24, Math.max(24, canvas.clientWidth - 280));
    const y = rand(24, Math.max(24, canvas.clientHeight - 220));
    const color = rand(1,5);
    const rot = `${rand(-3,3)}deg`;
    const n = spawn({id,x,y,color,rot, html:'Escribe aquí…'});
    setTimeout(()=> n.querySelector('.body').focus(), 0);
    save();
  }

  /* ============ BOTONES DOCK ============ */

  // Botón: nueva nota
  if (dockAddBtn) {
    dockAddBtn.addEventListener('click', addNote);
  }

  // Botón: borrar todo (notas, dibujo y hilos)
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if(confirm('¿Borrar todas las notas, fotos, dibujos, pines e hilos? Esta acción no se puede deshacer.')){
        canvas.querySelectorAll('.note').forEach(n => n.remove());
        canvas.querySelectorAll('.floating-pin').forEach(p => p.remove());
        ctx.clearRect(0, 0, drawLayer.width, drawLayer.height);

        connections = [];
        saveLinks();
        redrawConnections();

        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(PINS_KEY);
      }
    });
  }


  // Botón: importar imagen como nota
  if (imgBtn && imgInput) {
    imgBtn.addEventListener('click', () => {
      imgInput.click();
    });

    imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,7);
        const x = rand(24, Math.max(24, canvas.clientWidth - 280));
        const y = rand(24, Math.max(24, canvas.clientHeight - 220));
        const rot = `${rand(-2,2)}deg`;

        const html = `
          <img src="${reader.result}" 
               alt="Imagen pegada"
               style="max-width:100%;height:auto;display:block;border-radius:8px;">
        `;

        spawn({ id, x, y, color:1, rot, html });
        save();

        imgInput.value = '';
      };

      reader.readAsDataURL(file);
    });
  }

  // Botón: descargar imagen del tablero
  if (downloadBtn && window.html2canvas) {
    downloadBtn.addEventListener('click', () => {
      // activar modo exportación (oculta UI y sombras extras)
      canvas.classList.add('exporting');

      html2canvas(canvas, {
        backgroundColor: null
      }).then(canvasShot => {
        canvas.classList.remove('exporting'); // volver al modo normal

        const link = document.createElement('a');
        link.download = 'tablero.png';
        link.href = canvasShot.toDataURL('image/png');
        link.click();
      }).catch(err => {
        canvas.classList.remove('exporting'); // asegurar volver
        console.error('Error al generar la imagen del tablero', err);
        alert('No se pudo generar la imagen del tablero.');
      });
    });
  }

  // Botón: modo hilos
  if (linkToggle){
    linkToggle.addEventListener('click', () => {
      linkingMode = !linkingMode;
      linkToggle.classList.toggle('is-on', linkingMode);

      if (!linkingMode){
        clearPendingLink();
        pendingFromId = null;
        cutMode = false;
        if (linkToolbar) {
          linkToolbar.classList.remove('is-visible');
        }
        if (linkScissorsBtn) {
          linkScissorsBtn.classList.remove('is-on');
        }
      } else {
        if (linkToolbar) {
          linkToolbar.classList.add('is-visible');
        }
      }
    });
  }

  // Botón: tijeras para cortar hilos
  if (linkScissorsBtn) {
    linkScissorsBtn.addEventListener('click', () => {
      if (!linkingMode) return;   // solo tiene sentido en modo hilos
      cutMode = !cutMode;
      linkScissorsBtn.classList.toggle('is-on', cutMode);

      // al entrar en modo tijeras, limpiar selección pendiente
      if (cutMode) {
        clearPendingLink();
        pendingFromId = null;
      }
    });
  }

  // Botón: Agregar pines
  let pinMode = false;
  let pinTool = null; // 'add' | 'remove' | 'move' | null

  if (pinToggle) {
    pinToggle.addEventListener('click', () => {
      pinMode = !pinMode;
      pinToggle.classList.toggle('is-on', pinMode);

      if (pinToolbar) {
        pinToolbar.classList.toggle('is-visible', pinMode);
      }

      if (!pinMode) {
        // al apagar modo pines, limpiar herramienta
        pinTool = null;
        [pinAddBtn, pinRemoveBtn, pinMoveBtn].forEach(btn => {
          if (btn) btn.classList.remove('is-on');
        });
      } else {
        // al encender modo pines, dejar por defecto "Agregar pin"
        selectPinTool('add');
      }
    });
  }

  // Helper para marcar herramienta activa en la barra de pines
  function selectPinTool(tool){
    pinTool = tool;
    [pinAddBtn, pinRemoveBtn, pinMoveBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('is-on');
    });

    if (tool === 'add'    && pinAddBtn)    pinAddBtn.classList.add('is-on');
    if (tool === 'remove' && pinRemoveBtn) pinRemoveBtn.classList.add('is-on');
    if (tool === 'move'   && pinMoveBtn)   pinMoveBtn.classList.add('is-on');
  }

  // Botón: agregar pin
  if (pinAddBtn) {
    pinAddBtn.addEventListener('click', () => {
      if (!pinMode) return;
      selectPinTool('add');
    });
  }

  // Botón: quitar pin
  if (pinRemoveBtn) {
    pinRemoveBtn.addEventListener('click', () => {
      if (!pinMode) return;
      selectPinTool('remove');
    });
  }

  // Botón: mover pin
  if (pinMoveBtn) {
    pinMoveBtn.addEventListener('click', () => {
      if (!pinMode) return;
      selectPinTool('move');
    });
  }


  /* ============ INICIO ============ */

  load();

  window.addEventListener('beforeunload', save);

  // Handle para redimensionar el tablero
  const resizer = document.createElement('div');
  resizer.className = 'canvas-resizer';
  canvas.appendChild(resizer);

  let resizing = false;
  let startX = 0, startY = 0;
  let startW = 0, startH = 0;

  // Inicio de resize del tablero
  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizing = true;
    resizer.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startW = canvas.clientWidth;
    startH = canvas.clientHeight;
  });

  // Cambio de tamaño mientras se arrastra el handle
  resizer.addEventListener('pointermove', (e) => {
    if(!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newW = startW + dx;
    let newH = startH + dy;

    newW = Math.max(MIN_W, Math.min(newW, MAX_W));
    newH = Math.max(MIN_H, Math.min(newH, MAX_H));

    applyCanvasSize(newW, newH);
    syncConnectLayerSize();
    syncDrawLayerSize();
    clampNotesToCanvas();
  });

  // Fin de resize
  resizer.addEventListener('pointerup', (e) => {
    if(!resizing) return;
    resizing = false;
    resizer.releasePointerCapture(e.pointerId);
    saveCanvasSize();
  });
})();
