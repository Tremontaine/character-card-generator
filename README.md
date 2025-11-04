# SillyTavern Character Generator

A web application for generating SillyTavern character cards using AI. Create detailed character profiles, descriptions, and images for use with SillyTavern.

## Features

- **AI-Powered Character Generation**: Generate comprehensive character cards with AI assistance
- **Text API Integration**: Works with various text generation APIs (OpenAI, OpenRouter, etc.)
- **Image Generation**: Create character images using AI image generation APIs
- **Character Profiles**: Generate detailed backstories, personality traits, and relationships
- **SillyTavern Compatible**: Output formats compatible with SillyTavern
- **Web Interface**: Clean, user-friendly web interface for character creation
- **Docker Support**: Easy deployment with Docker Compose
- **Local Development**: Run directly with Node.js and npm

## API Configuration
Configure your AI APIs through the web interface settings panel:
- **Text API**: Configure your text generation API (OpenAI, OpenRouter, etc.)
- **Image API**: Configure your image generation API (DALL-E, etc.)

API keys and settings are stored in browser localStorage and managed through the web interface.

## Usage

1. **Configure APIs**: Click the settings icon in the web interface to configure your text and image generation APIs
2. **Create Character**: Enter a character concept and optional name
3. **Generate Content**: Use the AI-powered generators to create character details
4. **Export**: Download your completed character card

## Quick Start with Docker Compose

1. **Clone and Setup**:
   ```bash
   git clone <repository-url>
   cd character-card-generator
   ```

2. **Configure Environment (optional)**:
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Start with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

4. **Access the Application**:
   - Frontend: http://localhost:2427
   - Backend API: http://localhost:2426

## Direct Installation

1. **Install Dependencies**:
   ```bash
   npm install
   cd proxy && npm install
   cd ..
   ```

2. **Configure Environment (optional)**:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start**:
   ```bash
   npm run dev
   ```

4. **Access the Application**:
   - Frontend: http://localhost:2427
   - Backend API: http://localhost:2426

## Environment Configuration

Copy `.env.example` to `.env` and configure the following settings:

### Working Server Configuration
- `FRONTEND_PORT`: Frontend web interface port (default: 2427)
- `PROXY_PORT`: Backend proxy server port (default: 2426)
- `FRONTEND_URL`: Frontend URL for CORS headers (default: auto-generated from FRONTEND_PORT)
