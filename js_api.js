const API = {
  VERSION: "1.5 (Con Logs)",
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
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: action,
          apiKey: this.KEY,
          ...payload
        })
      });

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error("Respuesta no es JSON:", text);
        return { 
          success: false, 
          message: "La respuesta del servidor no es válida (posible error de redirección). Contenido: " + text.substring(0, 50) + "..."
        };
      }
    } catch (err) {
      console.error("Error API:", err);
      return { success: false, message: "Error de red: " + err.message };
    }
  }
};
