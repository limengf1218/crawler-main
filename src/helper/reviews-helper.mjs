import { deletedResourceError, NoUserError, NSFWError } from "../error.mjs";
import { ismodelNSFW } from "./helper.mjs";
import axios from "axios";

// Function to retrieve information about a review by its ID
export const getReviewById = async (browser, reviewId) => {
  console.log("")
  const page = await browser.newPage();

  try {
    console.log('Fetching data for review id', reviewId);
    await page.goto(`https://civitai.com/reviews/${reviewId}`,{
      waitUntil: 'networkidle0',
      // timeout: 30000 //30 seconds
    });

    const DELETED_USER_SELECTOR='div.mantine-Stack-root.mantine-1qlxz9s div.mantine-Group-root.mantine-1u5ck20 div.mantine-Text-root.mantine-lfggf9';
    const noResultElement = await page.$('div.mantine-Text-root.mantine-vsd342');
    const fofpage = await page.$('h1.mantine-Text-root.mantine-Title-root.mantine-po08x7');
    const timeElement = await page.$('div.mantine-Text-root.mantine-hwzn5p time');

    console.log('data fetched');

    //Deleted User
    const deletedUserElement = await page.$(DELETED_USER_SELECTOR);
    if (deletedUserElement != null) throw new NoUserError;

    //Deleted reviews
    if (noResultElement || fofpage) {
      const noResultText = await noResultElement.evaluate(element => element.textContent);
      console.log(noResultText);
      return noResultText
    }

    //Existing reviews
    if (timeElement) {
      const createdAt = new Date(await timeElement.evaluate(x => x.getAttribute('title')));
    
      // const updatedAt = new Date();   
      const userElement = await page.$('div.mantine-Group-root.mantine-1g4q40w div.mantine-Group-root.mantine-54g21i a');
      if (userElement === null) throw new Error('User element is null');
      const usernameurl = await userElement.evaluate((x) => x.href);
      const username = usernameurl.split('/').pop();

      let review ={};

      const userimg = await page.$('div.mantine-Group-root.mantine-54g21i a div.mantine-Avatar-root.mantine-1wzyfqm img.mantine-1trwvlz.mantine-Avatar-image');
      if (userimg !== null) {
        const imgurl = await userimg.evaluate(element => element.src);
        review.userimage = imgurl;
      } 

      // const imagesOnReview = await page.$('div.mantine-Group-root.mantine-54g21i a div.mantine-Avatar-root.mantine-1wzyfqm img.mantine-1trwvlz.mantine-Avatar-image');
      if (userimg !== null) {
        const imgurl = await userimg.evaluate(element => element.src);
        review.userimage = imgurl;
      } 
  

      // const text = await (
      //   await page.$('div.mantine-TypographyStylesProvider-root.mantine-1c4hq9n')
      //   )?.evaluate((x) => x.textContent);

      const starElements = await page.$$(
        'div.mantine-116ok0u.mantine-Rating-symbolGroup div.__mantine-ref-label.mantine-Rating-label.mantine-16zn1oj div.mantine-Rating-symbolBody.mantine-om7bs8 svg'
      );
      let negativeRating = 0;
      for (const el of starElements) {
        const starClass = await el.evaluate((x) => x.getAttribute('class'));
        if (starClass === 'mantine-1c628xb') negativeRating++; // count the number of uncolored stars
      }
 

      //getting modelid and modelversionid
      const modelElement = await page.$('a.mantine-Text-root.mantine-5kixqr')
      const urlString = await modelElement.evaluate(element => element.href);
      const modelIdPattern = /\/models\/(\d+)/;
      const modelVersionIdPattern = /modelVersionId=(\d+)/;
      const modelIdMatch = urlString.match(modelIdPattern);
      const modelVersionIdMatch = urlString.match(modelVersionIdPattern);    
      const modelId = modelIdMatch[1];
      const modelVersionId = modelVersionIdMatch[1];

      try{
        if(await ismodelNSFW(modelId)) throw new NSFWError;
      } catch (e) {
        if (e.response && (e.response.status == 400 || e.response.status == 404)) {
          throw new NSFWError;
        }
        throw(e);
      };

      try {
        await axios.get(`https://civitai.com/api/v1/model-versions/${modelVersionId}`);
      } catch (e) {
        if (e.response && (e.response.status == 400 || e.response.status == 404)) {
          throw new NSFWError;
        } 
      };    

      // To Do imagesOnReview----------------------------------------------------------------
      //   let imagesOnReview
      //   page.on('response', async (res) => {
      //     if (res.url().startsWith('https://civitai.com/api/trpc/post.getInfinite')) {
      //         imagesOnReview = await res.json();
      //     }
      //   });

      review = { ...review,
        username: username,
        id: reviewId,
        modelId: +modelId,
        modelVersionId: +modelVersionId,
        createdAt: createdAt?.toISOString(),
        rating: 5 - negativeRating,
      };
      //Not crawling for text for now
      //   if (typeof text !== 'undefined') {
      //     review = {
      //       ...review,
      //       details: `<p>${text}</p>`,
      //     };
      //   }

      await page.close();
      //Not crawling for comments for now
      //   const comments = await getCommentsByReviewId(browser, reviewId);

      //   return { review, comments };
      return review
    }
  } catch(error) {
    await page.close();
    if (error instanceof NoUserError) {
      console.error('Deleted user found, skipping reviewId', reviewId);
      return;
    }
    if(error instanceof NSFWError) {
      console.error('NSFW model found, skipping reviewId', reviewId);
      return;
    }
    if(error instanceof deletedResourceError) {
      console.error('Deleted resource, skipping reviewId', reviewId);
      return;
    }
    console.error('Failed to get reviewId', reviewId, 'retrying...');
    return await getReviewById(browser, reviewId);
  }
};