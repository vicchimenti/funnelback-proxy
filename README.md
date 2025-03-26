# Funnelback Search Proxy

A specialized proxy system that facilitates communication between Seattle University's frontend applications and Funnelback's search services, with enhanced analytics, caching, and GeoIP features.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## Overview

This API serves as a strategic intermediary layer between client-side applications and Funnelback's search infrastructure. It provides specialized endpoints optimized for different search needs while enhancing performance through Redis caching, collecting detailed analytics via MongoDB, and implementing comprehensive error handling and logging.

## Key Features

- **Redis Caching** - Significantly improves response times for common queries
- **MongoDB Analytics** - Detailed tracking of search behaviors and user interactions
- **GeoIP Integration** - Location-aware search results for better relevance
- **Session Tracking** - Persistent session IDs for analyzing user journeys
- **Edge Middleware** - Rate limiting and request optimization at the network edge
- **Specialized Endpoints** - Purpose-built handlers for different search contexts

## System Architecture

### API Endpoints

The proxy is structured around seven specialized handlers:

| Endpoint | Handler | Purpose |
|----------|---------|---------|
| `/proxy/funnelback` | `server.js` | Primary search entry point |
| `/proxy/funnelback/search` | `search.js` | Dedicated search results handler |
| `/proxy/funnelback/tools` | `tools.js` | Faceted search and advanced features |
| `/proxy/funnelback/spelling` | `spelling.js` | Spelling suggestion processing |
| `/proxy/funnelback/suggest` | `suggest.js` | General autocomplete functionality |
| `/proxy/suggestPeople` | `suggestPeople.js` | Faculty/staff search specialization |
| `/proxy/suggestPrograms` | `suggestPrograms.js` | Academic program search specialization |

### Analytics Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/proxy/analytics/click` | Record individual result clicks |
| `/proxy/analytics/clicks-batch` | Batch processing of click data |
| `/proxy/analytics/supplement` | Additional analytics collection |

### Testing/Utility Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/queryCount` | Analytics dashboard utilities |
| `/api/mongoTest` | Database connectivity testing |
| `/api/testAnalytics` | Analytics system validation |

## Technical Components

### Core Services

1. **Redis Caching Service**
   - Configurable TTL for different cache types
   - Automatic key generation based on query parameters
   - Versioned Redis instances for seamless rotation
   - Comprehensive logging of cache operations

2. **MongoDB Analytics**
   - Detailed query tracking with full metadata
   - Click-through analytics with position tracking
   - Session-based user journey analysis
   - Enrichment data for specialized content types

3. **GeoIP Service**
   - IP-based location detection
   - Geographic data enrichment for search results
   - In-memory caching of location data
   - Timezone-aware search processing

### Middleware System

Edge middleware performs critical functions before requests reach API handlers:

- Rate limiting based on endpoint type
- IP address preservation for accurate analytics
- Session ID generation and tracking
- Request header augmentation

### Request Processing Flow

```markdown
Client Request → Edge Middleware → Specialized Handler → Redis Cache Check → 
Funnelback API → Response Formatting → Analytics Recording → Client Response
```

## Response Formats

### People Search (`/proxy/suggestPeople`)

```javascript
[
  {
    title: "Person Name",
    affiliation: "Faculty/Staff", 
    position: "Position Title",
    department: "Department Name",
    college: "College Name",
    url: "Profile URL",
    image: "Image URL"
  }
]
```

### Program Search (`/proxy/suggestPrograms`)

```javascript
{
  metadata: {
    totalResults: number,
    queryTime: number,
    searchTerm: string
  },
  programs: [
    {
      id: number,
      title: string,
      url: string,
      details: {
        type: string,       // Program credential type
        school: string,     // Provider/school
        credits: string,    // Required credits
        area: string,       // Area of study
        level: string,      // Category/level
        mode: string        // Program mode
      },
      image: string,
      description: string
    }
  ]
}
```

### General Suggestions (`/proxy/funnelback/suggest`)

```javascript
[
  {
    display: "Suggestion text",
    metadata: {
      tabs: ["tab-name"] // Associated tabs
    }
  }
]
```

## Frontend Integration

### Base Search Implementation

```javascript
// Search configuration
const SEARCH_CONFIG = {
  baseUrl: 'https://your-domain.com/proxy/funnelback',
  collection: 'seattleu~sp-search'
};

// Basic search function
async function performSearch(query, options = {}) {
  const params = new URLSearchParams({
    query,
    collection: SEARCH_CONFIG.collection,
    ...options
  });
  
  try {
    const response = await fetch(`${SEARCH_CONFIG.baseUrl}/search?${params}`);
    if (!response.ok) throw new Error('Search failed');
    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

// Usage
const results = await performSearch('computer science', {
  profile: '_default',
  form: 'partial'
});
```

