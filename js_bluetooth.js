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
    printerModel: localStorage.getItem('printer_model') || 'generic', // 'generic' o 'niimbot'
    isAuthenticated: false,
    pendingRowAck: null, // Control de flujo: resolve() al recibir ACK de fila

    // UUIDs NIIMBOT
    NIIMBOT_SERVICE: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    NIIMBOT_CHAR: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',

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
        LINE_FEED: [0x0A],
        // Barcode commands
        BARCODE_WIDTH: [0x1D, 0x77, 0x02], // Default width 2
        BARCODE_HEIGHT: [0x1D, 0x68, 0x64], // Default height 100 dots
        BARCODE_FONT_BELOW: [0x1D, 0x48, 0x02], // HRI font below barcode
        BARCODE_PRINT_128: [0x1D, 0x6B, 0x49]  // CODE128 (Format B/C auto usually)
    },

    async connect() {
        try {
            console.log("Solicitando dispositivo Bluetooth...");
            
            const filters = this.printerModel === 'niimbot' ? [
                { services: [this.NIIMBOT_SERVICE] },
                { namePrefix: 'B' }, // NIIMBOT B1, B21, etc
                { namePrefix: 'NIIMBOT' }
            ] : [
                { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
                { namePrefix: 'TP' },
                { namePrefix: 'MPT' },
                { namePrefix: 'Printer' },
                { namePrefix: 'MTP' }
            ];

            const optionalServices = this.printerModel === 'niimbot' ? [this.NIIMBOT_SERVICE] : ['000018f0-0000-1000-8000-00805f9b34fb'];

            this.device = await navigator.bluetooth.requestDevice({
                filters: filters,
                optionalServices: optionalServices
            });

            console.log("Conectando al servidor GATT...");
            this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
            this.server = await this.device.gatt.connect();

            console.log("Obteniendo servicio primario...");
            const serviceUUID = this.printerModel === 'niimbot' ? this.NIIMBOT_SERVICE : '000018f0-0000-1000-8000-00805f9b34fb';
            const service = await this.server.getPrimaryService(serviceUUID);
            
            console.log("Obteniendo característica...");
            const characteristics = await service.getCharacteristics();
            this.characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

            if (!this.characteristic) {
                throw new Error("No se encontró una característica de escritura en la impresora.");
            }

            // Iniciar notificaciones para recibir respuestas
            if (this.characteristic.properties.notify) {
                try {
                    await this.characteristic.startNotifications();
                    this.characteristic.addEventListener('characteristicvaluechanged', (e) => this.handlePrinterResponse(e));
                } catch (e) {
                    console.warn("No se pudieron activar notificaciones:", e);
                }
            }

            this.isConnected = true;
            this.isAuthenticated = false; // Resetear hasta recibir ACK 0x01
            this.updateUI();
            
            if (this.printerModel === 'niimbot') {
                console.log("Iniciando Handshake de autenticación (0x01)...");
                await this.sendNiimbotPacket(0x01, [0x01]);
                
                // ESPERA REAL: Bloquear hasta que isAuthenticated sea true
                const authOk = await this.waitUntilAuthenticated(8000);
                
                if (authOk) {
                    console.log("¡Handshake exitoso! Pidiendo batería...");
                    this.sendNiimbotPacket(0x06, [0x01]);
                } else {
                    console.warn("Handshake no confirmado tras espera. Reintente si falla.");
                }
            }

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
        this.isAuthenticated = false;
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
        this.isAuthenticated = false;
        this.isConnected = false;
    },

    async waitUntilAuthenticated(timeoutMs = 10000) {
        const start = Date.now();
        console.log("Esperando confirmación de impresora (Handshake)...");
        while (!this.isAuthenticated && (Date.now() - start) < timeoutMs) {
            await new Promise(r => setTimeout(r, 500));
        }
        return this.isAuthenticated;
    },

    async printTest() {
        if (!this.isConnected) return app.showAlert("Conecta la impresora primero", "warning");
        
        if (this.printerModel === 'niimbot') {
            return this.printNiimbotDiagnosticTest();
        }

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

    // Test diagnóstico: envía barras negras sólidas hardcodeadas (sin canvas, sin JsBarcode)
    // Si esto NO imprime, es problema físico (papel al revés o cabezal)
    // Si ESTO imprime pero la etiqueta no, es problema del canvas
    async printNiimbotDiagnosticTest() {
        try {
            app.showLoader();
            console.log("🔬 Iniciando test diagnóstico NIIMBOT (barras sólidas)...");
            
            const ready = await this.waitUntilAuthenticated(5000);
            if (!ready) {
                await this.sendNiimbotPacket(0x01, [0x01]);
                await this.waitUntilAuthenticated(3000);
            }
            
            // Total: 80 filas (10mm aprox)
            const totalRows = 80;
            
            await this.sendNiimbotPacket(0x23, [0x01]); // label type
            await new Promise(r => setTimeout(r, 200));
            await this.sendNiimbotPacket(0x21, [0x05]); // density max
            await new Promise(r => setTimeout(r, 200));
            await this.sendNiimbotPacket(0x01, [0x00]); // start print
            await new Promise(r => setTimeout(r, 300));
            await this.sendNiimbotPacket(0x03, [0x01]); // start page
            await new Promise(r => setTimeout(r, 200));
            // page size: height=80, copies=1, width=48 bytes
            await this.sendNiimbotPacket(0x13, [0x00, totalRows, 0x01, 0x00, 0x30]);
            await new Promise(r => setTimeout(r, 200));
            
            // Patrón: 10 filas NEGRO, 10 BLANCO, 10 NEGRO, ...
            for (let i = 0; i < totalRows; i++) {
                const isBlack = Math.floor(i / 10) % 2 === 0;
                const rowData = new Uint8Array(48).fill(isBlack ? 0xFF : 0x00);
                await this.sendNiimbotRow(i, Array.from(rowData));
            }
            
            await new Promise(r => setTimeout(r, 300));
            await this.sendNiimbotPacket(0xE3, [0x01]); // end page
            await new Promise(r => setTimeout(r, 200));
            await this.sendNiimbotPacket(0xF3, [0x01]); // end print

            app.hideLoader();
            app.showAlert("Test diagnóstico enviado. ¿Salieron barras negras?", "info");
        } catch (e) {
            console.error("Error en test NIIMBOT:", e);
            app.hideLoader();
            app.showAlert("Error: " + e.message, "error");
        }
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

    async printProductLabel(product) {
        if (!this.isConnected) return app.showAlert("Conecta la impresora primero", "warning");

        if (this.printerModel === 'niimbot') {
            return this.printNiimbotLabel(product);
        }

        try {
            // Lógica para impresora genérica (ESC/POS) - Mantener original
            const name = product.name.substring(0, 24);
            const price = "$" + Number(product.salePrice).toFixed(2);
            const barcode = String(product.barcode);

            let label = [
                ...this.commands.INIT,
                ...this.commands.ALIGN_CENTER,
                ...this.commands.BOLD_ON,
                ...this.encodeText(name + "\n"),
                ...this.encodeText(price + "\n"),
                ...this.commands.BOLD_OFF,
                ...this.commands.LINE_FEED,
                ...this.commands.BARCODE_WIDTH,
                ...this.commands.BARCODE_HEIGHT,
                ...this.commands.BARCODE_FONT_BELOW,
                ...this.commands.BARCODE_PRINT_128,
                barcode.length + 2,
                0x7B, 0x42,
                ...this.encodeText(barcode),
                ...this.commands.LINE_FEED,
                ...this.commands.LINE_FEED,
                ...this.commands.CUT
            ];

            await this.sendData(new Uint8Array(label));
        } catch (e) {
            console.error("Error al imprimir etiqueta:", e);
            app.showAlert("Error al imprimir etiqueta", "error");
        }
    },

    // --- LOGICA ESPECIFICA NIIMBOT ---
    
    async printNiimbotLabel(product) {
        try {
            app.showLoader();
            // 1. Crear Canvas (384px @ 203 DPI = 48mm reales del cabezal de la B1)
            const width = 384; 
            const height = 240; // 30mm aprox
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // Fondo blanco
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            // Borde negro garantizado (diagnóstico visual)
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, 8);    // Borde superior
            ctx.fillRect(0, height - 8, width, 8); // Borde inferior

            // Nombre del producto (Centrado arriba)
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(product.name.substring(0, 24), width / 2, 40);

            // Precio (Grande)
            ctx.font = 'bold 46px Arial';
            ctx.fillText("$" + Number(product.salePrice).toFixed(2), width / 2, 95);

            // Código de Barras usando JsBarcode sobre canvas (más confiable que img)
            try {
                const barcodeCanvas = document.createElement('canvas');
                JsBarcode(barcodeCanvas, String(product.barcode), {
                    format: "CODE128",
                    width: 2,
                    height: 65,
                    displayValue: true,
                    fontSize: 16,
                    margin: 2,
                    background: "#ffffff",
                    lineColor: "#000000"
                });
                // Centrar y dibujar el barcode en el canvas principal
                const bx = Math.max(0, (width - barcodeCanvas.width) / 2);
                ctx.drawImage(barcodeCanvas, bx, 118);
                console.log(`Barcode canvas: ${barcodeCanvas.width}x${barcodeCanvas.height}`);
            } catch (bErr) {
                console.error("JsBarcode error:", bErr);
                // Fallback: barras manuales si JsBarcode falla
                ctx.fillRect(10, 120, width - 20, 80);
            }

            // 2. Convertir Canvas a Bitmap de 1 bit (Array de filas)
            const imageData = ctx.getImageData(0, 0, width, height).data;
            const bitmap = [];
            let nonZeroBytes = 0;
            for (let y = 0; y < height; y++) {
                const row = new Uint8Array(width / 8);
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const r = imageData[idx];
                    const g = imageData[idx + 1];
                    const b = imageData[idx + 2];
                    const avg = (r + g + b) / 3;
                    
                    if (avg < 128) { // Negro
                        row[Math.floor(x / 8)] |= (0x80 >> (x % 8));
                    }
                }
                nonZeroBytes += row.filter(b => b > 0).length;
                bitmap.push(row);
            }
            
            // Diagnóstico: si el bitmap está vacío, alertar
            console.log(`📊 Bitmap: ${bitmap.length} filas, ${nonZeroBytes} bytes con datos (esperado > 0)`);
            if (nonZeroBytes === 0) {
                console.error("⚠️ El bitmap está en BLANCO. El canvas no generó contenido negro.");
            }

            // ── PROTOCOL v3.5 – Añadiendo 0x20 allowPrintClear ──────────
            console.log("🖨️ NIIMBOT v3.5 – Con comando 0x20 (activar cabezal)");

            const ready = await this.waitUntilAuthenticated(5000);
            if (!ready) {
                await this.sendNiimbotPacket(0x01, [0x01]);
                await this.waitUntilAuthenticated(3000);
            }

            await this.sendNiimbotPacket(0x23, [0x01]);   // setLabelType: GAP
            await new Promise(r => setTimeout(r, 300));
            await this.sendNiimbotPacket(0x21, [0x05]);   // setDensity: 5
            await new Promise(r => setTimeout(r, 300));
            await this.sendNiimbotPacket(0x01, [0x01]);   // startPrint
            await new Promise(r => setTimeout(r, 500));
            await this.sendNiimbotPacket(0x03, [0x01]);   // startPagePrint
            await new Promise(r => setTimeout(r, 300));

            // setPageSize: 4 bytes [height_h, height_l, width_bytes, copies]
            const TEST_ROWS = 8;
            await this.sendNiimbotPacket(0x13, [0x00, TEST_ROWS, 0x30, 0x01]);
            await new Promise(r => setTimeout(r, 300));

            // 🔑 COMANDO CRÍTICO: allowPrintClear (0x20)
            // Activa el cabezal térmico - sin este comando la impresora
            // solo avanza el papel sin imprimir nada
            console.log("🔑 Enviando allowPrintClear (0x20)...");
            await this.sendNiimbotPacket(0x20, [0x01]);
            await new Promise(r => setTimeout(r, 500));

            console.log(`📤 Enviando ${TEST_ROWS} filas 0x00 (negro máximo)...`);
            for (let i = 0; i < TEST_ROWS; i++) {
                const blackRow = new Uint8Array(48).fill(0x00);
                await this.sendNiimbotPacket(0x83, [
                    (i >> 8) & 0xFF, i & 0xFF, 1, ...blackRow
                ]);
                await new Promise(r => setTimeout(r, 20));
            }
            await new Promise(r => setTimeout(r, 200));

            await this.sendNiimbotPacket(0xE3, [0x01]);   // endPagePrint
            await new Promise(r => setTimeout(r, 300));
            console.log("⏳ Esperando 5s...");
            await new Promise(r => setTimeout(r, 5000));
            await this.sendNiimbotPacket(0xF3, [0x01]);   // endPrint

            app.hideLoader();
            app.showAlert("TEST v3.5: ¿Salió línea negra (~1mm)?", "info");
        } catch (e) {
            console.error("Error NIIMBOT:", e);
            app.hideLoader();
            app.showAlert("Error: " + e.message, "error");
        }
    },

    async sendNiimbotPacket(cmd, data = []) {
        const len = data.length;
        let packet = [0x55, 0x55, cmd, len, ...data];
        
        let cs = cmd ^ len;
        for (let b of data) cs ^= b;
        packet.push(cs);
        packet.push(0xAA);
        packet.push(0xAA);

        try {
            // SIEMPRE usar writeWithoutResponse (como niimblue/python-niimbot)
            // writeWithResponse causa problemas de fragmentación en paquetes de 58 bytes
            if (this.characteristic.properties.writeWithoutResponse) {
                await this.characteristic.writeValueWithoutResponse(new Uint8Array(packet));
            } else {
                await this.characteristic.writeValueWithResponse(new Uint8Array(packet));
            }
        } catch (e) {
            console.warn("Write error, fallback to withoutResponse:", e);
            await this.characteristic.writeValueWithoutResponse(new Uint8Array(packet));
        }
        
        await new Promise(r => setTimeout(r, 15));
    },

    handlePrinterResponse(event) {
        const value = event.target.value;
        const data = new Uint8Array(value.buffer);
        console.log("Printer Response:", Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // NIIMBOT responde con cmd+1. El ACK del handshake (0x01) llega como 0x02.
        if (data[2] === 0x02) {
            this.isAuthenticated = true;
            console.log("✅ Handshake ACK. Autenticación OK.");
        }
        
        // ACK de fila (0x83 -> 0xD3): resolver el pendingRowAck para control de flujo
        if (data[2] === 0xD3) {
            const rowIdx = (data[3] << 8) | data[4];
            console.log(`✅ Row ACK recibido (fila ~${rowIdx})`);
            if (this.pendingRowAck) {
                const resolve = this.pendingRowAck;
                this.pendingRowAck = null;
                resolve();
            }
        }
        
        // ACK de batería (0x06 -> 0x07)
        if (data[2] === 0x07) {
            console.log("🔋 Batería:", data[4], "%");
        }
    },
    
    // Enviar una fila y esperar el ACK (0xD3) antes de continuar (flow control)
    async sendNiimbotRow(rowIndex, rowData) {
        const ACK_TIMEOUT = 300; // ms antes de continuar sin ACK
        return new Promise((resolve) => {
            this.pendingRowAck = resolve;
            const packetData = [
                (rowIndex >> 8) & 0xFF, rowIndex & 0xFF,
                1, // copies
                ...rowData
            ];
            this.sendNiimbotPacket(0x83, packetData).then(() => {
                // Timeout de seguridad
                setTimeout(() => {
                    if (this.pendingRowAck) {
                        this.pendingRowAck = null;
                        resolve();
                    }
                }, ACK_TIMEOUT);
            });
        });
    },

    setPrinterModel(model) {
        this.printerModel = model;
        localStorage.setItem('printer_model', model);
        this.disconnect(); // Desconectar para aplicar cambios de filtros en siguiente conexión
        this.updateUI();
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
        if (connectBtn) connectBtn.innerText = this.isConnected ? (this.printerModel === 'niimbot' ? 'Conectado (B1)' : 'Impresora Conectada') : 'Conectar Impresora';
        
        const modelSelect = document.getElementById('printer-model-select');
        if (modelSelect) modelSelect.value = this.printerModel;
        
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
