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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getAudioBuffer } from './services/tts/elevenLabsService.js';
import { warmUpOllama } from './services/ai/conversation.js';

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve Web Dashboard Static Files
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve ElevenLabs generated audio directly from RAM memory (with TTL & size cap)
app.get('/audio/:audioId', (req, res) => {
    const audioId = req.params.audioId;
    const buffer = getAudioBuffer(audioId);
    if (!buffer) return res.status(404).send('Audio expired');
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length });
    res.send(buffer);
});

// Mount Routes
app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/users', userRoutes);
app.use('/api', apiRoutes);
app.use('/', webhookRoutes);

// Centralized Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

let server = null;
let ngrokListener = null;

async function startServer() {
    console.log('=====================================================');
    console.log('  VoiceAI Enterprise Sales Agent Platform (v2.0)    ');
    console.log('=====================================================');

    await connectDB();
    await seedDefaultOrgAndAdmin();

    const PORT = env.PORT;
    server = app.listen(PORT, async () => {
        console.log(`✓ Express Voice Platform running on http://localhost:${PORT}`);

        try {
            ngrokListener = await ngrok.forward({
                addr: PORT,
                authtoken: process.env.NGROK_AUTHTOKEN,
                request_header_add: ['ngrok-skip-browser-warning:true']
            });
            const publicUrl = ngrokListener.url();
            app.set('publicTunnelUrl', publicUrl);
            console.log(`✓ Public Ngrok Security Tunnel Established: ${publicUrl}`);
        } catch (err) {
            console.warn(`⚠️  Ngrok Tunnel Notice: ${err.message || err}`);
            app.set('publicTunnelUrl', `http://localhost:${PORT}`);
        }
    });

    warmUpOllama().catch(() => {});
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

    await disconnectDB();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer().catch(err => {
    console.error('❌ Server startup failure:', err);
    process.exit(1);
});