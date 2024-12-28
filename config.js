const config = {
  apiUrl: process.env.NODE_ENV === 'production' 
    ? 'youtube-summarizer-backend-psi.vercel.app' // Replace with your actual Vercel backend URL
    : 'http://localhost:3000/api'
};

export default config;
