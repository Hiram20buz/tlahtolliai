import requests

# URL of your FastAPI server
url = "http://127.0.0.1:8080/voice-agent"

# Path to a test audio file
audio_path = "test_audio.wav"

# Send POST request with the audio file
with open(audio_path, "rb") as f:
    files = {"file": ("test_audio.wav", f, "audio/wav")}
    response = requests.post(url, files=files)

# Save the returned TTS audio
if response.status_code == 200:
    with open("reply_audio.mp3", "wb") as out:
        out.write(response.content)
    print("TTS audio saved as reply_audio.mp3")
else:
    print("Error:", response.status_code, response.text)
