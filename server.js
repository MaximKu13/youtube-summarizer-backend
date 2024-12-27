const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');
const OpenAI = require('openai');
const he = require('he'); // Library for decoding HTML entities
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Function to extract video ID from a YouTube URL
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Clean text by replacing HTML entities explicitly
function cleanText(text) {
    return he.decode(text) // Decode all HTML entities
        .replace(/&#39;/g, "'") // Handle single quote explicitly
        .replace(/&quot;/g, '"') // Handle double quotes explicitly
        .replace(/&amp;/g, '&')  // Handle ampersands explicitly
        .replace(/\.{2,}/g, '.') // Replace multiple dots with a single period
        .replace(/\s+/g, ' ');   // Replace multiple spaces with a single space
}

// Refine summary formatting to preserve titles, bold them, and format paragraphs
function formatSummary(summary) {
    return summary
        .split('\n') // Split into lines
        .map(line => {
            line = line.trim();

            if (line.length === 0) return ''; // Skip empty lines

            // Replace Markdown **bold** with HTML <strong>
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            // Titles
            if (/^(###|##|#|\*\*).*/.test(line) || line.endsWith(':') || line.toUpperCase() === line) {
                return `<p style="margin-top: 20px; margin-bottom: 10px;"><strong>${line.replace(/[#*]/g, '').trim()}</strong></p>`;
            }

            // Bullet points
            if (/^[-•]\s|^\d+\./.test(line)) {
                return `<p style="margin-left: 20px; margin-bottom: 10px;">${line}</p>`;
            }

            // Regular paragraphs
            return `<p style="margin-bottom: 15px;">${line}</p>`;
        })
        .filter(Boolean) // Remove empty results
        .join('\n'); // Combine into a single HTML string
}

// API endpoint to get video summary
app.post('/api/video-summary', async (req, res) => {
    console.log('Received request body:', req.body);
    
    try {
        const { videoUrl } = req.body;
        const videoId = extractVideoId(videoUrl);
        
        console.log('Processing video ID:', videoId);

        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Fetch the transcript using the video ID
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        console.log('Transcript fetched successfully');

        // Combine transcript into a single text block and clean it
        let transcriptText = transcript
            .map(entry => entry.text)
            .join(' ');
        transcriptText = cleanText(transcriptText);

        // Process the transcript with OpenAI for formatting and proofreading
        const processedTranscriptResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: `You are a professional editor. Your task is to proofread and improve the formatting of this transcript.

Important rules:
1. DO NOT summarize or shorten the content in any way
2. DO NOT remove any information or context
3. DO maintain all original content and meaning
4. DO fix grammar, punctuation, and spelling errors
5. DO improve sentence structure and readability
6. DO format into clear paragraphs with proper line breaks - use double line breaks between paragraphs
7. DO maintain all speaker identifications if present
8. DO preserve natural speaking cadence by creating new paragraphs when:
   - A new speaker begins
   - There's a change in topic
   - There's a natural pause or transition in the content
9. DO NOT combine everything into one big paragraph
10. DO ensure each paragraph is properly separated with blank lines

Format your response with:
- Double line breaks between paragraphs
- Proper indentation for speaker names (if present)
- Clear separation between different segments of the transcript`
            }, {
                role: "user",
                content: transcriptText
            }]
        });

        // Get the processed transcript
        const processedTranscript = processedTranscriptResponse.choices[0].message.content;

        // Split processed transcript into paragraphs
        const paragraphs = processedTranscript
            .split('\n\n')
            .map(para => para.trim())
            .filter(para => para.length > 0);

        // Get summary from OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: `Here is the transcript of a video. Please analyze it and provide a concise summary of the key insights, main points, and takeaways. Highlight any actionable advice, themes, or data mentioned:\n\n${processedTranscript}`
            }]
        });

        console.log('Summary generated successfully');

        // Format summary for readability
        let summary = completion.choices[0].message.content;
        summary = formatSummary(summary);

        // Respond with the formatted transcript and summary
        res.json({
            transcript: paragraphs,
            summary: summary
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to process video'
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
module.exports = app;
