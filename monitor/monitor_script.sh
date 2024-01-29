#!/bin/bash

cd /home/claurence/Desktop/Projects/crawler

# Replace 'your_script_name.mjs' with the actual name of your .mjs script
SCRIPT_NAME="upsert-models.mjs"

# Check if the script is running
if pgrep -f "$SCRIPT_NAME" >/dev/null; then
    echo "Script $SCRIPT_NAME is running."
else
    echo "Script $SCRIPT_NAME is not running. Restarting..."
    /home/claurence/.nvm/versions/node/v18.17.1/bin/node "$SCRIPT_NAME" &
    echo "Script $SCRIPT_NAME restarted."
fi
