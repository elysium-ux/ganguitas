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
        // Si el texto parece ser la respuesta de doGet (error común de redirección en GAS)
        if (text.includes("Usa método POST")) {
          console.warn("⚠️ Detectada redirección silenciosa. Reintentando con configuración de red forzada...");
          return {
            success: false,
            message: "Error de sincronización con Google Apps Script. Por favor, refresca la página."
          };
        }
        console.error("Respuesta no es JSON:", text);
        return {
          success: false,
          message: "Respuesta inválida del servidor. Código: API_NON_JSON"
        };
      }
    } catch (err) {
      console.error("Error API:", err);
      return { success: false, message: "Error de red: " + err.message };
    }
  }
};
