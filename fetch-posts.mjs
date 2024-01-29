import fs from "fs";
import {readFile} from 'fs/promises'
import {getPostById} from './src/helper/posts-helper.mjs'
import {
  createBrowser,
  closeBrowser,
  saveMergedJSONToFile,
  loginGmail
} from './src/helper/helper.mjs'



//-------------------------------------config-------------------------------------//
// Maximum number of posts per file
const POST_LIMIT_PER_FILE = 100;
const START_ID = 54501;
const STOP_ID = 90600;
//--------------------------------------------------------------------------------//

// Create the directory if it doesn't exist
const POSTS_DIR = './data/posts';
const LAST_PROCESSED_ID_FILEPATH = POSTS_DIR + '/last_processed_id_posts.txt';
fs.mkdirSync(POSTS_DIR, { recursive: true });

// Find the largest number in existing post files
let latestFileNumber = 0;
const postFiles = fs.readdirSync(POSTS_DIR);
postFiles.forEach((filename) => {
  const match = filename.match(/^(\d+)\.posts\.json$/);
  if (match) {
    const fileNumber = parseInt(match[1]);
    if (fileNumber > latestFileNumber) {
      latestFileNumber = fileNumber;
    }
  }
});

const readfilepath = POSTS_DIR + '/' + latestFileNumber + '.posts.json';
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

if (jsondata.items.length < POST_LIMIT_PER_FILE && jsondata.items.length !== 0) {
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

  const getPostsInRange = async (ID, stopId) => {
    const browser = await createBrowser();

    try {
        await loginGmail(browser);
        let pid = ID;
        for (let postId = ID; postId <= stopId; postId++) {
            const result = await getPostById(browser, postId);
            if (result) {
                console.log('postID', postId, 'completed');
                mergedItems.push(result);
                totalItemCount++;
                pid = postId;
                // Save the result to a JSON file or perform any other desired actions
                if (totalItemCount % POST_LIMIT_PER_FILE === 0) {
                    saveMergedJSONToFile(mergedItems,fileCount,'posts');
                
                    // Reset mergedItems
                    mergedItems = [];
                
                    // Increment the file count
                    fileCount++;

                    const lastProcessedID = postId;
                    fs.writeFileSync(LAST_PROCESSED_ID_FILEPATH, lastProcessedID.toString());
                    console.log(`Saved last processed ID: ${lastProcessedID}`);
                }
            } else {
                pid = postId;
                console.log('Skipping postId', postId);
            }
        }
        if (totalItemCount % POST_LIMIT_PER_FILE !== 0) {
            saveMergedJSONToFile(mergedItems,fileCount,'posts');

            // Reset mergedItems
            mergedItems = [];

            const lastProcessedID = pid;
            fs.writeFileSync(LAST_PROCESSED_ID_FILEPATH, lastProcessedID.toString());
            console.log(`Saved last processed ID: ${lastProcessedID}`);

        }
    } catch (error) {
        console.error(error);
    } finally {
        await closeBrowser(browser);
    }
};

/*  Main function to scrape */
(async () => {
    await getPostsInRange(ID, STOP_ID);
})();