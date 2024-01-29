import fs from 'fs';
import axios from 'axios';
import stream from 'stream';
import { Buffer } from 'buffer';
import {
    S3Client,
    CreateMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    PutObjectCommand,
    UploadPartCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
//import { HttpsProxyAgent } from 'https-proxy-agent';
import { format } from 'date-fns';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const { WEB_ENDPOINT, 
        S3_UPLOAD_KEY, 
        S3_UPLOAD_SECRET, 
        S3_UPLOAD_REGION, 
        S3_UPLOAD_ENDPOINT, 
        S3_UPLOAD_BUCKET, 
        S3_UPLOAD_BUCKET_ENDPOINT, 
        S3_IMAGE_UPLOAD_BUCKET, 
        SECURE_MIKOMIKO_TOKEN, 
        S3_FORCE_PATH_STYLE
        } = process.env;
//-----------------------------------------------------------Config------------------------------------------------------------------------------//
// const PROXY_ENDPOINT = 'http://61.16.108.30:30001';

// Moderator's cookie - mikomikotest123@gmail.com
// const SECURE_MIKOMIKO_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..uNtxvp-Z8AzaAjQq.2R-dhXUM42ZFrkQtJw_mDjF9UeYeabYJxslc1MS2rFrVJR33sLfn6jVuWQNX4n_h-Zi46BXdDc6htDzQ1xulx2MS1vT0VioyreNNFKJJ3Prh2T6gbLEmXqST_tOGQsiBYHs1VCL17TCqB42cvkS_frl2wCZeVDeofwbaRe17JjGS_aIN7PGsFZ21Srecj1DASswoOji9zwh29Y9oAYbqBnYCC3WGzx6o6D19M87bFJjoxbSXvdw2LzFUNl1Dud8QPhhvtT4_QwCBVFLbH3HsoIvg0AVYGHRhVUn0b3jvvFxInGhgRF-HZeioxfGawip_7GEoOSHfskxXFmjnLoNsPwp6kFh1wcMEis14qyUiqIXYEFe4um6JvXnTK8dwmkUbM0Mo0OIr1UNLgNqdT_SR_-DxiKwurvdf5cLKYIIW1wI94wUuJwjtdkHjV7VfD8z0yYPbE41jF9hM7MBKFMf0Gg0wFNmN-Emhuz-Lcj33ql8CJkqFV5nreIbEGEIYndEcv7YwPfSYvLRgoUwGqgtZfupGEquc4yC6PZeNA_oqug5tp3nRJ9V597aE9OLGJ48maWrlf4QDJOMy7Z9jNpBuQTR9oD-iuFhphbKPT4Ac1OzVT7KyYapSykgp-VBw4e_Mtw0jJyCvkzmbsTmzbyehouzi028Gc-G_YRyotcafS0wRoY4uYqXw2o51vUoVdyf0fLwXsPpoxFWHILpFq2LHaMBRLG6ajK5hyyzUzy_L4ian_1426rkT2VIlXNNF3KLyFGBw_XiM.XhISOx5poUZwHq4gQ5iMwQ';
const cookie = '__Secure-mikomiko-token=' + SECURE_MIKOMIKO_TOKEN;
//-------------------------------------------------------------end----------------------------------------------------------------------------//


// Configure Axios for API calls
export const instance = axios.create({
    baseURL: `${WEB_ENDPOINT}/api/`,
    headers: {
        referer: WEB_ENDPOINT,
        origin: WEB_ENDPOINT,
        connection: 'keep-alive',
        cookie: cookie
    }
});

// Configure S3 client for file uploads
const s3Client = new S3Client({
    credentials: {
        accessKeyId: S3_UPLOAD_KEY,
        secretAccessKey: S3_UPLOAD_SECRET
    },
    region: S3_UPLOAD_REGION,
    endpoint: S3_UPLOAD_ENDPOINT,
    forcePathStyle: S3_FORCE_PATH_STYLE,
});

// Configure proxy agent(not using)
// const proxyAgent = new HttpsProxyAgent(PROXY_ENDPOINT);

// Upload images
async function uploadImage(bucket, key, imageId, imageUrl, numTries, FILE_INDEX) {
    try {
        const config = {
            url: imageUrl,
            method: 'GET',
            responseType: 'stream',
            //httpsAgent: proxyAgent
        };

        // Send Axios request through proxy agent
        const response = await axios(config);

        const uploadParams = {
            Bucket: bucket,
            Key: key,
            Body: response.data,
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
    } catch (error) {
        console.error(`Error uploading image ${imageId} ${key}: ${error}`);
        await logError(error, 'posts', `${imageId} ${key}`, FILE_INDEX);

        // Retry image uploading up to 1 time(s)
        if (numTries < 1) {
            await uploadImage(bucket, key, imageId, imageUrl, ++numTries, FILE_INDEX);
        }
    }
};

async function deleteImage(bucket, key) {
    try {

        const input = {
            Bucket: bucket,
            Key: key
        }
        await s3Client.send(new DeleteObjectCommand(input));

    } catch (error) {
        console.error(error);
    }
};

// Upload model files
export async function uploadMultipartFile(bucket, key, fileId, fileUrl, fileName, modelId, FILE_INDEX) {
    try {
        const response = await axios.get(fileUrl, { responseType: 'stream' });

        console.log(`Retrieved from ${fileUrl}`);
        console.log(`Uploading file ${fileId} ${fileName}`);

        const createParams = {
            Bucket: bucket,
            Key: key,
            ContentType: 'application/octet-stream',
        };

        const createCommand = new CreateMultipartUploadCommand(createParams);
        const createResponse = await s3Client.send(createCommand);
        const uploadId = createResponse.UploadId;

        const partSize = 10 * 1024 * 1024; // 10 MB per part
        const parts = [];
        const uploadPromises = [];

        const bufferStream = new stream.PassThrough();
        response.data.pipe(bufferStream);

        let partNumber = 0;
        let bufferData = Buffer.alloc(0);

        const onData = (chunk) => {
            try {
                bufferData = Buffer.concat([bufferData, chunk]);

                while (bufferData.length >= partSize) {
                    const buffer = bufferData.subarray(0, partSize);
                    bufferData = bufferData.subarray(partSize);

                    const uploadPromise
                        = uploadPart(bucket, key, uploadId, buffer, ++partNumber, parts);
                    uploadPromises.push(uploadPromise);
                }
            } catch (error) {
                console.error('Error handling buffer data:', error);
                logError(error, 'models', `${fileId} ${key}`, FILE_INDEX);
            }
        };

        const onEnd = async () => {
            if (bufferData && bufferData.length > 0) {
                const uploadPromise
                    = uploadPart(bucket, key, uploadId, bufferData, ++partNumber, parts);
                uploadPromises.push(uploadPromise);
            }

            await Promise.all(uploadPromises);

            const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);
            await completeMultipartUpload(bucket, key, uploadId, sortedParts);
        };

        await new Promise((resolve, reject) => {
            bufferStream.on('data', onData);
            bufferStream.on('end', () => {
                onEnd().then(resolve).catch(reject);
            });
        });

        console.log(`Uploaded file:${fileId} ${fileName}`);
        await logFilesUploaded('models',`${fileId} fileName:${fileName} modelID:${modelId}`, FILE_INDEX);
    } catch (error) {
        console.error('Error uploading file:', fileName);
        await logError(error, 'models', `${fileId} ${fileName} ${fileUrl} ${modelId}`, FILE_INDEX);
    }

    async function uploadPart(
        bucket,
        key,
        uploadId,
        buffer,
        partNumber,
        parts
    ) {
        const uploadPartParams = {
            Bucket: bucket,
            Key: key,
            PartNumber: partNumber,
            UploadId: uploadId,
            Body: buffer,
        };

        try {
            const uploadPartCommand = new UploadPartCommand(uploadPartParams);
            const uploadPartResponse = await s3Client.send(uploadPartCommand);

            parts.push({
                ETag: uploadPartResponse.ETag,
                PartNumber: partNumber,
            });

            console.log({
                ETag: uploadPartResponse.ETag,
                PartNumber: partNumber,
            });
        } catch (error) {
            console.error('Error uploading part:', error);
            await logError(error, 'models', `${fileId} ${fileName}`, FILE_INDEX);
        }
    };

    async function completeMultipartUpload(
        bucket,
        key,
        uploadId,
        parts
    ) {
        const completeParams = {
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        };

        try {
            const completeCommand = new CompleteMultipartUploadCommand(completeParams);
            await s3Client.send(completeCommand);
        } catch (error) {
            console.error('Error completing multipart upload:', error);
            await logError(error, 'models', `${fileId} ${fileName}`, FILE_INDEX);
        }
    };
};


// transform tags to correct json format
function tagsformal(tags) {
    const tags_formal = tags.map(tag => ({ name: tag }));

    return tags_formal
};

// function matchSystemTags(tags) {
//     // Tags from MikoMiko
//     const systemTags = JSON.parse(fs.readFileSync('./prisma/data/system-tags.json', 'utf8'));

//     return systemTags
//         .filter(systemTag => tags.includes(systemTag.name))
//         .map(systemTag => ({ id: systemTag.id, name: systemTag.name }));
// };

export async function seedModel(model, fileIndex) {
    console.log("")
    // Filter out NSFW models
    if (model.nsfw) {
        console.log(`not uploaded model ${model.id} ${model.name}`);
        await logNSFWfiles('models',`${model.id} ${model.name}`, fileIndex);
        return
    }

    // Filter out models with only NSFW images
    let nsfwCounter = 0;
    for (const modelVersion of model.modelVersions) {
        if (modelVersion.images === 'NSFW') {
                nsfwCounter++;
            }
        }
    if (nsfwCounter === model.modelVersions.length) {
        console.log(`not uploaded model ${model.id} ${model.name}`);
        await logNSFWfiles('models',`${model.id} ${model.name}`, fileIndex);
        return
    }

    console.log('Start seeding model', model.id, model.name);

    // set tags
    const modelTags = tagsformal(model.tags);

    // Match model tags to existing tags
    // const modelTags = matchSystemTags(model.tags);

    let userinfo = {
        "username": model.creator.username,
        "authed": true
    };

    if(model.creator.image) {

        // Check if user image exists
        const getUserByUsernameResponse = await instance.get(`trpc/user.getByUsername?input={"json":{"username": "${userinfo.username}"}}`);
        if (getUserByUsernameResponse.data.result.data.json.image) {
            console.log("Deleting existing image for user", userinfo.username);
            const imageKey = getUserByUsernameResponse.data.result.data.json.image.split('/')[3];
            await deleteImage(S3_IMAGE_UPLOAD_BUCKET, imageKey);
        }

        const fileName = randomUUID() + `_${model.creator.username}_DP`
        const imageUrl = model.creator.image.replace(/\/width=\d+/, '');
        await uploadImage(
            S3_IMAGE_UPLOAD_BUCKET,
            fileName,
            'user_dp',
            imageUrl,
            0,
            fileIndex
        );
        userinfo.image = `https://mikomiko-images.oss-cn-beijing.aliyuncs.com/${fileName.toString()}`;
        console.log('Created img', userinfo.image);
    } 
    // Create user
    const response = await instance.post('trpc/user.upsertSeed', {
        "json": userinfo
    });

    const userId = response.data.result.data.json.id;
    console.log('Created user', model.creator.username, userId);

    // Delete Tags
    await instance.post('trpc/model.removeTags', {
        "json": {
            "id": model.id,
            "tags": modelTags.map(t => t.name)
        }
    })

    // Seed model
    await instance.post('trpc/model.upsertSeed', {
        "json": {
            "id": model.id,
            "name": model.name,
            "description": model.description,
            "type": model.type,
            "poi": model.poi,
            "nsfw": model.nsfw,
            "allowNoCredit": model.allowNoCredit,
            "allowCommercialUse": model.allowCommercialUse,
            "allowDerivatives": model.allowDerivatives,
            "allowDifferentLicense": model.allowDifferentLicense,
            "tagsOnModels": modelTags,
            "userId": userId,
            "status": "Draft",
            "authed": true,
        }
    });

    const modelVersionIds = [];

    await (async () => {
        // Upload the model versions in chronological order
        const chronologicalModelVersions = [...model.modelVersions].reverse();

        for (const modelVersion of chronologicalModelVersions) {
            // Filter out model versions with only NSFW images
            if (modelVersion.images === 'NSFW') {
                continue
            }

            await seedModelVersion(
                modelVersion,
                model.id,
                model.name,
                model.stats,
                modelTags,
                userId,
                model.creator.username,
                fileIndex
            );

            modelVersionIds.push(modelVersion.id);
        }

        const Verresponse = await instance.post('trpc/model.publish', {
            "json": {
                "id": model.id,
                "versionIds": modelVersionIds,
                "authed": true
            }
        });

        console.log('Seeding complete for model', model.name, model.id);
    })();
};

async function seedModelVersion(
    modelVersion,
    modelId,
    modelName,
    modelStats,
    modelTags,
    userId,
    username,
    FILE_INDEX
) {
    const modelVersionStats = {
        rating: modelVersion.stats.rating,
        ratingCount: modelVersion.stats.ratingCount,
        downloadCount: modelVersion.stats.downloadCount,
        favoriteCount: modelStats.favoriteCount,
        commentCount: 0, // modelStats.commentCount,
    };

    await instance.post('trpc/modelVersion.upsertSeed', {
        "json": {
            "id": modelVersion.id,
            "modelId": modelId,
            "name": modelVersion.name,
            "trainedWords": modelVersion.trainedWords,
            "skipTrainedWords": modelVersion.trainedWords?.length == 0,
            "baseModel": modelVersion.baseModel,
            "earlyAccessTimeFrame": modelVersion.earlyAccessTimeFrame,
            "createdAt": modelVersion.createdAt,
            "updatedAt": modelVersion.updatedAt,
            "description": modelVersion.description,
            "stats": modelVersionStats,
            "steps": null,
            "epochs": null,
            "authed": true
        }
    });

    // Seed model files
    await Promise.all(
        modelVersion.files.map(async (file) => {
            await seedModelFile(file, modelVersion.id, modelId, userId,FILE_INDEX);
        })
    );
};

// Generate tokens for file uploads
function generateToken(length) {
    const tokenCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const tokenCharactersLength = tokenCharacters.length;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += tokenCharacters.charAt(Math.floor(Math.random() * tokenCharactersLength));
    }
    return result;
};

