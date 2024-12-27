const config = {
  apiUrl: process.env.NODE_ENV === 'production' 
    ? 'https://your-vercel-app-name.vercel.app/api' // Replace with your actual Vercel backend URL
    : 'http://localhost:3000/api'
};

export default config;
