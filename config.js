// config.js
const config = {
  development: {
    apiUrl: 'http://localhost:3000/api'  // Local development
  },
  production: {
    apiUrl: 'youtube-summarizer-backend-psi.vercel.app'  // Vercel deployment URL
  }
};

export default {
  apiUrl: process.env.NODE_ENV === 'production' 
    ? config.production.apiUrl 
    : config.development.apiUrl
};
