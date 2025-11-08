export function Name() { return "Adalight"; }
export function Version() { return "1.0.1"; }
export function Type() { return "serial"; }
export function Publisher() { return "SignalRGB"; }
export function Size() { return [60, 1]; }
export function DefaultPosition() { return [20, 95]; }
export function DefaultScale() { return 1.0; }

export function ControllableParameters(){
  return [
      {"property":"g_iLEDCount", "label":"LED Count", "step":"1", "type":"number","min":"1", "max":"120","default":"60"},
      {"property":"g_iBaudRate", "label":"Baud Rate", "type":"combobox", "values":["115200", "460800", "500000"], "default":"115200"},
      {"property":"g_sPort", "label":"Serial Port", "type":"text", "default":"COM4"}
  ];
}

/* global
controller:readonly
*/
const MAX_LEDS = 120;
let serialPort = "";
let serialBaudRate = 115200;
let ledCount = 60;
let serialInitialized = false;

export function Initialize() {
	try {
		device.log("=== Adalight Initialize Start ===");
		device.setName(controller.name || "Adalight");
		
		device.log("Adding serial feature...");
		device.addFeature("serial");
		
		serialPort = g_sPort || "COM4";
		serialBaudRate = parseInt(g_iBaudRate) || 115200;
		ledCount = Math.min(MAX_LEDS, Math.max(1, parseInt(g_iLEDCount) || 60));
		
		device.log("Initializing Adalight on " + serialPort + " at " + serialBaudRate + " baud");
		device.log("LED Count: " + ledCount);
		
		// Set image
		if (controller && controller.image) {
			device.setImageFromUrl(controller.image);
		}
		
		// Check if serial object exists
		if (typeof serial === 'undefined') {
			device.log("ERROR: Serial object is undefined!");
			serialInitialized = false;
			return;
		}
		
		device.log("Serial object found, attempting to open port...");
		
		// Initialize serial connection
		try {
			serial.open(serialPort, serialBaudRate);
			serialInitialized = true;
			device.log("Serial port opened successfully on " + serialPort);
		} catch (e) {
			device.log("Failed to open serial port: " + e.toString());
			device.log("Error details: " + JSON.stringify(e));
			serialInitialized = false;
		}
		
		device.log("=== Adalight Initialize Complete ===");
	} catch (e) {
		device.log("CRITICAL ERROR in Initialize: " + e.toString());
		device.log("Stack: " + (e.stack || "No stack trace"));
		serialInitialized = false;
	}
}

function SendAdalightData() {
	if (!serialInitialized || typeof serial === 'undefined') {
		return;
	}
	
	try {
		// Adalight protocol:
		// 1. Magic word: "Ada" (3 bytes)
		// 2. High byte of LED count
		// 3. Low byte of LED count
		// 4. Checksum: hi ^ lo ^ 0x55
		// 5. RGB data for each LED (3 bytes per LED)
		
		const numLeds = Math.min(ledCount, MAX_LEDS);
		const hi = (numLeds - 1) >> 8;
		const lo = (numLeds - 1) & 0xFF;
		const checksum = hi ^ lo ^ 0x55;
		
		// Build packet
		const packet = [];
		
		// Magic word
		packet.push(0x41); // 'A'
		packet.push(0x64); // 'd'
		packet.push(0x61); // 'a'
		
		// LED count
		packet.push(hi);
		packet.push(lo);
		
		// Checksum
		packet.push(checksum);
		
		// RGB data for each LED
		// LEDs arranged horizontally: LED 0 = bottom right, LED N-1 = bottom left
		// Size() returns [60, 1], so device is 60 pixels wide and 1 pixel tall
		for (let i = 0; i < numLeds; i++) {
			// Map LED index to device coordinates
			// LED 0 = rightmost (x = numLeds - 1), LED N-1 = leftmost (x = 0)
			// All LEDs are at the bottom (y = 0)
			const x = numLeds - 1 - i; // Reverse mapping: right to left
			const y = 0; // Bottom row
			const color = device.color(x, y);
			
			// Adalight expects RGB order
			packet.push(Math.floor(color.r * 255));
			packet.push(Math.floor(color.g * 255));
			packet.push(Math.floor(color.b * 255));
		}
		
		// Send packet
		if (typeof serial.write === 'function') {
			serial.write(packet);
		} else {
			device.log("ERROR: serial.write is not a function!");
			serialInitialized = false;
		}
		
	} catch (e) {
		device.log("Error sending Adalight data: " + e.toString());
		device.log("Error stack: " + (e.stack || "No stack"));
		serialInitialized = false;
	}
}

