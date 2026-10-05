# Desarrollo del fork para Chrome y Edge

El codigo base corresponde a la rama `dev` de https://github.com/rodmontgt/Authenticator, commit `9d9660b` (descargado el 5 de octubre de 2026).
Esta copia se obtuvo inicialmente como ZIP y ahora tiene un checkout Git superficial verificado, con `origin` apuntando al fork y una rama de trabajo para el pull request. El historial completo se conserva en GitHub; se puede recuperar con `git fetch --unshallow` usando una instalacion completa de Git.

## Compilar en Windows, macOS o Linux

Instala Node.js con npm y ejecuta en esta carpeta:

```sh
npm ci
npm run build:browsers
```

Tambien puedes compilar un solo navegador con `npm run build:chrome` o `npm run build:edge`.
Estos comandos generan versiones de desarrollo, incluyen comprobacion de TypeScript y no requieren Bash.
Los comandos originales `chrome`, `edge` y `prod` siguen disponibles y requieren Bash.

## Instalar para probar

1. En Chrome, abre `chrome://extensions`; en Edge, abre `edge://extensions`.
2. Activa el modo de desarrollador.
3. Selecciona **Cargar descomprimida** y elige `build/chrome` o `build/edge`, respectivamente.
4. Abre la extension y prueba sus funciones con cuentas de prueba.

Para recompilar al guardar cambios, ejecuta `npm run dev:chrome` o `npm run dev:edge`.
Despues de cada compilacion, recarga la extension desde la pagina de extensiones y vuelve a abrir su ventana.
Los cambios en recursos estaticos o Sass requieren reiniciar el comando de desarrollo o ejecutar otra compilacion.

## Donde agregar funcionalidades

- `src/components`: interfaz Vue.
- `src/store`: estado y acciones de la interfaz.
- `src/models`: modelos, almacenamiento y proveedores.
- `src/background.ts`: tareas en segundo plano.
- `src/content.ts`: interaccion con paginas web.
- `manifests/manifest-chrome.json` y `manifests/manifest-edge.json`: permisos y configuracion de cada navegador.
- `_locales`: traducciones.

Para habilitar Google Drive y OneDrive Business, sigue [CLOUD_BACKUP.md](CLOUD_BACKUP.md). Los identificadores propios se configuran en `cloud-config.local.json`; el secreto de Google se conserva exclusivamente en el servicio OAuth.
La compilacion no valida las aplicaciones OAuth ni sustituye la prueba con cuentas reales.
