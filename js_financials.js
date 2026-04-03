const financialsModule = {
  async loadSummary(forceRefresh = false) {
    const period = document.getElementById('fin-filter-period').value;
    const filters = {
      period: period,
      start: document.getElementById('fin-date-start').value,
      end: document.getElementById('fin-date-end').value
    };

    // Usar dataManager con caché para mayor velocidad
    const res = await dataManager.getFinancials(filters, forceRefresh);
    
    if (res.success && res.data) {
      this.renderSummary(res.data);
    } else {
        app.showAlert("Error: " + (res.message || "No se pudo cargar el resumen"), "error");
    }

    // Actualización silenciosa si vino de caché
    if (res.fromCache) {
        setTimeout(async () => {
            const r2 = await dataManager.getFinancials(filters, true);
            if (r2.success) this.renderSummary(r2.data);
        }, 100);
    }
  },

  renderSummary(d) {
      // Totales Principales
      this.animateValue('fin-total-sales', d.totalSales);
      this.animateValue('fin-total-expenses', d.totalExpenses);
      this.animateValue('fin-net-profit', d.netProfit);
      
      const profitStatus = document.getElementById('fin-profit-status');
      if (d.netProfit >= 0) {
          profitStatus.innerText = "🌸 GANANCIA POSITIVA";
          profitStatus.style.color = "#2d6a4f";
      } else {
          profitStatus.innerText = "⚠️ PÉRDIDA EN PERIODO";
          profitStatus.style.color = "var(--danger)";
      }

      // Tabla de Caja con FECHA FORMATEADA
      const tbody = document.getElementById('fin-caja-tbody');
      if (tbody) {
        tbody.innerHTML = '';
        d.cajaHistory.forEach(row => {
          tbody.innerHTML += `
            <tr>
              <td style="font-size:0.75rem;">${app.formatDateTime(row[0])}</td>
              <td style="font-weight:600; color:${row[1]==='APERTURA'?'#74c69d':'#d67eb1'}">${row[1]}</td>
              <td>$${Number(row[2]).toFixed(2)}</td>
              <td style="color:${Number(row[5])<0?'red':'green'}">${row[5]?'$'+Number(row[5]).toFixed(2):'---'}</td>
            </tr>
          `;
        });
      }

      // Estáticos/Inventario
      document.getElementById('fin-inv-purchase').innerText = `$${d.invPurchaseValue.toLocaleString()}`;
      document.getElementById('fin-inv-sale').innerText = `$${d.invSaleValue.toLocaleString()}`;
      document.getElementById('fin-total-items').innerText = d.totalItems;
      document.getElementById('fin-sale-cash').innerText = `$${d.salesByMethod.Efectivo.toFixed(2)}`;
      document.getElementById('fin-sale-card').innerText = `$${d.salesByMethod.Tarjeta.toFixed(2)}`;
      document.getElementById('fin-sale-trans').innerText = `$${d.salesByMethod.Transferencia.toFixed(2)}`;
  },

  handleFilterChange() {
    const val = document.getElementById('fin-filter-period').value;
    const customArea = document.getElementById('fin-custom-dates');
    if (val === 'custom') customArea.classList.remove('hidden');
    else {
        customArea.classList.add('hidden');
        this.loadSummary();
    }
  },

  animateValue(id, value) {
    document.getElementById(id).innerText = `$${Number(value).toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
  },

  showExpenseModal() {
    document.getElementById('expense-modal').classList.remove('hidden');
  },

  async saveExpense() {
    const concept = document.getElementById('exp-concept').value;
    const amount = Number(document.getElementById('exp-amount').value);
    
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
        document.getElementById('expense-modal').classList.add('hidden');
        document.getElementById('exp-concept').value = '';
        document.getElementById('exp-amount').value = '';
        dataManager.invalidateCache(); // Limpiar caché para ver el gasto reflejado
        this.loadSummary(true);
    }
  }
};
