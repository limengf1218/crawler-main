import puppeteer, { TimeoutError } from "puppeteer";
import { upsertUserAndReturnUserId } from "./helper.mjs";
import { readdir, readFile } from 'fs/promises';
import instance from "../axios.config.mjs";

const MODELS_FILE_PATH = './src/models';

const getCommentsFromModel = async (browser, modelId) => {
  try {
    const page = await browser.newPage();
    const uniqueIds = new Set();
    const responses = [];

    console.log('Fetching comments for modelId', modelId);

    page.on('response', async (res) => {
      if (res.url().startsWith('https://civitai.com/api/trpc/comment.getAll')) {
        const comments = (await res.json()).result.data.json.comments;
        comments.forEach(comment => {
          const initialSize = uniqueIds.size;
          uniqueIds.add(comment.id);
          if (uniqueIds.size > initialSize) responses.push(comment);
        })
      };
    })

    await page.goto(`https://civitai.com/models/${modelId}`);

    const COMMENTS_SELECTOR = 'div.mantine-Paper-root.mantine-Card-root.mantine-bi4zl';
    const LOAD_MORE_BUTTON_SELECTOR = 'button.mantine-UnstyledButton-root.mantine-Button-root.mantine-95tael';
    
    await page.waitForSelector(COMMENTS_SELECTOR);

    while (await page.$(LOAD_MORE_BUTTON_SELECTOR) !== null) {
      (await page.$(LOAD_MORE_BUTTON_SELECTOR)).evaluate(b => b.click());
    }

    return responses;
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.log('No comments found for modelId', modelId);
      return [];
    };
    console.error('Failed to get comments for modelId', modelId, 'retrying...');
    return await getCommentsFromModel(browser, modelId);
  }
};

const getComments = async (modelId) => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new' });
    return await getCommentsFromModel(browser, modelId);
  } catch (e) {
    console.log(e);
  } finally {
    await browser.close();
  }
};

const insertComments = async (comments) => {
  for (const comment of comments) {
    if (comment.user.username == null) continue; // handle edge case of null username

    const { data } = await instance.post('trpc/comment.upsertSeed', {
      "json": {
        "createdAt": new Date(comment.createdAt),
        "content": comment.content,
        "modelId": comment.modelId,
        "updatedAt": new Date(),
        "userId": await upsertUserAndReturnUserId(comment.user.username)
      }
    });
    const { id: commentId } = data.result.data.json;
    console.log('Successfully inserted commentId', commentId, 'for modelId', comment.modelId);
  }
};

const getAndInsertComments = async (models) => {
  for (const { id: modelId, nsfw } of models.items) {
    if (nsfw) continue; // skip nsfw models
    const discussions = await getComments(modelId);
    await insertComments(discussions);
  }
  console.log('Successfully inserted all comments');
};


/*
  Main function to scrape and upsert comments from CivitAi for the modelIds in models dir 
*/
(async () => {
  let files = await readdir(MODELS_FILE_PATH);
  // Filter out files that do not start with a number or end with .json
  files = files.filter((file) => /^\d+.*\.json$/.test(file));
  for (const file of files) {
    const models = JSON.parse(await readFile(`${MODELS_FILE_PATH}/${file}`, 'utf-8'));
    await getAndInsertComments(models);
  }
})().catch(e => console.log(e));

/*
  Debugger function
*/
// (async () => {
//   const comment = {
//     createdAt: '2023-03-03',
//     content: '<p>test</p>',
//     modelId: 8,
//     user: {username: '1235'}
//   };
//   const { id: commentId } = await instance.post('trpc/comment.upsertSeed', {
//     "json": {
//       "createdAt": new Date(comment.createdAt),
//       "content": comment.content,
//       "modelId": comment.modelId,
//       "updatedAt": new Date(),
//       "userId": await upsertUserAndReturnUserId(comment.user.username)
//     }
//   });
//   return commentId;
// })().then(r => console.log(r)).catch(e => console.log(e));


