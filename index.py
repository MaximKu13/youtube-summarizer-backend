from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import re
import openai
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VideoRequest(BaseModel):
    videoUrl: str

def extract_video_id(url: str) -> str:
    """Extract video ID from YouTube URL."""
    pattern = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})'
    match = re.search(pattern, url)
    return match.group(1) if match else None

def format_summary(text: str) -> str:
    """Format the summary with HTML styling."""
    lines = text.split('\n')
    formatted_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Headers or all caps lines
        if line.startswith('#') or line.isupper():
            formatted = f'<p style="margin-top: 20px; margin-bottom: 10px;"><strong>{line.replace("#", "").strip()}</strong></p>'
        # Bullet points
        elif line.startswith('•') or line.startswith('-'):
            formatted = f'<p style="margin-left: 20px; margin-bottom: 10px;">{line}</p>'
        # Regular paragraphs
        else:
            formatted = f'<p style="margin-bottom: 15px;">{line}</p>'
            
        formatted_lines.append(formatted)
    
    return '\n'.join(formatted_lines)

def get_transcript(video_id: str):
    """Get transcript for a video."""
    try:
        print(f"Getting transcript list for video ID: {video_id}")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Get the first transcript from the list
        print("Getting available transcripts...")
        available_transcripts = list(transcript_list)
        
        if not available_transcripts:
            raise Exception("No transcripts found")
            
        transcript = available_transcripts[0]
        print(f"Found transcript: {transcript.language_code}")
        
        # Get the transcript data
        transcript_data = transcript.fetch()
        print("Successfully fetched transcript data")
        
        # If not English, translate
        if transcript.language_code != 'en':
            print(f"Translating from {transcript.language_code} to English")
            transcript_data = transcript.translate('en').fetch()
            print("Translation completed")
        
        # Process into paragraphs with better text handling
        paragraphs = []
        current_paragraph = []
        
        for entry in transcript_data:
            text = entry.get('text', '').strip()
            if not text:
                continue
                
            current_paragraph.append(text)
            
            # Start new paragraph after reasonable length or if ends with period
            if len(' '.join(current_paragraph)) > 150 or text.endswith('.'):
                paragraphs.append(' '.join(current_paragraph))
                current_paragraph = []
        
        # Add any remaining text
        if current_paragraph:
            paragraphs.append(' '.join(current_paragraph))
            
        print(f"Created {len(paragraphs)} paragraphs")
        
        if not paragraphs:
            raise Exception("No text content found in transcript")
            
        return transcript_data, paragraphs
            
    except Exception as e:
        error_msg = str(e)
        print(f"Error in get_transcript: {error_msg}")
        # Make the error message more user-friendly
        if "Transcript is disabled" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="This video doesn't have available captions. Please try another video."
            )
        elif "No transcripts found" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="No captions found for this video. Please try another video."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Error accessing video captions: {error_msg}"
            )

@app.get("/")
async def read_root():
    return {"message": "YouTube Summarizer API is running"}

@app.post("/api/video-summary")
async def get_video_summary(request: VideoRequest):
    try:
        print(f"Received URL: {request.videoUrl}")
        
        # Extract video ID
        video_id = extract_video_id(request.videoUrl)
        print(f"Extracted video ID: {video_id}")
        
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")

        try:
            # Get transcript
            transcript_data, paragraphs = get_transcript(video_id)
            print(f"Successfully got transcript with {len(paragraphs)} paragraphs")
        except HTTPException as he:
            raise he
        except Exception as transcript_error:
            print(f"Transcript error: {str(transcript_error)}")
            raise HTTPException(
                status_code=400,
                detail="Failed to process video transcript. Please try another video."
            )

        # Join paragraphs for OpenAI processing
        full_text = ' '.join(paragraphs)
        print("Processing with OpenAI...")
        
        # Process with OpenAI
        completion = await openai.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[{
                "role": "system",
                "content": "You are a professional editor. Your task is to create a clear, well-structured summary of the video transcript."
            }, {
                "role": "user",
                "content": f"Please analyze this video transcript and provide a comprehensive summary highlighting the key points, main insights, and important takeaways. Include any significant data or actionable advice mentioned:\n\n{full_text}"
            }]
        )

        summary = completion.choices[0].message.content
        formatted_summary = format_summary(summary)
        print("Successfully generated summary")

        return {
            "transcript": paragraphs,
            "summary": formatted_summary
        }
    
    except HTTPException as e:
        print(f"HTTP Exception: {str(e)}")
        raise e
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
