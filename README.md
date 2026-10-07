# Restaurante POS

Next.js y las rutas API se despliegan en Vercel. PostgreSQL vive en el contenedor creado en Hostinger; no despliegues la aplicación Next.js ni un segundo PostgreSQL en el VPS.

## Gestión de credenciales

No guardes contraseñas reales en el repositorio, archivos `.example`, capturas o mensajes. Usa variables de entorno privadas en Vercel y `.env.local` en desarrollo. No expongas `DATABASE_URL` mediante variables `NEXT_PUBLIC_*`.

## Conectar a PostgreSQL de Hostinger sin TLS

El endpoint `179.198.101.247:32803` es una conexión PostgreSQL TCP, no una página web. Abrirlo con `http://` en el navegador no sirve para comprobar la base. Configura la aplicación con:

```env
DATABASE_URL=postgresql://restaurant_admin:TU_PASSWORD_CODIFICADA@179.198.101.247:32803/restaurant
DATABASE_SSL=false
```

Codifica los caracteres especiales de la contraseña en formato URL; por ejemplo, `+` debe escribirse como `%2B`. `DATABASE_SSL=false` permite esta conexión en producción, pero los datos y credenciales viajarán sin cifrado por Internet. Como mínimo, limita el puerto TCP `32803` en el firewall de Hostinger a los orígenes que necesiten acceder.

En el Compose de Hostinger conserva el servicio `postgresql`, el volumen `postgres_data` y las variables existentes. Si Hostinger permite indicar el puerto de host, publícalo como `32803:5432`; si el panel asigna o gestiona el puerto público por separado, conserva el mapeo que muestra el panel. No borres el volumen ni crees otro proyecto Compose.

En Vercel, agrega `DATABASE_URL` y `DATABASE_SSL=false` en Project → Settings → Environment Variables y vuelve a desplegar. Para desarrollo local, usa los mismos valores en `.env.local`.

## Inicializar la base

Configura `DATABASE_URL` y `DATABASE_SSL=false` antes de ejecutar migraciones. Si el rol de PostgreSQL aún no tiene permisos para crear tablas, concede los permisos necesarios desde la consola de PostgreSQL usando una cuenta administradora.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
```

`db:seed` solo crea los ajustes básicos y el primer administrador; no genera ventas, platos ni inventario ficticio. Para crear el administrador inicial define `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME` y `INITIAL_ADMIN_PASSWORD` (12–128 caracteres); `INITIAL_ADMIN_USERNAME` es opcional y, si no se configura, se genera a partir del correo. Las migraciones nuevas se crean con `pnpm db:generate`, se revisan y se aplican antes de desplegar el código que las necesita.

Para vaciar todas las tablas públicas de la aplicación excepto `users`, ejecuta `pnpm resetdb` desde una terminal interactiva. El comando muestra el host/base destino y las tablas afectadas; solo continúa si escribes `RESET`. También elimina las sesiones de inicio de sesión, restablece secuencias y borra ajustes, categorías, platos, ingredientes, pedidos, ventas y datos de caja. Conserva el historial interno de migraciones. Haz primero una copia de seguridad y comprueba que `DATABASE_URL` apunte a la base correcta; esta operación no se puede deshacer.

El administrador puede crear categorías desde la sección **Categorías** y asignarlas a los platos. La migración `0012_demonic_toad.sql` crea el catálogo y conserva las categorías que ya tenían los platos; aplícala antes de desplegar esta versión.

El personal inicia sesión con su usuario o correo electrónico y contraseña. Cada cuenta debe tener un usuario único de 3 a 64 caracteres (letras, números, punto, guion o guion bajo). La migración `0009_bright_redwing.sql` asigna automáticamente un usuario a las cuentas existentes a partir del correo y el ID de la cuenta; revisa el usuario resultante en Configuración → Usuarios y permisos.

## Datos de pedido y comanda

Al cobrar una venta, el cajero debe elegir `Para llevar` o `Comer aquí` y registrar el nombre para llamar al cliente. Los pedidos para comer aquí también requieren la mesa. Estos datos se guardan con la venta, aparecen en su comanda impresa y se conservan en el historial. Antes de desplegar una versión que incluya cambios de esquema, aplica las migraciones desde un equipo autorizado con `pnpm db:migrate`; en particular, la migración `0005_blue_magdalene.sql` agrega estos campos de forma nullable para conservar el historial previo sin inventar datos.

## Reportes y anulación de pedidos

La sección Reportes permite consultar un día específico, los últimos siete días o el mes en curso. Muestra y exporta los pedidos completados en una tabla con fecha, hora, descripción de los productos, forma de pago, servicio (comer aquí o para llevar) y precio. El detalle de cada producto usa el mismo formato que la comanda reimpresa desde Ventas: cantidad, nombre, ingredientes excluidos, notas e importe por línea. El botón PDF imprime únicamente esa tabla; el CSV compatible con Excel contiene los mismos detalles.

Cada plato puede tener una imagen de referencia JPG, PNG o WebP. Al seleccionarla, la aplicación la optimiza y guarda en PostgreSQL; se muestra en el catálogo y al tomar pedidos. El tamaño almacenado se limita a 900 KB por imagen.

Actualmente no se registran impuestos, descuentos ni comisiones: brutas y netas muestran el total de las ventas completadas y esos conceptos aparecen en cero. Los ingredientes son un catálogo de nombres que se marcan como incluidos en cada plato; no se guarda stock, consumo ni cantidades por receta, y vender o anular un pedido no modifica existencias. La anulación requiere una cuenta administradora y un motivo de al menos cinco caracteres, y excluye el pedido de los ingresos reportados. Para una devolución en efectivo debe haber una caja abierta; el reembolso de pagos por QR, tarjeta o transferencia se realiza manualmente fuera del sistema.

Antes del despliegue, aplica las migraciones pendientes con `pnpm db:migrate`. Las migraciones `0006_shallow_natasha_romanoff.sql` a `0009_bright_redwing.sql` agregan auditoría de anulaciones, soporte para ingredientes sin cantidades y usuario de inicio de sesión. `0010_common_mindworm.sql` agrega almacenamiento de imágenes de platos, `0011_married_grey_gargoyle.sql` valida sus metadatos y `0012_demonic_toad.sql` agrega categorías administrables. Los campos históricos de stock y cantidades se conservan en la base por compatibilidad, pero la aplicación ya no los consulta ni modifica.

## Copias de seguridad

Configura copias periódicas desde el contenedor PostgreSQL y almacénalas fuera del volumen y, preferentemente, fuera del VPS. Ajusta el comando al nombre del contenedor Hostinger:

```sh
docker exec <contenedor-postgres> pg_dump -U restaurant_admin restaurant > restaurant-backup.sql
```

La persistencia del volumen no sustituye las copias de seguridad. Comprueba periódicamente que se puedan restaurar.

## Desarrollo local

Define `.env.local` con la conexión PostgreSQL y las variables opcionales del administrador inicial. Luego ejecuta:

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## PostgreSQL propio en Docker

`docker-compose.yml` y `.env.postgres.example` sirven únicamente como alternativa para crear un contenedor PostgreSQL administrado por el proyecto. No los uses junto al contenedor PostgreSQL ya creado por Hostinger; hacerlo crearía una segunda base de datos independiente.
