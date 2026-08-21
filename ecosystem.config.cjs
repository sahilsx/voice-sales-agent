const path = require('path');

module.exports = {
  apps: [
    {
      name: 'voice-platform-backend',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'pipecat-voice-engine',
      script: 'bot.py',
      cwd: path.join(__dirname, 'pipecat-service'),
      interpreter: path.join(__dirname, 'pipecat-service', 'venv', 'bin', 'python'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};