async function seedModelFile(file, modelVersionId, modelId, userId, FILE_INDEX) {
    // Delete old model file
    await instance.post('trpc/modelFile.deleteSeed', {
        "json": {
            "id": file.id,
            "authed": true,
        }
    });

    const fileName = file.name.substring(0, file.name.lastIndexOf('.'));
    const fileExt = file.name.substring(file.name.lastIndexOf('.'));
    const s3Key = `${userId}/default/${fileName}.${generateToken(4)}${fileExt}`;
    const s3Key_new = `${userId}/default/${fileName}${fileExt}`;

    await uploadMultipartFile(
        S3_UPLOAD_BUCKET, 
        s3Key_new, 
        file.id, 
        file.downloadUrl,
        file.name,
        modelId,
        FILE_INDEX
    );
    // await uploadImage(
    //   S3_UPLOAD_BUCKET,
    //   s3Key,
    //   0,
    //   'https://civitai.com/api/download/models/20986',
    //   0
    // );

    const createModelFileResponse = await instance.post('trpc/modelFile.createSeed', {
        "json": {
            "name": file.name,
            "id": file.id,
            "sizeKB": file.sizeKB,
            "type": file.type,
            "metadata": file.metadata,
            "hashes": file.hashes,
            "primary": file.primary,
            "url": `${S3_UPLOAD_BUCKET_ENDPOINT}/${s3Key_new}`,
            "bucket": S3_UPLOAD_BUCKET,
            "key": s3Key,
            "modelVersionId": modelVersionId,
            "authed": true,
            "pickleScanResult": file.pickleScanResult,
            "pickleScanMessage": file.pickleScanMessage,
            "virusScanResult": file.virusScanResult,
            "virusScanMessage": file.virusScanMessage,
            "scannedAt": file.scannedAt
        }
    });
    
    for (const [type, hash] of Object.entries(file.hashes)) {
        await seedModelHash(createModelFileResponse.data.result.data.json.id, type, hash, file.scannedAt);
    }
};

