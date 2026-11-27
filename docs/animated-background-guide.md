# Animated Background Customization Guide

This guide explains how to customize the interactive animated background on your PopupGenix website.

## Overview

The animated background is a full-screen interactive canvas that responds to cursor movement with particle effects, glowing elements, and smooth animations.

## Location

The background is implemented in:
- **Component**: `src/components/AnimatedBackground.tsx`
- **Configuration**: `src/lib/backgroundConfig.ts`
- **Integration**: `src/App.tsx`

## Quick Customization

### 1. Change Background Mode

In `src/App.tsx`, modify the `mode` prop:

```tsx
<AnimatedBackground mode="particles" />  // Floating particles with connections
// or
<AnimatedBackground mode="waves" />      // Fluid wave animations
```

### 2. Change Color Theme

#### Option A: Use Pre-defined Themes

In `src/App.tsx`:

```tsx
import { getTheme } from '@/lib/backgroundConfig';

// Use one of these themes: 'default', 'sunset', 'ocean', 'forest', 'fire'
<AnimatedBackground 
  mode="particles" 
  colors={getTheme('ocean')} 
/>
```

**Available Themes:**
- `default` - Purple, Blue, Cyan (current)
- `sunset` - Orange, Pink, Purple
- `ocean` - Light Blue, Blue, Dark Blue
- `forest` - Light Green, Green, Dark Green
- `fire` - Yellow, Orange, Red

#### Option B: Custom Colors

In `src/App.tsx`:

```tsx
<AnimatedBackground 
  mode="particles"
  colors={[
    'rgba(255, 0, 150, 0.8)',   // Pink
    'rgba(100, 200, 255, 0.8)', // Sky Blue
    'rgba(150, 255, 100, 0.8)'  // Light Green
  ]}
/>
```

**Color Format**: Use `rgba()` with alpha channel (0.6-0.9 recommended for best effect)

### 3. Adjust Particle Count

More particles = More visual density (but more performance cost)

```tsx
<AnimatedBackground 
  mode="particles"
  particleCount={120}  // Default: 80, Range: 40-150
/>
```

**Recommendations:**
- Desktop: 80-120 particles
- Tablet: 50-80 particles
- Mobile: 30-50 particles (can add responsive logic)

## Advanced Customization

### Modify Particle Behavior

Edit `src/components/AnimatedBackground.tsx`:

#### Change Particle Size
```typescript
size: Math.random() * 5 + 2,  // Default: 3 + 1 (range 1-4)
```

#### Adjust Mouse Interaction Distance
```typescript
const maxDistance = 200;  // Default: 150 (pixels)
```

#### Change Particle Speed
```typescript
vx: (Math.random() - 0.5) * 1.0,  // Default: 0.5
vy: (Math.random() - 0.5) * 1.0,
```

#### Modify Connection Lines
```typescript
if (distance < 150) {  // Default: 120 (max distance for connections)
  // Draw line between particles
}
```

### Wave Mode Customization

In `src/components/AnimatedBackground.tsx`, find the `drawWaves` function:

#### Number of Wave Layers
```typescript
for (let i = 0; i < 5; i++) {  // Default: 3
```

#### Wave Amplitude (Height)
```typescript
const amplitude = 50 + i * 30;  // Default: 30 + i * 20
```

#### Wave Speed
```typescript
const time = Date.now() * 0.002;  // Default: 0.001 (higher = faster)
```

## Performance Optimization

### For Better Performance:

1. **Reduce Particle Count**:
   ```tsx
   <AnimatedBackground particleCount={50} />
   ```

2. **Lower Frame Rate** (in AnimatedBackground.tsx):
   ```typescript
   // Add throttling to animation loop
   let lastFrame = 0;
   const fps = 30; // Target FPS
   const frameInterval = 1000 / fps;
   
   const animate = (timestamp: number) => {
     if (timestamp - lastFrame < frameInterval) {
       animationId = requestAnimationFrame(animate);
       return;
     }
     lastFrame = timestamp;
     // ... rest of animation code
   };
   ```

3. **Disable on Mobile** (in App.tsx):
   ```tsx
   const [isMobile, setIsMobile] = useState(false);
   
   useEffect(() => {
     setIsMobile(window.innerWidth < 768);
   }, []);
   
   {!isMobile && <AnimatedBackground mode="particles" />}
   ```

## Examples

### Example 1: Sunset Theme with More Particles
```tsx
<AnimatedBackground 
  mode="particles"
  particleCount={100}
  colors={getTheme('sunset')}
/>
```

### Example 2: Ocean Waves
```tsx
<AnimatedBackground 
  mode="waves"
  colors={getTheme('ocean')}
/>
```

### Example 3: Custom Neon Theme
```tsx
<AnimatedBackground 
  mode="particles"
  particleCount={80}
  colors={[
    'rgba(255, 0, 255, 0.8)',   // Magenta
    'rgba(0, 255, 255, 0.8)',   // Cyan
    'rgba(255, 255, 0, 0.8)'    // Yellow
  ]}
/>
```

## Troubleshooting

### Background Not Showing
- Check `z-index` in `src/index.css` - background should be `z-index: 0`
- Ensure content has `z-index: 1` or higher

### Performance Issues
- Reduce `particleCount`
- Switch from `particles` mode to `waves` mode
- Add FPS throttling (see Performance Optimization)

### Colors Not Matching Theme
- Ensure colors are in `rgba()` format
- Alpha channel (last number) should be 0.6-0.9 for best visibility
- Update gradient colors in `src/index.css` to match

## Adding New Themes

In `src/lib/backgroundConfig.ts`:

```typescript
export const backgroundThemes = {
  // ... existing themes
  custom: {
    name: 'My Custom Theme',
    colors: [
      'rgba(R, G, B, 0.8)',
      'rgba(R, G, B, 0.8)',
      'rgba(R, G, B, 0.8)'
    ]
  }
};
```

Then use it:
```tsx
<AnimatedBackground colors={getTheme('custom')} />
```

## Tips for Best Results

1. **Color Harmony**: Use colors that complement your brand
2. **Contrast**: Ensure text remains readable over the animated background
3. **Subtlety**: Lower alpha values (0.6-0.7) for more subtle effects
4. **Testing**: Test on different devices and screen sizes
5. **Performance**: Monitor performance on lower-end devices

## Support

For issues or questions:
- Check browser console for errors
- Verify Canvas API is supported in browser
- Test with different browsers (Chrome, Firefox, Safari)
- Ensure JavaScript is enabled
