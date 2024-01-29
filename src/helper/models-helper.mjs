import axios from "axios";

export function extractNSFW(images) {
    return images.map(image => {
      return { nsfw: image.nsfw };
    });
  }


// Function to retrieve information about a model by its ID
export const getModelById = async (modelId) => {
    try {
        const { data } = await axios.get(`https://civitai.com/api/v1/models/${modelId}`);
        console.log("")
        console.log('Start fetching model', modelId, '...');
        if (data.creator.image === null) {
            delete data.creator.image;
        }
        for (const modelVersion of data.modelVersions){
            const nsfwData = extractNSFW(modelVersion.images);
            let nsfwCounter = 0;
            for (const nsfw of nsfwData) {
                if (nsfw.nsfw !== 'None') {
                    nsfwCounter++;
                }
            }
            if (nsfwCounter === modelVersion.images.length) {
                modelVersion.images='NSFW'
                console.log('NSFW Level:',modelVersion.images);
            }
            else if (nsfwCounter !== 0){
                modelVersion.images='PARTIAL'
                console.log('NSFW Level:',modelVersion.images);
            }
            else {
                modelVersion.images='SAFE'
                console.log('NSFW Level:', modelVersion.images);
            }
          }

        return data;
    } catch (e) {
        console.log('')
        console.error('No model', modelId, 'skipping...');
        return;
    }
};