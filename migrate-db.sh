#!/bin/bash
OLD_DIR="$HOME/Library/Application Support/com.claudelens.app"
NEW_DIR="$HOME/.claudelens"
DB_NAME="claudelens.db"
FORCE=false

if [ "$1" = "-f" ] || [ "$1" = "--force" ]; then
    FORCE=true
fi

if [ ! -f "$OLD_DIR/$DB_NAME" ]; then
    echo "No database found at $OLD_DIR/$DB_NAME — nothing to migrate."
    exit 0
fi

mkdir -p "$NEW_DIR"

if [ -f "$NEW_DIR/$DB_NAME" ] && [ "$FORCE" = false ]; then
    echo "Database already exists at $NEW_DIR/$DB_NAME — use -f to overwrite."
    exit 1
fi

mv "$OLD_DIR/$DB_NAME" "$NEW_DIR/$DB_NAME"
# Move WAL/SHM files if they exist
mv "$OLD_DIR/$DB_NAME-wal" "$NEW_DIR/$DB_NAME-wal" 2>/dev/null
mv "$OLD_DIR/$DB_NAME-shm" "$NEW_DIR/$DB_NAME-shm" 2>/dev/null

echo "Migrated database to $NEW_DIR/$DB_NAME"
