const posModule = {
  catalog: [],
  cart: [],
  currentTotal: 0,
  expectedCash: Number(localStorage.getItem('expectedCash')) || 0,

  async loadCatalog(forceRefresh = false) {
    // Si ya tenemos cache, lo mostramos de inmediato sin loader
    const invRes = await dataManager.getInventory(forceRefresh);
    const movesRes = await dataManager.getMovements(forceRefresh);

    if (invRes.success) this.catalog = invRes.data;
    if (movesRes.success) this.renderMovements(movesRes.data);
    
    this.showView('movements');

    // Si los datos vinieron de caché, lanzamos una actualización en segundo plano (sin bloquear al usuario)
    if (invRes.fromCache || movesRes.fromCache) {
      setTimeout(async () => {
        const i2 = await dataManager.getInventory(true);
        const m2 = await dataManager.getMovements(true);
        if (i2.success) this.catalog = i2.data;
        if (m2.success) this.renderMovements(m2.data);
      }, 100);
    }

    // Inicializar UI de impresora
    if (typeof bluetoothPrinter !== 'undefined') bluetoothPrinter.updateUI();

    // Sincronizar estado de caja con el backend
    this.syncRegisterStatus();
  },

  async syncRegisterStatus() {
    if (!app.currentUser) return;
    const res = await API.send("getRegisterStatus", { userId: app.currentUser.userId });
    if (res.success) {
      if (res.isOpen) {
        localStorage.setItem('isRegisterOpen', 'true');
      } else {
        localStorage.removeItem('isRegisterOpen');
        localStorage.removeItem('expectedCash');
      }
    }
  },

  renderMovements(data) {
    const tbody = document.getElementById('pos-movements-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.forEach(m => {
        let typeColor = '#d67eb1';
        if(m.type === 'APERTURA') typeColor = '#74c69d';
        if(m.type === 'VENTA') typeColor = '#4a90e2';
        
        const formattedDate = app.formatDateTime(m.date);
        
        tbody.innerHTML += `
            <tr>
                <td style="font-size:0.75rem;">${formattedDate}</td>
                <td style="color:${typeColor}; font-weight:bold;">${m.type}</td>
                <td>$${Number(m.amount).toFixed(2)}</td>
                <td style="font-size:0.75rem; color:var(--text-muted);">${m.note}</td>
            </tr>
        `;
    });
  },

  showView(view) {
    const movesView = document.getElementById('pos-movements-view');
    const searchView = document.getElementById('pos-search-results');
    const title = document.getElementById('pos-left-title');

    if(view === 'search') {
        movesView.classList.add('hidden');
        searchView.classList.remove('hidden');
        title.innerText = "Resultados de Búsqueda";
        title.style.color = "var(--primary)";
    } else {
        movesView.classList.remove('hidden');
        searchView.classList.add('hidden');
        title.innerText = "Últimos Movimientos";
        title.style.color = "#d67eb1";
    }
  },

  renderCatalog(data) {
    const list = document.getElementById('pos-product-list');
    if (!list) return;
    list.innerHTML = '';
    
    if(data.length === 0) {
        list.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron coincidencias.</p>';
        return;
    }

    data.forEach(p => {
      list.innerHTML += `
        <div class="product-card" onclick="posModule.addToCart('${p.barcode}')" style="padding: 0.8rem; display: flex; align-items: center; gap: 15px;">
          <div style="background: var(--primary-light); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white;">
            <i class="fas fa-tag"></i>
          </div>
          <div style="flex: 1;">
            <div class="p-name" style="font-size:0.9rem; margin:0;">${p.name}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${p.barcode}</div>
          </div>
          <div style="text-align: right;">
            <div class="p-price" style="font-size:1rem; margin:0;">$${Number(p.salePrice).toFixed(2)}</div>
            <div style="font-size:0.7rem;">Stock: ${p.stock}</div>
          </div>
        </div>
      `;
    });
  },

  filterCatalog() {
    const q = document.getElementById('pos-search-input').value.toLowerCase();
    if(q.trim() === '') {
        this.showView('movements');
        return;
    }
    
    this.showView('search');
    const filtered = this.catalog.filter(p => p.name.toLowerCase().includes(q) || String(p.barcode).includes(q));
    this.renderCatalog(filtered);
  },

  addToCart(barcode) {
    // Validar si la caja está abierta
    if (!localStorage.getItem('isRegisterOpen')) {
        return app.showAlert("⚠️ Debes realizar la APERTURA de caja antes de iniciar una venta.", "warning");
    }

    const product = this.catalog.find(p => String(p.barcode) === String(barcode));
    if (!product) { app.showAlert("Producto no encontrado", "warning"); return; }
    if (product.stock <= 0) { app.showAlert("Sin inventario", "error"); return; }

    const existing = this.cart.find(c => c.barcode === product.barcode);
    if (existing) {
      if (existing.qty >= product.stock) { app.showAlert("Stock límite alcanzado", "warning"); return; }
      existing.qty++;
    } else {
      this.cart.push({ ...product, qty: 1 });
    }
    this.updateCart();
    
    // Limpiar búsqueda
    document.getElementById('pos-search-input').value = '';
    this.showView('movements');
  },

  // Gastos desde POS
  showExpenseModal() {
    if (!localStorage.getItem('isRegisterOpen')) {
        return app.showAlert("⚠️ Debes realizar la APERTURA de caja para registrar un gasto.", "warning");
    }
    document.getElementById('pos-expense-modal').classList.remove('hidden');
  },

  async saveExpense() {
    const concept = document.getElementById('pos-exp-concept').value;
    const amount = Number(document.getElementById('pos-exp-amount').value);
    
    if(!concept || !amount) return app.showAlert("Faltan datos del gasto", "warning");

    app.showLoader();
    const res = await API.send("addExpense", { expense: { 
        concept, 
        amount, 
        user: app.currentUser.userId 
    }});
    app.hideLoader();

    if(res.success) {
        app.showAlert("Gasto registrado correctamente");
        document.getElementById('pos-expense-modal').classList.add('hidden');
        document.getElementById('pos-exp-concept').value = '';
        document.getElementById('pos-exp-amount').value = '';
        this.loadCatalog(true);
    }
  },

  updateCart() {
    const tbody = document.getElementById('cart-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    this.currentTotal = 0;

    this.cart.forEach((item, index) => {
      const sub = item.qty * item.salePrice;
      this.currentTotal += sub;
      tbody.innerHTML += `
        <tr>
          <td style="font-size:0.85rem;">${item.name}</td>
          <td>${item.qty}</td>
          <td>$${sub.toFixed(2)}</td>
          <td><button class="btn danger" style="padding:2px 8px; width:auto;" onclick="posModule.removeFromCart(${index})">×</button></td>
        </tr>
      `;
    });

    document.getElementById('cart-total').innerText = `$${this.currentTotal.toFixed(2)}`;
    
    const method = document.getElementById('pos-method').value;
    const changeArea = document.getElementById('cash-change-area');
    if(method === 'Efectivo' && this.currentTotal > 0) {
        changeArea.classList.remove('hidden');
    } else {
        changeArea.classList.add('hidden');
    }
    this.calculateChange();
  },

  removeFromCart(index) {
    this.cart.splice(index, 1);
    this.updateCart();
  },

  clearCart() {
    this.cart = [];
    this.updateCart();
    document.getElementById('pos-cash-received').value = '';
  },

  calculateChange() {
    const received = Number(document.getElementById('pos-cash-received').value) || 0;
    const change = received - this.currentTotal;
    const display = document.getElementById('pos-change-display');
    if(display) {
        display.innerText = `$${Math.max(0, change).toFixed(2)}`;
        display.style.color = (change < 0 && received > 0) ? 'var(--danger)' : 'var(--primary)';
    }
  },

  async processSale() {
    if (this.cart.length === 0) return app.showAlert("Tu carrito está vacío", "warning");
    const method = document.getElementById('pos-method').value;
    const received = Number(document.getElementById('pos-cash-received').value) || 0;
    
    if (method === 'Efectivo' && received < this.currentTotal) {
        return app.showAlert("El monto recibido no cubre el total", "error");
    }

    const saleData = {
      method: method,
      total: this.currentTotal,
      items: this.cart
    };

    app.showLoader();
    const res = await API.send("processSale", { sale: saleData });
    app.hideLoader();

    if (res.success) {
      app.showAlert("¡Venta completada! 🌸");
      if(method === 'Efectivo') {
        this.expectedCash += this.currentTotal;
        localStorage.setItem('expectedCash', this.expectedCash);
      }

      // Impresión de ticket si aplica
      if (typeof bluetoothPrinter !== 'undefined' && bluetoothPrinter.autoPrint) {
        await bluetoothPrinter.printReceipt(saleData);
      } else if (typeof bluetoothPrinter !== 'undefined' && bluetoothPrinter.isConnected) {
        // Podríamos preguntar si quiere ticket o dejar el botón manual, 
        // por ahora autoPrint manda. 
      }

      this.clearCart();
      dataManager.invalidateCache();
      this.loadCatalog(true);
    } else {
      app.showAlert(res.message, "error");
    }
  },

  showOpenRegisterModal() {
    if (localStorage.getItem('isRegisterOpen')) {
        return app.showAlert("⚠️ La caja ya está abierta. Debes realizar el CORTE antes de iniciar un nuevo turno.", "warning");
    }
    document.getElementById('register-open-modal').classList.remove('hidden');
  },
  
  async confirmOpenRegister() {
    const amount = Number(document.getElementById('reg-open-amount').value);
    if(isNaN(amount) || amount < 0) return app.showAlert("Monto inválido", "error");
    
    app.showLoader();
    const res = await API.send("openRegister", { data: { amount, user: app.currentUser.userId } });
    app.hideLoader();
    
    if(res.success) {
        this.expectedCash = amount;
        localStorage.setItem('expectedCash', this.expectedCash);
        localStorage.setItem('isRegisterOpen', 'true');
        app.showAlert(res.message);
        document.getElementById('register-open-modal').classList.add('hidden');
        this.loadCatalog(true);
    }
  },

  async showCloseRegisterModal() {
    if (!app.currentUser) {
        return app.showAlert("Sesión no válida. Por favor vuelve a iniciar sesión.", "error");
    }
    if (!localStorage.getItem('isRegisterOpen')) {
        return app.showAlert("⚠️ No hay una apertura de caja activa. Primero debes realizar la apertura.", "warning");
    }
    app.showLoader();
    const res = await API.send("getRegisterReport", { user: app.currentUser.userId });
    app.hideLoader();

    if (res.success && res.data) {
        const d = res.data;
        document.getElementById('close-report-date').innerText = `Reporte al ${d.reportDate}`;
        document.getElementById('close-init-amount').innerText = `$${d.initialAmount.toFixed(2)}`;
        document.getElementById('close-sales-cash').innerText = `$${d.salesCash.toFixed(2)}`;
        document.getElementById('close-expenses').innerText = `-$${d.totalExpenses.toFixed(2)}`;
        document.getElementById('close-expected-cash').innerText = `$${d.expectedCash.toFixed(2)}`;
        document.getElementById('close-sales-trans').innerText = `$${d.salesTrans.toFixed(2)}`;
        document.getElementById('close-sales-card').innerText = `$${d.salesCard.toFixed(2)}`;
        document.getElementById('close-total-sales').innerText = `$${d.totalSales.toFixed(2)}`;
        document.getElementById('close-items-count').innerText = `(${d.totalItemsSold} art.)`;
        
        // El input de efectivo real lo limpiamos para una nueva cuenta
        document.getElementById('reg-close-amount').value = '';
        
        // Valor esperado para usar en la confirmación
        this.expectedCashReported = d.expectedCash;

        document.getElementById('register-close-modal').classList.remove('hidden');
    } else {
        app.showAlert(res.message || "No se pudo generar el reporte del turno", "error");
    }
  },

  async confirmCloseRegister() {
    const finalAmount = Number(document.getElementById('reg-close-amount').value);
    if(isNaN(finalAmount) || document.getElementById('reg-close-amount').value === '') {
        return app.showAlert("⚠️ Por favor ingresa el monto de efectivo que contaste en caja.", "warning");
    }

    const data = {
        expectedAmount: this.expectedCashReported,
        finalAmount: finalAmount,
        user: app.currentUser.userId
    };

    app.showLoader();
    const res = await API.send("closeRegister", { data });
    app.hideLoader();

    if(res.success) {
        app.showAlert(`¡Corte realizado con éxito! Diferencia: $${(finalAmount - this.expectedCashReported).toFixed(2)}`);
        document.getElementById('register-close-modal').classList.add('hidden');
        this.expectedCash = 0;
        localStorage.removeItem('expectedCash');
        localStorage.removeItem('isRegisterOpen');
        this.loadCatalog(true);
    }
  }
};
