import 'dotenv/config';
import instance from "../axios.config.mjs";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import axios from "axios";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer-extra";
import { deletedResourceError } from '../error.mjs';


const { CIVITAI_EMAIL, CIVITAI_EMAIL_PASSWORD } = process.env;


puppeteer.use(StealthPlugin()); // So that google cannot detect the bot

const createBrowser = async () => {
  return await puppeteer.launch({ headless: 'new' });
};


const closeBrowser = async (browser) => {
  await browser?.close();
}


const loginGmail = async (browser) => {
  console.log('login as ',CIVITAI_EMAIL, CIVITAI_EMAIL_PASSWORD);
  
  const page = await browser.newPage();
  await page.goto('https://civitai.com/login?returnUrl=/', { waitUntil: 'networkidle0' });

  const GOOGLE_SELECTOR = 'button.mantine-UnstyledButton-root.mantine-Button-root.mantine-11ku2ma';
  await page.click(GOOGLE_SELECTOR);
  await page.waitForNavigation();

  await page.keyboard.type(CIVITAI_EMAIL);
  await page.keyboard.press('Enter');

  await page.waitForSelector('input[type="password"]')

  await page.waitForTimeout(2000);
  await page.keyboard.type(CIVITAI_EMAIL_PASSWORD);
  await page.keyboard.press('Enter');

  await page.waitForNavigation();
  await page.close();

  console.log("Signed in to google");
};


// Function to save merged JSON data to a file
const saveMergedJSONToFile = (mergedItems,fileCount,type) => {
  const mergedJSON = { items: mergedItems };
  const filePath = path.join('data', `${type}`, `${fileCount}.${type}.json`);
  const writeStream = fs.createWriteStream(filePath);
  writeStream.write(JSON.stringify(mergedJSON, null, 2));
  writeStream.close();
  // fs.writeFileSync(filePath, JSON.stringify(mergedJSON, null, 2));
  console.log(`Saved merged data to ${filePath}`);
};


const getUserImageURLFromCivitaiAPI = async (username) => {
  const { data } = await axios.get(`https://civitai.com/api/v1/creators?query=${username}`);
  const { items } = data;
  if (items.length > 0 && items[0].image) return items[0].image;
  // return await getUserImageFromCivitaiWebPage(username);
};

// const getUserImageFromCivitaiWebPage = async (username) => {
//   let browser;
//   try {
//     browser = await puppeteer.launch({ headless: 'new' });
//     return await scrapeUserImage(browser, username);
//   } catch (e) {
//     if (e instanceof TimeoutError) return null;
//     return await getUserImageFromCivitaiWebPage(username);
//   } finally {
//     await browser?.close();
//   }
// };

// const scrapeUserImage = async (browser, username) => {

//   const page = await browser.newPage();
//   await page.goto(`https://civitai.com/user/${username}`);

//   const USER_IMAGE_SELECTOR = 'div.mantine-16q0nr3 div.mantine-AspectRatio-root.mantine-j0p7ti img';
//   await page.waitForSelector(USER_IMAGE_SELECTOR)
//   const userImageElement = await page.$(USER_IMAGE_SELECTOR);

//   return await userImageElement.evaluate(x => x.src);
// };


const upsertUserAndReturnUserId = async (username) => {
  try {
    const { data } = await instance.post('trpc/user.upsertSeed', {
      "json": {
        "username": username,
        "image": await getUserImageURLFromCivitaiAPI(username)
      }
    });
    return data.result.data.json.id;
  } catch (e) {
    if (e.response.status == 400) return; // Bad Request
    console.error(`Failed to get userId for username ${username}, retrying...`);
    return await upsertUserAndReturnUserId(username);
  }
}

//check if a model is nsfw

const ismodelNSFW = async (modelid) => {
  try{ 
    const model = await axios.get(`https://civitai.com/api/v1/models/${modelid}`);
    // console.log(model.data.nsfw)
    return model.data.nsfw
  } catch (e) {
    throw new deletedResourceError(modelid);
  }
}

export {
  upsertUserAndReturnUserId,
  saveMergedJSONToFile,
  createBrowser,
  closeBrowser,
  loginGmail,
  ismodelNSFW
};