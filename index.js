const express = require('express');
const fetch = require('node-fetch'); // For Node.js < 18 or if you prefer node-fetch's API
const cors = require('cors');

const app = express();

// --- Configuration from Environment Variables ---
// IMPORTANT: Set these on Vercel dashboard under Project Settings -> Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || "gemini-2.0-flash";
const DEFAULT_GENERATE_CONTENT_API = process.env.GENERATE_CONTENT_API || "streamGenerateContent";

// --- Middleware ---
// Enable CORS for all origins. In production, you might want to restrict this.
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// --- Routes ---

// Health check route for /api
app.get('/', (req, res) => {
    res.send('Gemini Proxy Vercel API is running!');
});

// The main proxy endpoint for Gemini
// This path structure matches the actual Gemini API structure.
// When deployed to Vercel, this function will be accessible at:
// YOUR_VERCEL_URL/api/v1beta/models/:modelId/:apiEndpoint
app.post('/v1beta/models/:modelId/:apiEndpoint', async (req, res) => {
    // Basic validation for API key
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return res.status(500).json({ error: "Server configuration error: Gemini API key missing." });
    }

    const { modelId, apiEndpoint } = req.params;

    // Construct the target Gemini API URL
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${apiEndpoint}?key=${GEMINI_API_KEY}`;

    console.log(`Proxying request to: ${targetUrl}`);
    // console.log('Incoming Request Body:', JSON.stringify(req.body, null, 2)); // Uncomment for debugging

    try {
        const geminiResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body), // Forward the entire incoming request body
        });

        // Set the response headers from Gemini to the client
        res.setHeader('Content-Type', geminiResponse.headers.get('Content-Type') || 'application/json');
        if (geminiResponse.headers.has('Transfer-Encoding')) {
            res.setHeader('Transfer-Encoding', geminiResponse.headers.get('Transfer-Encoding'));
        }
        // Add other headers if necessary, like X-Powered-By, etc.
        // geminiResponse.headers.forEach((value, name) => {
        //     if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(name.toLowerCase())) {
        //         res.setHeader(name, value);
        //     }
        // });


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
            // If headers have been sent, you can't change the status code here.
        });

    } catch (error) {
        console.error('Proxy request failed:', error);
        res.status(500).json({
            error: 'Failed to proxy request to Gemini API.',
            details: error.message
        });
    }
});

// IMPORTANT: Export the Express app instance. Vercel will handle the incoming requests.
module.exports = app;
