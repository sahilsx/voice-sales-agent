module.exports = {
  apps: [
    {
      name: 'voice-platform-backend',
      script: 'index.js',
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
      script: './pipecat-service/bot.py',
      interpreter: './pipecat-service/venv/bin/python',
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
