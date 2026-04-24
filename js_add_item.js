const addItemModule = {
  currentMode: 'create',
  selectedImages: [], // Array de {id: string, url: string, isNew: boolean, base64?: string}

  setMode(mode) {
    this.currentMode = mode;
    const btnCreate = document.getElementById('btn-mode-create');
    const btnEdit = document.getElementById('btn-mode-edit');
    const title = document.getElementById('inv-form-title');
    const btnSave = document.getElementById('btn-save-product');
    const btnDelete = document.getElementById('btn-delete-product');
    const barcodeContainer = document.getElementById('barcode-input-container');

    this.clearForm();

    if (mode === 'create') {
      btnCreate.classList.add('active');
      btnEdit.classList.remove('active');
      title.innerText = "Registrar Nuevo Producto";
      btnSave.innerText = "Guardar Producto";
      if (btnDelete) btnDelete.classList.add('hidden');
      if (barcodeContainer) barcodeContainer.classList.add('hidden');
    } else {
      btnCreate.classList.remove('active');
      btnEdit.classList.add('active');
      title.innerText = "Editar Producto Existente";
      btnSave.innerText = "Actualizar Información";
      if (btnDelete) btnDelete.classList.remove('hidden');
      if (barcodeContainer) barcodeContainer.classList.remove('hidden');

      const barcodeInput = document.getElementById('inv-barcode');
      if (barcodeInput) {
        barcodeInput.placeholder = "ESCANEA para buscar producto...";
        barcodeInput.onchange = () => {
          if (this.currentMode === 'edit' && barcodeInput.value) {
            this.loadProductByBarcode(barcodeInput.value);
          }
        };
      }
    }
  },

  clearForm() {
    ['inv-barcode', 'inv-name', 'inv-category', 'inv-description', 'inv-stock', 'inv-purchase', 'inv-sale'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const area = document.getElementById('barcode-preview-area');
    if (area) area.classList.add('hidden');

    this.selectedImages = [];
    this.renderImageSlots();
  },

  triggerImageUpload(index) {
    // Si ya hay una imagen en ese slot, no hacemos nada (el botón de borrado se encarga)
    if (this.selectedImages[index]) return;
    document.getElementById('inv-file-input').click();
  },

  async handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      if (this.selectedImages.length >= 5) break;

      const base64 = await this.resizeAndConvert(file);
      this.selectedImages.push({
        id: 'new-' + Date.now() + Math.random(),
        url: URL.createObjectURL(file), // Para vista previa rápida
        isNew: true,
        base64: base64
      });
    }

    this.renderImageSlots();
    e.target.value = ''; // Reset input
  },

  async resizeAndConvert(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max_size = 800; // Redimensionar a máx 800px para GAS

          if (width > height) {
            if (width > max_size) { height *= max_size / width; width = max_size; }
          } else {
            if (height > max_size) { width *= max_size / height; height = max_size; }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% calidad
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  renderImageSlots() {
    const grid = document.getElementById('image-uploader-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Mostramos las imágenes actuales
    this.selectedImages.forEach((img, i) => {
      grid.innerHTML += `
        <div class="img-slot">
          <img src="${img.url}">
          <button class="remove-btn" onclick="event.stopPropagation(); addItemModule.removeImage(${i})">×</button>
        </div>
      `;
    });

    // Rellenamos el resto con slots vacíos
    for (let i = this.selectedImages.length; i < 5; i++) {
      grid.innerHTML += `
        <div class="img-slot" onclick="addItemModule.triggerImageUpload(${i})">
          <i class="fas fa-plus"></i>
        </div>
      `;
    }
  },

  removeImage(index) {
    const img = this.selectedImages[index];
    // Si era una imagen de Drive (no nueva), opcionalmente podríamos llamar a la API para borrarla de inmediato
    // o simplemente no incluirla al guardar. Vamos a hacer que se borre al "Guardar".
    this.selectedImages.splice(index, 1);
    this.renderImageSlots();
  },

  init() {
    this.setMode('create');
    this.loadRecentItems();
  },

  async loadRecentItems() {
    const res = await dataManager.getInventory();
    if (res.success && res.data) {
      const tbody = document.getElementById('add-item-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      const recent = [...res.data].reverse().slice(0, 10);
      recent.forEach(item => {
        const thumb = (item.images && item.images.length > 0)
          ? `<img src="${item.images[0].url}" style="width: 30px; height: 30px; border-radius: 5px; object-fit: cover;">`
          : `<div style="width: 30px; height: 30px; background: #eee; border-radius: 5px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-image" style="font-size: 10px; color: #ccc;"></i></div>`;

        tbody.innerHTML += `
          <tr>
            <td style="display: flex; align-items: center; gap: 8px;">${thumb} <span>${item.barcode}</span></td>
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
      document.getElementById('inv-category').value = product.category || "";
      document.getElementById('inv-description').value = product.description || "";
      document.getElementById('inv-stock').value = product.stock;
      document.getElementById('inv-purchase').value = product.purchasePrice;
      document.getElementById('inv-sale').value = product.salePrice;

      this.selectedImages = (product.images || []).map(img => ({ ...img, isNew: false }));
      this.renderImageSlots();

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
    const category = document.getElementById('inv-category').value;
    const description = document.getElementById('inv-description').value;
    const stock = document.getElementById('inv-stock').value;
    const purchasePrice = document.getElementById('inv-purchase').value;
    const salePrice = document.getElementById('inv-sale').value;

    if (!name || !category || !stock) return app.showAlert("El nombre, la categoría y el stock son obligatorios", "error");

    // Si es creación y no hay barcode, generamos uno único
    if (this.currentMode === 'create' && !barcode) {
      barcode = "E" + Date.now().toString().slice(-8); // Prefijo E + últimos 8 dígitos del timestamp
    }

    if (!barcode) return app.showAlert("Código de barras faltante", "error");

    app.showLoader();

    // Separar imágenes existentes de las nuevas
    const existingImages = this.selectedImages.filter(img => !img.isNew).map(img => ({ id: img.id, url: img.url }));
    const newImages = this.selectedImages.filter(img => img.isNew && img.base64).map(img => ({ base64: img.base64 }));

    console.log(`Enviando producto: ${name} (${barcode}). Imágenes: ${existingImages.length} existentes, ${newImages.length} nuevas.`);

    const productData = {
      barcode,
      name,
      category,
      description,
      stock,
      purchasePrice,
      salePrice,
      existingImages,
      newImages
    };

    const res = await API.send("addProduct", { product: productData });
    app.hideLoader();

    if (res.success) {
      app.showAlert(res.message);

      // Invalidar caché y forzar recarga total para obtener los nuevos links de Drive
      dataManager.invalidateCache();
      await dataManager.getInventory(true);

      if (this.currentMode === 'create') {
        this.generateBarcodePreview(barcode, name);
        // Cambiar a modo edición del producto recién creado para mostrar las fotos
        this.prepareEdit(barcode);
      } else {
        // Recargar el producto actual en modo edición
        this.loadProductByBarcode(barcode);
      }

      this.loadRecentItems();
    } else {
      app.showAlert(res.message, "error");
    }
  },

  async confirmDeleteProduct() {
    const barcode = document.getElementById('inv-barcode').value;
    const name = document.getElementById('inv-name').value;
    
    if (!barcode) return;

    const confirmed = await app.showConfirm(
      `¿Estás seguro de que deseas eliminar permanentemente el producto "${name}"? Esta acción no se puede deshacer y borrará también sus imágenes.`,
      "Confirmar Eliminación",
      "danger"
    );

    if (confirmed) {
      app.showLoader();
      const res = await API.send("deleteProduct", { barcode });
      app.hideLoader();
      
      if (res.success) {
        app.showAlert("Producto eliminado correctamente");
        this.setMode('create');
        dataManager.invalidateCache();
        this.loadRecentItems();
      } else {
        app.showAlert(res.message, "error");
      }
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
