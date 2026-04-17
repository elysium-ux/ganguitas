const addItemModule = {
  currentMode: 'create',

  setMode(mode) {
    this.currentMode = mode;
    const btnCreate = document.getElementById('btn-mode-create');
    const btnEdit = document.getElementById('btn-mode-edit');
    const title = document.getElementById('inv-form-title');
    const btnSave = document.getElementById('btn-save-product');
    const barcodeContainer = document.getElementById('barcode-input-container');

    this.clearForm();

    if (mode === 'create') {
      btnCreate.classList.add('active');
      btnEdit.classList.remove('active');
      title.innerText = "Registrar Nuevo Producto";
      btnSave.innerText = "Guardar Producto";
      if(barcodeContainer) barcodeContainer.classList.add('hidden');
    } else {
      btnCreate.classList.remove('active');
      btnEdit.classList.add('active');
      title.innerText = "Editar Producto Existente";
      btnSave.innerText = "Actualizar Información";
      if(barcodeContainer) barcodeContainer.classList.remove('hidden');
      
      const barcodeInput = document.getElementById('inv-barcode');
      if(barcodeInput) {
        barcodeInput.placeholder = "ESCANEA para buscar producto...";
        barcodeInput.onchange = () => {
          if(this.currentMode === 'edit' && barcodeInput.value) {
            this.loadProductByBarcode(barcodeInput.value);
          }
        };
      }
    }
  },

  clearForm() {
    ['inv-barcode', 'inv-name', 'inv-description', 'inv-stock', 'inv-purchase', 'inv-sale'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
    const area = document.getElementById('barcode-preview-area');
    if(area) area.classList.add('hidden');
  },

  async loadRecentItems() {
    const res = await dataManager.getInventory();
    if (res.success && res.data) {
      const tbody = document.getElementById('add-item-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      const recent = [...res.data].reverse().slice(0, 10);
      recent.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td>${item.barcode}</td>
            <td>${item.name}</td>
            <td>${item.stock}</td>
            <td>
              <button class="btn" style="padding: 5px; width:auto; background: var(--accent);" onclick="addItemModule.prepareEdit('${item.barcode}')"><i class="fas fa-edit"></i></button>
            </td>
          </tr>
        `;
      });
    }
  },

  prepareEdit(barcode) {
    this.setMode('edit');
    document.getElementById('inv-barcode').value = barcode;
    this.loadProductByBarcode(barcode);
  },

  loadProductByBarcode(barcode) {
    const product = dataManager.inventoryCache.find(p => String(p.barcode) === String(barcode));
    if (product) {
      document.getElementById('inv-name').value = product.name;
      document.getElementById('inv-description').value = product.description || "";
      document.getElementById('inv-stock').value = product.stock;
      document.getElementById('inv-purchase').value = product.purchasePrice;
      document.getElementById('inv-sale').value = product.salePrice;
      this.generateBarcodePreview(barcode, product.name);
    } else {
        app.showAlert("Producto no encontrado", "warning");
    }
  },

  generateBarcodePreview(barcode, name) {
    const area = document.getElementById('barcode-preview-area');
    const svg = document.getElementById('barcode-svg');
    const labelName = document.getElementById('label-product-name');
    if (area && svg && typeof JsBarcode !== 'undefined') {
      area.classList.remove('hidden');
      labelName.innerText = name;
      JsBarcode("#barcode-svg", barcode, { format: "CODE128", width: 2, height: 50, displayValue: true });
    }
  },

  async saveProduct() {
    let barcode = document.getElementById('inv-barcode').value;
    const name = document.getElementById('inv-name').value;
    const description = document.getElementById('inv-description').value;
    const stock = document.getElementById('inv-stock').value;
    const purchasePrice = document.getElementById('inv-purchase').value;
    const salePrice = document.getElementById('inv-sale').value;

    if (!name || !stock) return app.showAlert("El nombre y el stock son obligatorios", "error");

    // Si es creación y no hay barcode, generamos uno único
    if (this.currentMode === 'create' && !barcode) {
        barcode = "E" + Date.now().toString().slice(-8); // Prefijo E + últimos 8 dígitos del timestamp
    }

    if (!barcode) return app.showAlert("Código de barras faltante", "error");

    app.showLoader();
    const productData = { barcode, name, description, stock, purchasePrice, salePrice };
    const res = await API.send("addProduct", { product: productData });
    app.hideLoader();

    if(res.success) {
      app.showAlert(res.message);
      if (this.currentMode === 'create') this.generateBarcodePreview(barcode, name);
      dataManager.invalidateCache();
      this.loadRecentItems();
      if (this.currentMode === 'edit') { this.clearForm(); this.setMode('create'); }
    } else {
      app.showAlert(res.message, "error");
    }
  },

  printCurrentLabel() {
    const barcode = document.getElementById('inv-barcode').value;
    const name = document.getElementById('inv-name').value;
    const salePrice = document.getElementById('inv-sale').value;

    if (!barcode || !name || !salePrice) {
        return app.showAlert("Faltan datos para imprimir la etiqueta", "warning");
    }

    if (typeof bluetoothPrinter !== 'undefined') {
        bluetoothPrinter.printProductLabel({ barcode, name, salePrice });
    }
  }
};
