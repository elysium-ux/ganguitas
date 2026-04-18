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
          let btnHtml = '';
          if(row[1] === 'CORTE') {
               btnHtml = `<button class="btn" style="padding: 2px 8px; font-size: 0.7rem; width: auto;" onclick="financialsModule.viewCorte('${row[0]}', '${row[3]}')"><i class="fas fa-search"></i> Ver</button>`;
          }
          
          tbody.innerHTML += `
            <tr>
              <td style="font-size:0.75rem;">${app.formatDateTime(row[0])}</td>
              <td style="font-weight:600; color:${row[1]==='APERTURA'?'#74c69d':'#d67eb1'}">
                 ${row[1]} ${btnHtml}
              </td>
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

  async viewCorte(corteDateStr, userId) {
      app.showLoader();
      const res = await API.send("getCorteDetails", { data: { corteDate: corteDateStr, user: userId } });
      app.hideLoader();

      if (!res.success || !res.data) {
          return app.showAlert("No se pudieron cargar los detalles del corte", "error");
      }

      const d = res.data;
      document.getElementById('corte-det-open').innerText = app.formatDateTime(d.openingDate);
      document.getElementById('corte-det-close').innerText = app.formatDateTime(d.corteDate);
      
      document.getElementById('corte-det-initial').innerText = `$${d.initialAmount.toFixed(2)}`;
      document.getElementById('corte-det-sales').innerText = `$${d.sales.reduce((acc, s) => acc + s.total, 0).toFixed(2)}`;
      document.getElementById('corte-det-expenses').innerText = `$${d.expenses.reduce((acc, e) => acc + e.amount, 0).toFixed(2)}`;
      document.getElementById('corte-det-final').innerText = `$${d.finalAmount.toFixed(2)}`;

      // Render Sales
      const salesTbody = document.getElementById('corte-det-sales-tbody');
      salesTbody.innerHTML = '';
      if(d.sales.length === 0) salesTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hubo ventas en el turno.</td></tr>';
      
      d.sales.forEach(sale => {
          const itemsDesc = sale.items.map(it => `${it.qty}x ${it.name}`).join('<br>');
          salesTbody.innerHTML += `
             <tr style="border-bottom: 1px solid #efefef;">
                <td>${app.formatDateTime(sale.date).split(', ')[1] || sale.date}</td>
                <td><small>${sale.ticketId.substring(0, 8)}...</small></td>
                <td><small>${itemsDesc}</small></td>
                <td>${sale.method}</td>
                <td><strong>$${sale.total.toFixed(2)}</strong></td>
             </tr>
          `;
      });

      // Render Expenses
      const expTbody = document.getElementById('corte-det-expenses-tbody');
      expTbody.innerHTML = '';
      if(d.expenses.length === 0) expTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hubo gastos reportados.</td></tr>';
      
      d.expenses.forEach(exp => {
          expTbody.innerHTML += `
             <tr style="border-bottom: 1px solid #efefef;">
                <td>${app.formatDateTime(exp.date).split(', ')[1] || exp.date}</td>
                <td>${exp.concept}</td>
                <td style="color:var(--danger);"><strong>$${exp.amount.toFixed(2)}</strong></td>
             </tr>
          `;
      });

      document.getElementById('corte-details-modal').classList.remove('hidden');
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
    if (!localStorage.getItem('isRegisterOpen')) {
        return app.showAlert("⚠️ Debes realizar la APERTURA de caja en el Punto de Venta para registrar un gasto.", "warning");
    }
    document.getElementById('expense-modal').classList.remove('hidden');
  },

  async saveExpense() {
    const concept = document.getElementById('exp-concept').value;
    const amount = Number(document.getElementById('exp-amount').value);
    
    if(!concept || !amount) return app.showAlert("Faltan datos del gasto", "warning");

    if (!localStorage.getItem('isRegisterOpen')) {
        return app.showAlert("⚠️ La caja se encuentra cerrada. No se pueden registrar gastos.", "error");
    }

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
