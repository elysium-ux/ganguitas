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

      // Tabla de Movimientos Unificada (Caja + Ventas + Gastos)
      const tbody = document.getElementById('fin-caja-tbody');
      if (tbody) {
        tbody.innerHTML = '';
        d.cajaHistory.forEach(m => {
          let typeColor = '#d67eb1'; // Default
          if (m.type === 'APERTURA') typeColor = '#74c69d';
          if (m.type === 'VENTA') typeColor = '#4a90e2';
          if (m.type === 'GASTO') typeColor = '#f28482';

          let btnHtml = '';
          if(m.type === 'CORTE') {
               btnHtml = ` <button class="btn" style="padding: 2px 8px; font-size: 0.7rem; width: auto;" onclick="financialsModule.viewCorte('${m.date}', '${m.user}')"><i class="fas fa-search"></i></button>`;
          }

          // Columna de información o diferencia
          let infoHtml = m.note || '---';
          if (m.type === 'CORTE') {
            const diff = Number(m.diff) || 0;
            const diffColor = diff < 0 ? 'var(--danger)' : '#74c69d';
            infoHtml = `<span style="color:${diffColor}; font-weight:bold;">$${diff.toFixed(2)}</span>${btnHtml}`;
          }
          
          tbody.innerHTML += `
            <tr>
              <td style="font-size:0.7rem; white-space:nowrap;">${app.formatDateTime(m.date).split(', ')[1] || app.formatDateTime(m.date)}</td>
              <td style="font-weight:600; color:${typeColor}; font-size:0.75rem;">
                 ${m.type}
              </td>
              <td style="font-weight:bold;">$${Number(m.amount).toFixed(2)}</td>
              <td style="font-size:0.7rem; color:var(--text-muted); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${m.note || ''}">
                ${infoHtml}
              </td>
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

      // Render Tarjetas de Cortes
      const cortesContainer = document.getElementById('fin-cortes-container');
      if (cortesContainer) {
          cortesContainer.innerHTML = '';
          if (d.cortes.length === 0) {
              cortesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No hay cortes registrados en este periodo.</p>';
          } else {
              d.cortes.forEach(c => {
                  const dateObj = app.formatDateTime(c.date);
                  const [datePart, timePart] = dateObj.split(' ');
                  const diffColor = c.difference < 0 ? 'var(--danger)' : '#74c69d';
                  const diffSign = c.difference >= 0 ? '+' : '';

                  cortesContainer.innerHTML += `
                    <div class="glass-panel corte-card" onclick="financialsModule.viewCorte('${c.date}', '${c.user}')" style="cursor: pointer; padding: 1.2rem; border: 1px solid rgba(0,0,0,0.05); transition: transform 0.2s;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                            <div>
                                <h4 style="margin:0; font-size: 1.1rem; color: #333;">Corte ${datePart}</h4>
                                <small style="color: var(--text-muted);">${timePart}</small>
                            </div>
                            <div style="font-size: 1.3rem; font-weight: 800; color: #1a1a1a;">$${c.totalSales.toFixed(2)}</div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem; margin-bottom: 1rem;">
                            <div>Fondo: <strong>$${c.initialAmount.toFixed(2)}</strong></div>
                            <div style="text-align: right;">Ef. Real: <strong>$${c.finalAmount.toFixed(2)}</strong></div>
                            <div>Ef. Esperado: <strong>$${c.expectedCash.toFixed(2)}</strong></div>
                            <div style="text-align: right;">
                                <span style="background: ${c.difference < 0 ? 'rgba(242,132,130,0.1)' : 'rgba(116,198,157,0.1)'}; padding: 2px 8px; border-radius: 12px; font-weight: bold; color: ${diffColor};">
                                    Dif: ${diffSign}$${c.difference.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 15px; font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid #f5f5f5; pt: 8px;">
                            <span><i class="fas fa-university" style="color: #4a90e2;"></i> $${c.salesTrans.toFixed(2)}</span>
                            <span><i class="fas fa-credit-card" style="color: #4a90e2;"></i> $${c.salesCard.toFixed(2)}</span>
                            <span><i class="fas fa-arrow-down" style="color: var(--danger);"></i> Gastos: $${c.totalExpenses.toFixed(2)}</span>
                        </div>
                    </div>
                  `;
              });
          }
      }
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
