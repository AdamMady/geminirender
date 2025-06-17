const express = require('express');
const fetch = require('node-fetch'); // Using node-fetch for clarity, native fetch is also an option for Node >= 18
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000; // Render will provide the PORT env var

// --- Configuration from Environment Variables ---
// IMPORTANT: Set these on Render dashboard under Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || "gemini-2.0-flash";
const DEFAULT_GENERATE_CONTENT_API = process.env.GENERATE_CONTENT_API || "streamGenerateContent";

// --- Middleware ---
// Enable CORS for all origins. In production, you might want to restrict this:
// app.use(cors({ origin: 'https://your-frontend-domain.com' }));
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// --- Routes ---

// Health check route
app.get('/', (req, res) => {
    res.send('Gemini Proxy is running!');
});

// The main proxy endpoint for Gemini
// This path structure matches the actual Gemini API structure
// e.g., /v1beta/models/gemini-2.0-flash:streamGenerateContent
app.post('/v1beta/models/:modelId/:apiEndpoint', async (req, res) => {
    // Basic validation for API key
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return res.status(500).json({ error: "Server configuration error: Gemini API key missing." });
    }

    const { modelId, apiEndpoint } = req.params;

    // Construct the target Gemini API URL
    // We use path parameters for modelId and apiEndpoint to allow flexibility
    // If you only ever want to proxy gemini-2.0-flash and streamGenerateContent,
    // you could hardcode them here or use the DEFAULT_ variables.
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${apiEndpoint}?key=${GEMINI_API_KEY}`;

    console.log(`Proxying request to: ${targetUrl}`);
    // console.log('Incoming Request Body:', JSON.stringify(req.body, null, 2)); // Uncomment for debugging

    try {
        const geminiResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // You might want to pass other specific headers if necessary,
                // but Content-Type is usually sufficient for Gemini's JSON API.
            },
            body: JSON.stringify(req.body), // Forward the entire incoming request body
        });

        // Set the response headers from Gemini to the client
        // This is crucial for streaming and correct content type (e.g., text/plain, application/json)
        res.setHeader('Content-Type', geminiResponse.headers.get('Content-Type') || 'application/json');
        // You might want to pass through other relevant headers, like 'Transfer-Encoding' for streaming
        if (geminiResponse.headers.has('Transfer-Encoding')) {
            res.setHeader('Transfer-Encoding', geminiResponse.headers.get('Transfer-Encoding'));
        }

        // Handle non-2xx responses from Gemini
        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error(`Gemini API returned error (${geminiResponse.status}): ${errorText}`);
            return res.status(geminiResponse.status).send(errorText); // Pass through status and error body
        }

        // Pipe the Gemini response stream directly to the client's response stream.
        // This is efficient for streaming APIs like streamGenerateContent.
        geminiResponse.body.pipe(res);

        geminiResponse.body.on('error', (err) => {
            console.error('Error piping Gemini response stream:', err);
            // Note: If headers have already been sent, you can't change the status code here.
            // This usually indicates a network issue during streaming.
        });

    } catch (error) {
        console.error('Proxy request failed:', error);
        res.status(500).json({
            error: 'Failed to proxy request to Gemini API.',
            details: error.message
        });
    }
});

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Gemini Proxy server listening on port ${PORT}`);
    console.log(`Using model: ${DEFAULT_GEMINI_MODEL_ID}`);
    console.log(`Using endpoint: ${DEFAULT_GENERATE_CONTENT_API}`);
});
