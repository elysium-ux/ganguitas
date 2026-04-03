const loginModule = {
  async submit() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const errorMsg = document.getElementById('login-error');
    
    // 1. Verificar Bloqueo Temporal
    const now = Date.now();
    const lockoutTime = Number(localStorage.getItem('elysium_lockout')) || 0;
    
    if (now < lockoutTime) {
      const minutesLeft = Math.ceil((lockoutTime - now) / 60000);
      errorMsg.innerText = `⚠️ Sistema bloqueado. Intenta de nuevo en ${minutesLeft} min.`;
      errorMsg.style.display = "block";
      return;
    }

    if (!user || !pass) {
      errorMsg.innerText = "Por favor completa ambos campos.";
      errorMsg.style.display = "block";
      return;
    }

    errorMsg.style.display = "none";
    app.showLoader();

    // 2. Enviar a la API
    const res = await API.send("validateUser", { username: user, password: pass });
    
    app.hideLoader();
    
    if (res.success) {
      // Éxito: Limpiar intentos y entrar
      localStorage.removeItem('elysium_attempts');
      localStorage.removeItem('elysium_lockout');
      localStorage.setItem('elysium_role', res.role);
      localStorage.setItem('elysium_user', user);
      app.applyPermissions(res.role, user);
    } else {
      // Error: Manejo de intentos fallidos
      let attempts = Number(localStorage.getItem('elysium_attempts')) || 0;
      attempts++;
      
      if (attempts >= 3) {
        const fiveMinutes = 5 * 60 * 1000;
        localStorage.setItem('elysium_lockout', Date.now() + fiveMinutes);
        localStorage.setItem('elysium_attempts', 0);
        errorMsg.innerText = "⛔ Demasiados intentos fallidos. Bloqueado por 5 min.";
      } else {
        localStorage.setItem('elysium_attempts', attempts);
        errorMsg.innerText = `Credenciales incorrectas. Intentos: ${attempts}/3`;
      }
      errorMsg.style.display = "block";
    }
  }
};
