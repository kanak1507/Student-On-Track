StudentOnTrack

StudentOnTrack is a full-stack student productivity and accountability tracker that helps students manage assignments, attendance, and personal goals in one place.

Features

🔐 User registration and secure login

📝 Add, edit, complete, and delete assignments

📊 Track attendance and attendance percentage

🎯 Create and track personal goals

⏰ Identify overdue assignments and goals

📈 Dashboard with a quick progress overview

👤 User-specific data with PostgreSQL

Tech Stack:
Frontend: HTML, CSS, Vanilla JavaScript

Backend: Node.js, Express.js

Database: PostgreSQL

Authentication: bcrypt + JWT

Database Driver: pg

Installation
1. Clone the repository

git clone https://github.com/kanak1507/Student-On-Track.git
cd Student-On-Track

2. Install dependencies

npm install

3. Set up PostgreSQL

Create a database named:

studentontrack

Then run the project's schema.sql file on that database.

4. Configure environment variables

Create a .env file in the project root:

PORT=3000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/studentontrack
JWT_SECRET=your_long_random_secret

5. Start the application

npm start

Open http://localhost:3000 in your browser.



Security:
Passwords are securely hashed using bcrypt.
JWT is used for authentication.
Database credentials and secrets are stored in environment variables.
.env is excluded from Git.
Note: This project currently stores the JWT in browser localStorage. For production, HttpOnly cookies and HTTPS are recommended.
Author
Kanak Kumari
