#!/bin/sh
set -eu

psql \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$POSTGRES_APP_PASSWORD" \
  --set=database_name="$POSTGRES_DB" \
  --set=owner_name="$POSTGRES_USER" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE restaurant_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"database_name" TO restaurant_app;
GRANT USAGE, CREATE ON SCHEMA public TO restaurant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO restaurant_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO restaurant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_name" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO restaurant_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_name" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO restaurant_app;
SQL
