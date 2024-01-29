import puppeteer, { TimeoutError } from 'puppeteer';
import { readdir, readFile } from 'fs/promises';
import { upsertUserAndReturnUserId } from "./helper.mjs";
import instance from "../axios.config.mjs";

const MODELS_FILE_PATH = './src/models';


const getReviewsFromModelByPage = async (
  browser,
  modelId,
  modelVersionId,
  pageNumber
) => {
  const page = await browser.newPage();
  await page.goto(
    `https://civitai.com/models/${modelId}/reviews?modelVersionId=${modelVersionId}&page=${pageNumber}`
  );
  console.log('Fetching data from page', pageNumber);
  
  const reviewCountElement = await page.$('div.mantine-Text-root.mantine-1jt6jod');

  if (reviewCountElement == null) {
    await page.close();
    console.log('No reviews found for modelId', modelId,'modelVersionId', modelVersionId);
    return [];
  }

  const reviewCount = +(await reviewCountElement.evaluate((x) => x.innerHTML))[0]; // Not really the review count
  if (reviewCount === 0) {
    await page.close();
    console.log('No reviews found for modelId', modelId, 'modelVersionId', modelVersionId);
    return [];
  }

  const REVIEWS_SELECTOR = 'a[href^="/reviews"]';
  await page.waitForSelector(REVIEWS_SELECTOR);
  const data = await page.$$(REVIEWS_SELECTOR);

  let reviews = [];
  const reviewIds = new Set();
  for (const d of data) {
    const reviewId = await d.evaluate((x) => +x.href.split('/')[4]);
    if (reviewIds.has(reviewId)) continue;
    reviewIds.add(reviewId);
    reviews.push(getReviewById(browser, reviewId, modelId, modelVersionId));
  }

  const NEXT_BUTTON_SELECTOR = 'div[role="navigation"] button:last-child';
  const nextButton = await page.$(NEXT_BUTTON_SELECTOR);
  if (nextButton == null) return reviews;
  const isDisabled = await nextButton.evaluate((x) => x.disabled);
  if (isDisabled) return reviews;
  await page.click(NEXT_BUTTON_SELECTOR);

  await page.close();

  reviews = [...reviews].concat(
    await getReviewsFromModelByPage(browser, modelId, modelVersionId, pageNumber + 1)
  );
  
  return reviews;
};

const getReviewById = async (
  browser,
  reviewId,
  modelId,
  modelVersionId
) => {
  try {
    const page = await browser.newPage();
    await page.goto(`https://civitai.com/reviews/${reviewId}`);

    console.log('Fetching data for review id', reviewId);

    const timeElement = await page.$('div.mantine-Text-root.mantine-hwzn5p time');
    let createdAt;
    if (timeElement !== null) {
      createdAt = new Date(await timeElement.evaluate((x) => x.title));
    }

    const updatedAt = new Date();
    
    const userElement = await page.$('div.mantine-Group-root.mantine-1u5ck20');
    if (userElement === null) throw new Error('User element is null');
    const username = await userElement.evaluate((x) => x.textContent);

    const text = await (
      await page.$('div.mantine-TypographyStylesProvider-root.mantine-1c4hq9n')
    )?.evaluate((x) => x.textContent);

    const starElements = await page.$$(
      'div.mantine-116ok0u.mantine-Rating-symbolGroup div.__mantine-ref-label.mantine-Rating-label.mantine-16zn1oj div.mantine-Rating-symbolBody.mantine-om7bs8 svg'
    );
    let negativeRating = 0;
    for (const el of starElements) {
      const starClass = await el.evaluate((x) => x.getAttribute('class'));
      if (starClass === 'mantine-1c628xb') negativeRating++; // count the number of uncolored stars
    }

    const userId = await upsertUserAndReturnUserId(username);
    if (userId == null) {
      await page.close();
      return;
    }

    let review = {
      modelId: modelId,
      modelVersionId: modelVersionId,
      userId: userId,
      createdAt: createdAt?.toISOString(),
      updatedAt: updatedAt.toISOString(),
      rating: 5 - negativeRating
    };

    if (typeof text !== 'undefined') {
      review = {
        ...review,
        details: `<p>${text}</p>`,
      };
    }

    await page.close();
    const comments = await getCommentsByReviewId(browser, reviewId);

    return { review, comments };
  } catch {
    console.error('Failed to get reviewId', reviewId, 'retrying...');
    return await getReviewById(browser, reviewId, modelId, modelVersionId);
  }
};

