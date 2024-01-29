import axios from "axios";
import { NoUserError, NSFWError } from "../error.mjs";
import { ismodelNSFW } from "./helper.mjs";

const scrapePostById = async (browser, postId) => {
    console.log("")
    const page = await browser.newPage();

    try{
        console.log('Fetching postId', postId);
        const TAG_SELECTOR = 'div.mantine-Group-root.mantine-1u5ck20 div.mantine-Badge-root.mantine-96kda span.mantine-h9iq4m.mantine-Badge-inner';
        // div.mantine-Group-root.mantine-1u5ck20 div.mantine-Badge-root.mantine-96kda span.mantine-h9iq4m.mantine-Badge-inner 
        const DELETED_USER_SELECTOR='div.mantine-Stack-root.mantine-1qlxz9s div.mantine-Group-root.mantine-1u5ck20 div.mantine-Text-root.mantine-lfggf9';

        let postData, commentsData;
        page.on('response', async (res) => {
            if (res.url().startsWith('https://civitai.com/api/trpc/post.getResources')) {
                postData = await res.json();
            } else if (res.url().startsWith('https://civitai.com/api/trpc/commentv2.getThreadDetails')) {
                commentsData = await res.json();
            }
        });

        await page.goto(`https://civitai.com/posts/${postId}`, {
            waitUntil: 'networkidle0',
            timeout: 30000 //30 seconds
        });

        const posts = postData.result.data.json;
        const comments = commentsData.result.data.json;

        let counter = 0;
        for (const item of posts) {
            try { if (await ismodelNSFW(item.modelId)) {
                    counter ++;
                }
            } catch (e) {
                if (e.response.status == 400 || e.response.status == 404) {
                counter ++;
                }
            }
            verID = item.modelVersionId;
            try {
                await axios.get(`https://civitai.com/api/v1/model-versions/${verID}`);
            } catch (e) {
                if (e.response.status == 400 || e.response.status == 404) {
                throw new NSFWError;
                }
            }    
        }
        if (posts.length === counter) throw new NSFWError;

    
        const deletedUserElement = await page.$(DELETED_USER_SELECTOR);
        if (deletedUserElement != null) throw new NoUserError;

        let tags = [];
        const tagElements = await page.$$(TAG_SELECTOR);
        for (const t of tagElements) {
            tags.push(await t.evaluate(x => x.textContent));
        }

        const urlString = await page.$('a div.mantine-Avatar-root.mantine-xoaubn img.mantine-1trwvlz.mantine-Avatar-image');

        if(urlString !== null){
            const imgurl = await urlString.evaluate(element => element.getAttribute('src'));
            await page.close();
            return { tags, imgurl, //posts, comments 
            };
        }
        await page.close();
        return { tags, //posts, comments
     };
    } catch (e) {
        if (e instanceof NSFWError) {
            console.error('NSFW post found, skipping postId', postId);
            await page.close();
            return;
        }
        if (e instanceof NoUserError) {
            console.error('Deleted user found, skipping postId', postId);
            await page.close();
            return;
        }
        // console.error(e);
        console.error('Failed to get postId', postId, 'retrying...');
        await page.close();
        return await getPostById(browser, postId);
        
    }
};


const fetchPostImagesById = async (postId) => {
    try {
        const { data } = await axios.get(`https://civitai.com/api/v1/images?postId=${postId}&nsfw=None`);
        return data.items;
    } catch (e) {
        // console.error(e);
        console.error('Failed to get image for postId', postId, 'retrying...');
        return await fetchPostImagesById(postId);
    }
};


const getPostById = async (browser, postId) => {
    try {
        const images = await fetchPostImagesById(postId);

        if (images.length === 0) {
            console.error('postId', postId, 'not meant to be seen, skipping...');
            return; // Skip the function
        }
        const postData = await scrapePostById(browser, postId);
        if (!postData) return;
        const { tags, imgurl, //posts, comments 
    } = postData;
        return { tags, imgurl, //posts, comments, 
        images};
    } catch (e) {
        // console.error(e);
        return await getPostById(browser, postId);
    }
};

export {
    getPostById,
}