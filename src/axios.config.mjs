import 'dotenv/config';
import axios from "axios";

const { WEB_ENDPOINT, MIKOMIKO_TOKEN } = process.env;
const cookie = 'mikomiko-token=' + MIKOMIKO_TOKEN

const instance = axios.create({
    baseURL: `${WEB_ENDPOINT}/api/`,
    headers: {
      referer: WEB_ENDPOINT,
      origin: WEB_ENDPOINT,
      connection: 'keep-alive',
      cookie: cookie
    }
});

export default instance;