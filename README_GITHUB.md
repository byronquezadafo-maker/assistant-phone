# Assistant Phone v12 — versión para GitHub Pages

Esta carpeta está lista para subir a GitHub Pages, Netlify, Vercel o cualquier hosting estático.

## Archivos importantes

- `index.html` debe quedar en la raíz del repositorio.
- `styles.css`, `app.js`, `manifest.webmanifest` y `sw.js` deben quedar junto a `index.html`.
- La carpeta `icons/` debe quedar completa.

## Subir a GitHub Pages

1. Crea o abre tu repositorio `assistant-phone`.
2. Entra a **Code → Add file → Upload files**.
3. Sube el contenido de esta carpeta, no el ZIP.
4. Haz **Commit changes**.
5. Ve a **Settings → Pages**.
6. Selecciona **Deploy from a branch**.
7. Rama: `main`.
8. Carpeta: `/ (root)`.
9. Espera unos minutos y abre la URL publicada.

## Actualizar en iPhone

Después de subir una actualización:

1. Cierra completamente la app en el iPhone.
2. Abre la URL en Safari una vez.
3. Vuelve a abrir el icono instalado.

Si sigue mostrando una versión vieja, espera unos minutos. El service worker usa una clave de cache nueva para esta versión.
