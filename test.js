console.log('Testing server dependencies...');

try {
  require('express');
  console.log('✓ Express loaded successfully');
} catch (e) {
  console.error('✗ Failed to load Express:', e);
}

try {
  require('youtube-transcript');
  console.log('✓ youtube-transcript loaded successfully');
} catch (e) {
  console.error('✗ Failed to load youtube-transcript:', e);
}

try {
  require('openai');
  console.log('✓ openai loaded successfully');
} catch (e) {
  console.error('✗ Failed to load openai:', e);
}

try {
  require('dotenv').config();
  console.log('✓ dotenv loaded successfully');
  console.log('Environment variables:', {
    PORT: process.env.PORT || '(default)',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '(set)' : '(not set)'
  });
} catch (e) {
  console.error('✗ Failed to load dotenv:', e);
}