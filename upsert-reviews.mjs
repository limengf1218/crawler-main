import fs from 'fs';
import { seedReviews, logError } from './src/helper/upsert-helper.mjs';

//-------------------------------------config-------------------------------------//
// Data folder to read from
const DATA_FOLDER = 'data';

// Create the directory if it doesn't exist
const REVIEWS_DIR = './upsert/Reviews';
const LOG_DIR = './logs/reviews';
const LAST_PROCESSED_FILE_FILEPATH = REVIEWS_DIR + '/last_upserted_file_reviews.txt';
const LAST_PROCESSED_INDEX_FILEPATH = REVIEWS_DIR + '/last_upserted_index_reviews.txt';
fs.mkdirSync(REVIEWS_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const FIRST_FILE = 1;
const LAST_FILE = 10;

let LAST_PROCESSED_FILE, LAST_PROCESSED_INDEX;

if (fs.existsSync(LAST_PROCESSED_FILE_FILEPATH)) {
    const lastProcessedFile = fs.readFileSync(LAST_PROCESSED_FILE_FILEPATH, 'utf8');
    LAST_PROCESSED_FILE = parseInt(lastProcessedFile) + 1;
} else {
    LAST_PROCESSED_FILE = FIRST_FILE;
}

if (fs.existsSync(LAST_PROCESSED_INDEX_FILEPATH)) {
    const lastProcessedIndex = fs.readFileSync(LAST_PROCESSED_INDEX_FILEPATH, 'utf8');
    LAST_PROCESSED_INDEX = parseInt(lastProcessedIndex) + 1;
} else {
    LAST_PROCESSED_INDEX = -1;
}
//-------------------------------------config-------------------------------------//

while (LAST_PROCESSED_FILE <= LAST_FILE) {
    // START SEEDING PROCESS
    const file = `${LAST_PROCESSED_FILE}.reviews.json`;
    const reviews = JSON.parse(fs.readFileSync(`./${DATA_FOLDER}/reviews/${file}`, 'utf-8')).items;

    await (async () => {
        for (let i = 0; i < reviews.length; i++) {
            if (LAST_PROCESSED_INDEX >= i) continue;

            // seed reviews
            await seedReviews(reviews[i], LAST_PROCESSED_FILE)
                .catch(async (error) => {
                    console.error(`Error uploading review ${reviews[i].id}: ${error}`);
                    await logError(error, 'reviews', reviews[i].id, LAST_PROCESSED_FILE);
                });

            fs.writeFileSync(LAST_PROCESSED_INDEX_FILEPATH, LAST_PROCESSED_INDEX.toString());
            LAST_PROCESSED_INDEX++;
        }
    })().then(() => {
        console.log('Seeding complete for file', file);
        fs.writeFileSync(LAST_PROCESSED_FILE_FILEPATH, LAST_PROCESSED_FILE.toString());
        LAST_PROCESSED_FILE++;
        fs.writeFileSync(LAST_PROCESSED_INDEX_FILEPATH, (-1).toString());
        LAST_PROCESSED_INDEX = -1;
    }).catch((error) => {
        console.error(`Error writing file: ${error}`);
    });
}
