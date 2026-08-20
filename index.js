import express from 'express';
import path from 'path';
import ngrok from '@ngrok/ngrok';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { seedDefaultOrgAndAdmin } from './controllers/authController.js';
import authRoutes from './routes/auth.routes.js';
import apiRoutes from './routes/api.routes.js';
import superAdminRoutes from './routes/superAdmin.routes.js';
import userRoutes from './routes/user.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import healthRoutes from './routes/health.routes.js';
import internalRoutes from './routes/internal.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { getAudioBuffer } from './services/tts/elevenLabsService.js';
import { warmUpOllama } from './services/ai/conversation.js';

const app = express();

// Trust reverse proxy (Ngrok / Nginx / cloud load balancers) for accurate rate limiting and IP resolution
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve Web Dashboard Static Files
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve ElevenLabs generated audio directly from RAM memory (with TTL & size cap)
app.get('/audio/:audioId', (req, res) => {
    const audioId = req.params.audioId;
    const buffer = getAudioBuffer(audioId);
    if (!buffer) return res.status(404).send('Audio expired');
    res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
        'Accept-Ranges': 'bytes',
        'ngrok-skip-browser-warning': 'true'
    });
    res.send(buffer);
});

// Mount Routes
app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api', apiRoutes);
app.use('/', webhookRoutes);

// Centralized Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

let server = null;
let ngrokListener = null;
let pipecatProcess = null;

function isPortInUse(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(400);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

let isLaunchingPipecat = false;

async function ensurePipecatServiceRunning() {
    if (!env.USE_PIPECAT_FOR_CALLS || isLaunchingPipecat) return;

    try {
        const res = await fetch('http://127.0.0.1:8765/health', { signal: AbortSignal.timeout(500) });
        if (res.ok) {
            console.log('✓ Pipecat Voice Orchestration Engine active on ws://localhost:8765/ws/twilio');
            return;
        }
    } catch (_) {}

    isLaunchingPipecat = true;
    try {
        console.log('⚡ Launching Pipecat Voice Orchestration Engine (ws://localhost:8765/ws/twilio)...');

        const venvPython = path.join(process.cwd(), 'pipecat-service', 'venv', 'bin', 'python');
        const systemPython = 'python3';
        const pythonBin = fs.existsSync(venvPython) ? venvPython : systemPython;
        const botScript = path.join(process.cwd(), 'pipecat-service', 'bot.py');

        pipecatProcess = spawn(pythonBin, [botScript], {
            stdio: 'inherit',
            cwd: path.join(process.cwd(), 'pipecat-service'),
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        pipecatProcess.on('error', (err) => {
            console.warn('⚠️  Notice launching Pipecat process:', err.message);
        });

        pipecatProcess.on('exit', (code, signal) => {
            console.warn(`⚠️  Pipecat Python engine exited (code: ${code}, signal: ${signal})`);
            pipecatProcess = null;
        });

        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 200));
            try {
                const h = await fetch('http://127.0.0.1:8765/health', { signal: AbortSignal.timeout(300) });
                if (h.ok) {
                    console.log('✓ Pipecat Engine ready & listening on port 8765!');
                    break;
                }
            } catch (_) {}
        }
    } finally {
        isLaunchingPipecat = false;
    }
}

async function establishNgrokTunnel(PORT, retries = 3) {
    if (env.PUBLIC_TUNNEL_URL || process.env.PUBLIC_TUNNEL_URL) {
        const publicUrl = env.PUBLIC_TUNNEL_URL || process.env.PUBLIC_TUNNEL_URL;
        console.log(`✓ Using Configured Production Public URL: ${publicUrl}`);
        return { listener: null, publicUrl };
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await ngrok.disconnect().catch(() => {});
            if (attempt > 1) {
                await new Promise(r => setTimeout(r, 800));
            }
            const listener = await ngrok.forward({
                addr: PORT,
                authtoken: process.env.NGROK_AUTHTOKEN,
                request_header_add: ['ngrok-skip-browser-warning:true']
            });
            const publicUrl = listener.url();
            console.log(`✓ Public Ngrok Security Tunnel Established: ${publicUrl}`);
            return { listener, publicUrl };
        } catch (err) {
            if (attempt < retries) {
                console.warn(`⚠️  Ngrok tunnel setup retry ${attempt}/${retries}...`);
            } else {
                try {
                    const apiResp = await fetch('http://127.0.0.1:4040/api/tunnels');
                    if (apiResp.ok) {
                        const apiData = await apiResp.json();
                        const existingUrl = apiData?.tunnels?.[0]?.public_url;
                        if (existingUrl) {
                            console.log(`✓ Ngrok Tunnel Reused (already online): ${existingUrl}`);
                            return { listener: null, publicUrl: existingUrl };
                        }
                    }
                } catch (_) {}
                console.warn(`⚠️  Ngrok Tunnel Notice: ${err.message || err}`);
                return { listener: null, publicUrl: `http://localhost:${PORT}` };
            }
        }
    }
}

