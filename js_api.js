const API = {
  // Intentar obtener de CONFIG (archivo local) o de localStorage (para GitHub)
  get URL() {
    return (typeof CONFIG !== 'undefined' ? CONFIG.API_URL : null) || localStorage.getItem('elysium_api_url') || "";
  },
  get KEY() {
    return (typeof CONFIG !== 'undefined' ? CONFIG.API_KEY : null) || localStorage.getItem('elysium_api_key') || "";
  },

  async send(action, payload = {}) {
    if (!this.URL || !this.KEY) {
      return { success: false, message: "⚠️ Error: Configuración de API no encontrada. Ve a Ajustes." };
    }

    try {
      const response = await fetch(this.URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: action,
          apiKey: this.KEY,
          ...payload
        })
      });

      const result = await response.json();
      return result;
    } catch (err) {
      console.error("Error API:", err);
      return { success: false, message: "Error de red: " + err.message };
    }
  }
};