### Autocomplete Implementation

```javascript
// Suggestion function with debouncing
let suggestionTimer;
async function getSuggestions(query, handler = 'suggest', delay = 300) {
  // Clear previous timer
  clearTimeout(suggestionTimer);
  
  // Return empty array for short queries
  if (!query || query.length < 2) return [];
  
  // Create a promise that resolves after debounce delay
  return new Promise(resolve => {
    suggestionTimer = setTimeout(async () => {
      try {
        // Determine correct endpoint
        const endpoint = handler === 'suggest' 
          ? '/proxy/funnelback/suggest' 
          : `/proxy/${handler}`;
        
        // Include session ID if available
        const sessionId = localStorage.getItem('searchSessionId') || null;
        
        const params = new URLSearchParams({
          query,
          collection: 'seattleu~sp-search',
          sessionId
        });
        
        const response = await fetch(`${endpoint}?${params}`);
        if (!response.ok) throw new Error('Suggestion request failed');
        const data = await response.json();
        resolve(data);
      } catch (error) {
        console.error('Suggestion error:', error);
        resolve([]);
      }
    }, delay);
  });
}

// Usage examples
const peopleSuggestions = await getSuggestions('smith', 'suggestPeople');
const programSuggestions = await getSuggestions('computer', 'suggestPrograms');
const generalSuggestions = await getSuggestions('admission', 'suggest');
```

### Click Tracking Implementation

```javascript
// Track search result clicks
async function trackResultClick(resultData) {
  try {
    const clickData = {
      sessionId: localStorage.getItem('searchSessionId'),
      clickedUrl: resultData.url,
      clickedTitle: resultData.title,
      clickPosition: resultData.position,
      originalQuery: sessionStorage.getItem('lastSearchQuery'),
      timestamp: new Date().toISOString()
    };
    
    // Send as background request - don't await response
    fetch('/proxy/analytics/click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clickData),
      // Use keepalive to ensure the request completes even during page transitions
      keepalive: true
    });
    
    return true;
  } catch (error) {
    console.error('Click tracking error:', error);
    return false;
  }
}
```

## Advanced Features

### Tab-Specific Search

```javascript
// Program-specific search
async function searchPrograms(query) {
  const params = new URLSearchParams({
    query,
    collection: 'seattleu~sp-search',
    'f.Tabs|programMain': true
  });
  
  const response = await fetch(`/proxy/funnelback/search?${params}`);
  return await response.json();
}

// Faculty/Staff search
async function searchStaff(query) {
  const params = new URLSearchParams({
    query,
    collection: 'seattleu~sp-search',
    'f.Tabs|seattleu~ds-staff': 'Faculty & Staff'
  });
  
  const response = await fetch(`/proxy/funnelback/search?${params}`);
  return await response.json();
}
```

### Session Handling

```javascript
// Initialize or retrieve session ID
function getSearchSessionId() {
  let sessionId = localStorage.getItem('searchSessionId');
  
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('searchSessionId', sessionId);
  }
  
  return sessionId;
}

// Add session ID to all search requests
function addSessionToRequest(url) {
  const sessionId = getSearchSessionId();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}sessionId=${sessionId}`;
}
```

## Configuration

### Environment Variables

```markdown
# Funnelback Configuration
FUNNELBACK_BASE_URL=https://dxp-us-search.funnelback.squiz.cloud/s
ALLOWED_ORIGIN=https://www.seattleu.edu

# Redis Configuration (Caching)
REDIS_URL=redis://username:password@hostname:port
# OR using versioned instances for rotation
REDIS_URL_V1=redis://username:password@hostname:port
REDIS_URL_V2=redis://username:password@hostname:port
REDIS_URL_ACTIVE=REDIS_URL_V2

# MongoDB Configuration (Analytics)
MONGODB_URI=mongodb+srv://username:password@hostname/database

