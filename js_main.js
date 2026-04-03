const app = {
  currentUserRole: null,
  currentUser: null,

  async init() {
    // Inject components into DOM
    await this.injectViews();
    
    // Check if session exists
    const savedRole = localStorage.getItem('elysium_role');
    const savedUser = localStorage.getItem('elysium_user');
    if (savedRole && savedUser) {
      this.applyPermissions(savedRole, savedUser);
    } else {
      this.switchView('login');
    }
  },

  async injectViews() {
    // Lee dinámicamente o puedes quemarlas. Ya que estamos locales, usaremos fetch nativo para inyectar si usas Live Server
    // Si da cors file://, el usuario debe abrir index en un servidor
    const views = ['login', 'pos', 'inventory', 'add-item', 'financials'];
    for (let view of views) {
      const section = document.getElementById(`view-${view}`);
      if(section && section.dataset.file) {
        try {
          const res = await fetch(section.dataset.file);
          if (res.ok) {
            section.innerHTML = await res.text();
          }
        } catch (e) {
          console.warn(`Could not load ${section.dataset.file} automatically. If you're opening index.html directly (without a server), HTML partials logic won't work in standard browsers.`);
        }
      }
    }
  },

  showLoader() {
    document.getElementById('loader').classList.remove('hidden');
  },

  hideLoader() {
    document.getElementById('loader').classList.add('hidden');
  },

  switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
      v.classList.add('hidden');
    });

    const target = document.getElementById(`view-${viewId}`);
    if(target) {
      target.classList.remove('hidden');
      target.classList.add('active');
    }

    // Nav bar state
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    let activeBtnId = viewId;
    if (viewId === 'add-item') activeBtnId = 'add';
    if (viewId === 'inventory') activeBtnId = 'inv';
    if (viewId === 'financials') activeBtnId = 'fin';
    
    const activeBtn = document.getElementById(`nav-${activeBtnId}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (viewId === 'login') {
      document.getElementById('top-nav').classList.add('hidden');
    } else {
      document.getElementById('top-nav').classList.remove('hidden');
    }

    if (viewId === 'inventory' && typeof inventoryModule !== 'undefined') inventoryModule.loadInventory(false);
    if (viewId === 'add-item' && typeof addItemModule !== 'undefined') addItemModule.loadRecentItems();
    if (viewId === 'financials' && typeof financialsModule !== 'undefined') financialsModule.loadSummary();
    if (viewId === 'pos' && typeof posModule !== 'undefined') posModule.loadCatalog(false);
  },

  logout() {
    const modal = document.getElementById('logout-modal');
    if (modal) modal.classList.remove('hidden');
  },

  confirmLogout() {
    const modal = document.getElementById('logout-modal');
    if (modal) modal.classList.add('hidden');

    this.currentUserRole = null;
    this.currentUser = null;
    localStorage.removeItem('elysium_role');
    localStorage.removeItem('elysium_user');
    this.switchView('login');
    
    const u = document.getElementById('login-user');
    const p = document.getElementById('login-pass');
    if(u) u.value = '';
    if(p) p.value = '';
  },

  applyPermissions(role, username) {
    this.currentUserRole = role;
    this.currentUser = { userId: username, role: role };
    const d = document.getElementById('user-display');
    if(d) d.innerText = `Rol: ${role} (${username})`;

    
    const btnPos = document.getElementById('nav-pos');
    const btnInv = document.getElementById('nav-inv');
    const btnAdd = document.getElementById('nav-add');
    const btnFin = document.getElementById('nav-fin');
    
    if(btnPos) btnPos.style.display = 'inline-block';
    if(btnInv) btnInv.style.display = 'inline-block';
    if(btnAdd) btnAdd.style.display = 'inline-block';
    if(btnFin) btnFin.style.display = 'inline-block';

    if (role === 'Cajero') {
      if(btnInv) btnInv.style.display = 'none';
      if(btnAdd) btnAdd.style.display = 'none';
      if(btnFin) btnFin.style.display = 'none';
      this.switchView('pos');
    } else if (role === 'Inventario') {
      if(btnPos) btnPos.style.display = 'none';
      if(btnFin) btnFin.style.display = 'none';
      this.switchView('inventory');
    } else if (role === 'Admin') {
      this.switchView('pos');
    }
  },

  showAlert(message, type = 'success') {
    const modal = document.getElementById('alert-modal');
    const icon = document.getElementById('alert-icon');
    const title = document.getElementById('alert-title');
    const msg = document.getElementById('alert-message');
    const box = document.getElementById('alert-content-box');

    if (!modal) return;

    msg.innerText = message;
    
    if (type === 'error') {
      icon.innerHTML = '<i class="fas fa-times-circle" style="color: var(--danger);"></i>';
      title.innerText = '¡Ups! Algo salió mal';
      box.style.borderColor = 'var(--danger)';
    } else if (type === 'warning') {
      icon.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: orange;"></i>';
      title.innerText = 'Atención';
      box.style.borderColor = 'orange';
    } else {
      icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
      title.innerText = '¡Excelente!';
      box.style.borderColor = 'var(--success)';
    }

    modal.classList.remove('hidden');
  },

  closeAlert() {
    const modal = document.getElementById('alert-modal');
    if (modal) modal.classList.add('hidden');
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '---';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).slice(-2);
        
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        
        hours = hours % 12;
        hours = hours ? hours : 12;
        
        return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    } catch(e) { return dateStr; }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  app.init();
  
  // Registro de Service Worker para PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker Registrado!', reg))
        .catch(err => console.error('Error al registrar SW:', err));
    });
  }
});