async function seedModelHash(fileId, type, hash, createdAt) {
    await instance.post('trpc/modelFile.addSeedModelFileHash', {
        "json": {
            "fileId": fileId,
            "type": type,
            "hash": hash,
            "createdAt": createdAt
        }
    })
}

export async function seedPost(post, fileIndex) {
    try {
        console.log ('')
        // Filter out posts with only NSFW images
        let nsfwCounter = 0;
        for (const image of post.images) {
            if (image.nsfw === true) {
                nsfwCounter++;
            }
        }
        if (nsfwCounter === post.images.length) {
            console.log(`not uploaded post ${post.posts[0].postId} ${post.posts[0].name}`);
            await logNSFWfiles('posts',`${post.posts[0].postId} ${post.posts[0].name}`,fileIndex);
            return
        }

        console.log('Start seeding post', post.posts[0].postId, post.posts[0].name);

        // set tags
        const postTags = tagsformal(post.tags);
        let userinfo = {"username": post.images[0].username,
                        "authed": true,};

        if(post.imgurl) {
            
            // Check if user image exists
            const getUserByUsernameResponse = await instance.get(`trpc/user.getByUsername?input={"json":{"username": "${userinfo.username}"}}`);
            if (getUserByUsernameResponse.data.result.data.json.image) {
                console.log("Deleting existing image for user", userinfo.username);
                const imageKey = getUserByUsernameResponse.data.result.data.json.image.split('/')[3];
                await deleteImage(S3_IMAGE_UPLOAD_BUCKET, imageKey);
            }

            const fileName = randomUUID() + `_${post.images[0].username}_DP`
            const imageUrl = post.imgurl.replace(/\/width=\d+/, '');
            await uploadImage(
                S3_IMAGE_UPLOAD_BUCKET,
                fileName,
                'user_dp',
                imageUrl,
                0,
                fileIndex
            );
            userinfo.image = `https://mikomiko-images.oss-cn-beijing.aliyuncs.com/${fileName.toString()}`;
            console.log('Created img', userinfo.image);
        } 

        // Create user
        const userResponse = await instance.post('trpc/user.upsertSeed', { 
            "json": userinfo
        });
        const userId = userResponse.data.result.data.json.id;
        console.log('Created user', post.images[0].username, userId);

        const postId = post.posts[0].postId;
        const modelVersionId = post.posts[0].modelVersionId;

        // Seed post
        const postData = {
            id: postId,
            title: post.posts[0].name,
            userId: userId,
            authed: true,
            createdAt: post.images[0].createdAt,
            updatedAt: (new Date()).toISOString(),
            modelVersionId: modelVersionId
        };
        // console.log(postData)
        await instance.post('trpc/post.createSeed', {
            "json": postData
        });
        
        console.log('Created post', postId, post.posts[0].name, 'to modelVersion', modelVersionId);

        // insert into review table if the post is a review
        if (post.posts[0].reviewId != null) {
            await instance.post('trpc/resourceReview.upsertSeed', {
                "json": {
                    "id": post.posts[0].reviewId,
                    "modelId": review.modelId,
                    "userId": userId,
                    "rating": post.posts[0].reviewRating,
                    "modelVersionId": modelVersionId,
                    "details": post.posts[0].reviewDetails,
                    "createdAt": post.posts[0].reviewCreatedAt,
                    "authed": true
                }
            });
            console.log('Created review', post.posts[0].reviewId);
        }

        // Seed post tags
        await Promise.all(
            postTags.map(async (postTag) => {
                await instance.post('trpc/post.addTag', {
                    "json": {
                        "id": postId,
                        "tagId": postTag.id,
                        "name": postTag.name,
                        "authed": true
                    }
                });
            })
        );

        // Publish post
        await instance.post('trpc/post.publishSeed', {
            "json": {
                "id": postId,
                "authed": true
            }
        });

        let imageIndex = 0;
        for (const image of post.images) {
            // Get the image file name and extension from the end of the URL
            const fileName = image.url.substring(image.url.lastIndexOf('/') + 1);
            const fileExt = image.url.substring(image.url.lastIndexOf('.') + 1);

            const imageResponse = await instance.post('image-upload', {
                "filename": fileName,
                "metadata": image.meta
            });

            const { id: s3ImageId } = imageResponse.data;
            // Remove image size restriction from the URL
            const imageUrl = image.url.replace(/\/width=\d+/, '');

            // Upload images to S3 storage
            await uploadImage(
                S3_IMAGE_UPLOAD_BUCKET,
                s3ImageId,
                image.id,
                imageUrl,
                0,
                fileIndex
            );

            // Add image to post
            // console.log({
            //     "id": image.id,
            //     "index": imageIndex,
            //     "name": fileName,
            //     "url": s3ImageId,
            //     "hash": image.hash,
            //     "width": image.width,
            //     "height": image.height,
            //     "nsfw": image.nsfwLevel ?? image.nsfw,
            //     "postId": postId,
            //     "stats": image.stats,
            //     "meta": image.meta,
            //     "modelVersionId": modelVersionId,
            //     "userId": userId,
            //     "mimeType": `image/${fileExt}`,
            //     "type": "upload",
            //     "status": "uploading",
            //     "message": null,
            //     "authed": true
            // });
            await instance.post('trpc/post.addSeedImage', {
                "json": {
                    "id": image.id,
                    "index": imageIndex,
                    "name": fileName,
                    "url": s3ImageId,
                    "hash": image.hash,
                    "width": image.width,
                    "height": image.height,
                    "nsfw": image.nsfwLevel ?? image.nsfw,
                    "postId": postId,
                    "stats": image.stats,
                    "meta": image.meta,
                    "modelVersionId": modelVersionId,
                    "userId": userId,
                    "mimeType": `image/${fileExt}`,
                    "type": "upload",
                    "status": "uploading",
                    "message": null,
                    "authed": true
                }
            });

            // Perform image scanning
            await instance.post('image/ingest', {
                "id": image.id,
                "name": fileName,
                "url": s3ImageId,
                "hash": image.hash,
                "width": image.width,
                "height": image.height,
                "nsfw": image.nsfwLevel ?? image.nsfw,
                "meta": image.meta,
                "mimeType": `image/${fileExt}`
            });

            imageIndex++;
        }

        return postId;
    } catch (e) {
        console.log(e);
        if (e.response && e.response.status === 409) {
            console.error('Skipped due to 409'); 
            return logError('Skipped due to 409', 'posts', `${post.posts[0].postId}`, fileIndex);
        }
    }
};

