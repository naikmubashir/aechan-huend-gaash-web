/**
 * Sound utility functions for call notifications
 */

// Sound file paths
const SOUNDS = {
  INCOMING_CALL: "/sounds/incoming-call.mp3",
  OUTGOING_CALL: "/sounds/outgoing-call.mp3",
  CALL_CONNECTED: "/sounds/call-connected.mp3",
  CALL_ENDED: "/sounds/call-ended.mp3",
};

// Audio instances cache to avoid creating multiple instances
const audioInstances = {};

/**
 * Create or get audio instance for a sound
 * @param {string} soundPath - Path to the sound file
 * @returns {HTMLAudioElement} Audio element
 */
const getAudioInstance = (soundPath) => {
  if (!audioInstances[soundPath]) {
    audioInstances[soundPath] = new Audio(soundPath);
    // Set default volume
    audioInstances[soundPath].volume = 0.7;
    // Preload the audio
    audioInstances[soundPath].preload = "auto";
  }
  return audioInstances[soundPath];
};

/**
 * Play a sound with error handling
 * @param {string} soundPath - Path to the sound file
 * @param {object} options - Playback options
 * @returns {Promise<void>}
 */
const playSound = async (soundPath, options = {}) => {
  try {
    const audio = getAudioInstance(soundPath);

    // Set options
    if (options.volume !== undefined) {
      audio.volume = Math.max(0, Math.min(1, options.volume));
    }

    if (options.loop !== undefined) {
      audio.loop = options.loop;
    }

    // Reset audio to beginning if it was played before
    audio.currentTime = 0;

    // Play the sound
    await audio.play();

    console.log(`Playing sound: ${soundPath}`);

    return audio;
  } catch (error) {
    console.warn(`Failed to play sound ${soundPath}:`, error);
    // Don't throw error to prevent breaking the app
    return null;
  }
};

/**
 * Stop a specific sound
 * @param {string} soundPath - Path to the sound file
 */
const stopSound = (soundPath) => {
  try {
    const audio = audioInstances[soundPath];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.loop = false;
      console.log(`Stopped sound: ${soundPath}`);
    }
  } catch (error) {
    console.warn(`Failed to stop sound ${soundPath}:`, error);
  }
};

/**
 * Stop all currently playing sounds
 */
const stopAllSounds = () => {
  Object.keys(audioInstances).forEach((soundPath) => {
    stopSound(soundPath);
  });
};

// Specific sound functions for different call events

/**
 * Play incoming call sound (looping)
 * @param {number} volume - Volume level (0-1)
 * @returns {Promise<HTMLAudioElement|null>}
 */
export const playIncomingCallSound = async (volume = 0.8) => {
  return await playSound(SOUNDS.INCOMING_CALL, {
    volume,
    loop: true,
  });
};

/**
 * Stop incoming call sound
 */
export const stopIncomingCallSound = () => {
  stopSound(SOUNDS.INCOMING_CALL);
};

/**
 * Play outgoing call sound (looping)
 * @param {number} volume - Volume level (0-1)
 * @returns {Promise<HTMLAudioElement|null>}
 */
export const playOutgoingCallSound = async (volume = 0.7) => {
  return await playSound(SOUNDS.OUTGOING_CALL, {
    volume,
    loop: true,
  });
};

/**
 * Stop outgoing call sound
 */
export const stopOutgoingCallSound = () => {
  stopSound(SOUNDS.OUTGOING_CALL);
};

/**
 * Play call connected sound (single play)
 * @param {number} volume - Volume level (0-1)
 * @returns {Promise<HTMLAudioElement|null>}
 */
export const playCallConnectedSound = async (volume = 0.8) => {
  // First stop any ongoing call sounds
  stopIncomingCallSound();
  stopOutgoingCallSound();

  return await playSound(SOUNDS.CALL_CONNECTED, { volume });
};

/**
 * Play call ended sound (single play)
 * @param {number} volume - Volume level (0-1)
 * @returns {Promise<HTMLAudioElement|null>}
 */
export const playCallEndedSound = async (volume = 0.8) => {
  // Stop all other sounds first
  stopAllSounds();

  return await playSound(SOUNDS.CALL_ENDED, { volume });
};

/**
 * Stop all call sounds
 */
export const stopAllCallSounds = () => {
  stopAllSounds();
};

// Export sound constants for reference
export { SOUNDS };
