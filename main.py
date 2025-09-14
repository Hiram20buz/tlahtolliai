import io
import wave
import os
import webrtcvad
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydub import AudioSegment
from openai import OpenAI
from dotenv import load_dotenv
import pytesseract
from fastapi import HTTPException
from pydantic import BaseModel
from PIL import Image
import base64
from PyPDF2 import PdfReader
from pdf2image import convert_from_bytes
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.vectorstores import FAISS
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationalRetrievalChain


# Load .env
load_dotenv()
# No need to pass api_key here
client = OpenAI()

app = FastAPI()
# Global vectorstore
vectorstore = None

vad = webrtcvad.Vad(3)  # Aggressiveness 0-3


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


# --- Endpoint 1: Upload and Transcribe ---
@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    audio = AudioSegment.from_file(file.file)
    speech_wav = detect_speech(audio)

    transcription = client.audio.transcriptions.create(
        model="gpt-4o-mini-transcribe", file=("speech.wav", speech_wav, "audio/wav")
    )
    text = transcription.text
    print(f"Transcribed text: {text}")  # Print the text
    return {"text": text}


# --- Endpoint 2: Generate LLM Response ---
# @app.post("/chat-response")
# async def chat_response(text: str = Form(...)):
#     print(f"Input text: {text}")  # Print the text
#     response = client.chat.completions.create(
#         model="gpt-4o-mini", messages=[{"role": "user", "content": text}]
#     )
#     reply = response.choices[0].message.content
#     print(f"LLM reply: {reply}")  # Print the reply
#     return {"reply": reply}


# --- Endpoint 2: Generate LLM Response ---
@app.post("/chat-response")
async def chat_response(text: str = Form(...)):
    print(f"Input text: {text}")  # Print the text

    # system_prompt = """
    # You are a friendly English tutor.
    # 1. Have a conversation with the user in English.
    # 2. Correct grammar mistakes politely and explain them.
    # 3. Encourage the user to practice more.
    # """
    # system_prompt = """
    # You are a friendly English tutor helping the user practice pronunciation.
    # 1. Listen to the target sentence and compare it with what the user said.
    # 2. Identify words that were mispronounced or skipped.
    # 3. Explain pronunciation mistakes in simple terms (e.g., missing sounds, wrong stress).
    # 4. Give clear examples of how to say the word correctly.
    # 5. Encourage the user to repeat and try again in a supportive way.
    # """
    system_prompt = """
    You are a friendly English tutor helping the user build vocabulary. 
    1. Introduce new words that match the user’s level.
    2. Provide clear definitions and example sentences.
    3. Suggest synonyms, antonyms, or related words when helpful.
    4. Encourage the user to make their own sentences using the new word.
    5. Correct mistakes politely and give feedback on usage.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},  # Add system prompt
            {"role": "user", "content": text},
        ],
    )

    reply = response.choices[0].message.content
    print(f"LLM reply: {reply}")  # Print the reply
    return {"reply": reply}


# --- Endpoint 3: Text-to-Speech ---
@app.post("/tts")
async def text_to_speech(text: str = Form(...)):
    print(f"TTS input: {text}")  # Print the text
    tts = client.audio.speech.create(
        model="gpt-4o-mini-tts", voice="ballad", input=text
    )
    return StreamingResponse(io.BytesIO(tts.read()), media_type="audio/mpeg")


# --- Endpoint 4: OCR from Image ---
@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)):
    try:
        # Load image for Tesseract
        image = Image.open(file.file).convert("RGB")

        # First try Tesseract OCR
        text = pytesseract.image_to_string(image).strip()
        if text:
            print(f"Tesseract OCR extracted text: {text}")
            return JSONResponse(content={"text": text})

        # If Tesseract fails or returns empty, fallback to GPT-4.1 Vision
        file.file.seek(0)  # Reset file pointer
        image_bytes = await file.read()
        base64_image = base64.b64encode(image_bytes).decode("utf-8")

        response = client.responses.create(
            model="gpt-4.1",
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Extract all text from this image.",
                        },
                        {
                            "type": "input_image",
                            "image_url": f"data:image/jpeg;base64,{base64_image}",
                        },
                    ],
                }
            ],
        )

        gpt_text = response.output_text.strip()
        if gpt_text:
            print(f"GPT-4.1 OCR extracted text: {gpt_text}")
            return JSONResponse(content={"text": gpt_text})

        raise HTTPException(
            status_code=500, detail="No text could be extracted from the image."
        )

    except Exception as e:
        print(f"Error in /ocr endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")


def extract_text_from_pdf(file_bytes: bytes) -> str:
    from PyPDF2 import PdfReader
    import io

    reader = PdfReader(io.BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text.strip()


def create_faiss_index(text: str):
    from langchain.vectorstores import FAISS
    from langchain.embeddings import OpenAIEmbeddings

    embeddings = OpenAIEmbeddings()
    return FAISS.from_texts([text], embeddings)


@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    global vectorstore
    try:
        file_bytes = await file.read()
        pdf_text = extract_text_from_pdf(file_bytes)
        if not pdf_text:
            raise HTTPException(status_code=400, detail="PDF contains no text.")

        vectorstore = create_faiss_index(pdf_text)
        return {"message": "PDF uploaded and indexed successfully."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query_pdf(user_message: str = Form(...)):
    global vectorstore
    if vectorstore is None:
        raise HTTPException(status_code=400, detail="No PDF indexed. Upload first.")

    try:
        retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
        llm = ChatOpenAI(model_name="gpt-4o-mini", temperature=0)
        qa_chain = ConversationalRetrievalChain.from_llm(llm, retriever)
        result = qa_chain({"question": user_message, "chat_history": []})
        return {"answer": result["answer"]}  # the chain returns a dict

    except Exception as e:
        print(f"[ERROR] Query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")
