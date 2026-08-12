/**
 * ELLEBI Worker - Server statico per sito vetrina borse
 * Serve file HTML, CSS, JS, immagini e asset statici
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // Normalizza il percorso
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Se è la root, serve index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }

    // Se non ha estensione e non è un asset, aggiungi .html
    if (!pathname.includes('.') && !pathname.startsWith('/assets/') && !pathname.startsWith('/.well-known/')) {
      pathname += '.html';
    }

    // MIME types comuni
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
      '.txt': 'text/plain; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
    };

    const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      // Importa il file statico usando il path
      const fileData = await import(`..${pathname}`, { assert: { type: 'file' } }).catch(() => null);

      if (fileData) {
        return new Response(fileData.default, {
          status: 200,
          headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
        });
      }

      // Se il file non esiste, prova a servire 404.html
      const notFoundData = await import('../404.html', { assert: { type: 'file' } }).catch(() => null);
      if (notFoundData) {
        return new Response(notFoundData.default, {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response('404 - File not found', { status: 404 });
    } catch (error) {
      console.error(`Error serving ${pathname}:`, error);
      return new Response('500 - Internal Server Error', { status: 500 });
    }
  },
};
