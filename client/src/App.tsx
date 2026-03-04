import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';

// Create socket with autoConnect disabled so we can add listeners before connecting
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
export const socket: Socket = io(API_URL, { autoConnect: false });

export type Platform = 'whatsapp';

export interface ConnectionState {
    whatsapp: boolean;
    whatsappQr: string | null;
}

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [connectionState, setConnectionState] = useState<ConnectionState>({
        whatsapp: false,
        whatsappQr: null
    });

    const isAnyPlatformReady = connectionState.whatsapp;

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
            setConnectionState({
                whatsapp: false,
                whatsappQr: null
            });
        }

        function onWhatsAppConnectionOpen() {
            setConnectionState(prev => ({ ...prev, whatsapp: true, whatsappQr: null }));
        }

        function onWhatsAppQr(qr: string) {
            console.log('[WHATSAPP] Received QR code');
            setConnectionState(prev => ({ ...prev, whatsappQr: qr }));
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('qr', onWhatsAppQr);
        socket.on('connection-open', onWhatsAppConnectionOpen);

        // Now connect after listeners are set up
        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('qr', onWhatsAppQr);
            socket.off('connection-open', onWhatsAppConnectionOpen);
        };
    }, []);

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900">Careless Whisper</h1>
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-gray-600">{isConnected ? 'Server Connected' : 'Disconnected'}</span>
                        {isConnected && (
                            <>
                                <div className="w-px h-4 bg-gray-300 mx-2" />
                                <div className={`w-3 h-3 rounded-full ${connectionState.whatsapp ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                <span className="text-sm text-gray-600">WhatsApp</span>
                            </>
                        )}
                    </div>
                </header>

                <main>
                    {!isAnyPlatformReady ? (
                        <Login connectionState={connectionState} />
                    ) : (
                        <Dashboard connectionState={connectionState} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
