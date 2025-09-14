import io
import wave
import webrtcvad
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydub import AudioSegment
import ollama
from gtts import gTTS
import pyttsx3
import tempfile

from faster_whisper import WhisperModel


app = FastAPI()
vad = webrtcvad.Vad(3)  # Aggressiveness 0–3
whisper_model = WhisperModel(
    "small", device="cpu"
)  # choose "tiny", "small", "base" etc.


def detect_speech(audio: AudioSegment):
    """Run VAD on audio and return speech-only segments as WAV bytes."""
    audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    raw = audio.raw_data

    frame_ms = 30
    frame_size = int(16000 * 2 * frame_ms / 1000)
    speech = io.BytesIO()
    with wave.open(speech, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)

        for i in range(0, len(raw), frame_size):
            frame = raw[i : i + frame_size]
            if len(frame) < frame_size:
                break
            if vad.is_speech(frame, 16000):
                wf.writeframes(frame)
    speech.seek(0)
    return speech


def text_to_speech_offline(text: str):
    engine = pyttsx3.init()
    tmpfile = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    engine.save_to_file(text, tmpfile.name)
    engine.runAndWait()
    return tmpfile.name


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    audio = AudioSegment.from_file(file.file)
    speech_wav = detect_speech(audio)

    # Save to temp WAV file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(speech_wav.read())
        tmp_path = tmp.name

    # Transcribe with faster-whisper
    segments, _ = whisper_model.transcribe(tmp_path)
    text = " ".join([segment.text for segment in segments])
    print(f"Transcribed text: {text}")
    return {"text": text}


# --- Endpoint 2: Chat with Ollama ---
@app.post("/chat-response")
async def chat_response(text: str = Form(...)):
    print(f"Input text: {text}")

    system_prompt = """
    You are a friendly English tutor helping the user build vocabulary. 
    1. Introduce new words that match the user’s level.
    2. Provide clear definitions and example sentences.
    3. Suggest synonyms, antonyms, or related words when helpful.
    4. Encourage the user to make their own sentences using the new word.
    5. Correct mistakes politely and give feedback on usage.
    """

    response = ollama.chat(
        model="phi3:latest",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
    )

    reply = response["message"]["content"]
    print(f"LLM reply: {reply}")
    return {"reply": reply}


# --- Endpoint 3: Text-to-Speech ---
@app.post("/tts")
async def text_to_speech(text: str = Form(...)):
    print(f"TTS input: {text}")

    tts = gTTS(text=text, lang="en")
    audio_bytes = io.BytesIO()
    tts.write_to_fp(audio_bytes)
    audio_bytes.seek(0)

    return StreamingResponse(audio_bytes, media_type="audio/mpeg")