export const seedReviews = async (review, fileIndex) => {
    console.log("")    
    console.log('Start seeding reviewID', review.id, 'to modelID', review.modelId); 

    // Create user
    let userinfo = {
        "username": review.username,
        "authed": true
    };

    if(review.userimage) {

        // Check if user image exists
        const getUserByUsernameResponse = await instance.get(`trpc/user.getByUsername?input={"json":{"username": "${userinfo.username}"}}`);
        if (getUserByUsernameResponse.data.result.data.json.image) {
            console.log("Deleting existing image for user", userinfo.username);
            const imageKey = getUserByUsernameResponse.data.result.data.json.image.split('/')[3];
            await deleteImage(S3_IMAGE_UPLOAD_BUCKET, imageKey);
        }

        const fileName = randomUUID() + `_${review.username}_DP`
        const imageUrl = review.userimage.replace(/\/width=\d+/, '');
        await uploadImage(
            S3_IMAGE_UPLOAD_BUCKET,
            fileName,
            'user_dp',
            imageUrl,
            0,
            fileIndex
        );
        userinfo.image = `https://mikomiko-images.oss-cn-beijing.aliyuncs.com/${fileName.toString()}`;
        console.log('Created img', userinfo.image);
    } 

    const userResponse = await instance.post('trpc/user.upsertSeed', { 
        "json": userinfo
    });

    const userId = userResponse.data.result.data.json.id;
    console.log('Created user', review.username, userId);
    try {
      await instance.post('trpc/resourceReview.upsertSeed', {
        "json": {
            "id": review.id,
            "modelId": review.modelId,
            "userId": userId,
            "rating": review.rating,
            "modelVersionId": review.modelVersionId,
            "details": "",
            "authed": true
        }
      });
      console.log('Seeding complete for reviewID', review.id)
    } catch (e) {
      if (e.response.status === 409) {console.error('Skipped due to 409');
      return logError('Skipped due to 409', 'reviews', `${review.id}`, fileIndex);
    }
      console.error(`Error in uploading a review for reviewId`, review.id, "Retrying...");
      return seedReviews(review, fileIndex);
    }};

    