async function startServer() {
    console.log('=====================================================');
    console.log('  VoiceAI Enterprise Sales Agent Platform (v2.0)    ');
    console.log('=====================================================');

    await connectDB();
    await seedDefaultOrgAndAdmin();

    const PORT = env.PORT;
    server = app.listen(PORT, async () => {
        console.log(`✓ Express Voice Platform running on http://localhost:${PORT}`);

        const tunnelResult = await establishNgrokTunnel(PORT);
        ngrokListener = tunnelResult.listener;
        app.set('publicTunnelUrl', tunnelResult.publicUrl);
    });

    // Proxy WebSocket upgrade connections (e.g. /ws/twilio) from Ngrok to Pipecat service (port 8765)
    server.on('upgrade', async (request, socket, head) => {
        try {
            const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : '';
            if (pathname.startsWith('/ws')) {
                if (!env.USE_PIPECAT_FOR_CALLS) {
                    socket.destroy();
                    return;
                }

                console.log(`📍 [STEP 2] Twilio WebSocket Upgrade Request received for ${pathname}`);

                await ensurePipecatServiceRunning();

                const clientWsServer = new WebSocketServer({ noServer: true });
                clientWsServer.handleUpgrade(request, socket, head, (clientSocket) => {
                    console.log(`✓ [STEP 2] Sent 101 Switching Protocols to Twilio for ${pathname}`);
                    const targetWsUrl = `ws://127.0.0.1:8765${request.url}`;
                    console.log(`📍 [STEP 3] Connecting target WebSocket proxy to Pipecat at ${targetWsUrl}`);

                    function connectTarget(retriesLeft = 2) {
                        const targetWs = new WebSocket(targetWsUrl);

                        targetWs.on('open', () => {
                            console.log('✓ [STEP 3] Target WebSocket connected & bridged to Pipecat Python engine.');
                            clientSocket.on('message', (msg) => {
                                if (targetWs.readyState === WebSocket.OPEN) targetWs.send(msg);
                            });
                            targetWs.on('message', (msg) => {
                                if (clientSocket.readyState === WebSocket.OPEN) clientSocket.send(msg);
                            });
                        });

                        clientSocket.on('close', () => {
                            if (targetWs.readyState === WebSocket.OPEN) targetWs.close();
                        });
                        targetWs.on('close', () => {
                            if (clientSocket.readyState === WebSocket.OPEN) clientSocket.close();
                        });
                        clientSocket.on('error', () => {
                            targetWs.close();
                        });
                        targetWs.on('error', (err) => {
                            if (retriesLeft > 0 && err.code === 'ECONNREFUSED') {
                                console.log('🔄 Target WebSocket refused, retrying bridge connection...');
                                setTimeout(() => connectTarget(retriesLeft - 1), 300);
                            } else {
                                console.error('❌ Pipecat Target WebSocket error:', err.message);
                                clientSocket.close();
                            }
                        });
                    }

                    connectTarget();
                });
            } else {
                socket.destroy();
            }
        } catch (err) {
            console.error('❌ WebSocket upgrade handler error:', err.message);
            socket.destroy();
        }
    });

    warmUpOllama().catch(() => {});
    ensurePipecatServiceRunning().catch(() => {});
}

// Graceful Shutdown Handling (SIGINT / SIGTERM)
async function gracefulShutdown(signal) {
    console.log(`\n⚠️  Received ${signal}. Initiating graceful shutdown...`);

    if (server) {
        server.close(() => {
            console.log('✓ Express HTTP server closed.');
        });
    }

    if (ngrokListener) {
        try {
            await ngrokListener.close();
            console.log('✓ Ngrok tunnel closed.');
        } catch (err) {
            console.warn('Notice closing Ngrok:', err.message);
        }
    }

    if (pipecatProcess) {
        try {
            pipecatProcess.kill('SIGINT');
            console.log('✓ Pipecat process stopped.');
        } catch (_) {}
    }

    await disconnectDB();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', async () => {
    if (pipecatProcess) {
        try { pipecatProcess.kill('SIGINT'); } catch (_) {}
    }
    process.kill(process.pid, 'SIGUSR2');
});

startServer().catch(err => {
    console.error('❌ Server startup failure:', err);
    process.exit(1);
});