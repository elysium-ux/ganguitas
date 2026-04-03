let html5QrcodeScanner = null;

const scannerModule = {
  targetInputId: null,

  toggleScanner(targetId = null) {
    const modal = document.getElementById('scanner-modal');
    if(!modal) return;

    this.targetInputId = targetId;

    if (modal.classList.contains('hidden')) {
      modal.classList.remove('hidden');
      this.startScanner();
    } else {
      this.stopScanner();
    }
  },

  startScanner() {
    if(typeof Html5Qrcode === 'undefined') {
      alert("Librería de escáner no cargada aún.");
      return;
    }

    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start({ facingMode: "environment" }, config, this.onScanSuccess.bind(this))
      .catch(err => {
        console.error("Error iniciando cámara", err);
        alert("Error comprobando cámara. Verifica tus permisos de navegador.");
      });
  },

  stopScanner() {
    const modal = document.getElementById('scanner-modal');
    if (html5QrcodeScanner) {
      html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner.clear();
        modal.classList.add('hidden');
      }).catch(err => {
        console.error("No se pudo detener el scanner", err);
        modal.classList.add('hidden');
      });
    } else {
      modal.classList.add('hidden');
    }
  },

  onScanSuccess(decodedText, decodedResult) {
    console.log(`Scan result: ${decodedText}`);
    try {
      const sound = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
      sound.play().catch(e => { /* Ignore auto-play strict rules */ });
    } catch(e) {}

    // Si fue abierto desde inventario
    if(this.targetInputId) {
      const inp = document.getElementById(this.targetInputId);
      if(inp) inp.value = decodedText;
      this.stopScanner();
    } 
    // Si fue abierto desde POS
    else {
      const search = document.getElementById('catalog-search');
      if(search) search.value = decodedText;
      if(typeof posModule !== 'undefined') {
        posModule.filterCatalog();
        posModule.addToCart(decodedText);
      }
      this.stopScanner();
    }
  }
};
