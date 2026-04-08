/**
 * BluetoothPrinter Module
 * Handles Web Bluetooth connectivity and ESC/POS encoding for thermal printers.
 */
const bluetoothPrinter = {
    device: null,
    server: null,
    characteristic: null,
    isConnected: false,
    autoPrint: localStorage.getItem('printer_auto_print') === 'true',

    // ESC/POS Commands
    commands: {
        INIT: [0x1B, 0x40],
        ALIGN_LEFT: [0x1B, 0x61, 0x00],
        ALIGN_CENTER: [0x1B, 0x61, 0x01],
        ALIGN_RIGHT: [0x1B, 0x62, 0x02],
        BOLD_ON: [0x1B, 0x45, 0x01],
        BOLD_OFF: [0x1B, 0x45, 0x00],
        CUT: [0x1D, 0x56, 0x41, 0x03],
        FEED_6: [0x1B, 0x64, 0x06],
        LINE_FEED: [0x0A]
    },

    async connect() {
        try {
            console.log("Solicitando dispositivo Bluetooth...");
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Generic Thermal Printer service
                    { namePrefix: 'TP' },
                    { namePrefix: 'MPT' },
                    { namePrefix: 'Printer' },
                    { namePrefix: 'MTP' }
                ],
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
            });

            console.log("Conectando al servidor GATT...");
            this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
            this.server = await this.device.gatt.connect();

            console.log("Obteniendo servicio primario...");
            const service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            
            console.log("Obteniendo característica...");
            const characteristics = await service.getCharacteristics();
            this.characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

            if (!this.characteristic) {
                throw new Error("No se encontró una característica de escritura en la impresora.");
            }

            this.isConnected = true;
            this.updateUI();
            app.showAlert("Impresora conectada correctamente", "success");
            return true;
        } catch (error) {
            console.error("Error de conexión Bluetooth:", error);
            app.showAlert("Error: " + error.message, "error");
            return false;
        }
    },

    onDisconnected() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.updateUI();
        app.showAlert("Impresora desconectada", "warning");
    },

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
    },

    async printTest() {
        if (!this.isConnected) return app.showAlert("Conecta la impresora primero", "warning");
        
        const data = new Uint8Array([
            ...this.commands.INIT,
            ...this.commands.ALIGN_CENTER,
            ...this.commands.BOLD_ON,
            ...this.encodeText("ELYSIUM POS\n"),
            ...this.commands.BOLD_OFF,
            ...this.encodeText("Prueba de Impresión Exitosa\n"),
            ...this.encodeText("--------------------------------\n"),
            ...this.commands.ALIGN_LEFT,
            ...this.encodeText("Fecha: " + new Date().toLocaleString() + "\n"),
            ...this.encodeText("Estado: Conectado OK\n"),
            ...this.encodeText("\n\n"),
            ...this.commands.FEED_6,
            ...this.commands.CUT
        ]);

        await this.sendData(data);
    },

    async printReceipt(saleData) {
        if (!this.isConnected) {
            console.warn("No hay impresora conectada, saltando impresión.");
            return;
        }

        try {
            let receipt = [
                ...this.commands.INIT,
                ...this.commands.ALIGN_CENTER,
                ...this.commands.BOLD_ON,
                ...this.encodeText("GANGUITAS\n"),
                ...this.commands.BOLD_OFF,
                ...this.encodeText("Ticket de Venta\n"),
                ...this.encodeText("--------------------------------\n"),
                ...this.commands.ALIGN_LEFT,
                ...this.encodeText("Fecha: " + app.formatDateTime(new Date()) + "\n"),
                ...this.encodeText("Atendió: " + app.currentUser.userId + "\n"),
                ...this.encodeText("Metodo: " + saleData.method + "\n"),
                ...this.encodeText("--------------------------------\n"),
                ...this.commands.BOLD_ON,
                ...this.encodeText("Cant  Articulo          Total\n"),
                ...this.commands.BOLD_OFF
            ];

            saleData.items.forEach(item => {
                const name = item.name.substring(0, 18).padEnd(18, ' ');
                const qty = String(item.qty).padStart(2, ' ');
                const total = "$" + (item.qty * item.salePrice).toFixed(2);
                receipt.push(...this.encodeText(`${qty}    ${name} ${total.padStart(8, ' ')}\n`));
            });

            receipt.push(...[
                ...this.encodeText("--------------------------------\n"),
                ...this.commands.ALIGN_RIGHT,
                ...this.commands.BOLD_ON,
                ...this.encodeText("TOTAL: $" + saleData.total.toFixed(2) + "\n"),
                ...this.commands.BOLD_OFF,
                ...this.commands.ALIGN_CENTER,
                ...this.encodeText("\n¡Gracias por su compra!\n"),
                ...this.encodeText("Vuelva pronto\n"),
                ...this.commands.FEED_6,
                ...this.commands.CUT
            ]);

            await this.sendData(new Uint8Array(receipt));
        } catch (e) {
            console.error("Error al imprimir ticket:", e);
            app.showAlert("Error al imprimir ticket", "error");
        }
    },

    encodeText(text) {
        // Basic UTF-8 to Windows-1252/ASCII for common thermal printers (simplified)
        const encoder = new TextEncoder();
        return Array.from(encoder.encode(text));
    },

    async sendData(data) {
        const CHUNK_SIZE = 512; // MTU size usually around 20-512
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await this.characteristic.writeValue(chunk);
        }
    },

    toggleAutoPrint() {
        this.autoPrint = !this.autoPrint;
        localStorage.setItem('printer_auto_print', this.autoPrint);
        this.updateUI();
    },

    updateUI() {
        const statusDot = document.getElementById('printer-status-dot');
        const statusText = document.getElementById('printer-status-text');
        const connectBtn = document.getElementById('printer-connect-btn');
        const autoPrintToggle = document.getElementById('printer-auto-toggle');

        if (statusDot) statusDot.style.background = this.isConnected ? '#74c69d' : '#f28482';
        if (statusText) statusText.innerText = this.isConnected ? 'Conectado' : 'Desconectado';
        if (connectBtn) connectBtn.innerText = this.isConnected ? 'Desconectar' : 'Conectar Impresora';
        if (autoPrintToggle) autoPrintToggle.checked = this.autoPrint;
        
        // Indicador visual en la pantalla principal si existe
        const mainIndicator = document.getElementById('pos-printer-indicator');
        if (mainIndicator) {
            mainIndicator.style.color = this.isConnected ? '#74c69d' : 'var(--text-muted)';
            mainIndicator.title = this.isConnected ? 'Impresora Lista' : 'Impresora Desconectada';
        }
    },

    showSettings() {
        document.getElementById('printer-modal').classList.remove('hidden');
        this.updateUI();
    },

    hideSettings() {
        document.getElementById('printer-modal').classList.add('hidden');
    }
};
