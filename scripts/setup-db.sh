#!/bin/bash
set -e

# Configuration
CONTAINER_NAME="${POSTGRES_CONTAINER:-postgres}"
DB_USER="${DB_USER:-uppity}"
DB_PASSWORD="${DB_PASSWORD:-uppity}"
DB_NAME="${DB_NAME:-uppity}"

echo "Setting up PostgreSQL database for Uppity..."
echo "Container: $CONTAINER_NAME"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: PostgreSQL container '$CONTAINER_NAME' is not running."
    echo "Start it with: docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16-alpine"
    exit 1
fi

# Create user (ignore error if already exists)
echo "Creating user '$DB_USER'..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "User already exists"

# Create database (ignore error if already exists)
echo "Creating database '$DB_NAME'..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || echo "Database already exists"

# Grant privileges
echo "Granting privileges..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Grant schema privileges (needed for PostgreSQL 15+)
docker exec -i "$CONTAINER_NAME" psql -U postgres -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

echo ""
echo "Database setup complete!"
echo ""
echo "Connection string: postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo "Next steps:"
echo "  1. Ensure your .env file has: DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo "  2. Run migrations: bun run db:push"
echo "  3. Start the dev server: bun run dev"
