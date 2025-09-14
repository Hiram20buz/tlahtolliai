import sounddevice as sd
import wavio

duration = 5  # seconds
fs = 16000
filename = "test_audio.wav"

print("recording")
recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype="int16")
sd.wait()
wavio.write(filename, recording, fs, sampwidth=2)
