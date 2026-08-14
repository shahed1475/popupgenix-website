// Shadows the monorepo root's Tailwind/PostCSS config so Vitest's upward config-resolution doesn't pick it up and fail on a missing `tailwindcss` dependency.
export default {
  plugins: {},
};
