const dataManager = {
  inventoryCache: null,
  financialsCache: null,
  movementsCache: null,
  
  lastFetchTimes: {
    inventory: 0,
    financials: 0,
    movements: 0
  },
  
  cacheDuration: 300000, // 5 minutos de caché para navegación (más agresivo)

  async getInventory(forceRefresh = false) {
    return this._getWithCache("inventory", "getInventory", forceRefresh);
  },

  async getFinancials(filters, forceRefresh = false) {
    // Los filtros rompen la caché simple, así que solo cacheamos si no hay filtros específicos (resumen general)
    if (filters && filters.period !== 'today') return API.send("getFinancialSummary", { filters });
    return this._getWithCache("financials", "getFinancialSummary", forceRefresh, { filters });
  },

  async getMovements(forceRefresh = false) {
    return this._getWithCache("movements", "getRecentMovements", forceRefresh);
  },

  async _getWithCache(key, action, force, params = {}) {
    const now = Date.now();
    const cacheKey = key + 'Cache';
    
    if (this[cacheKey] && !force && (now - this.lastFetchTimes[key] < this.cacheDuration)) {
      return { success: true, data: this[cacheKey], fromCache: true };
    }

    try {
      const res = await API.send(action, params);
      if (res.success && res.data) {
        this[cacheKey] = res.data;
        this.lastFetchTimes[key] = now;
      }
      return res;
    } catch (err) {
      return { success: false, message: "Error cargando " + key };
    }
  },

  invalidateCache() {
    this.inventoryCache = null;
    this.financialsCache = null;
    this.movementsCache = null;
    this.lastFetchTimes = { inventory: 0, financials: 0, movements: 0 };
  }
};