function SyncLEDCount() {
	const newCount = Math.min(MAX_LEDS, Math.max(1, parseInt(g_iLEDCount) || 60));
	if (newCount !== ledCount) {
		ledCount = newCount;
		device.log("LED count changed to: " + ledCount);
	}
}

function SyncBaudRate() {
	const newBaud = parseInt(g_iBaudRate) || 115200;
	if (newBaud !== serialBaudRate) {
		serialBaudRate = newBaud;
		device.log("Baud rate changed to: " + serialBaudRate);
		if (serialInitialized) {
			try {
				serial.close();
				serial.open(serialPort, serialBaudRate);
				device.log("Serial port reopened with new baud rate");
			} catch (e) {
				device.log("Failed to reopen serial port: " + e);
				serialInitialized = false;
			}
		}
	}
}

function SyncPort() {
	const newPort = g_sPort || "COM4";
	if (newPort !== serialPort) {
		serialPort = newPort;
		device.log("Serial port changed to: " + serialPort);
		if (serialInitialized) {
			try {
				serial.close();
				serial.open(serialPort, serialBaudRate);
				device.log("Serial port reopened on new port");
			} catch (e) {
				device.log("Failed to reopen serial port: " + e);
				serialInitialized = false;
			}
		} else {
			// Try to initialize if not already initialized
			try {
				serial.open(serialPort, serialBaudRate);
				serialInitialized = true;
				device.log("Serial port opened successfully");
			} catch (e) {
				device.log("Failed to open serial port: " + e);
				serialInitialized = false;
			}
		}
	}
}

function Blackout() {
	if (!serialInitialized) {
		return;
	}
	
	try {
		const numLeds = Math.min(ledCount, MAX_LEDS);
		const hi = (numLeds - 1) >> 8;
		const lo = (numLeds - 1) & 0xFF;
		const checksum = hi ^ lo ^ 0x55;
		
		const packet = [];
		packet.push(0x41); // 'A'
		packet.push(0x64); // 'd'
		packet.push(0x61); // 'a'
		packet.push(hi);
		packet.push(lo);
		packet.push(checksum);
		
		// Send all zeros (black)
		for (let i = 0; i < numLeds; i++) {
			packet.push(0);
			packet.push(0);
			packet.push(0);
		}
		
		serial.write(packet);
	} catch (e) {
		device.log("Error in blackout: " + e);
	}
}

export function Render() {
	try {
		SyncLEDCount();
		SyncBaudRate();
		SyncPort();
		
		if (serialInitialized && typeof serial !== 'undefined') {
			SendAdalightData();
		} else if (!serialInitialized) {
			// Try to reinitialize if not initialized
			if (typeof serial !== 'undefined') {
				try {
					serialPort = g_sPort || "COM4";
					serialBaudRate = parseInt(g_iBaudRate) || 115200;
					serial.open(serialPort, serialBaudRate);
					serialInitialized = true;
					device.log("Serial port reinitialized successfully");
				} catch (e) {
					// Silently fail to avoid spam
				}
			}
		}
	} catch (e) {
		device.log("Error in Render: " + e.toString());
	}
}

export function Shutdown() {
	Blackout();
	if (serialInitialized) {
		try {
			serial.close();
			serialInitialized = false;
		} catch (e) {
			device.log("Error closing serial port: " + e);
		}
	}
}

// -------------------------------------------<( Discovery Service )>--------------------------------------------------

export function DiscoveryService() {
	this.IconUrl = "https://assets.signalrgb.com/brands/adalight/logo.png";
	
	this.Initialize = function() {
		service.log("Adalight Discovery Service Initialized");
	};
	
	this.Update = function() {
		// For serial devices, we can't really discover them automatically
		// User needs to manually add the device with the correct COM port
		// But we can create a default device if none exists
		if (service.controllers.length === 0) {
			const cont = new AdalightController();
			service.addController(cont);
			service.announceController(cont);
		}
	};
	
	this.Discovered = function(value) {
		// Serial devices are typically manually configured
		// This can be used if we implement serial port scanning
	};
}

class AdalightController {
	constructor() {
		this.id = "Adalight-COM4";
		this.name = "Adalight COM4";
		this.port = "COM4";
		this.image = "https://assets.signalrgb.com/devices/brands/adalight/misc/led-strip.png";
		
		service.log("Constructed: " + this.name);
	}
	
	updateWithValue(value, notify=true) {
		if (value.port) {
			this.port = value.port;
		}
		if (value.id) {
			this.id = value.id;
		}
		this.name = "Adalight " + this.port;
		
		if (notify) {
			service.updateController(this);
		}
	}
	
	update() {
		// Update logic if needed
	}
}

export function ImageUrl() {
	return "https://assets.signalrgb.com/devices/brands/adalight/misc/led-strip.png";
}

