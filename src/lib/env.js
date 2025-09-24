import pkg from '@next/env';
const { loadEnvConfig } = pkg;

// Load environment variables
loadEnvConfig(process.cwd());

// Export configuration object for reusability
export const config = {
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  nextAuth: {
    url: process.env.NEXTAUTH_URL,
    secret: process.env.NEXTAUTH_SECRET,
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
  },
  nodeEnv: process.env.NODE_ENV,
};

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'NEXTAUTH_SECRET',
  'GOOGLE_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}\n` +
    'Please check your .env.local file'
  );
}

console.log('✅ Environment variables loaded successfully');

export default config;