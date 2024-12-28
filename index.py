from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re
import openai
from dotenv import load_dotenv
import os
import googleapiclient.discovery
import html

# Load environment variables
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize YouTube API client
youtube = googleapiclient.discovery.build(
    'youtube', 'v3',
    developerKey=YOUTUBE_API_KEY
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
    """Get transcript using YouTube API."""
    try:
        print(f"Getting captions for video ID: {video_id}")
        
        # Get caption tracks
        captions_response = youtube.captions().list(
            part="snippet",
            videoId=video_id
        ).execute()

        if not captions_response.get('items'):
            raise Exception("No captions found for this video")

        # Try to find English captions first
        caption_id = None
        for caption in captions_response['items']:
            language = caption['snippet']['language']
            if language == 'en':
                caption_id = caption['id']
                break
        
        # If no English captions, take the first available
        if not caption_id and captions_response['items']:
            caption_id = captions_response['items'][0]['id']

        if not caption_id:
            raise Exception("No suitable captions found")

        # Download the caption track
        caption_track = youtube.captions().download(
            id=caption_id,
            tfmt='srt'
        ).execute()

        # Parse the SRT format and convert to paragraphs
        caption_text = html.unescape(caption_track.decode('utf-8'))
        
        # Simple SRT parsing (you might want to use a proper SRT parser)
        lines = caption_text.split('\n')
        paragraphs = []
        current_paragraph = []
        
        for line in lines:
            line = line.strip()
            if not line or line.isdigit() or '-->' in line:
                continue
                
            current_paragraph.append(line)
            if len(' '.join(current_paragraph)) > 150 or line.endswith('.'):
                paragraphs.append(' '.join(current_paragraph))
                current_paragraph = []

        if current_paragraph:
            paragraphs.append(' '.join(current_paragraph))

        return caption_track, paragraphs

    except Exception as e:
        error_msg = str(e)
        print(f"Error in get_transcript: {error_msg}")
        if "quota" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="API quota exceeded. Please try again later."
            )
        elif "No captions found" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="This video doesn't have available captions. Please try another video."
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
        
        video_id = extract_video_id(request.videoUrl)
        print(f"Extracted video ID: {video_id}")
        
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")

        try:
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

        full_text = ' '.join(paragraphs)
        print("Processing with OpenAI...")
        
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
