import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const endpoint = searchParams.get("endpoint")

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint parameter required" }, { status: 400 })
    }

    // Get the form data from the request
    const formData = await request.formData()

    let apiUrl = `http://127.0.0.1:8080/${endpoint}`

    // Try different URL configurations based on the endpoint
    if (endpoint === "upload-pdf" || endpoint === "query") {
      // These endpoints might need a different base URL
      apiUrl = `http://localhost:8080/${endpoint}`
    }

    console.log("[v0] Attempting to connect to:", apiUrl)

    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData,
    })

    console.log("[v0] Response status:", response.status)
    console.log("[v0] Response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Error response body:", errorText)
      return NextResponse.json(
        { error: `API error: ${response.status} ${response.statusText} - ${errorText}` },
        { status: response.status },
      )
    }

    const contentType = response.headers.get("content-type")

    if (contentType?.includes("application/json")) {
      // For transcribe and chat-response endpoints that return JSON
      const jsonData = await response.json()
      return NextResponse.json(jsonData)
    } else {
      // For TTS endpoint that returns audio
      const audioBuffer = await response.arrayBuffer()
      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": audioBuffer.byteLength.toString(),
        },
      })
    }
  } catch (error) {
    console.error("[v0] Proxy error:", error)
    return NextResponse.json({ error: `Failed to connect to API: ${error.message}` }, { status: 500 })
  }
}
