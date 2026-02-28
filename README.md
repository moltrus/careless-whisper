# Careless Whisper
**WhatsApp Activity Monitor via RTT Analysis**

> ⚠️ **DISCLAIMER**: Proof-of-concept for educational and security research purposes only. Demonstrates privacy vulnerabilities in WhatsApp communication.

## Overview

This project is a modified version of the Proof-of-Concept based on the paper **"Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers"** by Gegenhuber et al. (University of Vienna & SBA Research).

**Key modifications:**
- Added full-featured web dashboard (React + Socket.IO) for real-time RTT visualization
- Added CLI dashboard (Blessed) for terminal-based monitoring
- Enhanced detection using `lastKnownPresence` status from Baileys for activity correlation

By analyzing Round-Trip Time (RTT) patterns of WhatsApp message delivery acknowledgments combined with presence indicators, this tool can infer:
- **Device Activity State**: When a device is actively in use vs. idle (standby mode) via RTT analysis
- **Real-Time Activity**: Detect when user is actively composing or recording messages (typing indicators)
- **Usage Patterns**: Activity timeline and behavioral patterns over time
- **Connection Changes**: Transitions between network conditions (WiFi, cellular)
- **Multi-Device Support**: Tracks linked devices via LID (Local ID) mapping

The vulnerability: WhatsApp leaks timing information through MESSAGE ACK receipts and explicit presence signals, which can be exploited to remotely monitor device state and real-time activity without the user's knowledge.

## Installation

```bash
# Clone repository
git clone https://github.com/moltrus/careless-whisper.git
cd careless-whisper

# Install dependencies (includes React client)
npm install
```

**Requirements:** Node.js 20+, npm, WhatsApp account (login via QR code scanning)

## Running the Application

### Option 1: Web Dashboard (Recommended)

Full-featured React interface with real-time RTT graphs and multi-device tracking.

**Terminal 1: Start Backend Server**
```bash
npm run start:server
```
The server will:
- Display a QR code in the terminal
- Connect to WhatsApp via Baileys (WhatsApp Web API wrapper)
- Establish WebSocket connections for real-time updates
- Default to port 3001

Scan the QR code with your WhatsApp mobile app (Linked Devices → Link a Device).

**Terminal 2: Start React Frontend**
```bash
npm run start:client
```
Opens dashboard at `http://localhost:3000`

**Usage:**
1. Scan QR code on the backend terminal with your WhatsApp mobile
2. Navigate to frontend dashboard
3. Enter target phone number (include country code, e.g., `491701234567`)
4. Monitor RTT measurements and inferred device state

### Option 2: CLI Dashboard

Lightweight terminal-based interface with real-time line graphs and status indicators.

```bash
npm start
```

**Usage:**
1. A QR code will display - scan it with your WhatsApp mobile app
2. Enter target phone number when prompted
3. Monitor RTT measurements and device state in a blessed-rendered dashboard

**CLI Features:**
- Real-time RTT vs. Threshold line chart (cyan RTT, red threshold)
- Device status box: JID, Current State, RTT, Average, Threshold, Median
- Event log with timestamped probe activity
- Press `Q` or `Escape` to exit

## Technical Details

### How RTT Tracking Works

The tool sends probe messages and measures time until `CLIENT ACK` (Status 3):

1. **Probe Methods**
   - **Delete Probe** (default): Send silent delete request for non-existent message ID
     - Completely covert - no notification on target device
     - Works across all WhatsApp instances
   - **Reaction Probe**: Send emoji reaction to non-existent message  
     - Slightly less stealthy but more detectable

2. **RTT Measurement**
   - Probe send time → Message ACK received time = RTT
   - RTT reflects device CPU state:
     - **Low RTT (< threshold)**: Device awake and actively processing messages
     - **High RTT (> threshold)**: Device in low-power mode or idle
     - **No response**: Device offline or unreachable

3. **Threshold Calculation**
   - Dynamic threshold = 90% of median RTT over tracking session
   - Adapts to network conditions and device hardware
   - Continuously updated with each measurement

4. **Device State Classification**
   - **🟢 Online**: RTT below threshold
   - **🟡 Standby**: RTT above threshold  
   - **🔴 Offline**: No MESSAGE ACK received (timeout)

5. **Presence Indicators (Real-Time Activity Detection)**
   
   WhatsApp broadcasts presence information for active chats via Baileys:
   - Captures `lastKnownPresence` status from target device
   - Detects when device receives/broadcasts presence updates
   
   These presence signals provide activity detection:
   - **Definitive proof** of device connectivity and activity
   - **Real-time awareness** when user transitions between states
   - **Combined with RTT analysis**: Correlate timing patterns with presence changes
   - **Multi-layered detection**: RTT baseline + presence changes = comprehensive monitoring

## Common Issues & Troubleshooting

| Issue | Solution |
|-------|----------|
| QR code not displaying | Ensure terminal width is sufficient (>80 chars), try maximizing window |
| "Not WhatsApp account" error | Number not registered on WhatsApp, verify number with country code |
| Connection drops repeatedly | Delete `auth_info_baileys/` folder and re-scan QR code |
| High/unstable RTT measurements | Check internet connection, network congestion may affect results |
| Port already in use | Change port in server.ts if 3000/3001 occupied |
| Debug output | Use `npm start -- --debug` to see Baileys library output |
