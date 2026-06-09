import os
import io
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import subprocess
import tempfile
import urllib.request

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Faster Whisper
print("Loading Faster-Whisper Model...")
try:
    whisper_model = WhisperModel("tiny.en", device="cuda", compute_type="int8")
    print("Faster-Whisper Loaded on GPU (CUDA) 🚀")
except Exception as e:
    print(f"CUDA failed ({e}), falling back to CPU...")
    whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    print("Faster-Whisper Loaded on CPU.")

PIPER_VOICE = "en_US-lessac-high.onnx"

# Download the Piper voice model if it doesn't exist (e.g. on Render)
if not os.path.exists(PIPER_VOICE):
    print(f"Downloading {PIPER_VOICE} (this might take a minute)...")
    urllib.request.urlretrieve("https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx", PIPER_VOICE)
if not os.path.exists(PIPER_VOICE + ".json"):
    print(f"Downloading {PIPER_VOICE}.json...")
    urllib.request.urlretrieve("https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json", PIPER_VOICE + ".json")

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    # Save uploaded audio to a temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        segments, info = whisper_model.transcribe(tmp_path, beam_size=5)
        transcription = " ".join([segment.text for segment in segments])
        return {"text": transcription.strip()}
    finally:
        os.remove(tmp_path)

@app.get("/speak")
async def speak(text: str):
    # This uses piper to generate an audio buffer
    # Note: Requires piper to be installed and in PATH.
    
    # Piper command line: echo 'text' | piper --model voice.onnx --output_file out.wav
    def generate_audio():
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp_path = tmp.name
        
        try:
            import shutil
            piper_path = shutil.which("piper") or shutil.which("piper-tts") or "piper"
            process = subprocess.Popen(
                [piper_path, '--model', PIPER_VOICE, '--output_file', tmp_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            process.communicate(input=text.encode('utf-8'))
            
            with open(tmp_path, "rb") as f:
                yield from f
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    return StreamingResponse(generate_audio(), media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
