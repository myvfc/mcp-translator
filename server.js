// Simple translator between REST API and MCP SSE
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Add CORS headers for browser requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'MCP Translator is running', message: 'Use POST /mcp to interact with MCP server' });
});

// Main translation endpoint
app.post('/mcp', async (req, res) => {
  try {
    console.log('Received request:', JSON.stringify(req.body, null, 2));

    // Your Brave MCP server URL
    const mcpServerUrl = 'https://brave-search-mcp-server-production.up.railway.app';
    
    // Make SSE request to the MCP server
    const response = await fetch(mcpServerUrl, {
      method: 'POST',
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      throw new Error(`MCP server responded with ${response.status}: ${response.statusText}`);
    }

    // Handle the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            console.log('Received SSE data:', JSON.stringify(data, null, 2));
            
            // Store the result (typically the last complete message is what we want)
            finalResult = data;
          } catch (e) {
            console.log('Non-JSON SSE line:', line);
          }
        }
      }
    }

    // Return the final result as regular JSON
    if (finalResult) {
      res.json(finalResult);
    } else {
      res.json({ error: 'No valid response received from MCP server' });
    }

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: 'Translation failed', 
      details: error.message,
      suggestion: 'Check if the MCP server is running and accessible'
    });
  }
});

// Handle tool discovery requests specifically
app.get('/mcp', async (req, res) => {
  try {
    const toolDiscoveryRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    // Forward to our POST handler
    req.body = toolDiscoveryRequest;
    req.method = 'POST';
    return app._router.handle(req, res);
  } catch (error) {
    console.error('Tool discovery error:', error);
    res.status(500).json({ error: 'Tool discovery failed' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`MCP Translator running on port ${port}`);
  console.log(`Translating between REST and MCP SSE for Brave Search`);
});
