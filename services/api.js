import config from '../config';

export const getVideoSummary = async (videoUrl) => {
  try {
    const response = await fetch(`${config.apiUrl}/video-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get video summary');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting video summary:', error);
    throw error;
  }
};