// export async function seedModelPost(
//     postId,
//     postTitle,
//     postTags,
//     modelVersionId,
//     userId
// ) {
//     const response = await instance.post('trpc/post.createSeed', {
//         "json": {
//             "id": postId,
//             "title": postTitle,
//             "modelVersionId": modelVersionId,
//             "userId": userId,
//             "authed": true
//         }
//     });

//     postId = response.data.result.data.json.id;

//     await Promise.all(
//         postTags.map(async (postTag) => {
//             await instance.post('trpc/post.addTag', {
//                 "json": {
//                     "id": postId,
//                     "tagId": postTag.id,
//                     "name": postTag.name,
//                     "authed": true
//                 }
//             });
//         })
//     );

//     await instance.post('trpc/post.publishSeed', {
//         "json": {
//             "id": postId,
//             "authed": true
//         }
//     });

//     return postId;
// };

// async function seedModelImage(
//     image,
//     imageIndex,
//     postId,
//     modelVersionId,
//     userId
// ) {
//     // Get the image file name and extension from the end of the URL
//     const fileName = image.url.substring(image.url.lastIndexOf('/') + 1);
//     const fileExt = image.url.substring(image.url.lastIndexOf('.') + 1);

//     const response = await instance.post('image-upload', {
//         "filename": fileName,
//         "metadata": image.meta
//     });

