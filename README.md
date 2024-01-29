# Getting Started
- Ensure that the model files are under src/models folder
- A model file must be a JSON file and the name of each file must start with a number

# Fetching Data
## Models
`npm run fetch-models`
## Reviews
`npm run fetch-reviews`
## Posts
`npm run fetch-posts`

# Upserting Data
## Models
`npm run upsert-models`
## Reviews
`npm run upsert-reviews`
## Posts
`npm run upsert-posts`

# Dev and Prod environments
To upsert of data on your local development server instead of production server, import from `upsert-helper-local.mjs` instead of `upsert-helper.mjs` and vice versa.

# Debugging
- Crawler relies heavily on [Puppeteer](https://pptr.dev/) to scrape data from CivitAi. Sometimes, puppeteer gives unexpected results and it helps to
change `puppeteer.launch({ headless: 'new'})` to `puppeteer.launch({ headless: false})` to debug.
- When you encounter error 4xx/5xx, reading docker logs from server can be useful in identifying the bug.  
    - Ensure that the route you are trying to debug has a `console.log`
    - Commit and push the changes
    - SSH into server and run the `update.sh` script
    - Run `docker ps` to view the new docker container
    - Run `docker logs [CONTAINER ID]`

# Exeception Handling
Custom errors are defined under `src/error.mjs` for cleaner exception handling.
