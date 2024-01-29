import fs from "fs";
import { readFile } from 'fs/promises';
import { getModelById } from './src/helper/models-helper.mjs';
import { saveMergedJSONToFile } from './src/helper/helper.mjs';

//-------------------------------------config-------------------------------------//
// Maximum number of models per file
const MODEL_LIMIT_PER_FILE = 100;
const START_ID = 1;
const STOP_ID = 136835;
//--------------------------------------------------------------------------------//

// Create the directory if it doesn't exist
const MODELS_DIR = './data/models';
const LAST_PROCESSED_ID_FILEPATH = MODELS_DIR + '/last_processed_id_models.txt';
fs.mkdirSync(MODELS_DIR, { recursive: true });

// Find the largest number in existing model files
let latestFileNumber = 0;
const modelFiles = fs.readdirSync(MODELS_DIR);
modelFiles.forEach((filename) => {
  const match = filename.match(/^(\d+)\.models\.json$/);
  if (match) {
    const fileNumber = parseInt(match[1]);
    if (fileNumber > latestFileNumber) {
      latestFileNumber = fileNumber;
    }
  }
});

const readfilepath = MODELS_DIR + '/' + latestFileNumber + '.models.json';
let data = '{"items":[]}';
if (latestFileNumber !== 0) {
  data = await readFile(readfilepath, 'utf8');
}
const jsondata = JSON.parse(data);

let mergedItems = [];
let totalItemCount = 0;
console.log('last file length',jsondata.items.length);
let fileCount = latestFileNumber + 1;
let ID;

if (jsondata.items.length < MODEL_LIMIT_PER_FILE && jsondata.items.length !== 0) {
  mergedItems = jsondata.items;
  totalItemCount = jsondata.items.length;
  fileCount = latestFileNumber;
}

if (fs.existsSync(LAST_PROCESSED_ID_FILEPATH)) {
    const lastProcessedID = fs.readFileSync(LAST_PROCESSED_ID_FILEPATH, 'utf8');
    if (lastProcessedID >= STOP_ID){
    ID = STOP_ID;
    process.exit(0);
    } else {
    ID = parseInt(lastProcessedID) + 1;
    }
} else {
  ID = START_ID;
}


const getModelsInRange = async (ID, stopId) => {

    try {
        let mid = ID;
        for (let modelId = ID; modelId <= stopId; modelId++) {
            const result = await getModelById(modelId);
            if (result) {
                console.log('modelID', modelId, 'completed');
                mergedItems.push(result);
                totalItemCount++;
                // Save the result to a JSON file or perform any other desired actions
                if (totalItemCount % MODEL_LIMIT_PER_FILE === 0) {
                    saveMergedJSONToFile(mergedItems,fileCount,'models');
                
                    // Reset mergedItems
                    mergedItems = [];
                
                    // Increment the file count
                    fileCount++;

                    const lastProcessedID = modelId;
                    fs.writeFileSync(LAST_PROCESSED_ID_FILEPATH, lastProcessedID.toString());
                    console.log(`Saved last processed ID: ${lastProcessedID}`);

                }
            } else {
              mid = modelId;
                console.log('Skipping modelId', modelId);
            }
        }
        if (totalItemCount % MODEL_LIMIT_PER_FILE !== 0) {
          saveMergedJSONToFile(mergedItems,fileCount,'models');

          // Reset mergedItems
          mergedItems = [];

          const lastProcessedID = mid;
          fs.writeFileSync(LAST_PROCESSED_ID_FILEPATH, lastProcessedID.toString());
          console.log(`Saved last processed ID: ${lastProcessedID}`);

        }
    } catch (error) {
        console.error(error);
    }
};


/*  Main function to scrape */
(async () => {
    await getModelsInRange(ID, STOP_ID);
})();