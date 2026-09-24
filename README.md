# La Última Noche

Horror psicológico en primera persona para navegador (Three.js + Vite + TypeScript), ambientado en una plaza colonial ficticia inspirada en el centro de Aguascalientes.

## Ejecutar

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # genera dist/ (sitio estático)
npm run preview  # sirve dist/ localmente
```

## Despliegue
- **Vercel**: importa el repositorio; `vercel.json` ya define `npm run build` y `dist` como salida.
- **Servidor propio**: copia el contenido de `dist/` a cualquier servidor estático (Nginx, Apache, etc.). Las rutas son relativas, así que también funciona en una subcarpeta.

## Controles
WASD caminar · Ratón mirar · Shift correr · C/Ctrl agacharse · E interactuar (mantener en acciones largas) · F linterna · Q/clic derecho cámara · clic fotografiar · Tab inventario · Esc pausa.

Créditos y licencias de todos los recursos: `CREDITS.md`.
