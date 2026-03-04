/**
 * Careless Whisper - Web Server (WhatsApp Only)
 *
 * HTTP server with Socket.IO for real-time tracking visualization.
 * Provides REST API and WebSocket interface for the React frontend.
 *
 * For educational and research purposes only.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import { WhatsAppTracker, ProbeMethod } from './tracker.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});

let sock: any;
let isWhatsAppConnected = false;
let globalProbeMethod: ProbeMethod = 'delete'; // Default to delete method
let currentWhatsAppQr: string | null = null; // Store current QR code for new clients
let reconnectAttempt = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_BACKOFF = 2000; // 2 seconds

interface TrackerEntry {
    tracker: WhatsAppTracker;
    platform: 'whatsapp';
}

const trackers: Map<string, TrackerEntry> = new Map(); // JID -> Tracker entry

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        sock = makeWASocket({
            auth: state,
            version: [2, 3000, 1033893291],
            logger: pino({ level: 'error' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            syncFullHistory: false,
            retryRequestDelayMs: 200,
            generateHighQualityLinkPreview: false,
        });

        sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
            console.log('QR Code generated');
            reconnectAttempt = 0; // Reset on successful QR generation
            currentWhatsAppQr = qr; // Store the QR code
            io.emit('qr', qr);
        }

        if (connection === 'close') {
            isWhatsAppConnected = false;
            currentWhatsAppQr = null; // Clear QR on close
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            console.log(`Connection closed [Status: ${statusCode}]. Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
                const backoffTime = INITIAL_BACKOFF * Math.pow(2, reconnectAttempt);
                reconnectAttempt++;
                console.log(`Attempting reconnect (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS}) in ${backoffTime}ms...`);
                setTimeout(() => connectToWhatsApp(), backoffTime);
            } else if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
                console.error('Max reconnection attempts reached. Please restart the server.');
            }
        } else if (connection === 'open') {
            isWhatsAppConnected = true;
            reconnectAttempt = 0; // Reset on successful connection
            currentWhatsAppQr = null; // Clear QR on successful connection
            console.log('Connected to WhatsApp');
            io.emit('connection-open');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.error', (error: any) => {
        console.error('Connection error:', error?.message || error);
    });

    sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }: any) => {
        console.log(`[SESSION] History sync - Chats: ${chats.length}, Contacts: ${contacts.length}, Messages: ${messages.length}, Latest: ${isLatest}`);
    });

    sock.ev.on('messages.update', (updates: any) => {
        for (const update of updates) {
                console.log(`[MSG UPDATE] JID: ${update.key.remoteJid}, ID: ${update.key.id}, Status: ${update.update.status}, FromMe: ${update.key.fromMe}`);
            }
        });
    } catch (error) {
        console.error('Fatal error during WhatsApp connection setup:', error);
        const backoffTime = INITIAL_BACKOFF * Math.pow(2, reconnectAttempt);
        reconnectAttempt++;
        if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            console.log(`Retrying in ${backoffTime}ms...`);
            setTimeout(() => connectToWhatsApp(), backoffTime);
        }
    }
}

connectToWhatsApp();

io.on('connection', (socket) => {
    console.log('Client connected');

    // Send current WhatsApp QR code if available
    if (currentWhatsAppQr) {
        socket.emit('qr', currentWhatsAppQr);
    }

    if (isWhatsAppConnected) {
        socket.emit('connection-open');
    }

    // Send current probe method to client
    socket.emit('probe-method', globalProbeMethod);

    // Handle request to get tracked contacts (for page refresh)
    socket.on('get-tracked-contacts', () => {
        const trackedContacts = Array.from(trackers.entries()).map(([id, entry]) => ({
            id,
            platform: entry.platform
        }));
        socket.emit('tracked-contacts', trackedContacts);
    });

    // Add contact - WhatsApp only
    socket.on('add-contact', async (data: string | { number: string; platform: 'whatsapp' }) => {
        const { number } = typeof data === 'string'
            ? { number: data }
            : data;

        console.log(`Request to track on WhatsApp: ${number}`);
        const cleanNumber = number.replace(/\D/g, '');
        const targetJid = cleanNumber + '@s.whatsapp.net';

        if (trackers.has(targetJid)) {
            socket.emit('error', { jid: targetJid, message: 'Already tracking this contact' });
            return;
        }

        try {
            const results = await sock.onWhatsApp(targetJid);
            const result = results?.[0];

            if (result?.exists) {
                const tracker = new WhatsAppTracker(sock, result.jid);
                tracker.setProbeMethod(globalProbeMethod);
                trackers.set(result.jid, { tracker, platform: 'whatsapp' });

                tracker.onUpdate = (updateData) => {
                    io.emit('tracker-update', {
                        jid: result.jid,
                        platform: 'whatsapp',
                        ...updateData
                    });
                };

                tracker.startTracking();

                const ppUrl = await tracker.getProfilePicture();

                let contactName = cleanNumber;
                try {
                    const contactInfo = await sock.onWhatsApp(result.jid);
                    if (contactInfo && contactInfo[0]?.notify) {
                        contactName = contactInfo[0].notify;
                    }
                } catch (err) {
                    console.log('[NAME] Could not fetch contact name, using number');
                }

                socket.emit('contact-added', {
                    jid: result.jid,
                    number: cleanNumber,
                    platform: 'whatsapp'
                });

                io.emit('profile-pic', { jid: result.jid, url: ppUrl });
                io.emit('contact-name', { jid: result.jid, name: contactName });
            } else {
                socket.emit('error', { jid: targetJid, message: 'Number not on WhatsApp' });
            }
        } catch (err) {
            console.error(err);
            socket.emit('error', { jid: targetJid, message: 'Verification failed' });
        }
    });

    socket.on('remove-contact', (jid: string) => {
        console.log(`Request to stop tracking: ${jid}`);
        const entry = trackers.get(jid);
        if (entry) {
            entry.tracker.stopTracking();
            trackers.delete(jid);
            socket.emit('contact-removed', jid);
        }
    });

    socket.on('set-probe-method', (method: ProbeMethod) => {
        console.log(`Request to change probe method to: ${method}`);
        if (method !== 'delete' && method !== 'reaction') {
            socket.emit('error', { message: 'Invalid probe method' });
            return;
        }

        globalProbeMethod = method;

        for (const entry of trackers.values()) {
            if (entry.platform === 'whatsapp') {
                entry.tracker.setProbeMethod(method);
            }
        }

        io.emit('probe-method', method);
        console.log(`Probe method changed to: ${method}`);
    });

    socket.on('set-rate-limit', (rate: number) => {
        // Rate is in messages per second
        const interval = Math.floor(1000 / Math.max(0.1, Math.min(rate, 5))); // Clamp between 0.1/s and 5/s
        console.log(`Request to change rate limit to: ${rate}/s (${interval}ms)`);
        
        for (const entry of trackers.values()) {
            if (entry.platform === 'whatsapp') {
                entry.tracker.setProbeInterval(interval);
            }
        }
        
        io.emit('rate-limit-updated', rate);
    });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
