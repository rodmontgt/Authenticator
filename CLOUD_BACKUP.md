# Respaldos en Google Drive y OneDrive Business

La extension usa `fetch` para funcionar en Manifest V3. OneDrive se conecta con codigo de autorizacion y PKCE, sin un secreto en el navegador. Google Drive usa un pequeno servicio OAuth incluido en `server/`; este conserva el secreto de Google fuera de la extension. Ambos flujos sirven para Chrome y Edge.

Los respaldos mantienen el formato JSON del proyecto y se pueden recuperar desde **Importar respaldo**. Google Drive los guarda en **Authenticator Backups**. OneDrive usa la carpeta **Apps / nombre de tu aplicacion**. Cada archivo tiene una fecha, hora e identificador distinto para conservar los anteriores.

## 1. Identificar las extensiones

Carga `build/chrome` en Chrome y `build/edge` en Edge. Copia sus identificadores desde la pagina de extensiones. Conserva las mismas carpetas al recompilar para mantener los identificadores de las instalaciones de desarrollo.

Los redirect URI son exactamente:

```text
https://IDENTIFICADOR_DE_CHROME.chromiumapp.org/
https://IDENTIFICADOR_DE_EDGE.chromiumapp.org/
```

La barra final es necesaria. Cada navegador puede tener un identificador diferente. Si cambias los identificadores o publicas en una tienda, actualiza los registros OAuth y la lista del servicio.

## 2. Configurar OneDrive Business

1. En Microsoft Entra ID, crea un registro de aplicacion.
2. Para tu propia organizacion, elige **Solo cuentas de este directorio organizativo** y anota el identificador del directorio (tenant). Para varias organizaciones, elige la opcion correspondiente. Si tambien necesitas OneDrive personal, la aplicacion debe admitir cuentas personales de Microsoft.
3. En **Autenticacion**, agrega una plataforma **Aplicacion de pagina unica (SPA)** y registra los dos redirect URI anteriores. No actives el flujo implicito ni crees un secreto para este flujo.
4. En **Permisos de API**, agrega permisos **delegados** de Microsoft Graph: `Files.ReadWrite.AppFolder` y `User.Read`. El inicio de sesion solicita tambien `offline_access` para renovar la sesion. Si las politicas del directorio lo requieren, un administrador debe autorizar la aplicacion.
5. Verifica que la cuenta tenga OneDrive habilitado y aprovisionado. Puedes comprobarlo abriendo OneDrive en el navegador.
6. Copia `cloud-config.example.json` a `cloud-config.local.json`. En `onedrive.client_id`, escribe el **Id. de aplicacion (cliente)**. Para una aplicacion de un solo directorio, escribe el **Id. de directorio (tenant)** en `onedrive.tenant_id`. Para una aplicacion de varias organizaciones, deja ese campo vacio.

Despues de recompilar y recargar la extension, entra a **Respaldos > OneDrive > Iniciar sesion empresarial**. Las aplicaciones configuradas solo para tu organizacion no permiten el boton de inicio de sesion personal.

Microsoft limita la duracion de las sesiones de aplicaciones SPA; la extension puede solicitar un nuevo inicio de sesion cuando ya no se pueda renovar el token. No incorpora una contraseña ni un secreto de Microsoft.

## 3. Configurar Google Drive

1. Crea un proyecto en Google Cloud y habilita **Google Drive API**.
2. Configura la pantalla de consentimiento. Si la aplicacion esta en pruebas, agrega tu cuenta como usuario de prueba cuando corresponda.
3. Crea un cliente OAuth de tipo **Aplicacion web**.
4. Registra como URI de redireccion del cliente la URL publica del servicio seguida de `/google/callback`. Para probar en esta computadora, usa exactamente `http://localhost:8787/google/callback`. En una instalacion compartida, usa un dominio HTTPS propio.
5. Escribe el ID del cliente en `drive.client_id` de `cloud-config.local.json` y la URL base del servicio en `drive.token_broker_url`, por ejemplo `http://localhost:8787`.
6. Copia `server/.env.example` a `server/.env`. Completa `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_BROKER_PUBLIC_URL` y `EXTENSION_REDIRECT_URLS`. Esta ultima variable contiene los redirect URI de Chrome y Edge, separados por comas.

El secreto de Google va solamente en `server/.env`; ese archivo esta excluido de Git y no se incluye en las carpetas de las extensiones. El servicio intercambia y renueva tokens; no recibe las cuentas OTP ni el contenido de los respaldos.

Con Node.js 20.12 o posterior, inicia el servicio en una terminal:

```sh
npm run google:broker
```

Para probar, manten esa terminal abierta. Para uso compartido, despliega el servicio detras de HTTPS en tu infraestructura y configura `GOOGLE_BROKER_PUBLIC_URL` con ese dominio; conserva la lista explicita de redirect URI permitidos. El servidor escucha por defecto en `127.0.0.1:8787`. Su almacenamiento temporal de autorizaciones y tickets es en memoria: usa una sola instancia o afinidad de sesion; reiniciarlo cancela los inicios de sesion pendientes.

Los tickets de acceso duran un minuto, se canjean una sola vez y requieren el verificador generado por la extension. Los tokens de Google se conservan en el almacenamiento local de la extension. El servicio debe permanecer disponible para renovar la sesion; no lo publiques con registros que capturen cuerpos o respuestas con tokens.

## 4. Compilar y probar

```sh
npm run build:browsers
npm run test:cloud
```

Recarga ambas extensiones desde sus paginas de administracion. Si estaban conectadas con la implementacion anterior, cierra la sesion y vuelve a conectarlas. El nuevo cliente OAuth no puede reutilizar autorizaciones del proyecto original.

1. Crea una cuenta OTP de prueba.
2. Conecta cada proveedor y comprueba que aparece la cuenta correcta. La ventana de la extension puede cerrarse durante el inicio de sesion; vuelve a abrirla al terminar.
3. Si necesitas un respaldo cifrado, configura primero una contraseña en Authenticator y conserva activada la opcion de cifrado de ese proveedor.
4. Ejecuta **Respaldo manual** y comprueba el archivo en la carpeta del proveedor.
5. Repite el respaldo y verifica que se conserva el archivo anterior.
6. Descarga un archivo e importalo en una instalacion de prueba; para un archivo cifrado, comprueba que se recupera usando su contraseña.

La extension conserva el mecanismo de respaldo automatico del proyecto al abrir su ventana. Esta version no agrega un proceso de respaldo continuo mientras esta cerrada.

Las pruebas locales simulan las respuestas de Google y Microsoft; no sustituyen el inicio de sesion y la verificacion con tus aplicaciones reales. El servicio OAuth incluido no esta desplegado ni conectado a una cuenta por defecto.

## Fuentes de los flujos implementados

- [Microsoft: codigo de autorizacion, PKCE y plataforma SPA](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
- [Microsoft: AppFolder para OneDrive personal y de trabajo o escuela](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder).
- [Google: OAuth para aplicaciones web con intercambio en el servidor](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Edge: limitaciones de getAuthToken y alternativa launchWebAuthFlow](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support).
