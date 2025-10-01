# Aechan Huend Gaash - Visual Assistance Platform

A comprehensive web-based platform that connects blind and low-vision users with sighted volunteers and AI assistance for real-time visual support. Built with Next.js 15, this accessible application enables video calls between users and volunteers, plus AI-powered image descriptions with advanced sound notifications.

## 🔗 Live Demo

**[Visit the Live Application](https://aechan-huend-gaash-web.vercel.app)**

## 🌟 Features

- **Two User Roles**: VI Users (visually impaired) and Volunteers with role-based dashboards
- **Real-time Video Calls**: WebRTC-powered two-way video and audio communication
- **AI Assistant**: Google Gemini-powered image analysis with text-to-speech capabilities
- **Smart Sound System**: Audio notifications for call events (incoming, outgoing, connected, ended)
- **Volunteer Matching**: Real-time broadcast system for connecting available volunteers
- **Session Management**: Persistent call sessions with reconnection support
- **User Statistics**: Call tracking, duration monitoring, and volunteer activity metrics
- **Multi-language Support**: Interface and audio descriptions in 10+ languages
- **Full Accessibility**: WCAG 2.1 AA compliance with screen reader support
- **Secure Authentication**: NextAuth.js with role-based access control

## � Screenshots

### Welcome Page

The main landing page where users choose their path - either seeking visual assistance or volunteering to help others. This accessible interface clearly presents both options with descriptive text.

![Welcome Page](public/screenshots/welcome-page.png)

### User Registration

Role-based signup pages tailored for each user type, ensuring the registration process is optimized for the specific needs of VI users and volunteers.

#### VI User Signup

![VI User Signup](public/screenshots/vi-user-signup.png)

#### Volunteer Signup

![Volunteer Signup](public/screenshots/volunteer-signup.png)

### User Authentication

Accessible signin pages designed for each user role with clear navigation and form validation.

#### VI User Signin

![VI User Signin](public/screenshots/vi-user-signin.png)

#### Volunteer Signin

![Volunteer Signin](public/screenshots/volunteer-signin.png)

### VI User Dashboard

The dashboard for visually impaired users provides quick access to essential features including starting video calls with volunteers and using the AI assistant for image analysis.

![VI User Dashboard](public/screenshots/vi-dashboard.png)

### Volunteer Dashboard

Volunteers can toggle their availability, view incoming call requests, and track their volunteer statistics through this dedicated interface.

![Volunteer Dashboard](public/screenshots/volunteer-dashboard.png)

### User Profile

A comprehensive profile management interface where users can update their preferences, change passwords, and manage account settings with full accessibility support.

![User Profile](public/screenshots/user-profile.png)

### Video Call Interface

The real-time video call interface connecting VI users with volunteers, featuring accessible controls and clear visual indicators for call status.

![Video Call Interface](public/screenshots/video-call.png)

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**: Latest LTS version recommended
- **MongoDB**: Local instance or MongoDB Atlas cloud database
- **Google Gemini API Key**: For AI image analysis functionality
- **Modern Browser**: Chrome, Firefox, Safari, or Edge with WebRTC support

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd aechan-huend-gaash
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create `.env.local` with your configuration:

   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/aechan-huend-gaash

   # Authentication
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secure-secret-key-minimum-32-characters

   # AI Services
   GOOGLE_API_KEY=your-google-gemini-api-key
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Access the application**
   Open [http://localhost:3000](http://localhost:3000) in your browser

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production application
- `npm start` - Start production server
- `npm run lint` - Run ESLint for code quality checks

## 📱 Usage Guide

### For VI Users (Visually Impaired)

1. **Account Setup**: Click "I need visual assistance" → Create account and select language
2. **Dashboard Features**: Call volunteers, use AI assistant, manage profile, view history
3. **During Calls**: Enable camera to share view, use audio to describe needs

### For Volunteers

1. **Account Setup**: Click "I would like to volunteer" → Create account and set availability
2. **Dashboard Features**: Toggle availability, accept calls, view statistics
3. **During Calls**: Provide clear descriptions, ask clarifying questions, be supportive

### AI Assistant Usage

- Upload images or use camera capture
- Receive detailed text descriptions with audio playback
- Re-analyze images with different perspectives

## 🏗️ Technology Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Radix UI
- **Backend**: Next.js API Routes, Socket.IO, NextAuth.js v5
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: WebRTC for video calls, Socket.IO for signaling
- **AI**: Google Gemini API for image analysis
- **Audio**: Web Audio API for sound notifications

## 📂 Project Structure

```
aechan-huend-gaash/
├── public/
│   ├── sounds/                 # Audio notification files
│   │   ├── incoming-call.mp3   # Volunteer incoming call alert
│   │   ├── outgoing-call.mp3   # VI user connection sound
│   │   ├── call-connected.mp3  # Success notification
│   │   └── call-ended.mp3      # Call termination sound
│   └── [static files]          # Icons, images, favicon
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/                # API routes
│   │   │   ├── ai/             # AI image analysis endpoints
│   │   │   ├── auth/           # Authentication routes
│   │   │   ├── user/           # User management APIs
│   │   │   └── volunteer/      # Volunteer-specific APIs
│   │   ├── auth/               # Authentication pages
│   │   ├── call/               # Video call interface
│   │   ├── dashboard/          # User dashboards
│   │   │   ├── vi-user/        # VI User dashboard
│   │   │   └── volunteer/      # Volunteer dashboard
│   │   ├── ai-assistant/       # AI image analysis interface
│   │   ├── profile/            # User profile management
│   │   └── [layout & global files]
│   ├── components/             # Reusable UI components
│   │   ├── providers/          # Context providers
│   │   └── ui/                 # Base UI components
│   ├── contexts/               # React contexts (if any)
│   ├── hooks/                  # Custom React hooks
│   │   └── useSocket.js        # Socket.IO connection hook
│   ├── lib/                    # Utility libraries
│   │   ├── auth.js             # NextAuth configuration
│   │   ├── db.js               # Database connection
│   │   ├── env.js              # Environment validation
│   │   ├── utils.js            # General utilities
│   │   └── sounds.js           # Audio management system
│   └── models/                 # Database schemas
│       ├── User.js             # User data model
│       ├── Call.js             # Call session model
│       └── Session.js          # Session management
├── server.js                   # Custom server with Socket.IO
├── next.config.mjs             # Next.js configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── eslint.config.mjs           # ESLint configuration
└── [config files]             # Package.json, etc.
```

## 🔧 API Reference

### Authentication Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/signin` - User authentication
- `GET /api/auth/session` - Session validation

### User Management

- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `POST /api/user/change-password` - Change password
- `GET /api/user/stats` - Get user statistics

### Volunteer Management

- `PUT /api/volunteer/availability` - Toggle availability status

### AI Services

- `POST /api/ai/analyze` - Analyze uploaded images

### Socket Events

#### Client → Server

- `join` - User joins with role and profile data
- `start_call` - VI user requests assistance
- `accept_call` - Volunteer accepts call request
- `end_call` - Either party ends the call
- `joinRoom` - Join specific call room
- `offer`, `answer`, `ice-candidate` - WebRTC signaling

#### Server → Client

- `incoming_call` - Notify volunteers of call requests
- `call_connected` - Notify both parties of successful connection
- `call_ended` - Notify call termination
- `call_taken` - Notify call was accepted by another volunteer
- `user_reconnected` - Notify of reconnection events

## 🛠️ Development

### Development Setup

For detailed development setup, see the [Getting Started](#-getting-started) section above.

### Code Standards

- **JavaScript**: ES6+ with proper error handling
- **CSS**: Tailwind utilities with semantic class names
- **Accessibility**: WCAG 2.1 AA compliance required
- **Performance**: Optimize images, lazy load components
- **Security**: Validate all inputs, sanitize data

---

## 🆘 Support

- **Issues**: Report bugs via GitHub Issues
- **Documentation**: Check inline code comments
- **Support**: Contact maintainers for critical issues

---

**Built with ❤️ for accessibility and inclusion by [Naik Mubashir](https://www.github.com/naikmubashir)**
