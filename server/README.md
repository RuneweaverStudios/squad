# Demo Backend API

Express.js REST API with SQLite database for demo application.

## Features

- ✅ Express.js server with modern ES modules
- ✅ SQLite database with better-sqlite3
- ✅ RESTful API design
- ✅ CORS enabled for cross-origin requests
- ✅ Error handling middleware
- ✅ Health check endpoint
- ✅ Request logging
- ✅ Graceful shutdown

## Quick Start

```bash
# Install dependencies
npm install

# Start server (development mode with watch)
npm run dev

# Or start in production mode
npm start
```

Server runs at: **http://localhost:3000**

## API Endpoints

### Root
- `GET /` - API information and available endpoints

### Health Check
- `GET /health` - Server and database health status

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Items
- `GET /api/items` - Get all items (query params: `user_id`, `status`)
- `GET /api/items/:id` - Get item by ID
- `POST /api/items` - Create new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

## API Examples

### Create User
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2025-11-20 10:00:00"
  }
}
```

### Create Item
```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "title": "Buy groceries",
    "description": "Milk, eggs, bread",
    "status": "pending"
  }'
```

### Get Items by User
```bash
curl http://localhost:3000/api/items?user_id=1
```

### Update Item Status
```bash
curl -X PUT http://localhost:3000/api/items/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

## Environment Variables

Create a `.env` file in the server directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./data/demo.db

# CORS
CORS_ORIGIN=http://localhost:3333
```

## Project Structure

```
server/
├── src/
│   ├── config/
│   │   └── database.js         # SQLite database configuration
│   ├── middleware/
│   │   └── errorHandler.js     # Error handling middleware
│   ├── routes/
│   │   ├── health.js           # Health check endpoint
│   │   ├── users.js            # User CRUD operations
│   │   └── items.js            # Item CRUD operations
│   └── index.js                # Server entry point
├── data/
│   └── demo.db                 # SQLite database (auto-created)
├── package.json
├── .env.example
└── README.md
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Items Table
```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Error Responses

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `409` - Conflict (e.g., duplicate email)
- `500` - Internal Server Error

## Development

### Watch Mode
```bash
npm run dev
```

Uses Node.js `--watch` flag to automatically restart on file changes.

### Testing
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test root endpoint
curl http://localhost:3000/

# Test users endpoint
curl http://localhost:3000/api/users
```

## License

MIT
