# StudentOnTrack — PostgreSQL Full-Stack Version

## Stack
- Frontend: HTML + CSS + Vanilla JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: bcrypt password hashing + JWT
- Database driver: `pg`

## Setup

### 1. Install Node.js
Use a current LTS version of Node.js.

### 2. Create the PostgreSQL database
Create an empty database named `studentontrack`.

Example with psql:
```sql
CREATE DATABASE studentontrack;
```

Then run `db/schema.sql` against that database.

### 3. Configure environment variables
Copy `.env.example` to `.env` and set:
- `DATABASE_URL`
- `JWT_SECRET`

Example:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/studentontrack
JWT_SECRET=use-a-long-random-secret-here
```

### 4. Install dependencies
```bash
npm install
```

### 5. Start the server
```bash
npm start
```

Open:
`http://localhost:3000`

## Important
There is no fake student data. Each account starts empty.

Passwords are hashed with bcrypt and are never stored as plain text.

The JWT is stored in browser localStorage in this starter implementation. For a production deployment, use secure, HttpOnly cookies and HTTPS.