//     const { id: s3ImageId } = response.data;
//     // Remove image size restriction from the URL
//     const imageUrl = image.url.replace(/\/width=\d+/, '');

//     // Upload images to S3 storage
//     await uploadImage(
//         S3_IMAGE_UPLOAD_BUCKET,
//         s3ImageId,
//         image.id,
//         imageUrl,
//         0
//     );

//     // Add image to post
//     await instance.post('trpc/post.addSeedImage', {
//         "json": {
//             "id": image.id,
//             "index": imageIndex,
//             "name": fileName,
//             "url": s3ImageId,
//             "hash": image.hash,
//             "width": image.width,
//             "height": image.height,
//             "nsfw": image.nsfwLevel ?? image.nsfw,
//             "postId": postId,
//             "stats": image.stats,
//             "meta": image.meta,
//             "modelVersionId": modelVersionId,
//             "userId": userId,
//             "mimeType": `image/${fileExt}`,
//             "type": "upload",
//             "status": "uploading",
//             "message": null,
//             "authed": true
//         }
//     });

//     // Perform image scanning
//     await instance.post('image/ingest', {
//         "id": image.id,
//         "name": fileName,
//         "url": s3ImageId,
//         "hash": image.hash,
//         "width": image.width,
//         "height": image.height,
//         "nsfw": image.nsfwLevel ?? image.nsfw,
//         "meta": image.meta,
//         "mimeType": `image/${fileExt}`
//     });
// };

