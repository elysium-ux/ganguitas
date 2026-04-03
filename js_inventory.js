const inventoryModule = {
  allProducts: [],
  scannedBarcodes: [],

  async loadInventory(forceRefresh = true) {
    app.showLoader();
    const res = await dataManager.getInventory(forceRefresh);
    app.hideLoader();

    if (res.success && res.data) {
      this.allProducts = res.data;
      this.applyFilters();
    } else {
        app.showAlert("Error cargando inventario: " + res.message, "error");
    }
  },

  applyFilters() {
    const nameQ = document.getElementById('filter-name').value.toLowerCase();
    const sortVal = document.getElementById('filter-sort').value;
    const stockVal = document.getElementById('filter-stock').value;

    let filtered = this.allProducts.filter(p => {
      const matchName = p.name.toLowerCase().includes(nameQ) || String(p.barcode).includes(nameQ);
      let matchStock = true;
      if (stockVal === 'low') matchStock = p.stock > 0 && p.stock < 5;
      else if (stockVal === 'out') matchStock = p.stock <= 0;
      
      return matchName && matchStock;
    });

    // Sorter
    filtered.sort((a, b) => {
      if (sortVal === 'date-desc') return new Date(b.dateAdded) - new Date(a.dateAdded);
      if (sortVal === 'date-asc') return new Date(a.dateAdded) - new Date(b.dateAdded);
      if (sortVal === 'price-high') return b.salePrice - a.salePrice;
      if (sortVal === 'price-low') return a.salePrice - b.salePrice;
      return 0;
    });

    this.renderTable(filtered);
  },

  renderTable(data) {
    const tbody = document.getElementById('audit-inventory-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    data.forEach(p => {
      const statusClass = p.stock <= 0 ? 'color: var(--danger); font-weight: bold;' : (p.stock < 5 ? 'color: orange; font-weight: bold;' : '');
      tbody.innerHTML += `
        <tr>
          <td>${app.formatDateTime(p.dateAdded)}</td>
          <td>${p.barcode}</td>
          <td><strong>${p.name}</strong></td>
          <td style="${statusClass}">${p.stock}</td>
          <td>$${Number(p.salePrice).toFixed(2)}</td>
          <td>${p.stock > 0 ? '✅ Activo' : '❌ Agotado'}</td>
        </tr>
      `;
    });
  },

  // Auditoría
  startAudit() {
    this.scannedBarcodes = [];
    document.getElementById('audit-count').innerText = "0";
    document.getElementById('audit-scanned-list').innerHTML = "";
    document.getElementById('audit-modal').classList.remove('hidden');
    
    const input = document.getElementById('audit-scan-input');
    input.value = '';
    input.focus();
    
    // Listener para escaneo continuo
    input.onchange = () => {
        if(input.value) {
            this.addScannedItem(input.value);
            input.value = '';
            input.focus();
        }
    };
  },

  addScannedItem(barcode) {
    this.scannedBarcodes.push(barcode);
    document.getElementById('audit-count').innerText = this.scannedBarcodes.length;
    const li = document.createElement('li');
    li.innerText = `Escaneado: ${barcode}`;
    document.getElementById('audit-scanned-list').prepend(li);
    
    // Feedback visual rápido
    document.getElementById('audit-scan-input').style.background = '#caffbf';
    setTimeout(() => document.getElementById('audit-scan-input').style.background = '', 300);
  },

  closeAudit() {
    document.getElementById('audit-modal').classList.add('hidden');
    scannerModule.stopScanner();
  },

  async finishAudit() {
    if(this.scannedBarcodes.length === 0) return app.showAlert("Aún no has escaneado ningún artículo", "warning");
    
    app.showLoader();
    
    // Calculamos faltantes
    // missing = productos que están en DB con stock > 0 pero NO fueron escaneados
    const missing = this.allProducts.filter(p => {
        if(p.stock <= 0) return false;
        // Si el código NO está en la lista de escaneados
        return !this.scannedBarcodes.some(b => String(b) === String(p.barcode));
    });

    const report = {
        user: "Admin", // Por ahora estático o de localStorage
        missing: missing.map(m => ({ barcode: m.barcode, name: m.name, expected: m.stock }))
    };

    const res = await API.send("saveAuditReport", { report });
    app.hideLoader();

    if(res.success) {
        this.closeAudit();
        this.showFinalReport(report.missing);
    } else {
        app.showAlert("Hubo un problema al guardar el reporte: " + res.message, "error");
    }
  },

  showFinalReport(missing) {
    const modal = document.getElementById('report-modal');
    const content = document.getElementById('report-content');
    
    let html = `FECHA: ${new Date().toLocaleString()}\n`;
    html += `ESTADO: AUDITORÍA FINALIZADA\n`;
    html += `----------------------------------\n`;
    html += `PRODUCTOS FALTANTES DETECTADOS:\n\n`;
    
    if(missing.length === 0) {
        html += `¡TODO CORRECTO! No hay faltantes.`;
    } else {
        missing.forEach(m => {
            html += `- [${m.barcode}] ${m.name}\n  (Stock esperado: ${m.expected})\n\n`;
        });
    }
    
    content.innerText = html;
    modal.classList.remove('hidden');
  }
};