# Server Configuration
NODE_ENV=production
```

### Vercel Configuration

The project includes a `vercel.json` file that configures routing for the serverless functions:

```json
{
    "version": 2,
    "rewrites": [
        { "source": "/proxy/funnelback", "destination": "/api/server.js" },
        { "source": "/proxy/funnelback/search", "destination": "/api/search.js" },
        { "source": "/proxy/funnelback/tools", "destination": "/api/tools.js" },
        ...
    ],
    "headers": [
        {
            "source": "/proxy/analytics/(.*)",
            "headers": [
                { "key": "Access-Control-Allow-Credentials", "value": "true" },
                ...
            ]
        }
    ]
}
```

## Security Features

- **Rate Limiting** - Prevents abuse with endpoint-specific limits
- **CORS Restriction** - Limited to Seattle University domain
- **IP Tracking** - Preserves original client IP for accurate analytics
- **Header Sanitization** - Ensures clean request headers
- **Error Handling** - Comprehensive error handling across all handlers

## Caching TTL Strategy

Different TTLs based on content type:

| Content Type | TTL | Rationale |
|--------------|-----|-----------|
| Suggestions | 1 hour | Frequently changing |
| Programs | 24 hours | Relatively stable |
| People | 12 hours | Moderately stable |
| Default | 30 minutes | Conservative default |

Caching is only applied to queries with 3+ characters to avoid caching potentially low-quality results.

## Analytics Schema

The system records detailed analytics in MongoDB with this structure:

```javascript
{
  // Base query information
  handler: String,         // Which handler processed the request
  query: String,           // The actual search query
  searchCollection: String, // Funnelback collection used
  
  // User information (anonymized)
  userAgent: String,
  referer: String,
  sessionId: String,
  
  // Location information
  city: String,
  region: String,
  country: String,
  timezone: String,
  
  // Search results information
  responseTime: Number,    // Processing time in ms
  resultCount: Number,     // Number of results returned
  hasResults: Boolean,     // Whether any results were found
  cacheHit: Boolean,       // Whether result came from cache
  
  // Tab-specific information
  isProgramTab: Boolean,
  isStaffTab: Boolean,
  tabs: [String],
  
  // Enrichment data (content-specific)
  enrichmentData: Object,
  
  // Click tracking
  clickedResults: [{
    url: String,
    title: String,
    position: Number,
    timestamp: Date
  }],
  
  // Timestamps
  timestamp: Date,
  lastClickTimestamp: Date
}
```

## Performance Considerations

This system is optimized for high performance:

1. **Edge Processing** - Critical functions (rate limiting, session tracking) performed at the edge
2. **Redis Caching** - Dramatically reduces load on Funnelback API
3. **Asynchronous Analytics** - Background processing of analytics data
4. **Connection Pooling** - Efficient database connections
5. **Request Timeouts** - Prevents hanging connections
6. **Error Recovery** - Graceful handling of service disruptions

## Error Handling

All endpoints implement standardized error handling:

- HTTP 500 for server-side errors
- Detailed error messages in response
- Structured error logging with context
- Cache fallbacks when possible

## Development Guidelines

### Code Organization

```
/
├── api/                   # API endpoint handlers
│   ├── search.js          # Dedicated search handler
│   ├── suggest.js         # Suggestion handler
│   ├── suggestPeople.js   # People-specific handler  
│   ├── suggestPrograms.js # Program-specific handler
│   ├── tools.js           # Tools handler
│   ├── spelling.js        # Spelling suggestions
│   └── server.js          # Main server handler
│
├── lib/                   # Shared libraries
│   ├── cacheService.js    # Redis caching functionality
│   ├── redisClient.js     # Redis connection management
│   ├── geoIpService.js    # IP-based location detection
│   ├── queryAnalytics.js  # MongoDB analytics integration
│   ├── queryMiddleware.js # Query processing middleware
│   └── schemaHandler.js   # Schema validation/handling
│
├── middleware.js          # Edge middleware for Vercel
├── vercel.json            # Vercel configuration
├── package.json           # Dependencies
└── README.md              # Documentation
```

### Coding Standards

1. **Documentation** - All files include comprehensive JSDoc headers
2. **Error Handling** - Every function includes proper error handling
3. **Logging** - Structured JSON logging for serverless environment
4. **Schema Validation** - Consistent data structure validation
5. **Caching Awareness** - Cache-aware code with proper invalidation

## Testing

For testing this API:

```bash
# Install testing dependencies
npm install --save-dev jest supertest nock

# Add to package.json scripts
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### Key Testing Areas

1. **Handler Functions** - Test data transformation
2. **Error Handling** - Verify proper error responses
3. **Caching Logic** - Test cache hits, misses and expirations
4. **Analytics Recording** - Validate data structure
5. **Edge Middleware** - Test rate limiting functionality

### Example Test Cases

```javascript
// Test suggestion handler
describe('Suggestion Handler', () => {
  test('should return enriched suggestions', async () => {
    // Mock request
    const req = { 
      query: { query: 'computer' },
      headers: { 'user-agent': 'test-agent' }
    };
    const res = { 
      setHeader: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
    
    // Mock Funnelback response
    axios.get.mockResolvedValueOnce({
      status: 200,
      data: ['computer science', 'computer engineering']
    });
    
    // Call handler
    await handler(req, res);
    
    // Assertions
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.length).toBe(2);
    expect(result[0].display).toBe('computer science');
  });
});
```

## Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy using the Vercel CLI:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to production
vercel --prod
```

### Required Setup

1. **Redis Instance** - For caching
2. **MongoDB Atlas** - For analytics
3. **Vercel Account** - For serverless deployment
4. **Funnelback API Access** - For search backend

## Monitoring and Maintenance

### Key Metrics to Monitor

1. **Cache Hit Ratio** - Target >80% for suggestion endpoints
2. **API Response Times** - Target <200ms for cached responses
3. **Error Rates** - Target <0.1% of total requests
4. **Rate Limit Hits** - Should be near-zero in normal operation

### Log Analysis

The system includes structured JSON logging designed for extraction to analytics tools:

```javascript
{
  "service": "suggest-programs",
  "version": "6.1.0",
  "timestamp": "2025-03-26T10:15:30Z",
  "level": "info",
  "message": "Programs search completed",
  "performance": {
    "duration": "125ms",
    "status": 200,
    "cacheHit": true
  },
  "userIp": "[redacted]",
  "location": {
    "city": "Seattle",
    "region": "Washington",
    "country": "US"
  }
}
```

### Cache Maintenance

Redis cache requires periodic management:

1. **Cache Rotation** - Using versioned Redis URLs (REDIS_URL_V1, REDIS_URL_V2)
2. **Selective Invalidation** - When content changes
3. **Monitoring** - Observing hit/miss ratios

## Troubleshooting

### Common Issues

1. **Missing Response Headers**
   - Check CORS configuration in vercel.json
   - Verify middleware is properly setting headers

2. **Cache Inconsistencies**
   - Verify Redis connection string
   - Check if Redis instance is running
   - Implement cache invalidation for affected keys

3. **Slow Response Times**
   - Identify Redis connectivity issues
   - Check MongoDB connection pool
   - Verify Funnelback API response times
   - Check for rate limiting issues

4. **Analytics Not Recording**
   - Validate MongoDB connection string
   - Check schema validation errors in logs
   - Verify session ID generation

## Performance Optimization

### Caching Strategy

The system implements a sophisticated caching approach:

1. **Selective Caching** - Only cache queries with 3+ characters
2. **Content-Based TTL** - Different TTLs based on content volatility
3. **Cache Key Generation** - Based on endpoint and query parameters
4. **Cache Hit Logging** - For monitoring performance

### Request Optimization

1. **Debouncing** - For suggestion endpoints
2. **Reduced Payload Size** - Trimming unnecessary data
3. **Response Compression** - For larger responses
4. **Header Optimization** - Minimizing header size

## Security Guidelines

1. **Rate Limiting** - Prevents abuse with graduated thresholds
2. **CORS Restrictions** - Limited to approved domains
3. **IP Preservation** - For accurate analytics and abuse prevention
4. **No PII Storage** - Personal data is anonymized
5. **Headers Sanitization** - Prevents header injection attacks

## Contribution Guidelines

### Repository Access

- Read/Write access: Restricted to authorized collaborators
- Deploy access: Restricted to production systems
- Branch protection: Enabled on main branch

### For Contributors

1. Clone the repository:

   ```bash
   git clone https://github.com/username/funnelback-proxy.git
   ```

2. Create a new branch:

   ```bash
   git checkout -b feature/description-of-change
   ```

3. Make changes following code standards

4. Write tests for new functionality

5. Submit a pull request with detailed description

### Commit Message Format

```markdown
type(scope): description

- feat(suggestPeople): add department field to response
- fix(caching): resolve issue with cache key generation
- docs(readme): update API documentation
- refactor(middleware): improve rate limiting logic
```

## API Reference

### Search Endpoint

```markdown
GET /proxy/funnelback/search
```

**Parameters:**

- `query` (string, required) - Search query
- `collection` (string) - Funnelback collection (default: 'seattleu~sp-search')
- `profile` (string) - Search profile (default: '_default')
- `form` (string) - Result format (default: 'partial')
- `sessionId` (string) - Session identifier

**Response:** HTML search results

### Suggestion Endpoint

```markdown
GET /proxy/funnelback/suggest
```

**Parameters:**

- `query` (string, required) - Partial search query
- `collection` (string) - Funnelback collection
- `sessionId` (string) - Session identifier

**Response:** Array of enriched suggestions

### People Suggestion Endpoint

```markdown
GET /proxy/suggestPeople
```

**Parameters:**

- `query` (string, required) - Partial search query
- `sessionId` (string) - Session identifier

**Response:** Array of people objects with metadata

### Program Suggestion Endpoint

```markdown
GET /proxy/suggestPrograms
```

**Parameters:**

- `query` (string, required) - Partial search query
- `sessionId` (string) - Session identifier

**Response:** Object with metadata and program array

### Click Tracking Endpoint

```markdown
POST /proxy/analytics/click
```

**Request Body:**

```json
{
  "sessionId": "string",
  "clickedUrl": "string",
  "clickedTitle": "string",
  "clickPosition": "number",
  "originalQuery": "string"
}
```

**Response:** Status object

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Authors

- Victor Chimenti

## Acknowledgments

- Funnelback Search API
