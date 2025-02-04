const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Enable CORS for your frontend domain
app.use(cors({ origin: 'https://www.seattleu.edu' }));

// Define API route
app.get('/proxy/funnelback', async (req, res) => {
    try {
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: { 'X-Forwarded-For': userIp }
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🚀 Correct Vercel export
module.exports = app;
