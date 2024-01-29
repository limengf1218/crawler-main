import fs from "fs";
import {readFile} from 'fs/promises';
import {getReviewById} from './src/helper/reviews-helper.mjs'
import {
  createBrowser,
  closeBrowser,
  saveMergedJSONToFile,
} from './src/helper/helper.mjs'


//-------------------------------------config-------------------------------------//
// Maximum number of reviews per file
const REVIEW_LIMIT_PER_FILE = 100;
const START_ID = 1;
const STOP_ID = 263762;
//--------------------------------------------------------------------------------//

// Create the directory if it doesn't exist
const REVIEWS_DIR = './data/reviews';
const LAST_PROCESSED_ID_FILEPATH = REVIEWS_DIR + '/last_processed_id_reviews.txt';
fs.mkdirSync(REVIEWS_DIR, { recursive: true });

// Find the largest number in existing review files
let latestFileNumber = 0;
const reviewFiles = fs.readdirSync(REVIEWS_DIR);
reviewFiles.forEach((filename) => {
  const match = filename.match(/^(\d+)\.reviews\.json$/);
  if (match) {
    const fileNumber = parseInt(match[1]);
    if (fileNumber > latestFileNumber) {
      latestFileNumber = fileNumber;
    }
  }
});

const readfilepath = REVIEWS_DIR + '/' + latestFileNumber + '.reviews.json';
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

if (jsondata.items.length < REVIEW_LIMIT_PER_FILE && jsondata.items.length !== 0) {
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


const getReviewsInRange = async (ID, stopId) => {
    const browser = await createBrowser();

    try {
        let rid = ID;
        for (let reviewId = ID; reviewId <= stopId; reviewId++) {
            const result = await getReviewById(browser, reviewId);
            // console.log(result);
            if (result) {
                console.log('reviewID', reviewId, 'completed');
                mergedItems.push(result);
                totalItemCount++;
                rid = reviewId;
                // Save the result to a JSON file or perform any other desired actions
                if (totalItemCount % REVIEW_LIMIT_PER_FILE === 0) {
                    saveMergedJSONToFile(mergedItems,fileCount,'reviews');
                
                    // Reset mergedItems
                    mergedItems = [];
                
                    // Increment the file count
                    fileCount++;

                    const lastProcessedID = reviewId;
                    fs.writeFileSync(LAST_PROCESSED_ID_FILEPATH, lastProcessedID.toString());
                    console.log(`Saved last processed ID: ${lastProcessedID}`);

                }
            } else {
                rid = reviewId;
                console.log('Skipping reviewId', reviewId);
            }
        }
        if (totalItemCount % REVIEW_LIMIT_PER_FILE !== 0) {
          saveMergedJSONToFile(mergedItems,fileCount,'reviews');

          // Reset mergedItems
          mergedItems = [];

          const lastProcessedID = rid;
          fs.writeFileSync(LAST_PROCESSED_ID_FILEPATH, lastProcessedID.toString());
          console.log(`Saved last processed ID: ${lastProcessedID}`);

      }
    } catch (error) {
        // console.error(error);
    } finally {
        await closeBrowser(browser);
    }
};


/*  Main function to scrape */
(async () => {
    await getReviewsInRange(ID, STOP_ID);
})();