// Save error message to a log file
export const logError = async (error, type, id, fileIndex) => {
    const errorMessage = `Error uploading ${type} ${id}: ${error}\n`;
    try {
        const datetime = format(new Date(), 'ddMMyyyy HH:mm:ss');
        const logEntry = `[${datetime}] ${errorMessage}`;
        await fs.promises.appendFile(`./logs/${type}/${fileIndex}.upsert_error.log`, logEntry);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
};

// Save files uploaded to a log file
const logFilesUploaded = async (type, id, fileIndex) => {
    const errorMessage = `Uploaded file ID: ${id}\n`;
    try {
        const datetime = format(new Date(), 'ddMMyyyy HH:mm:ss');
        const logEntry = `[${datetime}] ${errorMessage}`;
        await fs.promises.appendFile(`./logs/${type}/${fileIndex}.uploaded_files.log`, logEntry);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
};

// Save NSFW files not uploaded to a log file
const logNSFWfiles = async (type, id, fileIndex) => {
    const errorMessage = `NSFW ${type} ID: ${id}\n`;
    try {
        const datetime = format(new Date(), 'ddMMyyyy HH:mm:ss');
        const logEntry = `[${datetime}] ${errorMessage}`;
        await fs.promises.appendFile(`./logs/${type}/${fileIndex}.NSFW_files.log`, logEntry);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
};