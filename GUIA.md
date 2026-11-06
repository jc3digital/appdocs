# DISORTHMED · Guía rápida
## Supabase
1. Crea el proyecto en supabase.com.
2. SQL Editor > New query > pega TODO `supabase/01_schema.sql` > Run. (Crea tablas, seguridad y el bucket privado `document-assets`.)
3. Authentication > Sign In / Providers > Email: deja activado el registro y DESACTIVA «Confirm email».
4. Authentication > Users > Add user: tu correo y contraseña (marca Auto Confirm).
5. SQL Editor: abre `supabase/02_primer_admin.sql`, cambia TU_CORREO@EJEMPLO.COM por ese correo > Run.
6. Si el bucket `document-assets` no aparece en Storage: New bucket, nombre exacto `document-assets`, NO público.
7. Project Settings > API: copia Project URL y la clave publishable/anon.
## Netlify
1. Sube la carpeta a GitHub (o arrastra la carpeta `dist` tras `npm install && npm run build`).
2. Build command: `npm run build` · Publish directory: `dist`.
3. Site configuration > Environment variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Para probar en tu PC: copia `.env.example` a `.env`, rellénalo y ejecuta `npm run dev`.
