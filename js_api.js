const API = {
  // Asegúrate de que esta URL proviene de tu Apps Script implementado
  URL: CONFIG.API_URL,
  KEY: CONFIG.API_KEY,

  async send(action, payload = {}) {
    try {
      const response = await fetch(this.URL, {
        method: 'POST',
        // 'text/plain' evita el preflight CORS complejo que interfiere con Apps Script
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
