# Eve Organizational AI Platform

Private Organization AI Platform integrating local AI capabilities using Ollama.

## Features
- **Local AI Integration**: Powered by Ollama for privacy-focused, local AI processing.
- **Voice Service**: Python-based voice synthesis using ONNX models.
- **User Authentication**: Secure JWT-based login and registration.
- **Admin Dashboard**: Manage users, conversations, and view statistics.
- **Database**: Embedded SQLite database for easy setup.

## Project Structure
- `/client`: Frontend interface built with Vite, HTML, CSS, and Vanilla JS.
- `/server`: Node.js/Express backend handling API routes, authentication, and Ollama integration.
- `/voice_service`: Python service for text-to-speech capabilities.
- `/api`: Serverless function endpoints for Vercel deployment.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Python 3](https://www.python.org/)
- [Ollama](https://ollama.com/) running locally

### Installation

1. **Install Root/Backend Dependencies**
   ```bash
   npm install
   ```

2. **Install Frontend Dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

3. **Install Voice Service Dependencies**
   ```bash
   cd voice_service
   pip install -r requirements.txt
   cd ..
   ```
   *Note: Due to file size limits, the `en_US-lessac-high.onnx` model file is not tracked by Git. You will need to download and place it in the `voice_service/` directory for voice features to work.*

### Running the Application Locally

The project includes convenient batch files for Windows users:
- Run `setup.bat` to initialize the project and install dependencies.
- Run `start.bat` to launch the backend and frontend simultaneously.

Alternatively, you can start the services manually:

**Start Backend (Port 3000):**
```bash
npm run dev
```

**Start Frontend (Port 5173):**
```bash
npm run client
```

## Deployment
This project includes a `vercel.json` file for automatic deployment of the frontend and serverless API functions to [Vercel](https://vercel.com).