const getReviewsFromModel = async (
  modelId,
  modelVersionId
) => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new' });

    console.log('Fetching review ids for modelId', modelId, 'modelVesionId', modelVersionId);

    return (
      await Promise.all(await getReviewsFromModelByPage(browser, modelId, modelVersionId, 1))
    ).filter(r => r.review);

  } catch (e) {
    console.error(e);
    // console.error('Failed to get reviews for modelId', modelId, 'modelVersionId', modelVersionId, 'retrying...');
    // return await getReviewsFromModel(modelId, modelVersionId);
  } finally {
    await browser?.close();
  }
};

const getCommentsByReviewId = async (browser, reviewId) => {
    const page = await browser.newPage();
    await page.goto(`https://civitai.com/reviews/${reviewId}`);
  
    console.log('Fetching comments for reviewId', reviewId);
  
    const commentCountElement = await page.$('h3.mantine-Text-root.mantine-Title-root.mantine-1ia5rtn');
    const NUMBER_OF_COMMENTS = +(await commentCountElement.evaluate(x => x.innerHTML))[0]; // not really the numner of comments
    if (NUMBER_OF_COMMENTS === 0) {
      await page.close();
      return []
    };
  
    const COMMENTS_SELECTOR = 'div.mantine-Group-root.mantine-qrnz3n';
    const LOAD_MORE_COMMENTS_BUTTON_SELECTOR = 'div.mantine-Divider-root.mantine-Divider-horizontal.mantine-Divider-withLabel.mantine-gstba7 div.mantine-Text-root.mantine-Divider-label.mantine-Divider-labelDefaultStyles.mantine-138xue5';
  
    await page.waitForSelector(COMMENTS_SELECTOR);
  
    while (await page.$(LOAD_MORE_COMMENTS_BUTTON_SELECTOR) !== null) {
      await page.click(LOAD_MORE_COMMENTS_BUTTON_SELECTOR);
    }
  
    const commentElements = await page.$$(COMMENTS_SELECTOR);
    const comments = [];
  
    for (const comment of commentElements) {
      const commentCreatorUsernameElement = await comment.$('div.mantine-Group-root.mantine-1gg8vod div.mantine-Stack-root.mantine-1qlxz9s a');
      const commentCreatorUsername = await commentCreatorUsernameElement.evaluate(x => x.textContent);
      
      const timeElement = await comment.$('div.mantine-Text-root.mantine-t3rda4 time');
      const createdAt = await timeElement.evaluate(x => x.title);
  
      const contentElement = await comment.$('div.mantine-TypographyStylesProvider-root.mantine-11xnsqy div');
      const content = await contentElement.evaluate(x => x.innerHTML);
  
      const userId = await upsertUserAndReturnUserId(commentCreatorUsername);
      if (userId != null) {
        comments.push({
          userId: userId,
          createdAt: new Date(createdAt),
          updatedAt: new Date(),
          content: content
        });
      }
    };
  
    await page.close();
  
    return comments;
};

const getReviewsFromModelAndUpsert = async (modelId, modelVersionId) => {
  const reviewData = await getReviewsFromModel(modelId, modelVersionId);

  for (const { review, comments } of reviewData) {
    const reviewId = await upsertReviewAndReturnReviewId(review);
    if (reviewId != null) await insertComments(comments, reviewId);
  }

  console.log('Updated', reviewData.length, 'reviews for modelId', modelId, 'modelVersionId', modelVersionId);
};

const upsertReviewAndReturnReviewId = async (review) => {
  try {
    const { data } = await instance.post('trpc/resourceReview.upsertSeed', {
      "json": review
    });
    return data.result.data.json.id;
  } catch (e) {
    console.error(`Error in uploading a review for modelId`, review.modelId);
  }
};

const insertComments = async (comments, reviewId) => {
  for (let comment of comments) {
    comment = {
      entityId: reviewId,
      entityType: 'review',
      ...comment,
    };
    await instance.post('trpc/commentv2.upsertSeed', {
      "json": comment
    });
  }
  console.log(comments.length, 'comments created for reviewId', reviewId);
};

const getReviewsAndUpsert = async (models) => {
  for (const { id: modelId, modelVersions, nsfw } of models.items) {
    if (nsfw) continue; // skip nsfw models
    for (const { id: modelVersionId } of modelVersions) {
      return await getReviewsFromModel(modelId, modelVersionId);
    }
  }
};


/*
  Main function to scrape and upsert reviews from CivitAi for the modelIds in models dir 
*/
(async () => {
    let files = await readdir(MODELS_FILE_PATH);
    // Filter out files that do not start with a number or end with .json
    files = files.filter((file) => /^\d+.*\.json$/.test(file));
    for (const file of files) {
      const models = JSON.parse(await readFile(`${MODELS_FILE_PATH}/${file}`, 'utf-8'));
      return await getReviewsAndUpsert(models);
      console.log('Successfully updated reviews for', file);
    }
})().then(r => console.log(r)).catch(e => console.log(e));


/* 
  Debugger function 
*/

