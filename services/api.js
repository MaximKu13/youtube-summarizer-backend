import config from '../config';

export const getVideoSummary = async (videoUrl) => {
  try {
    const response = await fetch(`${config.apiUrl}/video-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ videoUrl }),
    });

    // Log response status and headers for debugging
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));

    if (!response.ok) {
      let errorMessage = 'Failed to get video summary';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.details || errorMessage;
      } catch (e) {
        console.error('Error parsing error response:', e);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting video summary:', error);
    throw new Error(error.message || 'Failed to connect to the server');
  }
};
