# Satellite Infall Playground

Standalone Vite/React deployment wrapper for the galaxy infall through a dark matter halo applet.

## Local Development

```bash
npm install
npm run dev
```

## Deployment Build

```bash
npm run build
npm run preview
```

The applet runs entirely in the browser and has no runtime service dependencies. It includes optional canvas recording support: MP4 via WebCodecs when available, otherwise zipped image frames.
