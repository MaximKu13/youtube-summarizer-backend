const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');
const OpenAI = require('openai');
const he = require('he');
const axios = require('axios');
require('dotenv').config();

const app = express();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function fetchAllTranscripts(videoId) {
    try {
        // First try to get list of available transcripts
        const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
        const html = response.data;
        
        // Extract caption tracks data
        const captionTrackMatch = html.match(/"captions":\s*({[^}]+})/);
        if (!captionTrackMatch) {
            throw new Error('No captions data found');
        }

        const captionsData = JSON.parse(captionTrackMatch[1]);
        if (!captionsData.playerCaptionsTracklistRenderer?.captionTracks) {
            throw new Error('No caption tracks available');
        }

        const tracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
        console.log('Available caption tracks:', tracks);

        // Try to find English transcript first
        let selectedTrack = tracks.find(track => track.languageCode === 'en');
        
        // If no English, take the first available track
        if (!selectedTrack && tracks.length > 0) {
            selectedTrack = tracks[0];
            console.log(`No English transcript found, using ${selectedTrack.languageCode}`);
        }

        if (!selectedTrack) {
            throw new Error('No suitable transcript found');
        }

        // Fetch the actual transcript
        const transcriptResponse = await axios.get(selectedTrack.baseUrl);
        const transcriptData = transcriptResponse.data;

        // Parse the transcript data
        const transcript = [];
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(transcriptData, 'text/xml');
        const textNodes = xmlDoc.getElementsByTagName('text');

        for (const node of textNodes) {
            transcript.push({
                text: node.textContent,
                start: parseFloat(node.getAttribute('start')),
                duration: parseFloat(node.getAttribute('dur'))
            });
        }

        return {
            transcript,
            language: selectedTrack.languageCode,
            isGenerated: selectedTrack.kind === 'asr', // asr means auto-generated
            availableLanguages: tracks.map(track => ({
                code: track.languageCode,
                name: track.name?.simpleText
            }))
        };
    } catch (error) {
        console.error('Transcript fetch error:', error);
        throw error;
    }
}

app.post('/api/video-summary', async (req, res) => {
    console.log('Received request body:', req.body);
    
    try {
        const { videoUrl } = req.body;
        const videoId = extractVideoId(videoUrl);
        
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        console.log('Fetching transcripts for video:', videoId);
        const transcriptData = await fetchAllTranscripts(videoId);
        
        if (!transcriptData?.transcript?.length) {
            return res.status(400).json({ 
                error: 'No transcript available for this video'
            });
        }

        // Process the transcript
        let transcriptText = transcriptData.transcript
            .map(entry => entry.text)
            .join(' ');
        transcriptText = cleanText(transcriptText);

        // Continue with existing OpenAI processing...
        const processedTranscriptResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [/* ... existing messages ... */]
        });

        // ... rest of the processing remains the same ...

    } catch (error) {
        console.error('Error details:', error);
        res.status(500).json({ 
            error: 'Failed to process video',
            details: error.message
        });
    }
});

module.exports = app;
