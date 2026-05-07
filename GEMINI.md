# Re:View - Wrong Note Management System

## Project Overview
**Re:View** is a collaborative web application designed to help learners manage and review their "Wrong Notes" (mistake logs). Users can document their mistakes, categorize them by type (e.g., calculation errors, conceptual gaps), share them with others, and participate in a Q&A community.

### Key Features
- **Wrong Note Management:** Create, edit, and delete logs of mistakes with problem images and solutions.
- **Categorization:** Tag mistakes with specific "Wrong Types" for better analysis.
- **Q&A Board:** A dedicated space for asking questions and receiving answers from the community.
- **Social Interaction:** Like notes, follow other users, and comment on shared notes.
- **Review Scheduling:** Automatic generation of review schedules to reinforce learning.
- **Statistics:** Track personal progress and identify common error types.

### Architecture & Tech Stack
- **Backend:** Node.js with [Express.js](https://expressjs.com/) framework.
- **Database:** [PostgreSQL](https://www.postgresql.org/) for persistent storage.
- **Template Engine:** [EJS](https://ejs.co/) for server-side rendering.
- **Session Management:** `express-session` backed by PostgreSQL (`connect-pg-simple`).
- **Authentication:** `bcryptjs` for secure password hashing.
- **Environment Management:** `dotenv` for configuration via `.env` files.

---

## Getting Started

### Prerequisites
- Node.js (v14+ recommended)
- PostgreSQL database

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables (see [Configuration](#configuration)).
4. Initialize the database schema using `repo/db/schema.sql`.

### Running the Application
- **Development Mode:**
  ```bash
  npm start
  ```
  The server typically runs on port `3000` unless specified otherwise in the `.env` file.

### Testing
Currently, there is no formal test suite. Running `npm test` will echo an error message.

---

## Configuration
Create a `.env` file in the `repo` directory with the following variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (e.g., `postgres://user:pass@localhost:5432/db`) | **Required** |
| `SESSION_SECRET` | Secret key used for signing session cookies | `review-default-dev-secret-key` |
| `PORT` | Port number for the Express server | `3000` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |

---

## Project Structure
- `repo/server.js`: The main application entry point. Handles middleware configuration, routing, and session setup.
- `repo/db/`:
    - `index.js`: Exports the PostgreSQL connection pool and query helper.
    - `schema.sql`: Contains the SQL DDL for creating the application's tables and initial data.
- `repo/views/`: Contains EJS templates for all application pages (login, signup, board, profile, etc.).
    - `partials/`: Reusable template components (e.g., header, footer).
- `repo/public/`: Static assets.
    - `css/style.css`: Main stylesheet for the application.

---

## Development Conventions

### Coding Style
- **CommonJS:** The project uses `require` and `module.exports`.
- **Async/Await:** All database operations and asynchronous logic should use `async/await` with `try/catch` blocks for error handling.
- **Database Access:** Use the `db.query` helper from `./db` to execute SQL. Prefer parameterized queries to prevent SQL injection.

### Database Design
- Tables are defined in `repo/db/schema.sql`.
- The `User` table is capitalized.
- Relational integrity is maintained via foreign keys with `ON DELETE CASCADE`.

### Session & Security
- Passwords must be hashed using `bcrypt` before storage.
- Session data is stored in the `session` table in PostgreSQL.
- Always verify `req.session.user` for routes requiring authentication.

---

## Future Improvements (TODO)
- [ ] Implement a robust test suite (Unit and Integration tests).
- [ ] Add image upload functionality (currently relies on `problem_image_url` strings).
- [ ] Enhance the statistics dashboard with visualizations.
- [ ] Add password reset functionality.
