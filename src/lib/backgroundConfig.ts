/**
 * Configuration for the animated background
 * 
 * Easily customize the background appearance by modifying these values
 */

export type BackgroundMode = 'particles' | 'waves';

export interface BackgroundConfig {
  mode: BackgroundMode;
  particleCount: number;
  colors: string[];
}

/**
 * Available color themes for the animated background
 */
export const backgroundThemes = {
  default: {
    name: 'Purple Blue Cyan',
    colors: [
      'rgba(138, 43, 226, 0.8)',  // Purple
      'rgba(33, 150, 243, 0.8)',   // Blue
      'rgba(16, 185, 129, 0.8)'    // Cyan/Green
    ]
  },
  sunset: {
    name: 'Sunset Orange Pink',
    colors: [
      'rgba(255, 92, 0, 0.8)',     // Orange
      'rgba(255, 0, 110, 0.8)',    // Pink
      'rgba(138, 43, 226, 0.8)'    // Purple
    ]
  },
  ocean: {
    name: 'Ocean Blues',
    colors: [
      'rgba(0, 180, 255, 0.8)',    // Light Blue
      'rgba(33, 150, 243, 0.8)',   // Blue
      'rgba(13, 71, 161, 0.8)'     // Dark Blue
    ]
  },
  forest: {
    name: 'Forest Greens',
    colors: [
      'rgba(16, 185, 129, 0.8)',   // Light Green
      'rgba(5, 150, 105, 0.8)',    // Green
      'rgba(4, 120, 87, 0.8)'      // Dark Green
    ]
  },
  fire: {
    name: 'Fire Red Orange',
    colors: [
      'rgba(255, 193, 7, 0.8)',    // Yellow
      'rgba(255, 87, 34, 0.8)',    // Orange
      'rgba(244, 67, 54, 0.8)'     // Red
    ]
  }
};

/**
 * Default background configuration
 */
export const defaultBackgroundConfig: BackgroundConfig = {
  mode: 'particles',
  particleCount: 80,
  colors: backgroundThemes.default.colors
};

/**
 * Get a theme by name
 */
export const getTheme = (themeName: keyof typeof backgroundThemes) => {
  return backgroundThemes[themeName].colors;
};
