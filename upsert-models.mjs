import fs from 'fs';
import { seedModel, logError } from './src/helper/upsert-helper.mjs';

//-------------------------------------config-------------------------------------//
// Data folder to read from
const DATA_FOLDER = 'data';

// Create the directory if it doesn't exist
const MODELS_DIR = './upsert/models';
const LOG_DIR = './logs/models';
const LAST_PROCESSED_FILE_FILEPATH = MODELS_DIR + '/last_upserted_file.txt';
const LAST_PROCESSED_INDEX_FILEPATH = MODELS_DIR + '/last_upserted_id.txt';
fs.mkdirSync(MODELS_DIR, { recursive: true });
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
  LAST_PROCESSED_INDEX = parseInt(lastProcessedIndex);
} else {
  LAST_PROCESSED_INDEX = -1;
}

//-------------------------------------config-------------------------------------//
while(LAST_PROCESSED_FILE <= LAST_FILE) {
//  START SEEDING PROCESS
const file = `${LAST_PROCESSED_FILE}.models.json`;
const models = JSON.parse(fs.readFileSync(`./${DATA_FOLDER}/models/${file}`, 'utf-8')).items;

await (async () => {
    for (let i = 0; i < models.length; i++) {
        if (LAST_PROCESSED_INDEX >= i) continue;

        //seed models
        await seedModel(models[i], LAST_PROCESSED_FILE)
        .catch(async (error) => {
            console.error(`Error uploading model ${models[i].id}: ${error}`);
            await logError(error, 'models', models[i].id, LAST_PROCESSED_FILE);
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
    })
    .catch((error) => {
        console.error(`Error writing file: ${error}`);
    });
}