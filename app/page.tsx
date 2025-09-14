"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mic, Send, Volume2, Play, Camera, FileText } from "lucide-react"

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  audioBlob?: Blob
}

export default function TlahtolliAI() {
  const [activeTab, setActiveTab] = useState<"chat" | "voice" | "extraction" | "pdf">("chat")

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)

  const [extractedText, setExtractedText] = useState("")
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedTextAudio, setExtractedTextAudio] = useState<Blob | null>(null)

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfSessionId, setPdfSessionId] = useState<string>("")
  const [isPdfUploaded, setIsPdfUploaded] = useState(false)
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [pdfQuestion, setPdfQuestion] = useState("")
  const [pdfMessages, setPdfMessages] = useState<
    Array<{ id: string; question: string; answer: string; audioBlob?: Blob }>
  >([])
  const [isProcessingPdfQuestion, setIsProcessingPdfQuestion] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const addMessage = (text: string, isUser: boolean, audioBlob?: Blob) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser,
      timestamp: new Date(),
      audioBlob,
    }
    setMessages((prev) => [...prev, newMessage])
    return newMessage.id
  }

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || isProcessing) return

    const userText = inputText.trim()
    setInputText("")
    addMessage(userText, true)

    await processUserInput(userText)
  }

  const processUserInput = async (text: string) => {
    setIsProcessing(true)

    try {
      const chatFormData = new FormData()
      chatFormData.append("text", text)

      const chatResponse = await fetch("/api/voice-proxy?endpoint=chat-response", {
        method: "POST",
        body: chatFormData,
      })

      if (!chatResponse.ok) {
        throw new Error(`Chat API error: ${chatResponse.status}`)
      }

      const chatData = await chatResponse.json()
      const aiReply = chatData.reply

      const ttsFormData = new FormData()
      ttsFormData.append("text", aiReply)

      const ttsResponse = await fetch("/api/voice-proxy?endpoint=tts", {
        method: "POST",
        body: ttsFormData,
      })

      let audioBlob: Blob | undefined
      if (ttsResponse.ok) {
        audioBlob = await ttsResponse.blob()
        if (audioBlob.size > 0) {
          playAudio(audioBlob)
        }
      }

      addMessage(aiReply, false, audioBlob)
    } catch (error) {
      console.error("Error processing input:", error)
      addMessage("Sorry, I encountered an error processing your request.", false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRecord = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data)
        }

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" })
          await transcribeAudio(audioBlob)
          stream.getTracks().forEach((track) => track.stop())
        }

        mediaRecorder.start()
        setIsRecording(true)
      } catch (error) {
        console.error("Error accessing microphone:", error)
      }
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        setIsRecording(false)
        setIsProcessing(true)
      }
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append("file", audioBlob, "recording.wav")

      const response = await fetch("/api/voice-proxy?endpoint=transcribe", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Transcription API error: ${response.status}`)
      }

      const data = await response.json()
      const transcribedText = data.text

      if (transcribedText.trim()) {
        addMessage(transcribedText, true)
        await processUserInput(transcribedText)
      }
    } catch (error) {
      console.error("Error transcribing audio:", error)
      setIsProcessing(false)
    }
  }

  const playAudio = async (audioBlob: Blob, messageId?: string) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }

      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      currentAudioRef.current = audio

      audio.onplay = () => {
        setIsPlaying(true)
        if (messageId) setPlayingMessageId(messageId)
      }
      audio.onended = () => {
        setIsPlaying(false)
        setPlayingMessageId(null)
        currentAudioRef.current = null
        URL.revokeObjectURL(audioUrl)
      }
      audio.onerror = () => {
        setIsPlaying(false)
        setPlayingMessageId(null)
        currentAudioRef.current = null
        URL.revokeObjectURL(audioUrl)
      }

      await audio.play()
    } catch (error) {
      console.error("Error playing audio:", error)
      setIsPlaying(false)
      setPlayingMessageId(null)
    }
  }

  const handleVoiceRecord = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data)
        }

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" })
          await processVoiceInput(audioBlob)
          stream.getTracks().forEach((track) => track.stop())
        }

        mediaRecorder.start()
        setIsRecording(true)
      } catch (error) {
        console.error("Error accessing microphone:", error)
      }
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        setIsRecording(false)
        setIsProcessing(true)
      }
    }
  }

  const processVoiceInput = async (audioBlob: Blob) => {
    try {
      const transcribeFormData = new FormData()
      transcribeFormData.append("file", audioBlob, "recording.wav")

      const transcribeResponse = await fetch("/api/voice-proxy?endpoint=transcribe", {
        method: "POST",
        body: transcribeFormData,
      })

      if (!transcribeResponse.ok) {
        throw new Error(`Transcription API error: ${transcribeResponse.status}`)
      }

      const transcribeData = await transcribeResponse.json()
      const transcribedText = transcribeData.text

      if (!transcribedText.trim()) {
        setIsProcessing(false)
        return
      }

      const chatFormData = new FormData()
      chatFormData.append("text", transcribedText)

      const chatResponse = await fetch("/api/voice-proxy?endpoint=chat-response", {
        method: "POST",
        body: chatFormData,
      })

      if (!chatResponse.ok) {
        throw new Error(`Chat API error: ${chatResponse.status}`)
      }

      const chatData = await chatResponse.json()
      const aiReply = chatData.reply

      const ttsFormData = new FormData()
      ttsFormData.append("text", aiReply)

      const ttsResponse = await fetch("/api/voice-proxy?endpoint=tts", {
        method: "POST",
        body: ttsFormData,
      })

      if (ttsResponse.ok) {
        const audioBlob = await ttsResponse.blob()
        if (audioBlob.size > 0) {
          playAudio(audioBlob)
        }
      }
    } catch (error) {
      console.error("Error processing voice input:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  const playLastResponse = () => {
    if (currentAudioRef.current && !isPlaying) {
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current.play()
    }
  }

  const replayMessageAudio = async (message: Message) => {
    if (!message.audioBlob) {
      try {
        const ttsFormData = new FormData()
        ttsFormData.append("text", message.text)

        const ttsResponse = await fetch("/api/voice-proxy?endpoint=tts", {
          method: "POST",
          body: ttsFormData,
        })

        if (ttsResponse.ok) {
          const audioBlob = await ttsResponse.blob()
          if (audioBlob.size > 0) {
            setMessages((prev) => prev.map((msg) => (msg.id === message.id ? { ...msg, audioBlob } : msg)))
            playAudio(audioBlob, message.id)
          }
        }
      } catch (error) {
        console.error("Error generating TTS for message:", error)
      }
    } else {
      playAudio(message.audioBlob, message.id)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Use back camera on mobile
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (error) {
      console.error("Error accessing camera:", error)
      // Fallback to file input if camera access fails
      fileInputRef.current?.click()
    }
  }

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      const context = canvas.getContext("2d")

      if (context) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0)

        const imageDataUrl = canvas.toDataURL("image/jpeg", 0.8)
        setCapturedImage(imageDataUrl)

        // Stop camera stream
        const stream = video.srcObject as MediaStream
        if (stream) {
          stream.getTracks().forEach((track) => track.stop())
        }

        // Convert to blob and extract text
        canvas.toBlob(
          (blob) => {
            if (blob) {
              extractTextFromImage(blob)
            }
          },
          "image/jpeg",
          0.8,
        )
      }
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const imageDataUrl = e.target?.result as string
        setCapturedImage(imageDataUrl)
      }
      reader.readAsDataURL(file)

      extractTextFromImage(file)
    }
  }

  const extractTextFromImage = async (imageFile: Blob | File) => {
    setIsExtracting(true)
    setExtractedText("")

    try {
      const formData = new FormData()
      formData.append("file", imageFile, "image.jpg")

      const response = await fetch("/api/voice-proxy?endpoint=ocr", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`OCR API error: ${response.status}`)
      }

      const data = await response.json()
      const text = data.text?.trim() || ""

      setExtractedText(text)

      if (text) {
        // Automatically generate TTS for extracted text
        await generateTTSForText(text)
      }
    } catch (error) {
      console.error("Error extracting text:", error)
      setExtractedText("Error: Could not extract text from image")
    } finally {
      setIsExtracting(false)
    }
  }

  const generateTTSForText = async (text: string) => {
    try {
      const ttsFormData = new FormData()
      ttsFormData.append("text", text)

      const ttsResponse = await fetch("/api/voice-proxy?endpoint=tts", {
        method: "POST",
        body: ttsFormData,
      })

      if (ttsResponse.ok) {
        const audioBlob = await ttsResponse.blob()
        if (audioBlob.size > 0) {
          setExtractedTextAudio(audioBlob)
          playAudio(audioBlob)
        }
      }
    } catch (error) {
      console.error("Error generating TTS:", error)
    }
  }

  const replayExtractedAudio = () => {
    if (extractedTextAudio) {
      playAudio(extractedTextAudio)
    }
  }

  const resetExtraction = () => {
    setExtractedText("")
    setCapturedImage(null)
    setIsExtracting(false)
    setExtractedTextAudio(null)
  }

  const uploadPdfForChat = async (file: File) => {
    setIsUploadingPdf(true)
    const sessionId = `session_${Date.now()}`
    setPdfSessionId(sessionId)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("session_id", sessionId)

      const response = await fetch("/api/voice-proxy?endpoint=upload-pdf", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("PDF upload API error:", errorText)
        throw new Error(`PDF upload failed: ${errorText}`)
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const responseText = await response.text()
        console.error("Non-JSON response:", responseText)
        throw new Error(`Expected JSON response, got: ${responseText.substring(0, 100)}...`)
      }

      const data = await response.json()
      console.log("PDF uploaded successfully:", data.message)
      setIsPdfUploaded(true)
    } catch (error) {
      console.error("Error uploading PDF:", error)
      alert(`Error uploading PDF: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsUploadingPdf(false)
    }
  }

  const chatWithPdf = async (question: string) => {
    if (!pdfSessionId || !question.trim()) return

    setIsProcessingPdfQuestion(true)

    try {
      const formData = new FormData()
      formData.append("user_message", question.trim())

      const chatHistory = pdfMessages.map((msg) => `Human: ${msg.question}\nAssistant: ${msg.answer}`).join("\n\n")
      formData.append("chat_history", chatHistory)

      const response = await fetch("/api/voice-proxy?endpoint=query", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("PDF chat API error:", errorText)
        throw new Error(`Chat failed: ${errorText}`)
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const responseText = await response.text()
        console.error("Non-JSON response:", responseText)
        throw new Error(`Expected JSON response, got: ${responseText.substring(0, 100)}...`)
      }

      const data = await response.json()
      const answer = data.answer || "No answer received"

      const ttsFormData = new FormData()
      ttsFormData.append("text", answer)

      const ttsResponse = await fetch("/api/voice-proxy?endpoint=tts", {
        method: "POST",
        body: ttsFormData,
      })

      let audioBlob: Blob | undefined
      if (ttsResponse.ok) {
        audioBlob = await ttsResponse.blob()
        if (audioBlob.size > 0) {
          playAudio(audioBlob)
        }
      }

      const newMessage = {
        id: Date.now().toString(),
        question: question.trim(),
        answer,
        audioBlob,
      }
      setPdfMessages((prev) => [...prev, newMessage])
      setPdfQuestion("")
    } catch (error) {
      console.error("Error chatting with PDF:", error)
      alert(`Error processing your question: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsProcessingPdfQuestion(false)
    }
  }

  const handlePdfQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pdfQuestion.trim() && !isProcessingPdfQuestion) {
      chatWithPdf(pdfQuestion)
    }
  }

  const handlePDFUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === "application/pdf") {
      setPdfFile(file)
      uploadPdfForChat(file)
    }
  }

  const replayPdfMessageAudio = async (message: { id: string; question: string; answer: string; audioBlob?: Blob }) => {
    if (!message.audioBlob) {
      try {
        const ttsFormData = new FormData()
        ttsFormData.append("text", message.answer)

        const ttsResponse = await fetch("/api/voice-proxy?endpoint=tts", {
          method: "POST",
          body: ttsFormData,
        })

        if (ttsResponse.ok) {
          const audioBlob = await ttsResponse.blob()
          if (audioBlob.size > 0) {
            setPdfMessages((prev) => prev.map((msg) => (msg.id === message.id ? { ...msg, audioBlob } : msg)))
            playAudio(audioBlob, message.id)
          }
        }
      } catch (error) {
        console.error("Error generating TTS for PDF message:", error)
      }
    } else {
      playAudio(message.audioBlob, message.id)
    }
  }

  const resetPDFChat = () => {
    setPdfFile(null)
    setPdfSessionId("")
    setIsPdfUploaded(false)
    setIsUploadingPdf(false)
    setPdfQuestion("")
    setPdfMessages([])
    setIsProcessingPdfQuestion(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl h-[600px] flex flex-col">
        <div className="bg-blue-500 text-white rounded-t-2xl">
          <div className="flex">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 p-4 text-center font-medium transition-colors ${
                activeTab === "chat" ? "bg-blue-600" : "hover:bg-blue-400"
              } rounded-tl-2xl`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("voice")}
              className={`flex-1 p-4 text-center font-medium transition-colors ${
                activeTab === "voice" ? "bg-blue-600" : "hover:bg-blue-400"
              }`}
            >
              Voice Interface
            </button>
            <button
              onClick={() => setActiveTab("extraction")}
              className={`flex-1 p-4 text-center font-medium transition-colors ${
                activeTab === "extraction" ? "bg-blue-600" : "hover:bg-blue-400"
              }`}
            >
              Text Extraction
            </button>
            <button
              onClick={() => setActiveTab("pdf")}
              className={`flex-1 p-4 text-center font-medium transition-colors ${
                activeTab === "pdf" ? "bg-blue-600" : "hover:bg-blue-400"
              } rounded-tr-2xl`}
            >
              PDF Chat Assistant
            </button>
          </div>

          <div className="px-4 pb-4">
            <h1 className="text-xl font-bold text-center">TlahtolliAI</h1>
            {isPlaying && (
              <div className="flex items-center justify-center mt-2 text-sm">
                <Volume2 className="h-4 w-4 mr-2 animate-pulse" />
                Playing response...
              </div>
            )}
          </div>
        </div>

        {activeTab === "chat" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  <p>Start a conversation by typing or recording a voice message!</p>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.isUser ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm">{message.text}</p>
                        <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                      </div>

                      {!message.isUser && (
                        <button
                          onClick={() => replayMessageAudio(message)}
                          disabled={playingMessageId === message.id}
                          className={`flex-shrink-0 p-1 rounded-full transition-colors ${
                            playingMessageId === message.id
                              ? "bg-green-600 animate-pulse"
                              : "bg-green-500 hover:bg-green-600"
                          }`}
                          title="Play audio"
                        >
                          <Play className="h-3 w-3 text-white" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">
                    <p className="text-sm">Processing...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t">
              <form onSubmit={handleTextSubmit} className="flex items-center space-x-2">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isProcessing}
                  className="flex-1"
                />

                <Button
                  type="submit"
                  disabled={!inputText.trim() || isProcessing}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Send className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  onClick={handleRecord}
                  disabled={isProcessing}
                  className={`transition-all duration-200 ${
                    isProcessing
                      ? "bg-yellow-500 hover:bg-yellow-600 animate-pulse"
                      : isRecording
                        ? "bg-red-500 hover:bg-red-600 scale-110"
                        : "bg-green-500 hover:bg-green-600"
                  }`}
                >
                  <Mic className="h-4 w-4 text-white" />
                </Button>
              </form>

              <p className="text-xs text-gray-500 text-center mt-2">
                {isRecording && "Recording... Click mic to stop"}
                {isProcessing && "Processing your request..."}
                {!isRecording && !isProcessing && "Type or record your message"}
              </p>
            </div>
          </>
        )}

        {activeTab === "voice" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
            <div className="text-center space-y-8">
              <div className="flex flex-col items-center space-y-4">
                <button
                  onClick={handleVoiceRecord}
                  disabled={isProcessing}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    isProcessing
                      ? "bg-yellow-500 animate-pulse"
                      : isRecording
                        ? "bg-red-500 scale-110"
                        : "bg-blue-500 hover:bg-blue-600"
                  }`}
                >
                  <Mic className="h-8 w-8 text-white" />
                </button>
                <p className="text-gray-600 font-medium">{isRecording ? "Recording..." : "Click to record"}</p>
              </div>

              <div className="flex flex-col items-center space-y-4">
                <button
                  onClick={playLastResponse}
                  disabled={!currentAudioRef.current || isPlaying}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    !currentAudioRef.current || isPlaying
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-green-500 hover:bg-green-600"
                  }`}
                >
                  <Play className="h-8 w-8 text-white ml-1" />
                </button>
                <p className="text-gray-600 font-medium">Click to play response</p>
              </div>
            </div>

            {isProcessing && (
              <div className="text-center">
                <p className="text-gray-500 animate-pulse">Processing your voice...</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "extraction" && (
          <div className="flex-1 flex flex-col p-4 space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Extract Text from Images</h2>
            </div>

            {!capturedImage ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <video ref={videoRef} className="w-full max-w-md rounded-lg shadow-lg hidden" autoPlay playsInline />
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="flex flex-col items-center space-y-4">
                  <Button
                    onClick={startCamera}
                    disabled={isExtracting}
                    className="bg-blue-500 hover:bg-blue-600 px-8 py-3"
                  >
                    <Camera className="h-5 w-5 mr-2" />
                    Take Photo
                  </Button>

                  <div className="text-gray-500">or</div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                    variant="outline"
                    className="px-8 py-3"
                  >
                    <FileText className="h-5 w-5 mr-2" />
                    Upload Image
                  </Button>
                </div>

                {videoRef.current?.srcObject && (
                  <Button onClick={capturePhoto} className="bg-green-500 hover:bg-green-600">
                    Capture
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="flex justify-center">
                  <img
                    src={capturedImage || "/placeholder.svg"}
                    alt="Captured"
                    className="max-w-full max-h-48 rounded-lg shadow-lg object-contain"
                  />
                </div>

                {isExtracting ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Extracting text...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-32">
                      <h3 className="font-medium text-gray-800 mb-2">Extracted Text:</h3>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {extractedText || "No text found in image"}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      {extractedText && (
                        <Button
                          onClick={() => generateTTSForText(extractedText)}
                          disabled={isPlaying}
                          className="bg-green-500 hover:bg-green-600 flex-1"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Play Text
                        </Button>
                      )}
                      {extractedTextAudio && (
                        <Button
                          onClick={replayExtractedAudio}
                          disabled={isPlaying}
                          className="bg-blue-500 hover:bg-blue-600 flex-1"
                        >
                          <Volume2 className="h-4 w-4 mr-2" />
                          Replay
                        </Button>
                      )}
                      <Button onClick={resetExtraction} variant="outline" className="flex-1 bg-transparent">
                        Try Another
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "pdf" && (
          <div className="flex-1 flex flex-col p-4 space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">PDF Chat Assistant</h2>
              <p className="text-sm text-gray-600">Upload a PDF and ask questions about its content</p>
            </div>

            {!pdfFile ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">Select a PDF file to start chatting</p>

                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePDFUpload}
                    disabled={isUploadingPdf}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className={`inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg cursor-pointer transition-colors ${
                      isUploadingPdf ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-600"
                    }`}
                  >
                    <FileText className="h-5 w-5 mr-2" />
                    Choose PDF File
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-6 w-6 text-blue-500" />
                      <div>
                        <p className="font-medium text-gray-800">{pdfFile.name}</p>
                        <p className="text-sm text-gray-600">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isUploadingPdf && (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      )}
                      <span
                        className={`text-sm px-2 py-1 rounded-full ${
                          isPdfUploaded ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {isUploadingPdf ? "Uploading..." : isPdfUploaded ? "Ready" : "Processing..."}
                      </span>
                    </div>
                  </div>
                </div>

                {isPdfUploaded && (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-3 min-h-48">
                      {pdfMessages.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                          <p>Ask questions about your PDF content!</p>
                          <p className="text-sm mt-2">
                            Try: "What is this document about?" or "Summarize the main points"
                          </p>
                        </div>
                      ) : (
                        pdfMessages.map((message) => (
                          <div key={message.id} className="space-y-2">
                            <div className="flex justify-end">
                              <div className="bg-blue-500 text-white px-4 py-2 rounded-lg max-w-sm md:max-w-md break-words">
                                <p className="text-sm">{message.question}</p>
                              </div>
                            </div>
                            <div className="flex justify-start">
                              <div className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg max-w-sm md:max-w-md break-words">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm whitespace-pre-wrap break-words">{message.answer}</p>
                                  </div>
                                  <button
                                    onClick={() => replayPdfMessageAudio(message)}
                                    disabled={playingMessageId === message.id}
                                    className={`flex-shrink-0 p-1 rounded-full transition-colors ${
                                      playingMessageId === message.id
                                        ? "bg-green-600 animate-pulse"
                                        : "bg-green-500 hover:bg-green-600"
                                    }`}
                                    title="Play audio"
                                  >
                                    <Play className="h-3 w-3 text-white" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}

                      {isProcessingPdfQuestion && (
                        <div className="flex justify-start">
                          <div className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">
                            <p className="text-sm">Processing your question...</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4">
                      <form onSubmit={handlePdfQuestionSubmit} className="flex items-center space-x-2">
                        <Input
                          value={pdfQuestion}
                          onChange={(e) => setPdfQuestion(e.target.value)}
                          placeholder="Ask a question about the PDF..."
                          disabled={isProcessingPdfQuestion}
                          className="flex-1"
                        />
                        <Button
                          type="submit"
                          disabled={!pdfQuestion.trim() || isProcessingPdfQuestion}
                          className="bg-blue-500 hover:bg-blue-600"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </form>
                      <div className="flex justify-center mt-2">
                        <Button onClick={resetPDFChat} variant="outline" className="text-sm bg-transparent">
                          Try Another PDF
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
