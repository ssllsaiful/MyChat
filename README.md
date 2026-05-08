# Personal Chat App

A real-time chat application built with **Django** (Backend) and **Next.js** (Frontend).

## Features
- Real-time messaging using WebSockets (Django Channels).
- JWT Authentication (Login/Register).
- Premium Dark Mode UI.
- Channel-based chat rooms.

## Setup Instructions

### Backend (Django)
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (if you haven't already):
   ```bash
   python -m venv env
   .\env\Scripts\Activate.ps1  # Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. Start the development server (using Daphne for WebSocket support):
   ```bash
   python manage.py runserver
   ```

### Frontend (Next.js)
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## How to Test
1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. **Register** a new account.
3. **Login** with your credentials.
4. Open a **second browser tab** (or an Incognito window) and register/login with a **different user**.
5. Start chatting in the **# General** channel!
